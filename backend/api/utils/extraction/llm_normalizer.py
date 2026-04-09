import json
import logging
import base64
import os
from io import BytesIO
from json import JSONDecodeError
from typing import Any, Dict, List, Tuple

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

OLLAMA_GENERATE_PATH = '/api/generate'
OLLAMA_TAGS_PATH = '/api/tags'

_PIN_VERIFICATION_CACHE: Dict[str, bool] = {}

ALLOWED_KEYS = {
    'subject_code',
    'subject_name',
    'day',
    'start_time',
    'end_time',
    'location',
    'metadata',
}

ALLOWED_METADATA_KEYS = {
    'parser',
    'field_confidence',
    'evidence',
}


def _build_ollama_headers(*, content_type: bool = False) -> dict:
    """
    Build HTTP headers for all outbound requests to Ollama (or the nginx proxy
    that sits in front of it).

    Behaviour:
    - Always sets Accept: application/json.
    - Sets Content-Type: application/json when content_type=True (POST calls).
    - Injects X-Api-Key when EXTRACTION_LLM_API_KEY is non-empty.
      An empty/missing key is silently omitted so local dev works without a proxy.
    """
    headers: dict = {'Accept': 'application/json'}
    if content_type:
        headers['Content-Type'] = 'application/json'
    api_key = str(getattr(settings, 'EXTRACTION_LLM_API_KEY', '')).strip()
    if api_key:
        headers['X-Api-Key'] = api_key
    return headers


def _truncate_text(text: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ''
    text = (text or '').strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars]


def _build_prompt(extracted_text: str, seed_courses: List[Dict[str, Any]]) -> str:
    # Fixed instruction template to avoid behavior changes from untrusted OCR text.
    seed_json = json.dumps(seed_courses[:50], ensure_ascii=True)
    return (
        'You are a strict JSON normalizer for schedule course rows. '
        'Return ONLY a valid JSON object with this exact top-level schema: '
        '{"courses": [course, ...]}. '
        'Allowed course keys: subject_code, subject_name, day, start_time, end_time, location, metadata. '
        'Allowed metadata keys: parser, field_confidence, evidence. '
        'If uncertain for a field, use null or empty string, never guess. '
        'Do not include explanations, markdown, or additional keys.\n\n'
        'OCR/TEXT INPUT:\n'
        f'{extracted_text}\n\n'
        'SEED COURSES (can be corrected):\n'
        f'{seed_json}\n'
    )


def _extract_response_text(payload: Dict[str, Any]) -> str:
    response_text = payload.get('response')
    if not isinstance(response_text, str):
        return ''
    return response_text.strip()


def _is_model_name_pinned(model_name: str) -> bool:
    model = (model_name or '').strip()
    if not model or ':' not in model:
        return False
    _, tag = model.rsplit(':', 1)
    if not tag or tag.lower() == 'latest':
        return False
    return True


def _cache_key(*, base_url: str, model_name: str, digest: str) -> str:
    return f'{base_url}|{model_name}|{digest}'


def _verify_model_digest(*, base_url: str, model_name: str, required_digest: str, timeout_seconds: int) -> bool:
    response = requests.get(
        f'{base_url}{OLLAMA_TAGS_PATH}',
        timeout=timeout_seconds,
        headers=_build_ollama_headers(),
    )
    response.raise_for_status()
    payload = response.json()
    models = payload.get('models', [])
    if not isinstance(models, list):
        return False

    for item in models:
        if not isinstance(item, dict):
            continue
        if str(item.get('name', '')).strip() != model_name:
            continue
        digest = str(item.get('digest', '')).strip()
        return digest == required_digest
    return False


def _validate_runtime_policy(
    *,
    base_url: str,
    model_name: str,
    timeout_seconds: int,
    require_pinned_model: bool | None = None,
    require_model_digest: bool | None = None,
    required_digest: str | None = None,
) -> Tuple[bool, str]:
    if require_pinned_model is None:
        require_pinned_model = bool(getattr(settings, 'EXTRACTION_LLM_REQUIRE_PINNED_MODEL', True))
    if require_model_digest is None:
        require_model_digest = bool(getattr(settings, 'EXTRACTION_LLM_REQUIRE_MODEL_DIGEST', False))
    if required_digest is None:
        required_digest = str(getattr(settings, 'EXTRACTION_LLM_MODEL_DIGEST', '')).strip()
    else:
        required_digest = str(required_digest).strip()

    if require_pinned_model and not _is_model_name_pinned(model_name):
        return False, 'EXTRACTION_LLM_MODEL_NAME must include an explicit non-latest tag (e.g., model:version).'

    if require_model_digest and not required_digest:
        return False, 'EXTRACTION_LLM_REQUIRE_MODEL_DIGEST=True but EXTRACTION_LLM_MODEL_DIGEST is empty.'

    if required_digest:
        key = _cache_key(base_url=base_url, model_name=model_name, digest=required_digest)
        if key in _PIN_VERIFICATION_CACHE:
            if not _PIN_VERIFICATION_CACHE[key]:
                return False, 'Configured model digest verification failed (cached).'
            return True, ''

        try:
            ok = _verify_model_digest(
                base_url=base_url,
                model_name=model_name,
                required_digest=required_digest,
                timeout_seconds=timeout_seconds,
            )
        except requests.RequestException:
            logger.exception('Failed to verify Ollama model digest using /api/tags')
            _PIN_VERIFICATION_CACHE[key] = False
            return False, 'Unable to verify model digest from Ollama runtime.'

        _PIN_VERIFICATION_CACHE[key] = ok
        if not ok:
            return False, 'Configured Ollama model digest mismatch.'

    return True, ''


