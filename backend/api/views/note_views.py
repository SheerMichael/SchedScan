from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db.models import Count

from ..models import Note, ClassEnrollment
from ..serializers import NoteSerializer, FacultyPublishedNoteSerializer


class NoteListCreateView(generics.ListCreateAPIView):
    """
    API endpoint to list and create quick notes.

    GET /api/notes/?subject_code=CS101
    POST /api/notes/
    """

    serializer_class = NoteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Note.objects.filter(user=self.request.user)

        subject_code = self.request.query_params.get('subject_code', None)
        if isinstance(subject_code, str):
            subject_code = subject_code.strip()
        if subject_code:
            queryset = queryset.filter(subject_code=subject_code)

        return queryset.order_by('-is_pinned', '-updated_at', '-created_at')


class NoteDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    API endpoint to retrieve, update, or delete a quick note.

    GET /api/notes/<id>/
    PATCH /api/notes/<id>/
    DELETE /api/notes/<id>/
    """

    serializer_class = NoteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Note.objects.filter(user=self.request.user)


class FacultyPublishedNoteListView(generics.ListAPIView):
    """
    API endpoint for students to list faculty-authored notes tied to an enrolled class.

    GET /api/student/faculty-notes/?subject_code=CS101
    """

    serializer_class = FacultyPublishedNoteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if getattr(user, 'user_type', None) != 'student':
            raise PermissionDenied('Only student accounts can access faculty notes.')

        subject_code = self.request.query_params.get('subject_code', '')
        if isinstance(subject_code, str):
            subject_code = subject_code.strip()
        if not subject_code:
            return Note.objects.none()

        active_enrollments = ClassEnrollment.objects.filter(
            student=user,
            status='active',
            subject_code=subject_code,
        ).values_list('faculty_id', flat=True)

        return (
            Note.objects.filter(
                user_id__in=active_enrollments,
                user__user_type='faculty',
                subject_code=subject_code,
            )
            .select_related('user')
            .order_by('-is_pinned', '-updated_at', '-created_at')
        )


class StudentFacultyNoteCountsView(APIView):
    """
    Get faculty note counts for multiple subject codes in a single request.

    POST /api/student/faculty-notes/counts/
    Body: {"subject_codes": ["CS101", "MATH201"]}
    Response: {"CS101": {"total": 2}, ...}
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if getattr(user, 'user_type', None) != 'student':
            return Response(
                {"error": "Only student accounts can access faculty note counts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        subject_codes = request.data.get('subject_codes', [])
        if not isinstance(subject_codes, list):
            return Response(
                {"error": "subject_codes must be a list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        normalized_codes = [str(code).strip() for code in subject_codes if str(code).strip()]
        if not normalized_codes:
            return Response({}, status=status.HTTP_200_OK)

        enrollments = ClassEnrollment.objects.filter(
            student=user,
            subject_code__in=normalized_codes,
            status='active',
        ).values('faculty_id', 'subject_code')

        counts = {code: {'total': 0} for code in normalized_codes}

        if not enrollments:
            return Response(counts, status=status.HTTP_200_OK)

        enrollment_pairs = {(e['subject_code'], e['faculty_id']) for e in enrollments}
        faculty_ids = {e['faculty_id'] for e in enrollments}

        note_rows = (
            Note.objects.filter(
                subject_code__in=normalized_codes,
                user_id__in=faculty_ids,
                user__user_type='faculty',
            )
            .values('subject_code', 'user_id')
            .annotate(total=Count('id'))
        )

        for row in note_rows:
            if (row['subject_code'], row['user_id']) in enrollment_pairs:
                counts[row['subject_code']]['total'] += row['total']

        return Response(counts, status=status.HTTP_200_OK)
