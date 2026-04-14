from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from django.utils import timezone
from django.db.models import Q, Count
from datetime import timedelta

from ..serializers import TaskSerializer
from ..models import Task, TaskUrgencyEvent


URGENCY_RANK = {
    'low': 1,
    'medium': 2,
    'high': 3,
    'critical': 4,
}


def task_effective_rank(task, now=None):
    """Return numeric rank for effective urgency after due-date escalation."""
    if now is None:
        now = timezone.now()

    label = task.get_effective_urgency(now=now)
    return URGENCY_RANK.get(label, 2)


def critical_popup_reason(task, now=None):
    """Return a reason label when task is critical for popup purposes."""
    if now is None:
        now = timezone.now()

    if task.due_date:
        minutes_until_due = task.minutes_until_due(now=now)
        if minutes_until_due is not None and minutes_until_due <= 0:
            return 'overdue'
        if minutes_until_due is not None and minutes_until_due <= 60:
            return 'due_soon'
    if task.urgency == 'critical':
        return 'critical_flag'
    return 'critical'


def _track_urgency_event(user, event_type, task=None, metadata=None):
    """Persist an urgency analytics event without affecting API flow on failures."""
    try:
        TaskUrgencyEvent.objects.create(
            user=user,
            task=task,
            event_type=event_type,
            metadata=metadata or {},
        )
    except Exception:
        # Analytics should never break functional API paths.
        pass


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
        Filter tasks by subject_code and optional urgency query params.
        """
        queryset = Task.objects.filter(user=self.request.user)

        subject_code = self.request.query_params.get('subject_code', None)
        if subject_code:
            queryset = queryset.filter(subject_code=subject_code)

        urgency = self.request.query_params.get('urgency', None)
        if urgency in dict(Task.URGENCY_CHOICES):
            queryset = queryset.filter(urgency=urgency)

        effective_urgency = self.request.query_params.get('effective_urgency', None)
        if effective_urgency in URGENCY_RANK:
            now = timezone.now()
            threshold = URGENCY_RANK[effective_urgency]
            queryset = [task for task in queryset if task_effective_rank(task, now) >= threshold]
            queryset.sort(key=lambda task: (task_effective_rank(task, now), task.created_at), reverse=True)
            return queryset

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


class TaskUrgentPopupView(APIView):
    """
    Returns a candidate task for invasive urgent popup handling.

    GET /api/tasks/urgent-popup/

    Selection rules:
    - incomplete
    - not snoozed
    - not shown within cooldown window
    - effective urgency is critical
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()

        if not request.user.urgent_popup_enabled:
            return Response({'show_popup': False, 'task': None, 'reason': 'disabled_by_user'}, status=status.HTTP_200_OK)

        local_hour = request.query_params.get('local_hour')
        if local_hour is not None:
            try:
                local_hour = int(local_hour)
            except (TypeError, ValueError):
                return Response({'error': 'local_hour must be an integer (0-23).'}, status=status.HTTP_400_BAD_REQUEST)
            if local_hour < 0 or local_hour > 23:
                return Response({'error': 'local_hour must be between 0 and 23.'}, status=status.HTTP_400_BAD_REQUEST)

            if request.user.is_in_quiet_hours(local_hour):
                return Response({'show_popup': False, 'task': None, 'reason': 'quiet_hours'}, status=status.HTTP_200_OK)

        cooldown_minutes = int(getattr(settings, 'TASK_URGENT_POPUP_COOLDOWN_MINUTES', 30))
        cooldown_cutoff = now - timedelta(minutes=cooldown_minutes)

        candidates = Task.objects.filter(
            user=request.user,
            is_completed=False,
        ).filter(
            Q(urgent_snoozed_until__isnull=True) | Q(urgent_snoozed_until__lte=now),
            Q(last_urgent_popup_at__isnull=True) | Q(last_urgent_popup_at__lt=cooldown_cutoff),
        )

        best_task = None
        best_rank = -1
        best_due_minutes = 10**9

        for task in candidates:
            rank = task_effective_rank(task, now=now)
            if rank < URGENCY_RANK['critical']:
                continue

            due_minutes = task.minutes_until_due(now=now)
            due_minutes = due_minutes if due_minutes is not None else 10**9
            if rank > best_rank or (rank == best_rank and due_minutes < best_due_minutes):
                best_task = task
                best_rank = rank
                best_due_minutes = due_minutes

        if not best_task:
            return Response({'show_popup': False, 'task': None}, status=status.HTTP_200_OK)

        reason = critical_popup_reason(best_task, now=now)
        best_task.last_urgent_popup_at = now
        best_task.save(update_fields=['last_urgent_popup_at'])

        _track_urgency_event(
            user=request.user,
            event_type='popup_shown',
            task=best_task,
            metadata={
                'reason': reason,
                'minutes_until_due': best_task.minutes_until_due(now=now),
                'effective_urgency': best_task.get_effective_urgency(now=now),
            },
        )

        serializer = TaskSerializer(best_task)
        return Response(
            {
                'show_popup': True,
                'task': serializer.data,
                'reason': reason,
                'cooldown_minutes': cooldown_minutes,
            },
            status=status.HTTP_200_OK,
        )