def run_llm_startup_health_check() -> None:
    """
    Optional startup-time health check for LLM runtime.

    Strict mode raises RuntimeError and stops process startup.
    Non-strict mode logs warnings only.
    """
    if not bool(getattr(settings, 'EXTRACTION_LLM_STARTUP_CHECK_ENABLED', False)):
        return
    if not bool(getattr(settings, 'EXTRACTION_LLM_NORMALIZATION_ENABLED', False)):
        return
    if not bool(getattr(settings, 'EXTRACTION_LLM_VISION_PARSE_ENABLED', False)):
        return

    model_name = str(getattr(settings, 'EXTRACTION_LLM_VISION_MODEL_NAME', '')).strip()
    base_url = str(getattr(settings, 'EXTRACTION_LLM_BASE_URL', 'http://127.0.0.1:11434')).rstrip('/')
    timeout_seconds = int(getattr(settings, 'EXTRACTION_LLM_STARTUP_CHECK_TIMEOUT_SECONDS', 2))
    strict = bool(getattr(settings, 'EXTRACTION_LLM_STARTUP_CHECK_STRICT', False))

    if not model_name:
        message = 'LLM startup check failed: EXTRACTION_LLM_VISION_MODEL_NAME is empty.'
        if strict:
            raise RuntimeError(message)
        logger.warning(message)
        return

    try:
        response = requests.get(
            f'{base_url}{OLLAMA_TAGS_PATH}',
            timeout=timeout_seconds,
            headers=_build_ollama_headers(),
        )
        response.raise_for_status()
        payload = response.json()
        models = payload.get('models', [])
        names = {
            str(item.get('name', '')).strip()
            for item in models
            if isinstance(item, dict)
        }
        if model_name not in names:
            message = f'LLM startup check failed: model {model_name} not found in Ollama tags.'
            if strict:
                raise RuntimeError(message)
            logger.warning(message)
            return

        policy_ok, policy_error = _validate_runtime_policy(
            base_url=base_url,
            model_name=model_name,
            timeout_seconds=timeout_seconds,
            require_pinned_model=bool(getattr(settings, 'EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL', True)),
            require_model_digest=bool(getattr(settings, 'EXTRACTION_LLM_VISION_REQUIRE_MODEL_DIGEST', False)),
            required_digest=str(getattr(settings, 'EXTRACTION_LLM_VISION_MODEL_DIGEST', '')).strip(),
        )
        if not policy_ok:
            if strict:
                raise RuntimeError(f'LLM startup check failed: {policy_error}')
            logger.warning('LLM startup check warning: %s', policy_error)
            return

        logger.info('LLM startup check passed for model %s', model_name)
    except requests.RequestException as exc:
        message = f'LLM startup check could not reach Ollama runtime: {exc}'
        if strict:
            raise RuntimeError(message) from exc
        logger.warning(message)


def _strip_markdown_fence(value: str) -> str:
    text = (value or '').strip()
    if text.startswith('```') and text.endswith('```'):
        lines = text.splitlines()
        if len(lines) >= 3:
            return '\n'.join(lines[1:-1]).strip()
    return text


def _parse_llm_json(value: str) -> Dict[str, Any]:
    cleaned = _strip_markdown_fence(value)
    try:
        parsed = json.loads(cleaned)
    except JSONDecodeError:
        # Some models wrap JSON with extra prose; recover the first object.
        start = cleaned.find('{')
        end = cleaned.rfind('}')
        if start == -1 or end == -1 or end <= start:
            raise
        parsed = json.loads(cleaned[start:end + 1])
    if not isinstance(parsed, dict):
        raise ValueError('LLM response must be a JSON object')
    return parsed


def _validate_course_metadata(value: Any) -> bool:
    if value is None:
        return True
    if not isinstance(value, dict):
        return False
    unknown = set(value.keys()) - ALLOWED_METADATA_KEYS
    if unknown:
        return False
    return True


