"""
Classmate discovery views.

Endpoints:
    GET /api/student/classmates/?subject_code=CS101
        → Student: list classmates sharing the same faculty enrollment

    GET /api/faculty/class-roster/?subject_code=CS101
        → Faculty: full roster (active + pending students) for a subject
"""

import logging

from django.db.models import F
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import ClassEnrollment, User
from ..serializers import ClassmateSerializer, FacultyRosterStudentSerializer

logger = logging.getLogger(__name__)


class StudentClassmateListView(APIView):
    """
    GET /api/student/classmates/?subject_code=CS101

    Returns the list of other students enrolled in the same faculty class as
    the authenticated student. Only active enrollments are included.

    Privacy: only first name, last name, and profile picture — no email or
    student number — are returned for classmates.

    Query params:
        subject_code (required) — the subject to look up classmates for

    Response (200):
        {
            "subject_code": "CS101",
            "subject_name": "Software Engineering",
            "faculty_name": "Dr. Juan Dela Cruz",
            "total_classmates": 12,
            "classmates": [
                {
                    "id": 5,
                    "first_name": "Jane",
                    "last_name": "Doe",
                    "full_name": "Jane Doe",
                    "profile_picture": null,
                    "enrollment_type": "auto"
                },
                ...
            ]
        }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.user_type != 'student':
            return Response(
                {"error": "Only student accounts can view classmates."},
                status=status.HTTP_403_FORBIDDEN,
            )

        subject_code = request.query_params.get('subject_code', '').strip()
        if not subject_code:
            return Response(
                {"error": "subject_code query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find the student's active enrollment for this subject
        my_enrollment = ClassEnrollment.objects.filter(
            student=request.user,
            subject_code=subject_code,
            status='active',
        ).select_related('faculty').first()

        if not my_enrollment:
            return Response(
                {"error": f"You are not actively enrolled in {subject_code}."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Find all other active students under the same faculty for this subject
        peer_enrollments = (
            ClassEnrollment.objects
            .filter(
                faculty=my_enrollment.faculty,
                subject_code=subject_code,
                status='active',
            )
            .exclude(student=request.user)
            .values(
                'student_id',
                'enrollment_type',
            )
        )

        # Build a map of student_id → enrollment_type for annotation
        student_ids = [e['student_id'] for e in peer_enrollments]
        enroll_type_map = {e['student_id']: e['enrollment_type'] for e in peer_enrollments}

        classmate_users = list(
            User.objects.filter(pk__in=student_ids)
        )

        # Annotate each User instance with enrollment_type
        for user in classmate_users:
            user.enrollment_type = enroll_type_map.get(user.pk)

        serializer = ClassmateSerializer(
            classmate_users,
            many=True,
            context={'request': request},
        )

        # Enrich with subject name from the faculty's courses
        from ..models import Course
        subject_name = ''
        course = Course.objects.filter(
            user=my_enrollment.faculty,
            subject_code=subject_code,
        ).values('subject_name').first()
        if course:
            subject_name = course['subject_name']

        return Response(
            {
                "subject_code": subject_code,
                "subject_name": subject_name,
                "faculty_name": my_enrollment.faculty.get_full_name(),
                "total_classmates": len(classmate_users),
                "classmates": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class FacultyClassRosterView(APIView):
    """
    GET /api/faculty/class-roster/?subject_code=CS101

    Returns the full class roster for a faculty member's subject, split into
    active and pending students. Includes student_number for faculty context.

    Query params:
        subject_code (required) — the subject to retrieve the roster for

    Response (200):
        {
            "subject_code": "CS101",
            "subject_name": "Software Engineering",
            "total_active": 25,
            "total_pending": 3,
            "active_students": [ ... ],
            "pending_students": [ ... ]
        }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.user_type != 'faculty':
            return Response(
                {"error": "Only faculty accounts can view the class roster."},
                status=status.HTTP_403_FORBIDDEN,
            )

        subject_code = request.query_params.get('subject_code', '').strip()
        if not subject_code:
            return Response(
                {"error": "subject_code query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def _get_students_for_status(stat):
            enrollments = (
                ClassEnrollment.objects
                .filter(faculty=request.user, subject_code=subject_code, status=stat)
                .values('student_id', 'enrollment_type', 'status', 'enrolled_at')
            )
            s_ids = [e['student_id'] for e in enrollments]
            meta_map = {
                e['student_id']: {
                    'enrollment_type': e['enrollment_type'],
                    'enrollment_status': e['status'],
                    'enrolled_at': e['enrolled_at'],
                }
                for e in enrollments
            }
            users = list(User.objects.filter(pk__in=s_ids))
            for u in users:
                meta = meta_map.get(u.pk, {})
                u.enrollment_type = meta.get('enrollment_type')
                u.enrollment_status = meta.get('enrollment_status')
                u.enrolled_at = meta.get('enrolled_at')
            return users

        active_students = _get_students_for_status('active')
        pending_students = _get_students_for_status('pending')

        active_serializer = FacultyRosterStudentSerializer(
            active_students, many=True, context={'request': request}
        )
        pending_serializer = FacultyRosterStudentSerializer(
            pending_students, many=True, context={'request': request}
        )

        from ..models import Course
        subject_name = ''
        course = Course.objects.filter(
            user=request.user, subject_code=subject_code
        ).values('subject_name').first()
        if course:
            subject_name = course['subject_name']

        return Response(
            {
                "subject_code": subject_code,
                "subject_name": subject_name,
                "total_active": len(active_students),
                "total_pending": len(pending_students),
                "active_students": active_serializer.data,
                "pending_students": pending_serializer.data,
            },
            status=status.HTTP_200_OK,
        )
