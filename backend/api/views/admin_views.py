"""
Admin-only API views for the SchedScan admin dashboard.

All endpoints (except AdminLoginView) require is_staff=True via IsAdminUser permission.
JWT tokens are issued from the existing simplejwt token infrastructure.
"""
import logging
from datetime import timedelta, date

from django.contrib.auth import authenticate, get_user_model
from django.db.models import Count, Sum, Q
from django.db.models.functions import TruncDate
from django.utils import timezone

from rest_framework import status, generics, serializers as drf_serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from ..models import (
    AdminAuditLog,
    Holiday,
    ParentChildLink,
    Payment,
    Schedule,
)
from ..permissions import IsAdminUser

User = get_user_model()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_client_ip(request):
    """Extract the real client IP, respecting X-Forwarded-For if present."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _write_audit(admin, action, target_type="", target_id=None, detail="", ip=None):
    """Create an AdminAuditLog entry. Swallows exceptions so it never breaks the main flow."""
    try:
        AdminAuditLog.objects.create(
            admin=admin,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail,
            ip_address=ip,
        )
    except Exception:
        logger.exception("Failed to write audit log")


# ---------------------------------------------------------------------------
# Serializers (local, admin-specific – keep separate from public serializers)
# ---------------------------------------------------------------------------

class AdminUserSerializer(drf_serializers.ModelSerializer):
    """Read-only serializer that includes admin-relevant fields."""
    full_name = drf_serializers.SerializerMethodField()
    has_premium = drf_serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name",
            "user_type", "student_number", "is_active", "is_staff", "has_premium",
            "created_at",
        ]
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_has_premium(self, obj):
        """A parent has 'premium' if they have at least one completed payment."""
        return Payment.objects.filter(parent=obj, status="completed").exists()


class HolidaySerializer(drf_serializers.ModelSerializer):
    created_by_email = drf_serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Holiday
        fields = [
            "id", "name", "date", "holiday_type",
            "created_by", "created_by_email", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_by_email", "created_at", "updated_at"]

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by else None


class AuditLogSerializer(drf_serializers.ModelSerializer):
    admin_email = drf_serializers.SerializerMethodField()
    action_label = drf_serializers.SerializerMethodField()

    class Meta:
        model = AdminAuditLog
        fields = [
            "id", "admin_email", "action", "action_label",
            "target_type", "target_id", "detail", "ip_address", "created_at",
        ]

    def get_admin_email(self, obj):
        return obj.admin.email if obj.admin else "Unknown"

    def get_action_label(self, obj):
        return obj.get_action_display()


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

class AdminLoginView(APIView):
    """
    POST /api/admin/login/

    Authenticates a staff user (is_staff=True) and returns JWT tokens.
    Regular app users receive 403 even with valid credentials.

    Request body:
        { "email": "admin@example.com", "password": "secret" }

    Response (200):
        {
            "access": "<access_token>",
            "refresh": "<refresh_token>",
            "user": { "id", "email", "first_name", "last_name" }
        }
    """

    permission_classes = [AllowAny]
    throttle_scope = "admin_login"  # add throttle in settings if desired

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        password = request.data.get("password", "")

        if not email or not password:
            return Response(
                {"error": "Email and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request, email=email, password=password)

        # Unified error for both wrong credentials and non-staff,
        # to avoid leaking account existence via timing/message differences.
        if user is None or not user.is_staff:
            logger.warning(
                "Failed admin login attempt for email='%s' ip='%s'",
                email,
                _get_client_ip(request),
            )
            return Response(
                {"error": "Invalid credentials or insufficient privileges."},
                status=status.HTTP_403_FORBIDDEN,
            )

        refresh = RefreshToken.for_user(user)

        _write_audit(
            admin=user,
            action="admin_login",
            detail=f"Admin login from {_get_client_ip(request)}",
            ip=_get_client_ip(request),
        )

        logger.info("Admin login: %s from %s", user.email, _get_client_ip(request))

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                },
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# User Management
# ---------------------------------------------------------------------------

class AdminUserListView(APIView):
    """
    GET /api/admin/users/

    Returns a paginated list of all users (excluding superusers).
    Supports search by name/email and filtering by user_type or is_active.

    Query params:
        - search     : string (name or email)
        - user_type  : student | faculty | parent
        - is_active  : true | false
        - page       : int (default 1)
        - page_size  : int (default 20, max 100)
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = User.objects.filter(is_superuser=False).order_by("-created_at")

        # -- filters --
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        user_type = request.query_params.get("user_type", "").strip()
        if user_type in ("student", "faculty", "parent"):
            qs = qs.filter(user_type=user_type)

        is_active_param = request.query_params.get("is_active", "").strip().lower()
        if is_active_param == "true":
            qs = qs.filter(is_active=True)
        elif is_active_param == "false":
            qs = qs.filter(is_active=False)

        # -- pagination --
        try:
            page = max(1, int(request.query_params.get("page", 1)))
            page_size = min(100, max(1, int(request.query_params.get("page_size", 20))))
        except (ValueError, TypeError):
            page, page_size = 1, 20

        total = qs.count()
        start = (page - 1) * page_size
        end = start + page_size
        users = qs[start:end]

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": max(1, -(-total // page_size)),  # ceiling division
                "results": AdminUserSerializer(users, many=True).data,
            }
        )


