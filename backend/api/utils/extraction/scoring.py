from typing import Any, Dict, List

from django.conf import settings

from .types import ScoreResult


DEFAULT_RELIABILITY_PRIOR = {
    "pdf_text": 0.92,
    "ocr": 0.74,
    "ocr_fallback": 0.68,
    "pdf_text_only": 0.6,
    "none": 0.0,
}

DEFAULT_SCORE_WEIGHTS = {
    "completeness": 0.25,
    "validity": 0.25,
    "consistency": 0.20,
    "parser_reliability": 0.15,
    "agreement": 0.15,
}


def _bounded(value: float) -> float:
    return round(max(0.0, min(1.0, value)), 4)


def _completeness_score(courses: List[Dict[str, Any]]) -> float:
    if not courses:
        return 0.0
    fields = ["subject_code", "day", "start_time", "end_time", "subject_name", "location"]
    score_sum = 0.0
    for course in courses:
        present = sum(1 for f in fields if str(course.get(f, "")).strip())
        score_sum += present / len(fields)
    return score_sum / len(courses)


def _consistency_score(courses: List[Dict[str, Any]]) -> float:
    if not courses:
        return 0.0
    consistent = 0
    for course in courses:
        has_required = all(str(course.get(f, "")).strip() for f in ("subject_code", "day", "start_time", "end_time"))
        if has_required:
            consistent += 1
    return consistent / len(courses)


def _validity_score(validator_errors: List[str]) -> float:
    if not validator_errors:
        return 1.0
    return max(0.0, 1.0 - (0.15 * len(validator_errors)))


def _prior_score(attempts: List[str]) -> float:
    if not attempts:
        return 0.0
    priors = getattr(settings, "EXTRACTION_PARSER_RELIABILITY_PRIOR", DEFAULT_RELIABILITY_PRIOR)
    final_method = attempts[-1]
    return float(priors.get(final_method, 0.5))


def _agreement_score(attempts: List[str]) -> float:
    unique_attempts = {a for a in attempts if a}
    if not unique_attempts:
        return 0.0
    if len(unique_attempts) == 1:
        return 1.0
    return 0.7


def _resolve_weights(upload_type: str) -> Dict[str, float]:
    weights = dict(DEFAULT_SCORE_WEIGHTS)

    configured = getattr(settings, "EXTRACTION_SCORE_WEIGHTS", None)
    if isinstance(configured, dict):
        weights.update({k: float(v) for k, v in configured.items() if k in weights})

    by_upload_type = getattr(settings, "EXTRACTION_SCORE_WEIGHTS_BY_UPLOAD_TYPE", None)
    if isinstance(by_upload_type, dict):
        scoped = by_upload_type.get((upload_type or "").lower())
        if isinstance(scoped, dict):
            weights.update({k: float(v) for k, v in scoped.items() if k in weights})

    return weights


def score_candidates(
    courses: List[Dict[str, Any]],
    validator_errors: List[str],
    attempts: List[str],
    upload_type: str = "student",
) -> ScoreResult:
    weights = _resolve_weights(upload_type)

    breakdown = {
        "completeness": _bounded(_completeness_score(courses)),
        "validity": _bounded(_validity_score(validator_errors)),
        "consistency": _bounded(_consistency_score(courses)),
        "parser_reliability": _bounded(_prior_score(attempts)),
        "agreement": _bounded(_agreement_score(attempts)),
    }

    weighted = sum(breakdown[name] * weights[name] for name in breakdown)
    return ScoreResult(confidence=_bounded(weighted), breakdown=breakdown)
