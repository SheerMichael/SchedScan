import json
import logging
import base64
import os
import time
import math
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


def _encode_image_to_jpeg_b64(
    image,
    *,
    image_max_edge: int,
    image_quality: int,
    grayscale: bool,
) -> str:
    prepared = _prepare_image_for_vision(
        image,
        image_max_edge=image_max_edge,
        grayscale=grayscale,
    )
    return _encode_prepared_image_to_jpeg_b64(
        prepared,
        image_quality=image_quality,
    )


def _prepare_image_for_vision(
    image,
    *,
    image_max_edge: int,
    grayscale: bool,
):
    from PIL import Image

    if grayscale:
        image = image.convert('L').convert('RGB')
    else:
        image = image.convert('RGB')

    width, height = image.size
    max_edge = max(640, int(image_max_edge))
    if max(width, height) > max_edge:
        ratio = max_edge / float(max(width, height))
        resized = (max(1, int(width * ratio)), max(1, int(height * ratio)))
        image = image.resize(resized, Image.Resampling.LANCZOS)

    return image


def _encode_prepared_image_to_jpeg_b64(
    image,
    *,
    image_quality: int,
) -> str:
    quality = max(35, min(95, int(image_quality)))
    buffer = BytesIO()
    image.save(buffer, format='JPEG', quality=quality, optimize=True)
    return base64.b64encode(buffer.getvalue()).decode('ascii')


def _slice_image_horizontally(
    image,
    *,
    chunk_count: int,
    overlap_ratio: float,
):
    width, height = image.size
    slices = []

    chunk_count = max(1, int(chunk_count))
    if chunk_count == 1 or height <= 1:
        return [image]

    chunk_height = max(1, int(math.ceil(height / float(chunk_count))))
    overlap_px = max(0, int(chunk_height * max(0.0, min(0.45, overlap_ratio))))

    for idx in range(chunk_count):
        start = max(0, idx * chunk_height - overlap_px)
        end = min(height, (idx + 1) * chunk_height + overlap_px)
        if start >= end:
            continue
        slices.append(image.crop((0, start, width, end)))

    return slices or [image]


