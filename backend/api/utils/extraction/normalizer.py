from typing import Any, Dict, List


NORMALIZABLE_FIELDS = (
    'subject_code',
    'subject_name',
    'day',
    'start_time',
    'end_time',
    'location',
)


def normalize_candidates(courses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deterministic normalization pass used before validators.
    """
    normalized = []
    for course in courses or []:
        row = dict(course)
        for field in NORMALIZABLE_FIELDS:
            if field in row and isinstance(row[field], str):
                row[field] = row[field].strip()
        normalized.append(row)
    return normalized
