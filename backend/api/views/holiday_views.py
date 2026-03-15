"""
Public holiday API views.

These endpoints are accessible to any authenticated user (students, faculty, parents)
so their calendars can display admin-created holidays.
"""
import logging
from calendar import monthrange
from datetime import date

from django.db.models import Q
from rest_framework import status, serializers as drf_serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Holiday

logger = logging.getLogger(__name__)


class PublicHolidaySerializer(drf_serializers.ModelSerializer):
    """Read-only serializer exposing only the fields mobile clients need."""

    class Meta:
        model = Holiday
        fields = ["id", "name", "date", "end_date", "holiday_type"]
        read_only_fields = fields


def _recurring_overlaps_month(holiday: Holiday, month: int) -> bool:
    """Whether a recurring holiday's month/day range includes the given month."""
    start_month = holiday.date.month
    end_month = (holiday.end_date or holiday.date).month

    if end_month >= start_month:
        return start_month <= month <= end_month
    return month >= start_month or month <= end_month


class HolidayListView(APIView):
    """
    GET /api/holidays/

    Returns holidays visible to all authenticated users.
    Supports optional year/month filtering; also returns recurring holidays
    whose month matches the requested month (regardless of year).

    Query params:
        - year  : int (optional, defaults to current year)
        - month : int 1-12 (optional)

    Response 200:
    [
        { "id": 1, "name": "New Year", "date": "2026-01-01", "holiday_type": "one_time" },
        { "id": 2, "name": "Independence Day", "date": "2026-06-12", "holiday_type": "recurring" },
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

        # One-time holidays that overlap the requested year/month window.
        if month:
            window_start = date(year, month, 1)
            window_end = date(year, month, monthrange(year, month)[1])
        else:
            window_start = date(year, 1, 1)
            window_end = date(year, 12, 31)

        one_time_qs = Holiday.objects.filter(
            holiday_type="one_time",
            date__lte=window_end,
        ).filter(
            Q(end_date__isnull=True, date__gte=window_start)
            | Q(end_date__gte=window_start)
        )

        # Recurring holidays: include ranges that overlap the requested month.
        recurring_qs = Holiday.objects.filter(holiday_type="recurring")
        if month:
            recurring_ids = [
                holiday.id for holiday in recurring_qs
                if _recurring_overlaps_month(holiday, month)
            ]
            recurring_qs = recurring_qs.filter(id__in=recurring_ids)

        # Combine and deduplicate (union removes duplicates by default)
        holidays = (one_time_qs | recurring_qs).distinct().order_by("date")

        serializer = PublicHolidaySerializer(holidays, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
