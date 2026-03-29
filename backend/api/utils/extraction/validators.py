import re
from datetime import datetime
from typing import Any, Dict, List, Tuple

from .types import ValidationResult

ALLOWED_DAYS = {"M", "T", "W", "TH", "F", "S"}
DAY_PATTERN = re.compile(r"M|TH|T|W|F|S")
TIME_FORMAT = "%I:%M%p"
SUBJECT_CODE_ALLOWED = re.compile(r"^[A-Z0-9\-\s]{1,50}$")

# Sentinel used when no day token is present (handwritten/informal COR documents
# often omit the day column entirely).
_DAY_ABSENT = ''


def _parse_time(value: str) -> datetime:
    return datetime.strptime(value.strip().upper(), TIME_FORMAT)


def _normalize_time(value: str) -> str:
    parsed = _parse_time(value)
    return parsed.strftime(TIME_FORMAT)


def _expand_days(raw_day: str) -> List[str]:
    if not raw_day:
        return []
    normalized = raw_day.strip().upper().replace(" ", "")
    tokens = DAY_PATTERN.findall(normalized)
    if "".join(tokens) != normalized:
        return []
    return tokens


def _is_symbol_heavy(text: str) -> bool:
    if not text:
        return True
    symbol_count = sum(1 for ch in text if not ch.isalnum() and not ch.isspace())
    return (symbol_count / len(text)) > 0.7


def _course_confidence(course: Dict[str, Any]) -> float:
    metadata = course.get("metadata") or {}
    field_conf = metadata.get("field_confidence") or {}
    if not field_conf:
        return 0.0
    values = [float(v) for v in field_conf.values() if isinstance(v, (int, float))]
    if not values:
        return 0.0
    return sum(values) / len(values)


def validate_candidates(courses: List[Dict[str, Any]], max_duration_hours: int = 8) -> ValidationResult:
    errors: List[str] = []
    dedupe: Dict[Tuple[str, str, str, str, str], Dict[str, Any]] = {}

    for idx, raw_course in enumerate(courses or []):
        course = dict(raw_course)
        subject_code = str(course.get("subject_code", "")).strip().upper()
        start_time_raw = str(course.get("start_time", "")).strip().upper()
        end_time_raw = str(course.get("end_time", "")).strip().upper()
        day_raw = str(course.get("day", "")).strip().upper()
        location = str(course.get("location", "")).strip()

        if not subject_code:
            errors.append(f"Course[{idx}] missing required field: subject_code")
            continue
        if not start_time_raw:
            errors.append(f"Course[{idx}] missing required field: start_time")
            continue
        if not end_time_raw:
            errors.append(f"Course[{idx}] missing required field: end_time")
            continue

        if not SUBJECT_CODE_ALLOWED.match(subject_code):
            errors.append(f"Course[{idx}] invalid subject_code format: {subject_code}")
            continue
        if _is_symbol_heavy(subject_code):
            errors.append(f"Course[{idx}] corrupted subject_code detected")
            continue

        try:
            start_time = _parse_time(start_time_raw)
            end_time = _parse_time(end_time_raw)
            if start_time >= end_time:
                errors.append(f"Course[{idx}] invalid time range: start_time >= end_time")
                continue
            duration_hours = (end_time - start_time).total_seconds() / 3600
            if duration_hours > max_duration_hours:
                errors.append(
                    f"Course[{idx}] duration exceeds {max_duration_hours} hours: {duration_hours:.2f}h"
                )
                continue
        except ValueError:
            errors.append(f"Course[{idx}] invalid time format (expected HH:MMPM): {start_time_raw}-{end_time_raw}")
            continue

        # ── Day field (soft-required) ─────────────────────────────────────
        # An empty day is accepted — it means the schedule day is not visible
        # in the source document (common with handwritten/informal COR images).
        # The course is stored with day='' rather than being dropped entirely.
        if not day_raw:
            # No day token — store the course as a single TBD row
            normalized_course = {
                **course,
                "subject_code": subject_code,
                "start_time": _normalize_time(start_time_raw),
                "end_time": _normalize_time(end_time_raw),
                "day": _DAY_ABSENT,
                "location": location,
            }
            dedupe_key = (
                normalized_course.get("subject_code", ""),
                _DAY_ABSENT,
                normalized_course.get("start_time", ""),
                normalized_course.get("end_time", ""),
                normalized_course.get("location", ""),
            )
            existing = dedupe.get(dedupe_key)
            if not existing or _course_confidence(normalized_course) >= _course_confidence(existing):
                dedupe[dedupe_key] = normalized_course
            continue

        day_tokens = _expand_days(day_raw)
        if not day_tokens:
            errors.append(f"Course[{idx}] invalid day token: {day_raw}")
            continue

        for day in day_tokens:
            if day not in ALLOWED_DAYS:
                errors.append(f"Course[{idx}] unsupported day: {day}")
                continue

            normalized_course = {
                **course,
                "subject_code": subject_code,
                "start_time": _normalize_time(start_time_raw),
                "end_time": _normalize_time(end_time_raw),
                "day": day,
                "location": location,
            }

            dedupe_key = (
                normalized_course.get("subject_code", ""),
                normalized_course.get("day", ""),
                normalized_course.get("start_time", ""),
                normalized_course.get("end_time", ""),
                normalized_course.get("location", ""),
            )
            existing = dedupe.get(dedupe_key)
            if not existing or _course_confidence(normalized_course) >= _course_confidence(existing):
                dedupe[dedupe_key] = normalized_course

    return ValidationResult(courses=list(dedupe.values()), errors=errors)
