"""
Calendar Event API views.

Admin endpoints (require is_staff):
    GET/POST   /api/admin/calendar-events/
    GET/PATCH/PUT/DELETE  /api/admin/calendar-events/<pk>/

Public endpoint (authenticated users only):
    GET /api/calendar-events/
    Events are filtered by user role (visibility field).
"""
import logging
from datetime import date

from rest_framework import status, serializers as drf_serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import CalendarEvent
from ..permissions import IsAdminUser
from .admin_views import _get_client_ip, _write_audit

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

class CalendarEventSerializer(drf_serializers.ModelSerializer):
    """Full CRUD serializer for admin views."""
    created_by_email = drf_serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CalendarEvent
        fields = [
            "id", "title", "description", "date",
            "start_time", "end_time", "location",
            "event_type", "visibility",
            "created_by", "created_by_email",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "created_by", "created_by_email",
            "created_at", "updated_at",
        ]

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by else None

    def validate(self, attrs):
        start_time = attrs.get("start_time")
        end_time = attrs.get("end_time")
        # If both times are provided, end must be after start
        if start_time and end_time and end_time <= start_time:
            raise drf_serializers.ValidationError(
                {"end_time": "End time must be after start time."}
            )
        return attrs


class PublicCalendarEventSerializer(drf_serializers.ModelSerializer):
    """Read-only serializer exposing only the fields mobile clients need."""

    class Meta:
        model = CalendarEvent
        fields = [
            "id", "title", "description", "date",
            "start_time", "end_time", "location",
            "event_type", "visibility",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Public endpoint — all authenticated users
# ---------------------------------------------------------------------------

class CalendarEventListView(APIView):
    """
    GET /api/calendar-events/

    Returns calendar events visible to the current user based on their role.
    Supports optional year/month filtering; also returns recurring events
    whose month matches the requested month (regardless of year).

    Query params:
        - year  : int (optional, defaults to current year)
        - month : int 1-12 (optional)

    Response 200:
    [
        {
            "id": 1,
            "title": "Enrollment Period",
            "description": "...",
            "date": "2026-09-01",
            "start_time": "08:00:00",
            "end_time": "17:00:00",
            "location": "Main Hall",
            "event_type": "one_time",
            "visibility": "all"
        },
        ...
    ]
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        year_param = request.query_params.get("year")
        month_param = request.query_params.get("month")

        # Parse year (default: current year)
        try:
            year = int(year_param) if year_param else date.today().year
        except (ValueError, TypeError):
            year = date.today().year

        # Parse month (optional)
        month = None
        if month_param:
            try:
                month = int(month_param)
                if month < 1 or month > 12:
                    month = None
            except (ValueError, TypeError):
                month = None

        # Determine which visibility values this user can see
        user_type = getattr(request.user, "user_type", None)
        visible_to = ["all"]
        if user_type in ("student", "faculty"):
            visible_to.append(user_type)

        # One-time events in the requested year (+ optional month)
        one_time_qs = CalendarEvent.objects.filter(
            event_type="one_time",
            date__year=year,
            visibility__in=visible_to,
        )
        if month:
            one_time_qs = one_time_qs.filter(date__month=month)

        # Recurring events: match by month only (they repeat every year)
        recurring_qs = CalendarEvent.objects.filter(
            event_type="recurring",
            visibility__in=visible_to,
        )
        if month:
            recurring_qs = recurring_qs.filter(date__month=month)

        events = (one_time_qs | recurring_qs).distinct().order_by("date", "start_time")

        serializer = PublicCalendarEventSerializer(events, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Admin CRUD endpoints
# ---------------------------------------------------------------------------

class AdminCalendarEventListCreateView(APIView):
    """
    GET   /api/admin/calendar-events/  – list all events (optionally filter by year/month)
    POST  /api/admin/calendar-events/  – create an event
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = CalendarEvent.objects.all()

        # Optional year/month filter
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        if year:
            try:
                qs = qs.filter(date__year=int(year))
            except ValueError:
                pass
        if month:
            try:
                qs = qs.filter(date__month=int(month))
            except ValueError:
                pass

        return Response(CalendarEventSerializer(qs, many=True).data)

    def post(self, request):
        serializer = CalendarEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = serializer.save(created_by=request.user)

        _write_audit(
            admin=request.user,
            action="event_created",
            target_type="CalendarEvent",
            target_id=event.id,
            detail=f"Event '{event.title}' on {event.date} created (visibility: {event.visibility})",
            ip=_get_client_ip(request),
        )

        return Response(
            CalendarEventSerializer(event).data,
            status=status.HTTP_201_CREATED,
        )


class AdminCalendarEventDetailView(APIView):
    """
    GET    /api/admin/calendar-events/<pk>/  – retrieve
    PUT    /api/admin/calendar-events/<pk>/  – full update
    PATCH  /api/admin/calendar-events/<pk>/  – partial update
    DELETE /api/admin/calendar-events/<pk>/  – delete
    """

    permission_classes = [IsAdminUser]

    def _get_event(self, pk):
        try:
            return CalendarEvent.objects.get(pk=pk)
        except CalendarEvent.DoesNotExist:
            return None

    def get(self, request, pk):
        event = self._get_event(pk)
        if not event:
            return Response(
                {"error": "Calendar event not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(CalendarEventSerializer(event).data)

    def _update(self, request, pk, partial=False):
        event = self._get_event(pk)
        if not event:
            return Response(
                {"error": "Calendar event not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = CalendarEventSerializer(
            event, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()

        _write_audit(
            admin=request.user,
            action="event_updated",
            target_type="CalendarEvent",
            target_id=updated.id,
            detail=f"Event '{updated.title}' updated",
            ip=_get_client_ip(request),
        )

        return Response(CalendarEventSerializer(updated).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def delete(self, request, pk):
        event = self._get_event(pk)
        if not event:
            return Response(
                {"error": "Calendar event not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        title = event.title
        _write_audit(
            admin=request.user,
            action="event_deleted",
            target_type="CalendarEvent",
            target_id=event.id,
            detail=f"Event '{title}' on {event.date} deleted",
            ip=_get_client_ip(request),
        )

        event.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