class TaskUrgentActionView(APIView):
    """
    Handles user actions from the urgent popup.

    POST /api/tasks/<id>/urgent-action/
    Body:
      {"action": "snooze", "minutes": 10}
      {"action": "acknowledge"}
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            task = Task.objects.get(pk=pk, user=request.user)
        except Task.DoesNotExist:
            return Response({'error': 'Task not found.'}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get('action', '')
        now = timezone.now()

        if action == 'open':
            task.last_urgent_popup_at = now
            task.save(update_fields=['last_urgent_popup_at'])
            _track_urgency_event(
                user=request.user,
                event_type='opened',
                task=task,
                metadata={'minutes_until_due': task.minutes_until_due(now=now)},
            )
            return Response({'message': 'Task opened from urgent popup.'}, status=status.HTTP_200_OK)

        if action == 'complete':
            task.is_completed = True
            task.last_urgent_popup_at = now
            task.save(update_fields=['is_completed', 'last_urgent_popup_at', 'updated_at'])
            _track_urgency_event(
                user=request.user,
                event_type='completed_from_popup',
                task=task,
                metadata={'minutes_until_due': task.minutes_until_due(now=now)},
            )
            return Response({'message': 'Task completed from urgent popup.'}, status=status.HTTP_200_OK)

        if action == 'snooze':
            try:
                default_minutes = int(getattr(request.user, 'urgent_popup_default_snooze_minutes', 10) or 10)
                minutes = int(request.data.get('minutes', default_minutes))
            except (TypeError, ValueError):
                return Response({'error': 'minutes must be a valid integer.'}, status=status.HTTP_400_BAD_REQUEST)

            minutes = max(1, min(minutes, 24 * 60))
            task.urgent_snoozed_until = now + timedelta(minutes=minutes)
            task.last_urgent_popup_at = now
            task.save(update_fields=['urgent_snoozed_until', 'last_urgent_popup_at'])
            _track_urgency_event(
                user=request.user,
                event_type='snoozed',
                task=task,
                metadata={'minutes': minutes, 'until': str(task.urgent_snoozed_until)},
            )
            return Response(
                {
                    'message': 'Task snoozed.',
                    'urgent_snoozed_until': task.urgent_snoozed_until,
                },
                status=status.HTTP_200_OK,
            )

        if action == 'acknowledge':
            task.last_urgent_popup_at = now
            task.save(update_fields=['last_urgent_popup_at'])
            _track_urgency_event(
                user=request.user,
                event_type='acknowledged',
                task=task,
                metadata={'minutes_until_due': task.minutes_until_due(now=now)},
            )
            return Response({'message': 'Task acknowledged.'}, status=status.HTTP_200_OK)

        return Response(
            {'error': 'action must be one of: snooze, acknowledge, open, complete'},
            status=status.HTTP_400_BAD_REQUEST,
        )


class TaskUrgencyAnalyticsView(APIView):
    """
    Return urgency event counters for the authenticated user.

    GET /api/tasks/urgent-analytics/?days=7
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            days = int(request.query_params.get('days', 7))
        except (TypeError, ValueError):
            return Response({'error': 'days must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

        days = max(1, min(days, 90))
        since = timezone.now() - timedelta(days=days)

        qs = TaskUrgencyEvent.objects.filter(user=request.user, created_at__gte=since)
        grouped = qs.values('event_type').annotate(count=Count('id'))

        counters = {item['event_type']: item['count'] for item in grouped}
        for event_type, _ in TaskUrgencyEvent.EVENT_TYPE_CHOICES:
            counters.setdefault(event_type, 0)

        return Response(
            {
                'days': days,
                'since': since,
                'total_events': qs.count(),
                'counters': counters,
            },
            status=status.HTTP_200_OK,
        )
