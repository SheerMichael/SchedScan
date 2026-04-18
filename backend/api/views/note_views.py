from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from ..models import Note
from ..serializers import NoteSerializer


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
