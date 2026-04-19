"""
Pending enrollment consent views — student-facing endpoints for the
auto-detected faculty-match flow.

When `enrollment_auto_link.sync_auto_enrollments_for_user()` detects that a
faculty member teaches the same subject/time as a student, it creates a
ClassEnrollment with status='pending'. These views let the student list,
accept, or decline those suggestions.

Endpoints:
    GET    /api/student/pending-enrollments/            → list pending matches
    POST   /api/student/pending-enrollments/<id>/accept/  → accept one
    POST   /api/student/pending-enrollments/<id>/decline/ → decline one
    POST   /api/student/pending-enrollments/accept-all/   → bulk accept all
"""

import logging

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import ClassEnrollment, Notification
from ..serializers import PendingEnrollmentSerializer

logger = logging.getLogger(__name__)


class PendingEnrollmentListView(APIView):
    """
    GET /api/student/pending-enrollments/

    Returns all pending (auto-detected) class enrollment suggestions for the
    authenticated student, ordered most-recent first.

    Response:
        {
            "count": 2,
            "results": [
                {
                    "id": 12,
                    "subject_code": "CS101",
                    "subject_name": "Software Engineering",
                    "faculty_name": "Dr. Juan Dela Cruz",
                    "faculty_email": "jdelacruz@example.com",
                    "faculty_profile_picture": null,
                    "enrollment_type": "auto",
                    "status": "pending",
                    "enrolled_at": "2026-04-19T06:30:00Z"
                },
                ...
            ]
        }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.user_type != 'student':
            return Response(
                {"error": "Only student accounts can view pending enrollment suggestions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = (
            ClassEnrollment.objects
            .filter(student=request.user, status='pending')
            .select_related('faculty', 'faculty__profile_picture')
            .order_by('-enrolled_at')
        )

        serializer = PendingEnrollmentSerializer(
            qs, many=True, context={'request': request}
        )
        return Response(
            {"count": qs.count(), "results": serializer.data},
            status=status.HTTP_200_OK,
        )


class PendingEnrollmentAcceptView(APIView):
    """
    POST /api/student/pending-enrollments/<pk>/accept/

    Transitions a specific pending enrollment to 'active'.
    Idempotent: if already active, returns 200 without error.

    Response (200):
        {"message": "You have joined CS101 — Dr. Juan Dela Cruz's class."}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.user_type != 'student':
            return Response(
                {"error": "Only student accounts can accept enrollment suggestions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            enrollment = ClassEnrollment.objects.select_related('faculty').get(
                pk=pk,
                student=request.user,
                status__in=('pending', 'active'),
            )
        except ClassEnrollment.DoesNotExist:
            return Response(
                {"error": "Pending enrollment not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if enrollment.status == 'active':
            return Response(
                {"message": f"You are already enrolled in {enrollment.subject_code}."},
                status=status.HTTP_200_OK,
            )

        with transaction.atomic():
            enrollment.status = 'active'
            enrollment.save(update_fields=['status'])

        faculty_name = enrollment.faculty.get_full_name()
        logger.info(
            "Student %s accepted pending enrollment %s (%s / %s)",
            request.user.email,
            pk,
            enrollment.subject_code,
            faculty_name,
        )

        # Dismiss the pending faculty_match notification for this enrollment
        Notification.objects.filter(
            user=request.user,
            notification_type='faculty_match',
            data__enrollment_id=enrollment.id,
        ).update(is_read=True)

        return Response(
            {"message": f"You have joined {enrollment.subject_code} — {faculty_name}'s class."},
            status=status.HTTP_200_OK,
        )


class PendingEnrollmentDeclineView(APIView):
    """
    POST /api/student/pending-enrollments/<pk>/decline/

    Transitions a specific pending enrollment to 'declined'.
    The auto-link sync will NOT re-create this suggestion because
    declined enrollments are treated as a terminal state for that combination.

    Response (200):
        {"message": "Enrollment suggestion for CS101 has been dismissed."}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.user_type != 'student':
            return Response(
                {"error": "Only student accounts can decline enrollment suggestions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            enrollment = ClassEnrollment.objects.get(
                pk=pk,
                student=request.user,
                status='pending',
            )
        except ClassEnrollment.DoesNotExist:
            return Response(
                {"error": "Pending enrollment not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            enrollment.status = 'declined'
            enrollment.save(update_fields=['status'])

        logger.info(
            "Student %s declined pending enrollment %s (%s)",
            request.user.email,
            pk,
            enrollment.subject_code,
        )

        # Mark related notification as read
        Notification.objects.filter(
            user=request.user,
            notification_type='faculty_match',
            data__enrollment_id=enrollment.id,
        ).update(is_read=True)

        return Response(
            {"message": f"Enrollment suggestion for {enrollment.subject_code} has been dismissed."},
            status=status.HTTP_200_OK,
        )


class PendingEnrollmentBulkAcceptView(APIView):
    """
    POST /api/student/pending-enrollments/accept-all/

    Bulk-accepts all pending enrollment suggestions for the authenticated student.
    Useful for the "Join All" button in the faculty match modal.

    Response (200):
        {"accepted_count": 3, "message": "You have joined 3 class(es)."}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.user_type != 'student':
            return Response(
                {"error": "Only student accounts can accept enrollment suggestions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            updated = ClassEnrollment.objects.filter(
                student=request.user,
                status='pending',
            ).update(status='active')

        # Mark all related faculty_match notifications as read
        Notification.objects.filter(
            user=request.user,
            notification_type='faculty_match',
            is_read=False,
        ).update(is_read=True)

        logger.info(
            "Student %s bulk-accepted %d pending enrollments",
            request.user.email,
            updated,
        )

        return Response(
            {
                "accepted_count": updated,
                "message": f"You have joined {updated} class(es).",
            },
            status=status.HTTP_200_OK,
        )
