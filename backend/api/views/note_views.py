from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied

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
