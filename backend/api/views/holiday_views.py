"""
Public holiday API views.

These endpoints are accessible to any authenticated user (students, faculty, parents)
so their calendars can display admin-created holidays.
"""
import logging
from datetime import date

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
        fields = ["id", "name", "date", "holiday_type"]
        read_only_fields = fields


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

        # One-time holidays that fall in the requested year (+ optional month)
        one_time_qs = Holiday.objects.filter(holiday_type="one_time", date__year=year)
        if month:
            one_time_qs = one_time_qs.filter(date__month=month)

        # Recurring holidays: match by month only (they repeat every year)
        recurring_qs = Holiday.objects.filter(holiday_type="recurring")
        if month:
            recurring_qs = recurring_qs.filter(date__month=month)

        # Combine and deduplicate (union removes duplicates by default)
        holidays = (one_time_qs | recurring_qs).distinct().order_by("date")

        serializer = PublicHolidaySerializer(holidays, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