def _sanitize_course_metadata(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    sanitized: Dict[str, Any] = {}

    parser = value.get('parser')
    if isinstance(parser, str):
        sanitized['parser'] = parser[:50].strip()

    evidence = value.get('evidence')
    if isinstance(evidence, str):
        sanitized['evidence'] = evidence[:500].strip()

    field_confidence = value.get('field_confidence')
    if isinstance(field_confidence, dict):
        normalized_confidence: Dict[str, float] = {}
        for key, confidence_value in field_confidence.items():
            if not isinstance(key, str):
                continue
            if not isinstance(confidence_value, (int, float)):
                continue
            normalized_confidence[key[:40]] = max(0.0, min(1.0, float(confidence_value)))
        if normalized_confidence:
            sanitized['field_confidence'] = normalized_confidence

    return sanitized


def _sanitize_course_row(value: Any) -> Dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    normalized: Dict[str, Any] = {
        'subject_code': str(value.get('subject_code') or '').strip()[:50],
        'subject_name': str(value.get('subject_name') or '').strip()[:255],
        'day': str(value.get('day') or '').strip()[:20],
        'start_time': str(value.get('start_time') or '').strip()[:20],
        'end_time': str(value.get('end_time') or '').strip()[:20],
        'location': str(value.get('location') or '').strip()[:100],
    }

    metadata = _sanitize_course_metadata(value.get('metadata'))
    if metadata:
        normalized['metadata'] = metadata

    return normalized


def _coerce_courses(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []

    normalized_courses: List[Dict[str, Any]] = []
    for item in value:
        normalized_row = _sanitize_course_row(item)
        if normalized_row is None:
            continue
        normalized_courses.append(normalized_row)
    return normalized_courses


def _validate_normalized_courses(courses: List[Dict[str, Any]]) -> bool:
    for row in courses:
        if not isinstance(row, dict):
            return False
        unknown = set(row.keys()) - ALLOWED_KEYS
        if unknown:
            # Log but do not reject — LLM may emit extra keys we don't need
            logger.debug('LLM course row has unknown keys (ignored): %s', sorted(unknown))
        if len(str(row.get('subject_code', ''))) > 50:
            return False
        if len(str(row.get('subject_name', ''))) > 255:
            return False
        if len(str(row.get('location', ''))) > 100:
            return False
        if not _validate_course_metadata(row.get('metadata')):
            return False
    return True


def normalize_with_llm(
    *,
    extracted_text: str,
    seed_courses: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Safe placeholder for Phase 3 local LLM normalization.

    Behavior today:
    - Returns original seed courses unless LLM feature flag is on and a
      normalized JSON payload can be parsed and schema-validated.

    Integration note:
    - Wire local model invocation here (e.g., isolated Ollama runtime) and keep
      strict output validation before returning any model-derived data.
    """
    telemetry: Dict[str, Any] = {
        'llm_used': False,
        'llm_parse_success': False,
        'llm_model': '',
        'llm_timeout_seconds': int(getattr(settings, 'EXTRACTION_LLM_TIMEOUT_SECONDS', 12)),
    }

    if not bool(getattr(settings, 'EXTRACTION_LLM_NORMALIZATION_ENABLED', False)):
        return seed_courses, telemetry

    telemetry['llm_used'] = True
    model_name = str(getattr(settings, 'EXTRACTION_LLM_MODEL_NAME', '')).strip()
    telemetry['llm_model'] = model_name

    if not model_name:
        logger.warning('LLM normalization enabled but EXTRACTION_LLM_MODEL_NAME is empty')
        return seed_courses, telemetry

    timeout_seconds = int(getattr(settings, 'EXTRACTION_LLM_TIMEOUT_SECONDS', 12))
    max_input_chars = int(getattr(settings, 'EXTRACTION_LLM_MAX_INPUT_CHARS', 6000))
    base_url = str(getattr(settings, 'EXTRACTION_LLM_BASE_URL', 'http://127.0.0.1:11434')).rstrip('/')
    generate_url = f'{base_url}{OLLAMA_GENERATE_PATH}'

    policy_ok, policy_error = _validate_runtime_policy(
        base_url=base_url,
        model_name=model_name,
        timeout_seconds=timeout_seconds,
    )
    if not policy_ok:
        logger.warning('LLM normalization policy check failed: %s', policy_error)
        return seed_courses, telemetry

    bounded_text = _truncate_text(extracted_text, max_input_chars)
    if not bounded_text:
        logger.warning('LLM normalization skipped because bounded OCR text is empty')
        return seed_courses, telemetry

    try:
        request_payload = {
            'model': model_name,
            'prompt': _build_prompt(bounded_text, seed_courses),
            'stream': False,
            'format': 'json',
            'options': {
                'temperature': 0,
            },
        }
        response = requests.post(
            generate_url,
            json=request_payload,
            timeout=timeout_seconds,
            headers=_build_ollama_headers(content_type=True),
        )
        response.raise_for_status()
        ollama_payload = response.json()
        llm_output = _extract_response_text(ollama_payload)
        if not llm_output:
            logger.warning('LLM normalization returned empty response payload')
            return seed_courses, telemetry

        parsed = _parse_llm_json(llm_output)
        unknown_top_level = set(parsed.keys()) - {'courses'}
        if unknown_top_level:
            logger.warning('LLM normalization response had unknown top-level keys: %s', sorted(unknown_top_level))
        if not isinstance(parsed, dict) or 'courses' not in parsed:
            return seed_courses, telemetry
        courses_raw = parsed.get('courses')
        courses = _coerce_courses(courses_raw)
        if not isinstance(courses_raw, list):
            return seed_courses, telemetry
        if not courses and courses_raw:
            logger.warning('LLM normalization response had unusable courses after sanitization')
            return seed_courses, telemetry
        if not _validate_normalized_courses(courses):
            return seed_courses, telemetry
        telemetry['llm_parse_success'] = True
        return courses, telemetry
    except requests.Timeout:
        logger.warning('LLM normalization timed out after %ss', timeout_seconds)
        return seed_courses, telemetry
    except requests.RequestException:
        logger.exception('LLM normalization request failed')
        return seed_courses, telemetry
    except (JSONDecodeError, ValueError):
        logger.warning('LLM normalization output was not valid JSON')
        return seed_courses, telemetry


# ---------------------------------------------------------------------------
# Full-document parse: LLM as primary parser (no seed courses required)
# ---------------------------------------------------------------------------

ALLOWED_DOC_METADATA_KEYS = {'student_number', 'semester', 'school_year'}


def _normalize_student_number(value: Any) -> str:
    text = str(value or '').strip()
    if not text:
        return ''

    digits_only = ''.join(ch for ch in text if ch.isdigit())
    if len(digits_only) == 9:
        return f'{digits_only[:4]}-{digits_only[4:]}'

    return text.upper()


def _sanitize_doc_metadata(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        value = {}

    return {
        'student_number': _normalize_student_number(value.get('student_number')),
        'semester': str(value.get('semester') or '').strip().upper(),
        'school_year': str(value.get('school_year') or '').strip(),
    }


def _build_full_parse_prompt(raw_text: str, upload_type: str) -> str:
    """
    Build a prompt that asks the LLM to extract BOTH course rows AND document
    metadata directly from raw OCR/PDF text — no regex seed required.

    The prompt explicitly teaches the LLM what each upload_type looks like so
    it can interpret handwritten, scanned, or informal formats intelligently.
    """
    if upload_type == 'faculty':
        format_hint = (
            'Faculty IDP format: rows contain a subject code like "OS137-BSCS-3A", '
            'a time range like "9:00-11:00" or "1:00PM-3:00PM", a room like "LR3", '
            'and a day column (MON, TUE, WED, THU, FRI, SAT). '
            'There is no student_number in faculty documents; set it to null.'
        )
    else:
        format_hint = (
            'Student COR format: may be a formal PDF with schedule IDs like "BSCS222285", '
            'or a handwritten/informal note. '
            'Handwritten format looks like: "OS  1:00 pm - 3:00 pm  LR1". '
            'The header usually says "Student number YYYY-NNNNN" on the same line or '
            '"Student Number" followed by the number on the next line. '
            'Extract subject_code, start_time (HH:MMam/pm or HH:MMAM/PM), end_time, '
            'day (M/T/W/TH/F/S — leave empty if not shown), location (room name).'
        )

    return (
        'You are a precise schedule data extractor for a university registration system. '
        'Analyze the following raw text (which may be OCR output from a photo or scan) '
        f'and extract all course schedule rows. Document type: {upload_type.upper()} COR/IDP.\n\n'
        f'FORMAT CONTEXT: {format_hint}\n\n'
        'Return ONLY valid JSON matching this exact schema — no markdown, no explanation:\n'
        '{\n'
        '  "doc_metadata": {\n'
        '    "student_number": "<YYYY-NNNNN or null>",\n'
        '    "semester": "<1ST|2ND|SUMMER or null>",\n'
        '    "school_year": "<YYYY-YYYY or null>"\n'
        '  },\n'
        '  "courses": [\n'
        '    {\n'
        '      "subject_code": "<code>",\n'
        '      "subject_name": "<name or empty string>",\n'
        '      "day": "<M|T|W|TH|F|S or empty>",\n'
        '      "start_time": "<HH:MMAM or HH:MMPM>",\n'
        '      "end_time": "<HH:MMAM or HH:MMPM>",\n'
        '      "location": "<room or empty string>"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        'Rules:\n'
        '- Normalize times to HH:MMAM or HH:MMPM (e.g. "1:00 pm" → "01:00PM").\n'
        '- If a field is unclear or missing, use null (for doc_metadata) or empty string (for course fields).\n'
        '- Skip header rows (Subject/Time/Room labels) and non-course lines.\n'
        '- Do NOT invent data. Only extract what is present in the text.\n\n'
        'RAW TEXT:\n'
        f'{raw_text}\n'
    )


def _validate_doc_metadata(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    unknown = set(value.keys()) - ALLOWED_DOC_METADATA_KEYS
    if unknown:
        return False
    return True


_VISION_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'}


def _build_vision_parse_prompt(upload_type: str) -> str:
    if upload_type == 'faculty':
        format_hint = (
            'Faculty IDP documents usually contain day labels (MON..SAT), '
            'subject/class codes, time ranges, and room/location. '
            'Set student_number to null for faculty documents.'
        )
    else:
        format_hint = (
            'Student COR documents may be typed, scanned, or handwritten and can '
            'contain student number, semester/school year, subject rows, time, day, and room.'
        )

    return (
        'You are a precise schedule extractor. Analyze the attached document image(s) '
        f'for a {upload_type.upper()} schedule and return ONLY valid JSON in this schema:\n'
        '{\n'
        '  "doc_metadata": {\n'
        '    "student_number": "<YYYY-NNNNN or null>",\n'
        '    "semester": "<1ST|2ND|SUMMER or null>",\n'
        '    "school_year": "<YYYY-YYYY or null>"\n'
        '  },\n'
        '  "courses": [\n'
        '    {\n'
        '      "subject_code": "<code>",\n'
        '      "subject_name": "<name or empty string>",\n'
        '      "day": "<M|T|W|TH|F|S or empty>",\n'
        '      "start_time": "<HH:MMAM or HH:MMPM>",\n'
        '      "end_time": "<HH:MMAM or HH:MMPM>",\n'
        '      "location": "<room or empty string>"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        f'Format context: {format_hint}\n'
        'Rules:\n'
        '- Use only data visible in the document.\n'
        '- Handwritten rows may look like: "OS 7:00AM-9:00AM LR1" or "SE 1:00PM-3:00PM LP2".\n'
        '- Column headers may be abbreviated: Subject/Subj, Time, Loc/Location.\n'
        '- Student number can appear as 9 contiguous digits (e.g. 202201191); normalize to YYYY-NNNNN.\n'
        '- Normalize times to HH:MMAM/PM.\n'
        '- Keep unknown fields empty instead of guessing.\n'
        '- No markdown, no prose, JSON only.'
    )


def _build_vision_metadata_prompt(upload_type: str) -> str:
    context_hint = (
        'Student COR documents can be typed or handwritten. '
        'Student number can appear as YYYY-NNNNN, YYYY NNNNN, or 9 contiguous digits.'
        if upload_type == 'student'
        else 'Faculty documents usually do not contain a student number. Return null.'
    )

    return (
        'You are a strict metadata extractor. Analyze the attached document image(s) '
        'and return ONLY valid JSON with this exact schema:\n'
        '{\n'
        '  "doc_metadata": {\n'
        '    "student_number": "<YYYY-NNNNN or null>"\n'
        '  }\n'
        '}\n\n'
        f'Context: {context_hint}\n'
        'Rules:\n'
        '- Use only data visible in the document.\n'
        '- If student number is shown as 9 digits (e.g. 202201191), normalize to YYYY-NNNNN.\n'
        '- If missing or unreadable, return null.\n'
        '- No markdown, no prose, JSON only.'
    )


def _load_document_images_for_vision(
    file_path: str,
    max_pages: int,
    *,
    image_max_edge: int = 1600,
    image_quality: int = 72,
    pdf_dpi: int = 220,
) -> List[str]:
    extension = os.path.splitext(file_path)[1].lower()

    if extension == '.pdf':
        try:
            from pdf2image import convert_from_path
        except ImportError:
            logger.warning('LLM vision parse skipped: pdf2image is not installed')
            return []

        images_b64: List[str] = []
        pages = convert_from_path(
            file_path,
            dpi=max(120, int(pdf_dpi)),
            first_page=1,
            last_page=max_pages,
            fmt='jpeg',
        )
        for page in pages:
            buffer = BytesIO()
            page.save(buffer, format='JPEG', quality=85)
            images_b64.append(base64.b64encode(buffer.getvalue()).decode('ascii'))
        return images_b64

    if extension in _VISION_IMAGE_EXTENSIONS:
        # Large phone images can trigger long multimodal decode/inference times.
        # Resize/compress before sending to Ollama to reduce timeout risk.
        try:
            from PIL import Image

            with Image.open(file_path) as image:
                image = image.convert('RGB')
                width, height = image.size
                max_edge = max(960, int(image_max_edge))
                if max(width, height) > max_edge:
                    ratio = max_edge / float(max(width, height))
                    resized = (max(1, int(width * ratio)), max(1, int(height * ratio)))
                    image = image.resize(resized, Image.Resampling.LANCZOS)

                buffer = BytesIO()
                quality = max(40, min(95, int(image_quality)))
                image.save(buffer, format='JPEG', quality=quality, optimize=True)
                return [base64.b64encode(buffer.getvalue()).decode('ascii')]
        except Exception:
            logger.exception('LLM vision image preprocessing failed; falling back to raw bytes')
            with open(file_path, 'rb') as infile:
                return [base64.b64encode(infile.read()).decode('ascii')]

    logger.warning('LLM vision parse skipped: unsupported file extension %s', extension)
    return []


def parse_document_with_llm_vision(
    *,
    file_path: str,
    upload_type: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    """
    Parse document images directly with a vision-capable LLM via Ollama.

    This bypasses OCR/pdf text extraction and asks the model to interpret the
    source document pixels directly.
    """
    empty_meta: Dict[str, Any] = {'student_number': '', 'semester': '', 'school_year': ''}
    telemetry: Dict[str, Any] = {
        'llm_used': False,
        'llm_parse_success': False,
        'llm_failure_reason': '',
        'llm_model': '',
        'llm_timeout_seconds': int(getattr(settings, 'EXTRACTION_LLM_TIMEOUT_SECONDS', 12)),
        'llm_retry_count': 0,
        'stage': 'llm_vision_parse',
    }

    if not bool(getattr(settings, 'EXTRACTION_LLM_VISION_PARSE_ENABLED', False)):
        telemetry['llm_failure_reason'] = 'schema_reject'
        return [], empty_meta, telemetry
    if not bool(getattr(settings, 'EXTRACTION_LLM_NORMALIZATION_ENABLED', False)):
        telemetry['llm_failure_reason'] = 'schema_reject'
        return [], empty_meta, telemetry

    model_name = str(
        getattr(settings, 'EXTRACTION_LLM_VISION_MODEL_NAME', '')
    ).strip()
    telemetry['llm_model'] = model_name
    telemetry['llm_used'] = True

    if not model_name:
        logger.warning('LLM vision parse enabled but no vision model name is configured')
        telemetry['llm_failure_reason'] = 'schema_reject'
        return [], empty_meta, telemetry

    timeout_seconds = max(1, int(getattr(settings, 'EXTRACTION_LLM_TIMEOUT_SECONDS', 12)))
    max_pages = int(getattr(settings, 'EXTRACTION_LLM_VISION_MAX_PAGES', 2))
    retry_count = max(0, int(getattr(settings, 'EXTRACTION_LLM_VISION_RETRY_COUNT', 1)))
    connect_timeout_seconds = max(
        1,
        int(getattr(settings, 'EXTRACTION_LLM_VISION_CONNECT_TIMEOUT_SECONDS', 8)),
    )
    max_tokens = max(64, int(getattr(settings, 'EXTRACTION_LLM_VISION_MAX_TOKENS', 768)))
    retry_max_tokens = max(
        64,
        int(
            getattr(
                settings,
                'EXTRACTION_LLM_VISION_RETRY_MAX_TOKENS',
                max(256, int(max_tokens * 0.75)),
            )
        ),
    )
    image_max_edge = max(960, int(getattr(settings, 'EXTRACTION_LLM_VISION_IMAGE_MAX_EDGE', 1600)))
    image_quality = max(40, min(95, int(getattr(settings, 'EXTRACTION_LLM_VISION_IMAGE_QUALITY', 72))))
    retry_image_max_edge = max(
        960,
        int(getattr(settings, 'EXTRACTION_LLM_VISION_RETRY_IMAGE_MAX_EDGE', 1280)),
    )
    retry_image_quality = max(
        40,
        min(95, int(getattr(settings, 'EXTRACTION_LLM_VISION_RETRY_IMAGE_QUALITY', 68))),
    )
    pdf_dpi = max(120, int(getattr(settings, 'EXTRACTION_LLM_VISION_PDF_DPI', 220)))
    retry_pdf_dpi = max(120, int(getattr(settings, 'EXTRACTION_LLM_VISION_RETRY_PDF_DPI', 180)))
    retry_timeout_seconds = max(
        timeout_seconds,
        int(getattr(settings, 'EXTRACTION_LLM_VISION_RETRY_TIMEOUT_SECONDS', timeout_seconds)),
    )
    retry_max_pages = max(
        max_pages,
        int(getattr(settings, 'EXTRACTION_LLM_VISION_RETRY_MAX_PAGES', max(max_pages, 2))),
    )
    base_url = str(getattr(settings, 'EXTRACTION_LLM_BASE_URL', 'http://127.0.0.1:11434')).rstrip('/')
    generate_url = f'{base_url}{OLLAMA_GENERATE_PATH}'

    policy_ok, policy_error = _validate_runtime_policy(
        base_url=base_url,
        model_name=model_name,
        timeout_seconds=timeout_seconds,
        require_pinned_model=bool(getattr(settings, 'EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL', True)),
        require_model_digest=bool(getattr(settings, 'EXTRACTION_LLM_VISION_REQUIRE_MODEL_DIGEST', False)),
        required_digest=str(getattr(settings, 'EXTRACTION_LLM_VISION_MODEL_DIGEST', '')).strip(),
    )
    if not policy_ok:
        logger.warning('LLM vision parse policy check failed: %s', policy_error)
        telemetry['llm_failure_reason'] = 'schema_reject'
        return [], empty_meta, telemetry

    retryable_reasons = {'timeout', 'empty_courses', 'invalid_json', 'schema_reject'}

    for attempt_index in range(retry_count + 1):
        telemetry['llm_retry_count'] = attempt_index
        is_retry = attempt_index > 0
        attempt_timeout_seconds = retry_timeout_seconds if is_retry else timeout_seconds
        attempt_max_pages = retry_max_pages if is_retry else max_pages
        attempt_max_tokens = retry_max_tokens if is_retry else max_tokens
        attempt_image_max_edge = min(image_max_edge, retry_image_max_edge) if is_retry else image_max_edge
        attempt_image_quality = min(image_quality, retry_image_quality) if is_retry else image_quality
        attempt_pdf_dpi = min(pdf_dpi, retry_pdf_dpi) if is_retry else pdf_dpi
        request_timeout: float | Tuple[float, float] = (
            connect_timeout_seconds,
            max(1, attempt_timeout_seconds),
        )

        images_b64 = _load_document_images_for_vision(
            file_path,
            max_pages=attempt_max_pages,
            image_max_edge=attempt_image_max_edge,
            image_quality=attempt_image_quality,
            pdf_dpi=attempt_pdf_dpi,
        )
        if not images_b64:
            telemetry['llm_failure_reason'] = 'empty_courses'
            return [], empty_meta, telemetry

        try:
            request_options: Dict[str, Any] = {'temperature': 0}
            if attempt_max_tokens > 0:
                request_options['num_predict'] = attempt_max_tokens

            request_payload = {
                'model': model_name,
                'prompt': _build_vision_parse_prompt(upload_type),
                'images': images_b64,
                'stream': False,
                'format': 'json',
                'options': request_options,
            }
            response = requests.post(
                generate_url,
                json=request_payload,
                timeout=request_timeout,
                headers=_build_ollama_headers(content_type=True),
            )
            response.raise_for_status()
            ollama_payload = response.json()
            llm_output = _extract_response_text(ollama_payload)
            if not llm_output:
                telemetry['llm_failure_reason'] = 'empty_courses'
                logger.warning('LLM vision parse returned empty response')
                if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                    return [], empty_meta, telemetry
                continue

            parsed = _parse_llm_json(llm_output)
            unknown_top = set(parsed.keys()) - {'courses', 'doc_metadata'}
            if unknown_top:
                logger.warning(
                    'LLM vision parse response had unknown top-level keys (ignored): %s',
                    sorted(unknown_top),
                )

            courses_raw = parsed.get('courses')
            if not isinstance(courses_raw, list):
                telemetry['llm_failure_reason'] = 'schema_reject'
                logger.warning('LLM vision parse: "courses" is not a list')
                if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                    return [], empty_meta, telemetry
                continue

            courses = _coerce_courses(courses_raw)
            if not courses and courses_raw:
                telemetry['llm_failure_reason'] = 'schema_reject'
                logger.warning('LLM vision parse: unusable courses after sanitization')
                if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                    return [], empty_meta, telemetry
                continue

            if not _validate_normalized_courses(courses):
                telemetry['llm_failure_reason'] = 'schema_reject'
                logger.warning('LLM vision parse: course schema validation failed')
                if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                    return [], empty_meta, telemetry
                continue

            if not courses:
                telemetry['llm_failure_reason'] = 'empty_courses'
                logger.warning('LLM vision parse returned zero courses')
                if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                    return [], empty_meta, telemetry
                continue

            raw_doc_meta = parsed.get('doc_metadata', {})
            if raw_doc_meta and not _validate_doc_metadata(raw_doc_meta):
                logger.warning('LLM vision parse: doc_metadata schema validation failed')

            doc_metadata: Dict[str, Any] = _sanitize_doc_metadata(raw_doc_meta)
            telemetry['llm_parse_success'] = True
            telemetry['llm_failure_reason'] = ''
            return courses, doc_metadata, telemetry
        except requests.Timeout:
            telemetry['llm_failure_reason'] = 'timeout'
            logger.warning('LLM vision parse timed out after %ss', attempt_timeout_seconds)
            if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                return [], empty_meta, telemetry
            continue
        except requests.RequestException:
            telemetry['llm_failure_reason'] = 'schema_reject'
            logger.warning('LLM vision parse request failed', exc_info=True)
            if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                return [], empty_meta, telemetry
            continue
        except (JSONDecodeError, ValueError):
            telemetry['llm_failure_reason'] = 'invalid_json'
            logger.warning('LLM vision parse output was not valid JSON')
            if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                return [], empty_meta, telemetry
            continue

    return [], empty_meta, telemetry


def parse_document_metadata_with_llm_vision(
    *,
    file_path: str,
    upload_type: str,
    timeout_seconds_override: int | None = None,
    max_pages_override: int | None = None,
    retry_count_override: int | None = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Lightweight vision call for ownership gating.

    Extracts only doc_metadata.student_number using a smaller budget
    (page/timeout/retry overrides), reducing synchronous request latency.
    """
    empty_meta: Dict[str, Any] = {'student_number': '', 'semester': '', 'school_year': ''}
    telemetry: Dict[str, Any] = {
        'llm_used': False,
        'llm_parse_success': False,
        'llm_failure_reason': '',
        'llm_model': '',
        'llm_timeout_seconds': int(getattr(settings, 'EXTRACTION_LLM_TIMEOUT_SECONDS', 12)),
        'llm_retry_count': 0,
        'stage': 'llm_vision_metadata_gate',
    }

    if not bool(getattr(settings, 'EXTRACTION_LLM_VISION_PARSE_ENABLED', False)):
        telemetry['llm_failure_reason'] = 'schema_reject'
        return empty_meta, telemetry
    if not bool(getattr(settings, 'EXTRACTION_LLM_NORMALIZATION_ENABLED', False)):
        telemetry['llm_failure_reason'] = 'schema_reject'
        return empty_meta, telemetry

    model_name = str(getattr(settings, 'EXTRACTION_LLM_VISION_MODEL_NAME', '')).strip()
    telemetry['llm_model'] = model_name
    telemetry['llm_used'] = True

    if not model_name:
        telemetry['llm_failure_reason'] = 'schema_reject'
        return empty_meta, telemetry

    default_timeout = int(getattr(settings, 'EXTRACTION_LLM_TIMEOUT_SECONDS', 12))
    timeout_seconds = int(timeout_seconds_override or default_timeout)
    max_pages = max(1, int(max_pages_override or 1))
    retry_count = max(0, int(retry_count_override or 0))
    base_url = str(getattr(settings, 'EXTRACTION_LLM_BASE_URL', 'http://127.0.0.1:11434')).rstrip('/')
    generate_url = f'{base_url}{OLLAMA_GENERATE_PATH}'

    policy_ok, policy_error = _validate_runtime_policy(
        base_url=base_url,
        model_name=model_name,
        timeout_seconds=timeout_seconds,
        require_pinned_model=bool(getattr(settings, 'EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL', True)),
        require_model_digest=bool(getattr(settings, 'EXTRACTION_LLM_VISION_REQUIRE_MODEL_DIGEST', False)),
        required_digest=str(getattr(settings, 'EXTRACTION_LLM_VISION_MODEL_DIGEST', '')).strip(),
    )
    if not policy_ok:
        logger.warning('LLM metadata gate policy check failed: %s', policy_error)
        telemetry['llm_failure_reason'] = 'schema_reject'
        return empty_meta, telemetry

    retryable_reasons = {'timeout', 'metadata_missing'}

    for attempt_index in range(retry_count + 1):
        telemetry['llm_retry_count'] = attempt_index
        is_retry = attempt_index > 0

        images_b64 = _load_document_images_for_vision(file_path, max_pages=max_pages)
        if not images_b64:
            telemetry['llm_failure_reason'] = 'metadata_missing'
            return empty_meta, telemetry

        try:
            request_payload = {
                'model': model_name,
                'prompt': _build_vision_metadata_prompt(upload_type),
                'images': images_b64,
                'stream': False,
                'format': 'json',
                'options': {'temperature': 0},
            }
            response = requests.post(
                generate_url,
                json=request_payload,
                timeout=timeout_seconds,
                headers=_build_ollama_headers(content_type=True),
            )
            response.raise_for_status()
            ollama_payload = response.json()
            llm_output = _extract_response_text(ollama_payload)
            if not llm_output:
                telemetry['llm_failure_reason'] = 'metadata_missing'
                if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                    return empty_meta, telemetry
                continue

            parsed = _parse_llm_json(llm_output)
            raw_doc_meta = parsed.get('doc_metadata', {})

            # Recovery for occasional non-schema outputs:
            # {"student_number": "2022-01191"}
            if not raw_doc_meta and isinstance(parsed.get('student_number'), str):
                raw_doc_meta = {'student_number': parsed.get('student_number')}

            doc_metadata: Dict[str, Any] = _sanitize_doc_metadata(raw_doc_meta)
            student_number = str(doc_metadata.get('student_number') or '').strip()

            if student_number:
                telemetry['llm_parse_success'] = True
                telemetry['llm_failure_reason'] = ''
                return doc_metadata, telemetry

            telemetry['llm_failure_reason'] = 'metadata_missing'
            if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                return empty_meta, telemetry
        except requests.Timeout:
            telemetry['llm_failure_reason'] = 'timeout'
            logger.warning('LLM metadata gate timed out after %ss', timeout_seconds)
            if is_retry:
                return empty_meta, telemetry
            continue
        except requests.RequestException:
            telemetry['llm_failure_reason'] = 'schema_reject'
            logger.exception('LLM metadata gate request failed')
            return empty_meta, telemetry
        except (JSONDecodeError, ValueError):
            telemetry['llm_failure_reason'] = 'invalid_json'
            logger.warning('LLM metadata gate output was not valid JSON')
            return empty_meta, telemetry

    return empty_meta, telemetry


def parse_with_llm(
    *,
    raw_text: str,
    upload_type: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    """
    Use Ollama to parse raw OCR/PDF text directly into structured courses + metadata.

    This is a FULL-DOCUMENT parse — it does not require seed courses from the
    regex parser and can handle formats the regex cannot (handwritten, informal).

    Gated by: EXTRACTION_LLM_FULL_PARSE_ENABLED (must be True) AND
               EXTRACTION_LLM_NORMALIZATION_ENABLED (must be True).

    Returns:
        (courses, doc_metadata, telemetry)
        - courses: list of course dicts (may be empty on failure)
        - doc_metadata: dict with student_number / semester / school_year
        - telemetry: dict with llm_used, llm_parse_success, llm_model, etc.
    """
    empty_meta: Dict[str, Any] = {'student_number': '', 'semester': '', 'school_year': ''}
    telemetry: Dict[str, Any] = {
        'llm_used': False,
        'llm_parse_success': False,
        'llm_model': '',
        'llm_timeout_seconds': int(getattr(settings, 'EXTRACTION_LLM_TIMEOUT_SECONDS', 12)),
        'stage': 'llm_full_parse',
    }

    # Gate 1: full-parse feature flag
    if not bool(getattr(settings, 'EXTRACTION_LLM_FULL_PARSE_ENABLED', False)):
        return [], empty_meta, telemetry

    # Gate 2: general LLM normalization flag
    if not bool(getattr(settings, 'EXTRACTION_LLM_NORMALIZATION_ENABLED', False)):
        return [], empty_meta, telemetry

    model_name = str(getattr(settings, 'EXTRACTION_LLM_MODEL_NAME', '')).strip()
    telemetry['llm_model'] = model_name
    telemetry['llm_used'] = True

    if not model_name:
        logger.warning('LLM full-parse enabled but EXTRACTION_LLM_MODEL_NAME is empty')
        return [], empty_meta, telemetry

    timeout_seconds = int(getattr(settings, 'EXTRACTION_LLM_TIMEOUT_SECONDS', 12))
    max_input_chars = int(getattr(settings, 'EXTRACTION_LLM_MAX_INPUT_CHARS', 6000))
    base_url = str(getattr(settings, 'EXTRACTION_LLM_BASE_URL', 'http://127.0.0.1:11434')).rstrip('/')
    generate_url = f'{base_url}{OLLAMA_GENERATE_PATH}'

    policy_ok, policy_error = _validate_runtime_policy(
        base_url=base_url,
        model_name=model_name,
        timeout_seconds=timeout_seconds,
    )
    if not policy_ok:
        logger.warning('LLM full-parse policy check failed: %s', policy_error)
        return [], empty_meta, telemetry

    bounded_text = _truncate_text(raw_text, max_input_chars)
    if not bounded_text:
        logger.warning('LLM full-parse skipped: raw text is empty after truncation')
        return [], empty_meta, telemetry

    try:
        request_payload = {
            'model': model_name,
            'prompt': _build_full_parse_prompt(bounded_text, upload_type),
            'stream': False,
            'format': 'json',
            'options': {'temperature': 0},
        }
        response = requests.post(
            generate_url,
            json=request_payload,
            timeout=timeout_seconds,
            headers=_build_ollama_headers(content_type=True),
        )
        response.raise_for_status()
        ollama_payload = response.json()
        llm_output = _extract_response_text(ollama_payload)
        if not llm_output:
            logger.warning('LLM full-parse returned empty response')
            return [], empty_meta, telemetry

        parsed = _parse_llm_json(llm_output)

        # Validate top-level keys — log unknown keys but do NOT discard the response
        unknown_top = set(parsed.keys()) - {'courses', 'doc_metadata'}
        if unknown_top:
            logger.warning(
                'LLM full-parse response had unknown top-level keys (ignored): %s',
                sorted(unknown_top),
            )

        # Extract and validate courses
        courses_raw = parsed.get('courses')
        courses = _coerce_courses(courses_raw)
        if not isinstance(courses_raw, list):
            logger.warning('LLM full-parse: "courses" is not a list')
            return [], empty_meta, telemetry
        if not courses and courses_raw:
            logger.warning('LLM full-parse: unusable courses after sanitization')
            return [], empty_meta, telemetry
        if not _validate_normalized_courses(courses):
            logger.warning('LLM full-parse: course schema validation failed')
            return [], empty_meta, telemetry

        # Extract and validate doc_metadata
        raw_doc_meta = parsed.get('doc_metadata', {})
        if raw_doc_meta and not _validate_doc_metadata(raw_doc_meta):
            logger.warning('LLM full-parse: doc_metadata schema validation failed')
        doc_metadata: Dict[str, Any] = _sanitize_doc_metadata(raw_doc_meta)

        telemetry['llm_parse_success'] = True
        logger.info(
            'LLM full-parse success: %d courses, student_number=%s, semester=%s',
            len(courses),
            doc_metadata.get('student_number'),
            doc_metadata.get('semester'),
        )
        return courses, doc_metadata, telemetry

    except requests.Timeout:
        logger.warning('LLM full-parse timed out after %ss', timeout_seconds)
        return [], empty_meta, telemetry
    except requests.RequestException:
        logger.exception('LLM full-parse request failed')
        return [], empty_meta, telemetry
    except (JSONDecodeError, ValueError):
        logger.warning('LLM full-parse output was not valid JSON')
        return [], empty_meta, telemetry
