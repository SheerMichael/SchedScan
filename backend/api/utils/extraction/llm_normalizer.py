import json
import logging
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


def _validate_runtime_policy(*, base_url: str, model_name: str, timeout_seconds: int) -> Tuple[bool, str]:
    require_pinned_model = bool(getattr(settings, 'EXTRACTION_LLM_REQUIRE_PINNED_MODEL', True))
    require_model_digest = bool(getattr(settings, 'EXTRACTION_LLM_REQUIRE_MODEL_DIGEST', False))
    required_digest = str(getattr(settings, 'EXTRACTION_LLM_MODEL_DIGEST', '')).strip()

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

    model_name = str(getattr(settings, 'EXTRACTION_LLM_MODEL_NAME', '')).strip()
    base_url = str(getattr(settings, 'EXTRACTION_LLM_BASE_URL', 'http://127.0.0.1:11434')).rstrip('/')
    timeout_seconds = int(getattr(settings, 'EXTRACTION_LLM_STARTUP_CHECK_TIMEOUT_SECONDS', 2))
    strict = bool(getattr(settings, 'EXTRACTION_LLM_STARTUP_CHECK_STRICT', False))

    if not model_name:
        message = 'LLM startup check failed: EXTRACTION_LLM_MODEL_NAME is empty.'
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
    parsed = json.loads(cleaned)
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


def _validate_normalized_courses(courses: List[Dict[str, Any]]) -> bool:
    for row in courses:
        if not isinstance(row, dict):
            return False
        unknown = set(row.keys()) - ALLOWED_KEYS
        if unknown:
            return False
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
            return seed_courses, telemetry
        if not isinstance(parsed, dict) or 'courses' not in parsed:
            return seed_courses, telemetry
        courses = parsed.get('courses')
        if not isinstance(courses, list):
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
