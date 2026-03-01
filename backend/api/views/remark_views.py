"""
Faculty Remark Views.

Faculty can create / list / delete remarks about a student's performance
in a specific subject they teach.
Students can view remarks about themselves.
Parents can view remarks about their linked children.
"""

import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle

from api.models import (
    FacultyRemark,
    ClassEnrollment,
    ParentChildLink,
    Course,
)
from api.serializers import FacultyRemarkSerializer
from api.utils.notification_service import notify_remark

logger = logging.getLogger(__name__)

# Maximum characters allowed for a remark's text body
MAX_REMARK_LENGTH = 5000

# Maximum remarks returned per page (simple offset pagination)
PAGE_SIZE = 50


class RemarkCreateThrottle(UserRateThrottle):
    """Rate-limit remark creation to prevent spam / abuse."""
    rate = '30/hour'


def _paginate_qs(qs, request):
    """Apply simple offset pagination to a queryset."""
    try:
        offset = max(int(request.query_params.get('offset', 0)), 0)
    except (ValueError, TypeError):
        offset = 0
    return qs[offset:offset + PAGE_SIZE]


# ============================================
# Faculty-side endpoints
# ============================================

class FacultyRemarkListCreateView(APIView):
    """
    GET  - List all remarks the faculty has left, optionally filtered by
           ?subject_code=XX and/or ?student_id=YY
    POST - Create a new remark for a student in a subject the faculty teaches.
           Body: { student_id, subject_code, text }
    """
    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        """Apply rate-limiting only to POST (creation)."""
        if self.request.method == 'POST':
            return [RemarkCreateThrottle()]
        return []

    def get(self, request):
        user = request.user
        if user.user_type != 'faculty':
            return Response({'error': 'Only faculty can access this.'}, status=status.HTTP_403_FORBIDDEN)

        qs = FacultyRemark.objects.filter(faculty=user).select_related('student', 'faculty')

        subject_code = request.query_params.get('subject_code')
        student_id = request.query_params.get('student_id')
        if subject_code:
            qs = qs.filter(subject_code=subject_code)
        if student_id:
            try:
                qs = qs.filter(student_id=int(student_id))
            except (ValueError, TypeError):
                return Response({'error': 'student_id must be a valid integer.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = FacultyRemarkSerializer(_paginate_qs(qs, request), many=True)
        return Response(serializer.data)

    def post(self, request):
        user = request.user
        if user.user_type != 'faculty':
            return Response({'error': 'Only faculty can create remarks.'}, status=status.HTTP_403_FORBIDDEN)

        # --- Input validation ---
        student_id = request.data.get('student_id')
        subject_code = request.data.get('subject_code', '').strip() if request.data.get('subject_code') else ''
        text = request.data.get('text', '').strip()

        if not student_id or not subject_code or not text:
            return Response(
                {'error': 'student_id, subject_code and text are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate student_id is a valid integer
        try:
            student_id = int(student_id)
        except (ValueError, TypeError):
            return Response({'error': 'student_id must be a valid integer.'}, status=status.HTTP_400_BAD_REQUEST)

        # Enforce max remark length
        if len(text) > MAX_REMARK_LENGTH:
            return Response(
                {'error': f'Remark text must be {MAX_REMARK_LENGTH} characters or fewer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify the faculty teaches this subject via a faculty schedule
        teaches_subject = Course.objects.filter(
            user=user,
            subject_code=subject_code,
            schedule__upload_type='faculty',
        ).exists()

        if not teaches_subject:
            return Response(
                {'error': 'You can only leave remarks for subjects you teach.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Verify enrollment: the student must be enrolled in this faculty's class
        enrollment_exists = ClassEnrollment.objects.filter(
            faculty=user,
            student_id=student_id,
            subject_code=subject_code,
            status='active',
        ).exists()

        if not enrollment_exists:
            return Response(
                {'error': 'This student is not enrolled in your class for this subject.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        remark = FacultyRemark.objects.create(
            faculty=user,
            student_id=student_id,
            subject_code=subject_code,
            text=text,
        )

        # Fire-and-forget notifications to student + parent(s)
        try:
            notify_remark(
                faculty_user=user,
                student_id=student_id,
                subject_code=subject_code,
                remark_text=text,
                remark_id=remark.id,
            )
        except Exception as e:
            logger.error(f"Failed to send remark notification: {e}")

        serializer = FacultyRemarkSerializer(remark)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FacultyRemarkDetailView(APIView):
    """
    PATCH  - Edit a remark's text  { text }
    DELETE - Remove a remark
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        user = request.user
        if user.user_type != 'faculty':
            return Response({'error': 'Only faculty can edit remarks.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            remark = FacultyRemark.objects.get(pk=pk, faculty=user)
        except FacultyRemark.DoesNotExist:
            return Response({'error': 'Remark not found.'}, status=status.HTTP_404_NOT_FOUND)

        text = request.data.get('text', '').strip()
        if not text:
            return Response({'error': 'text is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(text) > MAX_REMARK_LENGTH:
            return Response(
                {'error': f'Remark text must be {MAX_REMARK_LENGTH} characters or fewer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        remark.text = text
        remark.save(update_fields=['text', 'updated_at'])
        serializer = FacultyRemarkSerializer(remark)
        return Response(serializer.data)

    def delete(self, request, pk):
        user = request.user
        if user.user_type != 'faculty':
            return Response({'error': 'Only faculty can delete remarks.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            remark = FacultyRemark.objects.get(pk=pk, faculty=user)
        except FacultyRemark.DoesNotExist:
            return Response({'error': 'Remark not found.'}, status=status.HTTP_404_NOT_FOUND)

        remark.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================
# Student-side endpoint
# ============================================

class StudentRemarkListView(APIView):
    """
    GET - List all remarks for the authenticated student.
          Optional filter: ?subject_code=XX
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.user_type != 'student':
            return Response({'error': 'Only students can view their remarks.'}, status=status.HTTP_403_FORBIDDEN)

        qs = FacultyRemark.objects.filter(student=user).select_related('faculty', 'student')

        subject_code = request.query_params.get('subject_code')
        if subject_code:
            qs = qs.filter(subject_code=subject_code)

        serializer = FacultyRemarkSerializer(_paginate_qs(qs, request), many=True)
        return Response(serializer.data)


# ============================================
# Parent-side endpoint
# ============================================

class ParentRemarkListView(APIView):
    """
    GET - List all remarks for a linked child.
          Required query param: ?child_id=XX
          Optional: ?subject_code=YY
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.user_type != 'parent':
            return Response({'error': 'Only parents can access this.'}, status=status.HTTP_403_FORBIDDEN)

        child_id = request.query_params.get('child_id')
        if not child_id:
            # Default to first linked child
            link = ParentChildLink.objects.filter(parent=user, status='active').select_related('child').first()
            if not link:
                return Response({'error': 'No linked children found.'}, status=status.HTTP_404_NOT_FOUND)
            child_id = link.child_id

        # Verify the parent-child link is active
        link_exists = ParentChildLink.objects.filter(
            parent=user,
            child_id=child_id,
            status='active',
        ).exists()

        if not link_exists:
            return Response(
                {'error': 'You do not have an active link to this child.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = FacultyRemark.objects.filter(student_id=child_id).select_related('faculty', 'student')

        subject_code = request.query_params.get('subject_code')
        if subject_code:
            qs = qs.filter(subject_code=subject_code)

        serializer = FacultyRemarkSerializer(_paginate_qs(qs, request), many=True)
        return Response(serializer.data)