class AdminUserDetailView(APIView):
    """
    GET    /api/admin/users/<pk>/   – retrieve user detail
    PATCH  /api/admin/users/<pk>/   – update is_active (deactivate / reactivate)
    """

    permission_classes = [IsAdminUser]

    def _get_user(self, pk):
        try:
            return User.objects.get(pk=pk, is_superuser=False)
        except User.DoesNotExist:
            return None

    def get(self, request, pk):
        user = self._get_user(pk)
        if not user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AdminUserSerializer(user).data)

    def patch(self, request, pk):
        user = self._get_user(pk)
        if not user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        # Prevent an admin from deactivating their own account
        if user.pk == request.user.pk:
            return Response(
                {"error": "You cannot change your own active status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only is_active is patchable via this endpoint
        if "is_active" not in request.data:
            return Response(
                {"error": "'is_active' field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Accept both boolean and string representations safely
        raw = request.data["is_active"]
        if isinstance(raw, bool):
            new_active = raw
        elif isinstance(raw, str):
            new_active = raw.lower() in ("true", "1", "yes")
        else:
            new_active = bool(raw)

        old_active = user.is_active

        if new_active == old_active:
            return Response(AdminUserSerializer(user).data)

        user.is_active = new_active
        user.save(update_fields=["is_active"])

        action = "user_reactivated" if new_active else "user_deactivated"
        detail = (
            f"User {user.email} {'reactivated' if new_active else 'deactivated'} "
            f"by {request.user.email}"
        )
        _write_audit(
            admin=request.user,
            action=action,
            target_type="User",
            target_id=user.id,
            detail=detail,
            ip=_get_client_ip(request),
        )

        logger.info(detail)
        return Response(AdminUserSerializer(user).data)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

class AdminAnalyticsView(APIView):
    """
    GET /api/admin/analytics/

    Returns aggregated stats for the analytics dashboard.

    Response:
    {
        "total_users": int,
        "users_by_type": { "student": int, "faculty": int, "parent": int },
        "active_users": int,
        "inactive_users": int,
        "total_revenue_centavos": int,
        "total_revenue_php": float,
        "total_schedules": int,
        "premium_parents": int,
        "linked_parents": int,
        "reporting_period": "last_7_days"
    }
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        # User counts
        user_type_counts = dict(
            User.objects.filter(is_superuser=False)
            .values("user_type")
            .annotate(n=Count("id"))
            .values_list("user_type", "n")
        )
        total = User.objects.filter(is_superuser=False).count()
        active = User.objects.filter(is_superuser=False, is_active=True).count()

        # Revenue (completed Stripe payments)
        revenue_data = Payment.objects.filter(status="completed").aggregate(
            total=Sum("amount")
        )
        total_centavos = revenue_data["total"] or 0

        # Downloads = number of schedule objects ever uploaded
        total_schedules = Schedule.objects.count()

        # Premium parents = parents with at least 1 completed payment
        premium_parents = (
            Payment.objects.filter(status="completed")
            .values("parent")
            .distinct()
            .count()
        )

        # Linked parents (active parent-child links)
        linked_parents = ParentChildLink.objects.filter(status="active").count()

        return Response(
            {
                "total_users": total,
                "users_by_type": {
                    "student": user_type_counts.get("student", 0),
                    "faculty": user_type_counts.get("faculty", 0),
                    "parent": user_type_counts.get("parent", 0),
                },
                "active_users": active,
                "inactive_users": total - active,
                "total_revenue_centavos": total_centavos,
                "total_revenue_php": round(total_centavos / 100, 2),
                "total_schedules": total_schedules,
                "premium_parents": premium_parents,
                "linked_parents": linked_parents,
                "reporting_period": "all_time",
            }
        )


class AdminAnalyticsChartView(APIView):
    """
    GET /api/admin/analytics/chart/

    Returns daily schedule upload counts for the last N days (default 7).
    This serves as a proxy for "scan activity" since each scan = 1 Schedule.

    Query params:
        - days: int (default 7, max 90)
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        try:
            days = min(90, max(1, int(request.query_params.get("days", 7))))
        except (ValueError, TypeError):
            days = 7

        today = timezone.now().date()
        start = today - timedelta(days=days - 1)

        # Build a date -> count map from the DB (using TruncDate, not .extra())
        raw = (
            Schedule.objects.filter(created_at__date__gte=start)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )
        counts = {str(row["day"]): row["count"] for row in raw}

        # Fill in zeros for missing days so frontend always gets a complete series
        chart_data = []
        for i in range(days):
            d = start + timedelta(days=i)
            d_str = str(d)
            chart_data.append(
                {
                    "date": d_str,
                    "label": d.strftime("%a"),  # e.g. "Mon"
                    "scans": counts.get(d_str, 0),
                }
            )

        return Response({"days": days, "data": chart_data})


# ---------------------------------------------------------------------------
# Holiday CRUD
# ---------------------------------------------------------------------------

class AdminHolidayListCreateView(APIView):
    """
    GET   /api/admin/holidays/  – list all holidays (optionally filter by year/month)
    POST  /api/admin/holidays/  – create a holiday
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = Holiday.objects.all()

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

        return Response(HolidaySerializer(qs, many=True).data)

    def post(self, request):
        serializer = HolidaySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        holiday = serializer.save(created_by=request.user)

        _write_audit(
            admin=request.user,
            action="holiday_created",
            target_type="Holiday",
            target_id=holiday.id,
            detail=f"Holiday '{holiday.name}' on {holiday.date} created",
            ip=_get_client_ip(request),
        )

        return Response(HolidaySerializer(holiday).data, status=status.HTTP_201_CREATED)


class AdminHolidayDetailView(APIView):
    """
    GET    /api/admin/holidays/<pk>/  – retrieve
    PUT    /api/admin/holidays/<pk>/  – full update
    PATCH  /api/admin/holidays/<pk>/  – partial update
    DELETE /api/admin/holidays/<pk>/  – delete
    """

    permission_classes = [IsAdminUser]

    def _get_holiday(self, pk):
        try:
            return Holiday.objects.get(pk=pk)
        except Holiday.DoesNotExist:
            return None

    def get(self, request, pk):
        holiday = self._get_holiday(pk)
        if not holiday:
            return Response({"error": "Holiday not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(HolidaySerializer(holiday).data)

    def _update(self, request, pk, partial=False):
        holiday = self._get_holiday(pk)
        if not holiday:
            return Response({"error": "Holiday not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = HolidaySerializer(holiday, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()

        _write_audit(
            admin=request.user,
            action="holiday_updated",
            target_type="Holiday",
            target_id=updated.id,
            detail=f"Holiday '{updated.name}' updated",
            ip=_get_client_ip(request),
        )

        return Response(HolidaySerializer(updated).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def delete(self, request, pk):
        holiday = self._get_holiday(pk)
        if not holiday:
            return Response({"error": "Holiday not found."}, status=status.HTTP_404_NOT_FOUND)

        name = holiday.name
        _write_audit(
            admin=request.user,
            action="holiday_deleted",
            target_type="Holiday",
            target_id=holiday.id,
            detail=f"Holiday '{name}' on {holiday.date} deleted",
            ip=_get_client_ip(request),
        )

        holiday.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

class AdminAuditLogView(APIView):
    """
    GET /api/admin/audit-log/

    Returns the most recent admin audit log entries.

    Query params:
        - limit : int (default 50, max 200)
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        try:
            limit = min(200, max(1, int(request.query_params.get("limit", 50))))
        except (ValueError, TypeError):
            limit = 50

        logs = AdminAuditLog.objects.select_related("admin").order_by("-created_at")[:limit]
        return Response(AuditLogSerializer(logs, many=True).data)
