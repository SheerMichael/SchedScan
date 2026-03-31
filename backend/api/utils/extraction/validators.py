import re
from datetime import datetime
from typing import Any, Dict, List, Tuple

from .types import ValidationResult

ALLOWED_DAYS = {"M", "T", "W", "TH", "F", "S"}
DAY_PATTERN = re.compile(r"M|TH|T|W|F|S")
TIME_FORMAT = "%I:%M%p"
SUBJECT_CODE_ALLOWED = re.compile(r"^[A-Z0-9\-\s]{1,50}$")
TIME_WITH_MERIDIEM_PATTERN = re.compile(r"^(\d{1,2}):(\d{2})(AM|PM)$")
TIME_NO_MERIDIEM_PATTERN = re.compile(r"^(\d{1,2}):(\d{2})$")

DAY_ALIASES = {
    "M": "M",
    "MON": "M",
    "MONDAY": "M",
    "T": "T",
    "TU": "T",
    "TUE": "T",
    "TUES": "T",
    "TUESDAY": "T",
    "W": "W",
    "WED": "W",
    "WEDNESDAY": "W",
    "TH": "TH",
    "THU": "TH",
    "THUR": "TH",
    "THURS": "TH",
    "THURSDAY": "TH",
    "F": "F",
    "FRI": "F",
    "FRIDAY": "F",
    "S": "S",
    "SAT": "S",
    "SATURDAY": "S",
}

# Sentinel used when no day token is present (handwritten/informal COR documents
# often omit the day column entirely).
_DAY_ABSENT = ''


def _parse_time(value: str) -> datetime:
    return datetime.strptime(value.strip().upper(), TIME_FORMAT)


def _normalize_time(value: str) -> str:
    parsed = _parse_time(value)
    return parsed.strftime(TIME_FORMAT)


def _infer_meridiem_for_unmarked_hour(hour_12: int) -> str:
    # Faculty IDP heuristic used historically in this project:
    # 1-6 are usually afternoon blocks, while 7-11 are morning blocks.
    if hour_12 == 12:
        return 'PM'
    if 1 <= hour_12 <= 6:
        return 'PM'
    return 'AM'


def _to_24h_minutes(hour_12: int, minute: int, meridiem: str) -> int:
    hour = hour_12 % 12
    if meridiem == 'PM':
        hour += 12
    return (hour * 60) + minute


def _minutes_to_time_string(minutes_24h: int) -> str:
    minutes_24h = minutes_24h % (24 * 60)
    hour_24 = minutes_24h // 60
    minute = minutes_24h % 60
    suffix = 'AM' if hour_24 < 12 else 'PM'
    hour_12 = hour_24 % 12
    if hour_12 == 0:
        hour_12 = 12
    return f"{hour_12:02d}:{minute:02d}{suffix}"


def _parse_time_token(value: str) -> Tuple[int, bool]:
    text = str(value or '').strip().upper().replace(' ', '').replace('.', ':')

    with_meridiem = TIME_WITH_MERIDIEM_PATTERN.match(text)
    if with_meridiem:
        hour = int(with_meridiem.group(1))
        minute = int(with_meridiem.group(2))
        meridiem = with_meridiem.group(3)
        if hour < 1 or hour > 12 or minute < 0 or minute > 59:
            raise ValueError('invalid meridiem time')
        return _to_24h_minutes(hour, minute, meridiem), True

    without_meridiem = TIME_NO_MERIDIEM_PATTERN.match(text)
    if without_meridiem:
        hour = int(without_meridiem.group(1))
        minute = int(without_meridiem.group(2))
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            raise ValueError('invalid non-meridiem time')
        # Keep 24-hour value for now; caller decides if this was intended as
        # true 24-hour time or 12-hour unmarked time.
        return (hour * 60) + minute, False

    raise ValueError('unsupported time token')


def _normalize_time_pair(start_time_raw: str, end_time_raw: str) -> Tuple[str, str]:
    start_minutes, start_has_meridiem = _parse_time_token(start_time_raw)
    end_minutes, end_has_meridiem = _parse_time_token(end_time_raw)

    # If tokens are HH:MM without AM/PM and hour <= 12, infer meridiem using
    # the faculty-friendly heuristic to avoid dropping valid rows.
    if not start_has_meridiem:
        start_hour = (start_minutes // 60)
        if 1 <= start_hour <= 12:
            inferred = _infer_meridiem_for_unmarked_hour(start_hour)
            start_minutes = _to_24h_minutes(start_hour, start_minutes % 60, inferred)

    if not end_has_meridiem:
        end_hour = (end_minutes // 60)
        if 1 <= end_hour <= 12:
            inferred = _infer_meridiem_for_unmarked_hour(end_hour)
            end_minutes = _to_24h_minutes(end_hour, end_minutes % 60, inferred)

    # If both were unmarked and still inverted (e.g., 5:30-7:00), flip end by
    # 12 hours once before failing so afternoon slots are retained.
    if (not start_has_meridiem and not end_has_meridiem) and end_minutes <= start_minutes:
        candidate = end_minutes + (12 * 60)
        if candidate < (24 * 60):
            end_minutes = candidate

    return _minutes_to_time_string(start_minutes), _minutes_to_time_string(end_minutes)


def _expand_compact_day_token(compact: str) -> List[str]:
    normalized = compact.strip().upper()
    if not normalized:
        return []

    tokens: List[str] = []
    idx = 0
    while idx < len(normalized):
        if normalized.startswith('TH', idx):
            tokens.append('TH')
            idx += 2
            continue
        ch = normalized[idx]
        if ch in {'M', 'T', 'W', 'F', 'S'}:
            tokens.append(ch)
            idx += 1
            continue
        return []
    return tokens


def _expand_days(raw_day: str) -> List[str]:
    if not raw_day:
        return []
    normalized = raw_day.strip().upper()

    # Handle delimited day names/tokens: MON/WED, TUE THU, M-F, etc.
    split_tokens = re.split(r"[\s,;/|&+\-]+", normalized)
    split_tokens = [token for token in split_tokens if token]

    expanded: List[str] = []
    for token in split_tokens:
        alias = DAY_ALIASES.get(token)
        if alias:
            expanded.append(alias)
            continue

        compact = _expand_compact_day_token(token)
        if compact:
            expanded.extend(compact)
            continue

        return []

    return expanded


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
            normalized_start_time, normalized_end_time = _normalize_time_pair(start_time_raw, end_time_raw)
            start_time = _parse_time(normalized_start_time)
            end_time = _parse_time(normalized_end_time)
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
                    "start_time": normalized_start_time,
                    "end_time": normalized_end_time,
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
                "start_time": normalized_start_time,
                "end_time": normalized_end_time,
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