def _dedupe_courses(courses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    deduped: List[Dict[str, Any]] = []

    for course in courses:
        key = (
            str(course.get('subject_code') or '').strip().upper(),
            str(course.get('day') or '').strip().upper(),
            str(course.get('start_time') or '').strip().upper(),
            str(course.get('end_time') or '').strip().upper(),
            str(course.get('location') or '').strip().upper(),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(course)

    return deduped


def _estimate_document_complexity(file_path: str) -> Dict[str, Any]:
    extension = os.path.splitext(file_path)[1].lower()
    file_size_mb = 0.0
    image_megapixels = 0.0

    try:
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    except OSError:
        file_size_mb = 0.0

    if extension in _VISION_IMAGE_EXTENSIONS:
        try:
            from PIL import Image

            with Image.open(file_path) as image:
                width, height = image.size
                image_megapixels = (width * height) / 1_000_000.0
        except Exception:
            image_megapixels = 0.0

    tier = 'normal'
    huge_file_mb = float(getattr(settings, 'EXTRACTION_LLM_VISION_ADAPTIVE_FILE_SIZE_MB_HUGE', 7.0))
    large_file_mb = float(getattr(settings, 'EXTRACTION_LLM_VISION_ADAPTIVE_FILE_SIZE_MB_LARGE', 3.0))
    huge_mp = float(getattr(settings, 'EXTRACTION_LLM_VISION_ADAPTIVE_IMAGE_MP_HUGE', 10.0))
    large_mp = float(getattr(settings, 'EXTRACTION_LLM_VISION_ADAPTIVE_IMAGE_MP_LARGE', 4.0))

    if file_size_mb >= huge_file_mb or image_megapixels >= huge_mp:
        tier = 'very_heavy'
    elif file_size_mb >= large_file_mb or image_megapixels >= large_mp:
        tier = 'heavy'

    return {
        'tier': tier,
        'file_size_mb': round(file_size_mb, 3),
        'image_megapixels': round(image_megapixels, 3),
    }


def _build_adaptive_attempt_profiles(
    *,
    timeout_seconds: int,
    retry_timeout_seconds: int,
    max_pages: int,
    retry_max_pages: int,
    max_tokens: int,
    retry_max_tokens: int,
    image_max_edge: int,
    retry_image_max_edge: int,
    image_quality: int,
    retry_image_quality: int,
    pdf_dpi: int,
    retry_pdf_dpi: int,
    retry_count: int,
    complexity_tier: str,
    adaptive_enabled: bool,
) -> List[Dict[str, int]]:
    profiles: List[Dict[str, int]] = []

    base_profile = {
        'timeout_seconds': max(1, int(timeout_seconds)),
        'max_pages': max(1, int(max_pages)),
        'max_tokens': max(64, int(max_tokens)),
        'image_max_edge': max(640, int(image_max_edge)),
        'image_quality': max(35, min(95, int(image_quality))),
        'pdf_dpi': max(120, int(pdf_dpi)),
    }
    retry_profile = {
        'timeout_seconds': max(1, int(retry_timeout_seconds)),
        'max_pages': max(1, int(retry_max_pages)),
        'max_tokens': max(64, int(retry_max_tokens)),
        'image_max_edge': max(640, int(retry_image_max_edge)),
        'image_quality': max(35, min(95, int(retry_image_quality))),
        'pdf_dpi': max(120, int(retry_pdf_dpi)),
    }

    if adaptive_enabled and complexity_tier in {'heavy', 'very_heavy'}:
        first_pass_timeout_cap = int(
            getattr(settings, 'EXTRACTION_LLM_VISION_ADAPTIVE_FIRST_PASS_TIMEOUT_SECONDS', 90)
        )
        if complexity_tier == 'very_heavy':
            budget = {
                'timeout_seconds': min(base_profile['timeout_seconds'], max(30, first_pass_timeout_cap)),
                'max_pages': 1,
                'max_tokens': min(base_profile['max_tokens'], 256),
                'image_max_edge': min(base_profile['image_max_edge'], 960),
                'image_quality': min(base_profile['image_quality'], 52),
                'pdf_dpi': min(base_profile['pdf_dpi'], 150),
            }
        else:
            budget = {
                'timeout_seconds': min(base_profile['timeout_seconds'], max(45, first_pass_timeout_cap)),
                'max_pages': min(base_profile['max_pages'], 1),
                'max_tokens': min(base_profile['max_tokens'], 320),
                'image_max_edge': min(base_profile['image_max_edge'], 1024),
                'image_quality': min(base_profile['image_quality'], 56),
                'pdf_dpi': min(base_profile['pdf_dpi'], 170),
            }
        profiles.append(budget)
    else:
        profiles.append(base_profile)

    for _ in range(max(0, int(retry_count))):
        profiles.append(dict(retry_profile))

    return profiles


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
    grayscale: bool = False,
    enable_chunking: bool = False,
    chunk_count: int = 1,
    chunk_overlap_ratio: float = 0.0,
    chunking_min_height_px: int = 0,
    max_chunks: int = 12,
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
            prepared = _prepare_image_for_vision(
                page,
                image_max_edge=image_max_edge,
                grayscale=grayscale,
            )
            chunks = [prepared]
            if enable_chunking and int(chunk_count) > 1 and prepared.size[1] >= int(chunking_min_height_px):
                chunks = _slice_image_horizontally(
                    prepared,
                    chunk_count=chunk_count,
                    overlap_ratio=chunk_overlap_ratio,
                )
            chunks = chunks[: max(1, int(max_chunks))]
            for chunk in chunks:
                images_b64.append(
                    _encode_prepared_image_to_jpeg_b64(
                        chunk,
                        image_quality=image_quality,
                    )
                )
        return images_b64

    if extension in _VISION_IMAGE_EXTENSIONS:
        # Large phone images can trigger long multimodal decode/inference times.
        # Resize/compress before sending to Ollama to reduce timeout risk.
        try:
            from PIL import Image

            with Image.open(file_path) as image:
                prepared = _prepare_image_for_vision(
                    image,
                    image_max_edge=image_max_edge,
                    grayscale=grayscale,
                )
                chunks = [prepared]
                if enable_chunking and int(chunk_count) > 1 and prepared.size[1] >= int(chunking_min_height_px):
                    chunks = _slice_image_horizontally(
                        prepared,
                        chunk_count=chunk_count,
                        overlap_ratio=chunk_overlap_ratio,
                    )
                chunks = chunks[: max(1, int(max_chunks))]
                return [
                    _encode_prepared_image_to_jpeg_b64(
                        chunk,
                        image_quality=image_quality,
                    )
                    for chunk in chunks
                ]
        except Exception:
            logger.exception('LLM vision image preprocessing failed; falling back to raw bytes')
            with open(file_path, 'rb') as infile:
                return [base64.b64encode(infile.read()).decode('ascii')]

    logger.warning('LLM vision parse skipped: unsupported file extension %s', extension)
    return []


def _parse_vision_response_payload(ollama_payload: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Dict[str, Any], str]:
    llm_output = _extract_response_text(ollama_payload)
    if not llm_output:
        logger.warning('LLM vision parse returned empty response')
        return [], {'student_number': '', 'semester': '', 'school_year': ''}, 'empty_courses'

    try:
        parsed = _parse_llm_json(llm_output)
    except (JSONDecodeError, ValueError):
        logger.warning('LLM vision parse output was not valid JSON')
        return [], {'student_number': '', 'semester': '', 'school_year': ''}, 'invalid_json'

    unknown_top = set(parsed.keys()) - {'courses', 'doc_metadata'}
    if unknown_top:
        logger.warning(
            'LLM vision parse response had unknown top-level keys (ignored): %s',
            sorted(unknown_top),
        )

    courses_raw = parsed.get('courses')
    if not isinstance(courses_raw, list):
        logger.warning('LLM vision parse: "courses" is not a list')
        return [], {'student_number': '', 'semester': '', 'school_year': ''}, 'schema_reject'

    courses = _coerce_courses(courses_raw)
    if not courses and courses_raw:
        logger.warning('LLM vision parse: unusable courses after sanitization')
        return [], {'student_number': '', 'semester': '', 'school_year': ''}, 'schema_reject'

    if not _validate_normalized_courses(courses):
        logger.warning('LLM vision parse: course schema validation failed')
        return [], {'student_number': '', 'semester': '', 'school_year': ''}, 'schema_reject'

    if not courses:
        logger.warning('LLM vision parse returned zero courses')
        return [], {'student_number': '', 'semester': '', 'school_year': ''}, 'empty_courses'

    raw_doc_meta = parsed.get('doc_metadata', {})
    if raw_doc_meta and not _validate_doc_metadata(raw_doc_meta):
        logger.warning('LLM vision parse: doc_metadata schema validation failed')

    doc_metadata: Dict[str, Any] = _sanitize_doc_metadata(raw_doc_meta)
    return courses, doc_metadata, ''


def parse_document_with_llm_vision(
    *,
    file_path: str,
    upload_type: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    """
    Parse document images directly with a vision-capable LLM.

    When EXTRACTION_LLM_PROVIDER is set to a cloud provider (gemini, groq,
    cloud, auto), the request is routed to the cloud client first.  In
    'auto' mode, a cloud failure falls through to the Ollama code path
    below.  When the provider is 'ollama' (default), only the Ollama path
    is used.
    """
    # --- Cloud provider routing -------------------------------------------
    _provider = str(
        getattr(settings, 'EXTRACTION_LLM_PROVIDER', 'ollama')
    ).strip().lower()
    if _provider in ('gemini', 'groq', 'cloud', 'auto'):
        try:
            from .cloud_llm_client import parse_document_with_cloud_vision

            cloud_courses, cloud_meta, cloud_telemetry = (
                parse_document_with_cloud_vision(
                    file_path=file_path,
                    upload_type=upload_type,
                )
            )
            # If a dedicated cloud provider succeeded or failed definitively,
            # return its result.  In 'auto' mode, only fall through on
            # total failure (llm_parse_success=False) so Ollama can try.
            if (
                cloud_telemetry.get('llm_parse_success')
                or _provider != 'auto'
            ):
                return cloud_courses, cloud_meta, cloud_telemetry
            # 'auto' mode: cloud failed — fall through to Ollama below
            logger.warning(
                'Cloud vision providers exhausted (failure_reason=%s); '
                'falling back to Ollama.',
                cloud_telemetry.get('llm_failure_reason', ''),
            )
        except Exception:
            if _provider != 'auto':
                raise
            logger.exception(
                'Cloud vision client raised an unexpected error; '
                'falling back to Ollama.',
            )
    # --- End cloud routing ------------------------------------------------

    empty_meta: Dict[str, Any] = {'student_number': '', 'semester': '', 'school_year': ''}
    telemetry: Dict[str, Any] = {
        'llm_used': False,
        'llm_parse_success': False,
        'llm_failure_reason': '',
        'llm_timeout_type': '',
        'llm_model': '',
        'llm_timeout_seconds': int(getattr(settings, 'EXTRACTION_LLM_TIMEOUT_SECONDS', 12)),
        'llm_retry_count': 0,
        'llm_preprocess_seconds': 0.0,
        'llm_request_seconds': 0.0,
        'llm_total_seconds': 0.0,
        'llm_complexity_tier': 'normal',
        'llm_file_size_mb': 0.0,
        'llm_image_megapixels': 0.0,
        'llm_attempt_metrics': [],
        'stage': 'llm_vision_parse',
    }
    parse_started = time.monotonic()

    def _flush_attempt_metric(metric: Dict[str, Any], outcome: str) -> None:
        metric['outcome'] = outcome
        attempts = telemetry.get('llm_attempt_metrics')
        if not isinstance(attempts, list):
            attempts = []
            telemetry['llm_attempt_metrics'] = attempts
        attempts.append(metric)

        preprocess_total = 0.0
        request_total = 0.0
        for entry in attempts:
            preprocess_total += float(entry.get('preprocess_seconds') or 0.0)
            request_total += float(entry.get('request_seconds') or 0.0)

        telemetry['llm_preprocess_seconds'] = round(preprocess_total, 3)
        telemetry['llm_request_seconds'] = round(request_total, 3)
        telemetry['llm_total_seconds'] = round(time.monotonic() - parse_started, 3)

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
    adaptive_enabled = bool(getattr(settings, 'EXTRACTION_LLM_VISION_ADAPTIVE_BUDGET_ENABLED', True))
    adaptive_grayscale_enabled = bool(
        getattr(settings, 'EXTRACTION_LLM_VISION_ADAPTIVE_GRAYSCALE_ENABLED', True)
    )
    chunking_enabled = bool(getattr(settings, 'EXTRACTION_LLM_VISION_CHUNKING_ENABLED', True))
    chunking_force_enabled = bool(
        getattr(settings, 'EXTRACTION_LLM_VISION_CHUNKING_FORCE_ENABLED', False)
    )
    chunk_count = max(1, int(getattr(settings, 'EXTRACTION_LLM_VISION_CHUNK_COUNT', 3)))
    chunk_overlap_ratio = float(getattr(settings, 'EXTRACTION_LLM_VISION_CHUNK_OVERLAP_RATIO', 0.12))
    chunking_min_height_px = max(
        1,
        int(getattr(settings, 'EXTRACTION_LLM_VISION_CHUNKING_MIN_HEIGHT_PX', 900)),
    )
    chunking_max_chunks = max(
        1,
        int(getattr(settings, 'EXTRACTION_LLM_VISION_CHUNKING_MAX_CHUNKS', 4)),
    )
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
        1,
        int(getattr(settings, 'EXTRACTION_LLM_VISION_RETRY_TIMEOUT_SECONDS', timeout_seconds)),
    )
    retry_max_pages = max(
        max_pages,
        int(getattr(settings, 'EXTRACTION_LLM_VISION_RETRY_MAX_PAGES', max(max_pages, 2))),
    )

    complexity_profile = _estimate_document_complexity(file_path)
    complexity_tier = str(complexity_profile.get('tier') or 'normal')
    telemetry['llm_complexity_tier'] = complexity_tier
    telemetry['llm_file_size_mb'] = float(complexity_profile.get('file_size_mb') or 0.0)
    telemetry['llm_image_megapixels'] = float(complexity_profile.get('image_megapixels') or 0.0)

    attempt_profiles = _build_adaptive_attempt_profiles(
        timeout_seconds=timeout_seconds,
        retry_timeout_seconds=retry_timeout_seconds,
        max_pages=max_pages,
        retry_max_pages=retry_max_pages,
        max_tokens=max_tokens,
        retry_max_tokens=retry_max_tokens,
        image_max_edge=image_max_edge,
        retry_image_max_edge=retry_image_max_edge,
        image_quality=image_quality,
        retry_image_quality=retry_image_quality,
        pdf_dpi=pdf_dpi,
        retry_pdf_dpi=retry_pdf_dpi,
        retry_count=retry_count,
        complexity_tier=complexity_tier,
        adaptive_enabled=adaptive_enabled,
    )

    logger.info(
        'LLM vision parse budget profile: tier=%s, retries=%d, first_timeout=%ss, first_pages=%s, first_tokens=%s',
        complexity_tier,
        retry_count,
        attempt_profiles[0]['timeout_seconds'] if attempt_profiles else timeout_seconds,
        attempt_profiles[0]['max_pages'] if attempt_profiles else max_pages,
        attempt_profiles[0]['max_tokens'] if attempt_profiles else max_tokens,
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

    for attempt_index, attempt_profile in enumerate(attempt_profiles):
        telemetry['llm_retry_count'] = attempt_index
        is_retry = attempt_index > 0
        attempt_timeout_seconds = int(attempt_profile['timeout_seconds'])
        attempt_max_pages = int(attempt_profile['max_pages'])
        attempt_max_tokens = int(attempt_profile['max_tokens'])
        attempt_image_max_edge = int(attempt_profile['image_max_edge'])
        attempt_image_quality = int(attempt_profile['image_quality'])
        attempt_pdf_dpi = int(attempt_profile['pdf_dpi'])
        attempt_grayscale = bool(
            adaptive_grayscale_enabled
            and adaptive_enabled
            and complexity_tier in {'heavy', 'very_heavy'}
            and attempt_index == 0
        )
        attempt_chunking_enabled = bool(
            chunking_enabled
            and (
                chunking_force_enabled
                or (attempt_index == 0 and complexity_tier in {'heavy', 'very_heavy'})
            )
        )
        request_timeout: float | Tuple[float, float] = (
            connect_timeout_seconds,
            max(1, attempt_timeout_seconds),
        )

        attempt_metric: Dict[str, Any] = {
            'attempt': attempt_index,
            'timeout_seconds': attempt_timeout_seconds,
            'max_pages': attempt_max_pages,
            'max_tokens': attempt_max_tokens,
            'complexity_tier': complexity_tier,
            'grayscale': attempt_grayscale,
            'chunking_enabled': attempt_chunking_enabled,
            'preprocess_seconds': 0.0,
            'request_seconds': 0.0,
            'timeout_type': '',
        }

        preprocess_started = time.monotonic()

        images_b64 = _load_document_images_for_vision(
            file_path,
            max_pages=attempt_max_pages,
            image_max_edge=attempt_image_max_edge,
            image_quality=attempt_image_quality,
            pdf_dpi=attempt_pdf_dpi,
            grayscale=attempt_grayscale,
            enable_chunking=attempt_chunking_enabled,
            chunk_count=chunk_count,
            chunk_overlap_ratio=chunk_overlap_ratio,
            chunking_min_height_px=chunking_min_height_px,
            max_chunks=chunking_max_chunks,
        )
        attempt_metric['preprocess_seconds'] = round(
            time.monotonic() - preprocess_started,
            3,
        )
        attempt_metric['image_count'] = len(images_b64)
        attempt_metric['payload_megabytes_estimate'] = round(
            sum(len(img) for img in images_b64) / (1024 * 1024),
            3,
        )
        if not images_b64:
            telemetry['llm_failure_reason'] = 'empty_courses'
            _flush_attempt_metric(attempt_metric, 'empty_input')
            return [], empty_meta, telemetry

        request_started = None
        try:
            request_options: Dict[str, Any] = {'temperature': 0}
            if attempt_max_tokens > 0:
                request_options['num_predict'] = attempt_max_tokens

            chunked_request_mode = attempt_chunking_enabled and len(images_b64) > 1
            attempt_metric['chunk_count'] = len(images_b64) if chunked_request_mode else 1
            if chunked_request_mode:
                aggregated_courses: List[Dict[str, Any]] = []
                aggregated_meta: Dict[str, Any] = {'student_number': '', 'semester': '', 'school_year': ''}
                chunk_error_reasons: List[str] = []
                chunk_request_seconds = 0.0
                chunk_success_count = 0

                for chunk_index, image_b64 in enumerate(images_b64):
                    chunk_payload = {
                        'model': model_name,
                        'prompt': _build_vision_parse_prompt(upload_type),
                        'images': [image_b64],
                        'stream': False,
                        'format': 'json',
                        'options': request_options,
                    }
                    request_started = time.monotonic()
                    response = requests.post(
                        generate_url,
                        json=chunk_payload,
                        timeout=request_timeout,
                        headers=_build_ollama_headers(content_type=True),
                    )
                    elapsed = time.monotonic() - request_started
                    chunk_request_seconds += elapsed
                    response.raise_for_status()

                    courses, doc_metadata, parse_failure_reason = _parse_vision_response_payload(
                        response.json()
                    )
                    if parse_failure_reason:
                        if parse_failure_reason != 'empty_courses':
                            chunk_error_reasons.append(parse_failure_reason)
                        continue

                    chunk_success_count += 1
                    aggregated_courses.extend(courses)
                    for key in ('student_number', 'semester', 'school_year'):
                        if doc_metadata.get(key) and not aggregated_meta.get(key):
                            aggregated_meta[key] = doc_metadata[key]

                    logger.debug(
                        'LLM vision chunk parsed: attempt=%s chunk=%s/%s courses=%s',
                        attempt_index,
                        chunk_index + 1,
                        len(images_b64),
                        len(courses),
                    )

                attempt_metric['request_seconds'] = round(chunk_request_seconds, 3)
                attempt_metric['chunk_success_count'] = chunk_success_count
                attempt_metric['chunk_error_count'] = len(chunk_error_reasons)

                if aggregated_courses:
                    deduped_courses = _dedupe_courses(aggregated_courses)
                    attempt_metric['deduped_course_count'] = len(deduped_courses)
                    telemetry['llm_parse_success'] = True
                    telemetry['llm_failure_reason'] = ''
                    telemetry['llm_timeout_type'] = ''
                    _flush_attempt_metric(attempt_metric, 'success_chunked')
                    return deduped_courses, aggregated_meta, telemetry

                if chunk_error_reasons:
                    failure_reason = 'schema_reject'
                    if 'invalid_json' in chunk_error_reasons:
                        failure_reason = 'invalid_json'
                else:
                    failure_reason = 'empty_courses'

                telemetry['llm_failure_reason'] = failure_reason
                _flush_attempt_metric(
                    attempt_metric,
                    'chunked_empty_or_error' if failure_reason == 'empty_courses' else 'chunked_parse_error',
                )
                if is_retry or failure_reason not in retryable_reasons:
                    return [], empty_meta, telemetry
                continue

            request_payload = {
                'model': model_name,
                'prompt': _build_vision_parse_prompt(upload_type),
                'images': images_b64,
                'stream': False,
                'format': 'json',
                'options': request_options,
            }
            request_started = time.monotonic()
            response = requests.post(
                generate_url,
                json=request_payload,
                timeout=request_timeout,
                headers=_build_ollama_headers(content_type=True),
            )
            attempt_metric['request_seconds'] = round(
                time.monotonic() - request_started,
                3,
            )
            response.raise_for_status()
            courses, doc_metadata, parse_failure_reason = _parse_vision_response_payload(response.json())
            if parse_failure_reason:
                telemetry['llm_failure_reason'] = parse_failure_reason
                _flush_attempt_metric(attempt_metric, parse_failure_reason)
                if is_retry or parse_failure_reason not in retryable_reasons:
                    return [], empty_meta, telemetry
                continue

            telemetry['llm_parse_success'] = True
            telemetry['llm_failure_reason'] = ''
            telemetry['llm_timeout_type'] = ''
            _flush_attempt_metric(attempt_metric, 'success')
            return courses, doc_metadata, telemetry
        except requests.ConnectTimeout:
            if request_started is not None:
                attempt_metric['request_seconds'] = round(
                    time.monotonic() - request_started,
                    3,
                )
            attempt_metric['timeout_type'] = 'connect'
            telemetry['llm_failure_reason'] = 'timeout'
            telemetry['llm_timeout_type'] = 'connect'
            logger.warning('LLM vision parse connect timeout after %ss', attempt_timeout_seconds)
            _flush_attempt_metric(attempt_metric, 'timeout_connect')
            if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                return [], empty_meta, telemetry
            continue
        except requests.ReadTimeout:
            if request_started is not None:
                attempt_metric['request_seconds'] = round(
                    time.monotonic() - request_started,
                    3,
                )
            attempt_metric['timeout_type'] = 'read'
            telemetry['llm_failure_reason'] = 'timeout'
            telemetry['llm_timeout_type'] = 'read'
            logger.warning('LLM vision parse read timeout after %ss', attempt_timeout_seconds)
            _flush_attempt_metric(attempt_metric, 'timeout_read')
            if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                return [], empty_meta, telemetry
            continue
        except requests.Timeout:
            if request_started is not None:
                attempt_metric['request_seconds'] = round(
                    time.monotonic() - request_started,
                    3,
                )
            attempt_metric['timeout_type'] = 'unknown'
            telemetry['llm_failure_reason'] = 'timeout'
            telemetry['llm_timeout_type'] = 'unknown'
            logger.warning('LLM vision parse timed out after %ss', attempt_timeout_seconds)
            _flush_attempt_metric(attempt_metric, 'timeout_unknown')
            if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                return [], empty_meta, telemetry
            continue
        except requests.RequestException:
            if request_started is not None:
                attempt_metric['request_seconds'] = round(
                    time.monotonic() - request_started,
                    3,
                )
            telemetry['llm_failure_reason'] = 'schema_reject'
            logger.warning('LLM vision parse request failed', exc_info=True)
            _flush_attempt_metric(attempt_metric, 'request_error')
            if is_retry or telemetry['llm_failure_reason'] not in retryable_reasons:
                return [], empty_meta, telemetry
            continue
        except (JSONDecodeError, ValueError):
            if request_started is not None:
                attempt_metric['request_seconds'] = round(
                    time.monotonic() - request_started,
                    3,
                )
            telemetry['llm_failure_reason'] = 'invalid_json'
            logger.warning('LLM vision parse output was not valid JSON')
            _flush_attempt_metric(attempt_metric, 'invalid_json')
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

    When EXTRACTION_LLM_PROVIDER is set to a cloud provider, the request
    is routed to the cloud client which is significantly faster.
    """
    # --- Cloud provider routing -------------------------------------------
    _provider = str(
        getattr(settings, 'EXTRACTION_LLM_PROVIDER', 'ollama')
    ).strip().lower()
    if _provider in ('gemini', 'groq', 'cloud', 'auto'):
        try:
            from .cloud_llm_client import parse_document_metadata_with_cloud_vision

            cloud_meta, cloud_telemetry = (
                parse_document_metadata_with_cloud_vision(
                    file_path=file_path,
                    upload_type=upload_type,
                )
            )
            if (
                cloud_telemetry.get('llm_parse_success')
                or _provider != 'auto'
            ):
                return cloud_meta, cloud_telemetry
            logger.warning(
                'Cloud metadata gate providers exhausted; falling back to Ollama.',
            )
        except Exception:
            if _provider != 'auto':
                raise
            logger.exception(
                'Cloud metadata gate raised an unexpected error; '
                'falling back to Ollama.',
            )
    # --- End cloud routing ------------------------------------------------

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
    connect_timeout_seconds = max(
        1,
        int(getattr(settings, 'EXTRACTION_LLM_VISION_CONNECT_TIMEOUT_SECONDS', 8)),
    )
    metadata_image_max_edge = max(
        640,
        int(getattr(settings, 'EXTRACTION_LLM_VISION_METADATA_IMAGE_MAX_EDGE', 960)),
    )
    metadata_image_quality = max(
        35,
        min(95, int(getattr(settings, 'EXTRACTION_LLM_VISION_METADATA_IMAGE_QUALITY', 52))),
    )
    metadata_pdf_dpi = max(
        120,
        int(getattr(settings, 'EXTRACTION_LLM_VISION_METADATA_PDF_DPI', 150)),
    )
    metadata_grayscale = bool(
        getattr(settings, 'EXTRACTION_LLM_VISION_METADATA_GRAYSCALE_ENABLED', True)
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
        logger.warning('LLM metadata gate policy check failed: %s', policy_error)
        telemetry['llm_failure_reason'] = 'schema_reject'
        return empty_meta, telemetry

    retryable_reasons = {'timeout', 'metadata_missing'}

    for attempt_index in range(retry_count + 1):
        telemetry['llm_retry_count'] = attempt_index
        is_retry = attempt_index > 0

        images_b64 = _load_document_images_for_vision(
            file_path,
            max_pages=max_pages,
            image_max_edge=metadata_image_max_edge,
            image_quality=metadata_image_quality,
            pdf_dpi=metadata_pdf_dpi,
            grayscale=metadata_grayscale,
        )
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
                timeout=(connect_timeout_seconds, max(1, timeout_seconds)),
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
