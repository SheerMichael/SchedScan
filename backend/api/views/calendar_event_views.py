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
from calendar import monthrange
from datetime import date

from django.db.models import Q
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
    end_date = drf_serializers.DateField(required=False, allow_null=True, default=None)

    class Meta:
        model = CalendarEvent
        fields = [
            "id", "title", "description", "date", "end_date",
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
        start_date = attrs.get("date", getattr(self.instance, "date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))

        if start_date and end_date and end_date < start_date:
            raise drf_serializers.ValidationError(
                {"end_date": "End date must be on or after the start date."}
            )

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
            "id", "title", "description", "date", "end_date",
            "start_time", "end_time", "location",
            "event_type", "visibility",
        ]
        read_only_fields = fields


def _recurring_overlaps_month(event: CalendarEvent, month: int) -> bool:
    """Whether a recurring event's month/day range includes the given month."""
    start_month = event.date.month
    end_month = (event.end_date or event.date).month

    if end_month >= start_month:
        return start_month <= month <= end_month
    return month >= start_month or month <= end_month


def _one_time_overlaps_month(event: CalendarEvent, month: int) -> bool:
    """Whether a one-time event's concrete date range includes the given month."""
    start_date = event.date
    end_date = event.end_date or event.date

    cursor_year = start_date.year
    cursor_month = start_date.month

    while (cursor_year, cursor_month) <= (end_date.year, end_date.month):
        if cursor_month == month:
            return True

        if cursor_month == 12:
            cursor_month = 1
            cursor_year += 1
        else:
            cursor_month += 1

    return False


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

        # One-time events that overlap the requested year/month window.
        if month:
            window_start = date(year, month, 1)
            window_end = date(year, month, monthrange(year, month)[1])
        else:
            window_start = date(year, 1, 1)
            window_end = date(year, 12, 31)

        one_time_qs = CalendarEvent.objects.filter(
            event_type="one_time",
            visibility__in=visible_to,
            date__lte=window_end,
        ).filter(
            Q(end_date__isnull=True, date__gte=window_start)
            | Q(end_date__gte=window_start)
        )

        # Recurring events: match by month only (they repeat every year)
        recurring_qs = CalendarEvent.objects.filter(
            event_type="recurring",
            visibility__in=visible_to,
        )
        if month:
            recurring_ids = [
                event.id for event in recurring_qs
                if _recurring_overlaps_month(event, month)
            ]
            recurring_qs = recurring_qs.filter(id__in=recurring_ids)

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

        # Optional year/month filter using overlap semantics for ranged events.
        year_param = request.query_params.get("year")
        month_param = request.query_params.get("month")

        year = None
        if year_param:
            try:
                year = int(year_param)
            except ValueError:
                year = None

        month = None
        if month_param:
            try:
                parsed_month = int(month_param)
                if 1 <= parsed_month <= 12:
                    month = parsed_month
            except ValueError:
                month = None

        if year is not None:
            if month is not None:
                window_start = date(year, month, 1)
                window_end = date(year, month, monthrange(year, month)[1])
            else:
                window_start = date(year, 1, 1)
                window_end = date(year, 12, 31)

            one_time_qs = qs.filter(
                event_type="one_time",
                date__lte=window_end,
            ).filter(
                Q(end_date__isnull=True, date__gte=window_start)
                | Q(end_date__gte=window_start)
            )

            recurring_qs = qs.filter(event_type="recurring")
            if month is not None:
                recurring_ids = [
                    event.id for event in recurring_qs
                    if _recurring_overlaps_month(event, month)
                ]
                recurring_qs = recurring_qs.filter(id__in=recurring_ids)

            qs = (one_time_qs | recurring_qs).distinct().order_by("date", "start_time")
        elif month is not None:
            one_time_qs = qs.filter(event_type="one_time")
            one_time_ids = [
                event.id for event in one_time_qs
                if _one_time_overlaps_month(event, month)
            ]
            one_time_qs = one_time_qs.filter(id__in=one_time_ids)

            recurring_qs = qs.filter(event_type="recurring")
            recurring_ids = [
                event.id for event in recurring_qs
                if _recurring_overlaps_month(event, month)
            ]
            recurring_qs = recurring_qs.filter(id__in=recurring_ids)
            qs = (one_time_qs | recurring_qs).distinct().order_by("date", "start_time")
        else:
            qs = qs.order_by("date", "start_time")

        return Response(CalendarEventSerializer(qs, many=True).data)

    def post(self, request):
        serializer = CalendarEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = serializer.save(created_by=request.user)

        try:
            from api.utils.notification_service import notify_users_of_calendar_event
            notify_users_of_calendar_event(event)
        except Exception:
            logger.exception("Failed to fan out calendar event notifications")

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
