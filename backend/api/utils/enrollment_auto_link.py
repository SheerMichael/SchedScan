"""
Auto-linking service for faculty-student enrollments.

This module keeps auto enrollments in sync based on schedule similarity:
- Same normalized subject code
- At least one overlapping class day
- Start/end times aligned within a configurable tolerance

Manual class-code enrollments are never modified here.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Set, Tuple

from django.conf import settings
from django.db import transaction

from ..models import ClassEnrollment, Course, User

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _CourseSlot:
    owner_id: int
    subject_code: str
    normalized_subject: str
    days: frozenset[str]
    start_minutes: int
    end_minutes: int


def normalize_subject_code(value: str) -> str:
    """Normalize subject codes for safe cross-variant matching."""
    normalized = unicodedata.normalize("NFKC", str(value or ""))
    normalized = re.sub(r"[\u200B-\u200D\uFEFF]", "", normalized)
    normalized = re.sub(r"[‐‑‒–—―]", "-", normalized)
    normalized = re.sub(r"\s+", "", normalized)
    return normalized.strip().upper()


def _parse_time_to_minutes(time_str: str) -> Optional[int]:
    text = str(time_str or "").strip().upper().replace(" ", "")
    if not text:
        return None

    match = re.match(r"^(\d{1,2}):(\d{2})(AM|PM)$", text)
    if not match:
        return None

    hours = int(match.group(1))
    minutes = int(match.group(2))
    period = match.group(3)

    if hours < 1 or hours > 12 or minutes < 0 or minutes > 59:
        return None

    if period == "PM" and hours != 12:
        hours += 12
    elif period == "AM" and hours == 12:
        hours = 0

    return (hours * 60) + minutes


def _expand_day_codes(value: str) -> Set[str]:
    text = unicodedata.normalize("NFKC", str(value or "")).upper()
    text = re.sub(r"[^A-Z]", " ", text)

    # Convert full day words into short tokens before compact parsing.
    word_to_token = {
        "MONDAY": "M",
        "TUESDAY": "T",
        "WEDNESDAY": "W",
        "THURSDAY": "TH",
        "FRIDAY": "F",
        "SATURDAY": "S",
    }
    for word, token in word_to_token.items():
        text = re.sub(rf"\b{word}\b", f" {token} ", text)

    compact = re.sub(r"\s+", "", text)
    if not compact:
        return set()

    allowed_single = {"M", "T", "W", "F", "S"}
    days: Set[str] = set()
    index = 0

    while index < len(compact):
        if compact.startswith("TH", index):
            days.add("TH")
            index += 2
            continue

        token = compact[index]
        if token in allowed_single:
            days.add(token)
        index += 1

    return days


def _slots_match(source: _CourseSlot, target: _CourseSlot, tolerance_minutes: int) -> bool:
    if source.normalized_subject != target.normalized_subject:
        return False

    if not (source.days & target.days):
        return False

    return (
        abs(source.start_minutes - target.start_minutes) <= tolerance_minutes
        and abs(source.end_minutes - target.end_minutes) <= tolerance_minutes
    )


def _build_slots(course_rows: Iterable[Dict]) -> List[_CourseSlot]:
    slots: List[_CourseSlot] = []

    for row in course_rows:
        owner_id = int(row["user_id"])
        subject_code = str(row.get("subject_code") or "").strip()
        normalized_subject = normalize_subject_code(subject_code)
        if not normalized_subject:
            continue

        day_tokens = _expand_day_codes(str(row.get("day") or ""))
        if not day_tokens:
            continue

        start_minutes = _parse_time_to_minutes(str(row.get("start_time") or ""))
        end_minutes = _parse_time_to_minutes(str(row.get("end_time") or ""))
        if start_minutes is None or end_minutes is None or end_minutes <= start_minutes:
            continue

        slots.append(
            _CourseSlot(
                owner_id=owner_id,
                subject_code=subject_code,
                normalized_subject=normalized_subject,
                days=frozenset(day_tokens),
                start_minutes=start_minutes,
                end_minutes=end_minutes,
            )
        )

    return slots


def _canonical_subject_by_normalized(slots: Iterable[_CourseSlot]) -> Dict[str, str]:
    canonical: Dict[str, str] = {}
    for slot in slots:
        previous = canonical.get(slot.normalized_subject)
        if previous is None or (len(slot.subject_code), slot.subject_code) < (len(previous), previous):
            canonical[slot.normalized_subject] = slot.subject_code
    return canonical


def _collect_desired_for_student(student_user: User, tolerance_minutes: int) -> Set[Tuple[int, int, str]]:
    student_rows = Course.objects.filter(
        user=student_user,
        schedule__upload_type="student",
    ).values("user_id", "subject_code", "day", "start_time", "end_time")
    student_slots = _build_slots(student_rows)
    if not student_slots:
        return set()

    candidate_subjects = {slot.normalized_subject for slot in student_slots}

    faculty_rows = Course.objects.filter(
        schedule__upload_type="faculty",
    ).exclude(user=student_user).values("user_id", "subject_code", "day", "start_time", "end_time")
    faculty_slots = [
        slot for slot in _build_slots(faculty_rows)
        if slot.normalized_subject in candidate_subjects
    ]
    if not faculty_slots:
        return set()

    faculty_by_subject: Dict[str, List[_CourseSlot]] = {}
    for slot in faculty_slots:
        faculty_by_subject.setdefault(slot.normalized_subject, []).append(slot)

    canonical = _canonical_subject_by_normalized(faculty_slots)
    desired: Set[Tuple[int, int, str]] = set()

    for student_slot in student_slots:
        for faculty_slot in faculty_by_subject.get(student_slot.normalized_subject, []):
            if _slots_match(student_slot, faculty_slot, tolerance_minutes):
                desired.add(
                    (
                        student_user.id,
                        faculty_slot.owner_id,
                        canonical.get(student_slot.normalized_subject, faculty_slot.subject_code),
                    )
                )

    return desired


def _collect_desired_for_faculty(faculty_user: User, tolerance_minutes: int) -> Set[Tuple[int, int, str]]:
    faculty_rows = Course.objects.filter(
        user=faculty_user,
        schedule__upload_type="faculty",
    ).values("user_id", "subject_code", "day", "start_time", "end_time")
    faculty_slots = _build_slots(faculty_rows)
    if not faculty_slots:
        return set()

    candidate_subjects = {slot.normalized_subject for slot in faculty_slots}

    student_rows = Course.objects.filter(
        schedule__upload_type="student",
    ).exclude(user=faculty_user).values("user_id", "subject_code", "day", "start_time", "end_time")
    student_slots = [
        slot for slot in _build_slots(student_rows)
        if slot.normalized_subject in candidate_subjects
    ]
    if not student_slots:
        return set()

    student_by_subject: Dict[str, List[_CourseSlot]] = {}
    for slot in student_slots:
        student_by_subject.setdefault(slot.normalized_subject, []).append(slot)

    canonical = _canonical_subject_by_normalized(faculty_slots)
    desired: Set[Tuple[int, int, str]] = set()

    for faculty_slot in faculty_slots:
        for student_slot in student_by_subject.get(faculty_slot.normalized_subject, []):
            if _slots_match(faculty_slot, student_slot, tolerance_minutes):
                desired.add(
                    (
                        student_slot.owner_id,
                        faculty_user.id,
                        canonical.get(faculty_slot.normalized_subject, faculty_slot.subject_code),
                    )
                )

    return desired


def _apply_auto_enrollment_sync(
    *,
    user: User,
    desired: Set[Tuple[int, int, str]],
) -> Dict[str, int]:
    if user.user_type == "student":
        existing_qs = ClassEnrollment.objects.filter(
            student=user,
            enrollment_type="auto",
            status="active",
        )
    elif user.user_type == "faculty":
        existing_qs = ClassEnrollment.objects.filter(
            faculty=user,
            enrollment_type="auto",
            status="active",
        )
    else:
        return {"created": 0, "removed": 0, "desired": 0}

    existing = list(existing_qs.values("id", "student_id", "faculty_id", "subject_code"))
    existing_keys = {
        (row["student_id"], row["faculty_id"], row["subject_code"]): row["id"]
        for row in existing
    }

    remove_ids = [
        row_id
        for key, row_id in existing_keys.items()
        if key not in desired
    ]

    removed_count = 0
    if remove_ids:
        removed_count = ClassEnrollment.objects.filter(
            id__in=remove_ids,
            enrollment_type="auto",
            status="active",
        ).update(status="removed")

    created_count = 0
    missing = [key for key in desired if key not in existing_keys]
    for student_id, faculty_id, subject_code in missing:
        if ClassEnrollment.objects.filter(
            student_id=student_id,
            faculty_id=faculty_id,
            subject_code=subject_code,
            status="active",
        ).exists():
            continue

        ClassEnrollment.objects.create(
            student_id=student_id,
            faculty_id=faculty_id,
            subject_code=subject_code,
            enrollment_type="auto",
            status="active",
        )
        created_count += 1

    return {
        "created": created_count,
        "removed": removed_count,
        "desired": len(desired),
    }


def sync_auto_enrollments_for_user(user: User) -> Dict[str, int]:
    """
    Synchronize auto enrollments for one user based on schedule similarity.

    Returns a small stats dictionary for logging/observability.
    """
    if user.user_type not in ("student", "faculty"):
        return {"created": 0, "removed": 0, "desired": 0}

    tolerance_minutes = max(
        0,
        int(getattr(settings, "ENROLLMENT_AUTO_LINK_TIME_TOLERANCE_MINUTES", 10)),
    )

    if user.user_type == "student":
        desired = _collect_desired_for_student(user, tolerance_minutes)
    else:
        desired = _collect_desired_for_faculty(user, tolerance_minutes)

    with transaction.atomic():
        stats = _apply_auto_enrollment_sync(user=user, desired=desired)

    if stats["created"] or stats["removed"]:
        logger.info(
            "Auto-link sync for %s (%s): desired=%s created=%s removed=%s tolerance=%s",
            user.email,
            user.user_type,
            stats["desired"],
            stats["created"],
            stats["removed"],
            tolerance_minutes,
        )

    return stats
