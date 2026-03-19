import json
import logging
from typing import Any, Dict, List, Tuple

from django.conf import settings

logger = logging.getLogger(__name__)

ALLOWED_KEYS = {
    'subject_code',
    'subject_name',
    'day',
    'start_time',
    'end_time',
    'location',
    'metadata',
}


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
    telemetry = {
        'llm_used': False,
        'llm_parse_success': False,
        'llm_model': '',
    }

    if not bool(getattr(settings, 'EXTRACTION_LLM_NORMALIZATION_ENABLED', False)):
        return seed_courses, telemetry

    telemetry['llm_used'] = True
    model_name = str(getattr(settings, 'EXTRACTION_LLM_MODEL_NAME', '')).strip()
    telemetry['llm_model'] = model_name

    # Phase 3 implementation hook: replace this with isolated local inference.
    # For now, keep behavior deterministic and fail-closed.
    llm_output = ''

    if not llm_output:
        return seed_courses, telemetry

    try:
        parsed = json.loads(llm_output)
        if not isinstance(parsed, dict) or 'courses' not in parsed:
            return seed_courses, telemetry
        courses = parsed.get('courses')
        if not isinstance(courses, list):
            return seed_courses, telemetry
        if not _validate_normalized_courses(courses):
            return seed_courses, telemetry
        telemetry['llm_parse_success'] = True
        return courses, telemetry
    except json.JSONDecodeError:
        logger.warning('LLM normalization output was not valid JSON')
        return seed_courses, telemetry
