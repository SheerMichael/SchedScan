from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from ..serializers import TaskSerializer
from ..models import Task


class TaskListCreateView(generics.ListCreateAPIView):
    """
    API endpoint to list and create tasks for a specific subject code.
    
    GET /api/tasks/?subject_code=CS101
    Headers: Authorization: Bearer <access_token>
    
    Response: [
        {
            "id": 1,
            "subject_code": "CS101",
            "text": "Complete assignment 1",
            "is_completed": false,
            "created_at": "2025-12-02T...",
            "updated_at": "2025-12-02T..."
        }
    ]
    
    POST /api/tasks/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "subject_code": "CS101",
        "text": "Complete assignment 1"
    }
    """
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Filter tasks by subject_code query param.
        """
        queryset = Task.objects.filter(user=self.request.user)
        subject_code = self.request.query_params.get('subject_code', None)
        if subject_code:
            queryset = queryset.filter(subject_code=subject_code)
        return queryset.order_by('-created_at')


class TaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    API endpoint to retrieve, update, or delete a specific task.
    
    GET /api/tasks/<id>/
    PATCH /api/tasks/<id>/
    DELETE /api/tasks/<id>/
    
    Headers: Authorization: Bearer <access_token>
    
    PATCH Request body (to mark as completed):
    {
        "is_completed": true
    }
    """
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Only allow access to user's own tasks.
        """
        return Task.objects.filter(user=self.request.user)


class TaskCountsView(APIView):
    """
    API endpoint to get task counts for multiple subject codes in a single request.
    This avoids N+1 queries where frontend would otherwise make N separate API calls
    to get task counts for each subject code displayed on the home screen.
    
    POST /api/tasks/counts/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "subject_codes": ["CS101", "MATH201", "ENG100"]
    }
    
    Response: {
        "CS101": {"total": 3, "incomplete": 2},
        "MATH201": {"total": 1, "incomplete": 0},
        "ENG100": {"total": 0, "incomplete": 0}
    }
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        subject_codes = request.data.get('subject_codes', [])
        
        if not isinstance(subject_codes, list):
            return Response(
                {"error": "subject_codes must be a list"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Use aggregation for efficient counting
        from django.db.models import Count, Q
        
        # Get counts for all requested subject codes in a single query
        task_counts = Task.objects.filter(
            user=request.user,
            subject_code__in=subject_codes
        ).values('subject_code').annotate(
            total=Count('id'),
            incomplete=Count('id', filter=Q(is_completed=False))
        )
        
        # Convert to dict format
        counts = {item['subject_code']: {
            'total': item['total'],
            'incomplete': item['incomplete']
        } for item in task_counts}
        
        # Fill in zeros for subject codes with no tasks
        for code in subject_codes:
            if code not in counts:
                counts[code] = {'total': 0, 'incomplete': 0}
        
        return Response(counts, status=status.HTTP_200_OK)
