"""
Admin-only API views for the SchedScan admin dashboard.

All endpoints (except AdminLoginView) require is_staff=True via IsAdminUser permission.
JWT tokens are issued from the existing simplejwt token infrastructure.
"""
import logging
from datetime import timedelta, date

from django.contrib.auth import authenticate, get_user_model
from django.db.models import Avg, Count, Sum, Q
from django.db.models.functions import TruncDate
from django.utils import timezone

from rest_framework import status, generics, serializers as drf_serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from ..models import (
    AdminAuditLog,
    ClassEnrollment,
    ExtractionLog,
    Holiday,
    IncidentReport,
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
            "user_type", "student_number", "is_active", "is_staff",
            "is_verified", "has_premium", "created_at",
        ]
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_has_premium(self, obj):
        """A parent has 'premium' if they have at least one completed payment."""
        return Payment.objects.filter(parent=obj, status="completed").exists()


class HolidaySerializer(drf_serializers.ModelSerializer):
    created_by_email = drf_serializers.SerializerMethodField(read_only=True)
    # end_date is optional — null means single-day holiday
    end_date = drf_serializers.DateField(required=False, allow_null=True, default=None)

    class Meta:
        model = Holiday
        fields = [
            "id", "name", "date", "end_date", "holiday_type",
            "created_by", "created_by_email", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_by_email", "created_at", "updated_at"]

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by else None

    def validate(self, attrs):
        """Ensure end_date is not earlier than start date."""
        start = attrs.get("date")
        end = attrs.get("end_date")
        if start and end and end < start:
            raise drf_serializers.ValidationError(
                {"end_date": "End date must be on or after the start date."}
            )
        return attrs


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


class AdminParentLinkSerializer(drf_serializers.ModelSerializer):
    """Read-only serializer for parent-child links."""
    parent_email = drf_serializers.SerializerMethodField()
    parent_name = drf_serializers.SerializerMethodField()
    child_email = drf_serializers.SerializerMethodField()
    child_name = drf_serializers.SerializerMethodField()
    child_student_number = drf_serializers.SerializerMethodField()

    class Meta:
        model = ParentChildLink
        fields = [
            "id", "parent", "parent_email", "parent_name",
            "child", "child_email", "child_name", "child_student_number",
            "status", "linked_at",
        ]
        read_only_fields = fields

    def get_parent_email(self, obj):
        return obj.parent.email

    def get_parent_name(self, obj):
        return obj.parent.get_full_name()

    def get_child_email(self, obj):
        return obj.child.email

    def get_child_name(self, obj):
        return obj.child.get_full_name()

    def get_child_student_number(self, obj):
        return obj.child.student_number or ""


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

        # Prevent an admin from editing their own account via this endpoint
        if user.pk == request.user.pk:
            return Response(
                {"error": "You cannot modify your own account from this endpoint."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ip = _get_client_ip(request)
        changes_made = []

        # --- is_active ---
        if "is_active" in request.data:
            raw = request.data["is_active"]
            new_active = raw if isinstance(raw, bool) else str(raw).lower() in ("true", "1", "yes")
            if new_active != user.is_active:
                user.is_active = new_active
                action = "user_reactivated" if new_active else "user_deactivated"
                label = "reactivated" if new_active else "deactivated"
                _write_audit(
                    admin=request.user, action=action,
                    target_type="User", target_id=user.id,
                    detail=f"User {user.email} {label} by {request.user.email}",
                    ip=ip,
                )
                changes_made.append("is_active")

        # --- is_verified (faculty verification) ---
        if "is_verified" in request.data:
            raw = request.data["is_verified"]
            new_verified = raw if isinstance(raw, bool) else str(raw).lower() in ("true", "1", "yes")
            if new_verified != user.is_verified:
                user.is_verified = new_verified
                action = "faculty_verified" if new_verified else "faculty_unverified"
                label = "verified" if new_verified else "unverified"
                _write_audit(
                    admin=request.user, action=action,
                    target_type="User", target_id=user.id,
                    detail=f"User {user.email} marked as {label} by {request.user.email}",
                    ip=ip,
                )
                changes_made.append("is_verified")

        # --- user_type (role change) ---
        if "user_type" in request.data:
            new_type = str(request.data["user_type"]).strip().lower()
            if new_type not in ("student", "faculty", "parent"):
                return Response(
                    {"error": "user_type must be 'student', 'faculty', or 'parent'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if new_type != user.user_type:
                old_type = user.user_type
                user.user_type = new_type
                _write_audit(
                    admin=request.user, action="user_role_changed",
                    target_type="User", target_id=user.id,
                    detail=(
                        f"User {user.email} role changed from '{old_type}' to '{new_type}' "
                        f"by {request.user.email}"
                    ),
                    ip=ip,
                )
                changes_made.append("user_type")

        # --- Profile fields (first_name, last_name, student_number) ---
        profile_fields = {}
        for field_name in ("first_name", "last_name", "student_number"):
            if field_name in request.data:
                new_val = str(request.data[field_name]).strip()
                # Validate lengths
                max_len = User._meta.get_field(field_name).max_length
                if len(new_val) > max_len:
                    return Response(
                        {"error": f"{field_name} must be at most {max_len} characters."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                old_val = getattr(user, field_name) or ""
                if new_val != old_val:
                    profile_fields[field_name] = (old_val, new_val)
                    setattr(user, field_name, new_val)
                    changes_made.append(field_name)

        if profile_fields:
            detail_parts = [
                f"{k}: '{old}' → '{new}'" for k, (old, new) in profile_fields.items()
            ]
            _write_audit(
                admin=request.user, action="user_profile_edited",
                target_type="User", target_id=user.id,
                detail=(
                    f"Profile edited for {user.email} by {request.user.email}: "
                    + ", ".join(detail_parts)
                ),
                ip=ip,
            )

        if not changes_made:
            return Response(AdminUserSerializer(user).data)

        user.save(update_fields=changes_made + ["updated_at"])
        logger.info(
            "Admin %s edited user %s fields: %s",
            request.user.email, user.email, ", ".join(changes_made),
        )
        return Response(AdminUserSerializer(user).data)


class AdminUserActivityView(APIView):
    """
    GET /api/admin/users/<pk>/activity/

    Returns a read-only activity feed for a specific user:
    - Schedules (count + list with titles)
    - Class enrollments (as student or faculty)
    - Parent-child links
    - Account metadata (created_at, last_login, is_verified)
    """

    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            user = User.objects.get(pk=pk, is_superuser=False)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        # Schedules
        schedules = Schedule.objects.filter(user=user).values(
            "id", "title", "upload_type", "semester", "school_year",
            "is_active", "created_at",
        )

        # Enrollments (as student)
        student_enrollments = ClassEnrollment.objects.filter(
            student=user, status="active"
        ).values("id", "faculty__email", "subject_code", "enrollment_type", "enrolled_at")

        # Enrollments (as faculty)
        faculty_enrollments = ClassEnrollment.objects.filter(
            faculty=user, status="active"
        ).values("id", "student__email", "subject_code", "enrollment_type", "enrolled_at")

        # Parent-child links
        child_links = ParentChildLink.objects.filter(
            parent=user
        ).select_related("child").values(
            "id", "child__email", "child__first_name", "child__last_name",
            "status", "linked_at",
        )
        parent_links = ParentChildLink.objects.filter(
            child=user
        ).select_related("parent").values(
            "id", "parent__email", "parent__first_name", "parent__last_name",
            "status", "linked_at",
        )

        return Response({
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.get_full_name(),
                "user_type": user.user_type,
                "student_number": user.student_number,
                "is_active": user.is_active,
                "is_verified": user.is_verified,
                "last_login": user.last_login,
                "created_at": user.created_at,
            },
            "schedules": list(schedules),
            "student_enrollments": list(student_enrollments),
            "faculty_enrollments": list(faculty_enrollments),
            "child_links": list(child_links),
            "parent_links": list(parent_links),
        })


# ---------------------------------------------------------------------------
# Parent-Child Link Management
# ---------------------------------------------------------------------------

class AdminParentLinkListView(APIView):
    """
    GET /api/admin/parent-links/

    Lists all parent-child links with search/filter/pagination.

    Query params:
        - search     : string (parent or child email/name)
        - status     : active | revoked
        - page       : int (default 1)
        - page_size  : int (default 20, max 100)
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = ParentChildLink.objects.select_related("parent", "child").order_by("-linked_at")

        # -- filters --
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(parent__email__icontains=search)
                | Q(parent__first_name__icontains=search)
                | Q(parent__last_name__icontains=search)
                | Q(child__email__icontains=search)
                | Q(child__first_name__icontains=search)
                | Q(child__last_name__icontains=search)
                | Q(child__student_number__icontains=search)
            )

        link_status = request.query_params.get("status", "").strip().lower()
        if link_status in ("active", "revoked"):
            qs = qs.filter(status=link_status)

        # -- pagination --
        try:
            page = max(1, int(request.query_params.get("page", 1)))
            page_size = min(100, max(1, int(request.query_params.get("page_size", 20))))
        except (ValueError, TypeError):
            page, page_size = 1, 20

        total = qs.count()
        start = (page - 1) * page_size
        links = qs[start : start + page_size]

        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, -(-total // page_size)),
            "results": AdminParentLinkSerializer(links, many=True).data,
        })


class AdminParentLinkActionView(APIView):
    """
    POST   /api/admin/parent-links/       – create a parent-child link
    DELETE /api/admin/parent-links/<pk>/   – revoke a parent-child link

    POST body:
        { "parent_id": int, "student_number": "2022-01191" }
    """

    permission_classes = [IsAdminUser]

    def post(self, request):
        parent_id = request.data.get("parent_id")
        student_number = str(request.data.get("student_number", "")).strip()

        if not parent_id or not student_number:
            return Response(
                {"error": "parent_id and student_number are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate parent
        try:
            parent = User.objects.get(pk=parent_id, is_superuser=False)
        except User.DoesNotExist:
            return Response({"error": "Parent user not found."}, status=status.HTTP_404_NOT_FOUND)

        if parent.user_type != "parent":
            return Response(
                {"error": f"User {parent.email} is a '{parent.user_type}', not a 'parent'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find student by student_number
        try:
            student = User.objects.get(student_number=student_number, user_type="student")
        except User.DoesNotExist:
            return Response(
                {"error": f"No student found with student number '{student_number}'."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check for existing active link
        if ParentChildLink.objects.filter(
            parent=parent, child=student, status="active"
        ).exists():
            return Response(
                {"error": "An active link already exists between this parent and student."},
                status=status.HTTP_409_CONFLICT,
            )

        link = ParentChildLink.objects.create(
            parent=parent, child=student, status="active"
        )

        _write_audit(
            admin=request.user, action="parent_link_created",
            target_type="ParentChildLink", target_id=link.id,
            detail=(
                f"Admin {request.user.email} linked parent {parent.email} "
                f"to student {student.email} ({student_number})"
            ),
            ip=_get_client_ip(request),
        )

        logger.info(
            "Admin %s created parent link: %s → %s",
            request.user.email, parent.email, student.email,
        )

        return Response(
            AdminParentLinkSerializer(link).data,
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request, pk=None):
        if pk is None:
            return Response(
                {"error": "Link ID is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            link = ParentChildLink.objects.select_related("parent", "child").get(pk=pk)
        except ParentChildLink.DoesNotExist:
            return Response({"error": "Link not found."}, status=status.HTTP_404_NOT_FOUND)

        if link.status == "revoked":
            return Response(
                {"error": "This link is already revoked."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        link.status = "revoked"
        link.save(update_fields=["status"])

        _write_audit(
            admin=request.user, action="parent_link_revoked",
            target_type="ParentChildLink", target_id=link.id,
            detail=(
                f"Admin {request.user.email} revoked link between "
                f"parent {link.parent.email} and student {link.child.email}"
            ),
            ip=_get_client_ip(request),
        )

        logger.info(
            "Admin %s revoked parent link #%d: %s → %s",
            request.user.email, link.id, link.parent.email, link.child.email,
        )

        return Response(status=status.HTTP_204_NO_CONTENT)


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


# ---------------------------------------------------------------------------
# Extraction Health Monitoring
# ---------------------------------------------------------------------------

class AdminExtractionAnalyticsView(APIView):
    """
    GET /api/admin/extraction/analytics/

    Returns aggregated extraction statistics for the health dashboard.

    Query params:
        - days: int (default 30, max 365)

    Response:
    {
        "period_days": 30,
        "total_extractions": int,
        "successful": int,
        "failed": int,
        "success_rate": float,
        "avg_confidence": float,
        "avg_processing_time": float,
        "method_breakdown": { "pdf_text": int, "ocr": int, "ocr_fallback": int, ... },
        "upload_type_breakdown": { "student": int, "faculty": int }
    }
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        try:
            days = min(365, max(1, int(request.query_params.get("days", 30))))
        except (ValueError, TypeError):
            days = 30

        cutoff = timezone.now() - timedelta(days=days)
        qs = ExtractionLog.objects.filter(created_at__gte=cutoff)

        total = qs.count()
        successful = qs.filter(success=True).count()
        failed = total - successful

        agg = qs.aggregate(
            avg_conf=Avg("confidence"),
            avg_time=Avg("processing_time"),
        )

        # Method breakdown
        method_raw = (
            qs.values("extraction_method")
            .annotate(n=Count("id"))
            .order_by("-n")
        )
        method_breakdown = {r["extraction_method"]: r["n"] for r in method_raw}

        # Upload type breakdown
        type_raw = (
            qs.values("upload_type")
            .annotate(n=Count("id"))
            .order_by("-n")
        )
        type_breakdown = {r["upload_type"]: r["n"] for r in type_raw}

        return Response({
            "period_days": days,
            "total_extractions": total,
            "successful": successful,
            "failed": failed,
            "success_rate": round(successful / total, 4) if total else 0.0,
            "avg_confidence": round(agg["avg_conf"] or 0.0, 4),
            "avg_processing_time": round(agg["avg_time"] or 0.0, 3),
            "method_breakdown": method_breakdown,
            "upload_type_breakdown": type_breakdown,
        })


class AdminExtractionChartView(APIView):
    """
    GET /api/admin/extraction/analytics/chart/

    Returns daily success/failure counts for charting.

    Query params:
        - days: int (default 7, max 90)

    Response:
    {
        "days": 7,
        "data": [
            { "date": "2026-03-07", "label": "Sat", "success": 5, "failure": 1 },
            ...
        ]
    }
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        try:
            days = min(90, max(1, int(request.query_params.get("days", 7))))
        except (ValueError, TypeError):
            days = 7

        today = timezone.now().date()
        start = today - timedelta(days=days - 1)

        # Success counts per day
        success_raw = (
            ExtractionLog.objects.filter(created_at__date__gte=start, success=True)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )
        success_map = {str(r["day"]): r["count"] for r in success_raw}

        # Failure counts per day
        failure_raw = (
            ExtractionLog.objects.filter(created_at__date__gte=start, success=False)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )
        failure_map = {str(r["day"]): r["count"] for r in failure_raw}

        chart_data = []
        for i in range(days):
            d = start + timedelta(days=i)
            d_str = str(d)
            chart_data.append({
                "date": d_str,
                "label": d.strftime("%a"),
                "success": success_map.get(d_str, 0),
                "failure": failure_map.get(d_str, 0),
            })

        return Response({"days": days, "data": chart_data})


class AdminFailedExtractionListView(APIView):
    """
    GET /api/admin/extraction/failed/

    Paginated list of failed extraction logs for debugging.

    Query params:
        - search    : filter by file_name or error_message
        - page      : int (default 1)
        - page_size : int (default 20, max 100)
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = ExtractionLog.objects.select_related("user").filter(success=False).order_by("-created_at")

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(file_name__icontains=search)
                | Q(error_message__icontains=search)
            )

        # Pagination
        try:
            page = max(1, int(request.query_params.get("page", 1)))
            page_size = min(100, max(1, int(request.query_params.get("page_size", 20))))
        except (ValueError, TypeError):
            page, page_size = 1, 20

        total = qs.count()
        start = (page - 1) * page_size
        logs = qs[start: start + page_size]

        results = []
        for log in logs:
            results.append({
                "id": log.id,
                "user_email": log.user.email if log.user else None,
                "file_name": log.file_name,
                "file_type": log.file_type,
                "upload_type": log.upload_type,
                "extraction_method": log.extraction_method,
                "confidence": log.confidence,
                "courses_extracted": log.courses_extracted,
                "error_message": log.error_message,
                "raw_text_preview": log.raw_text_preview[:500],
                "processing_time": log.processing_time,
                "attempts": log.attempts,
                "created_at": log.created_at,
            })

        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, -(-total // page_size)),
            "results": results,
        })


# ---------------------------------------------------------------------------
# Incident Reports Console
# ---------------------------------------------------------------------------

class AdminIncidentReportListView(APIView):
    """
    GET /api/admin/incidents/

    Paginated list of user-submitted incident reports.

    Query params:
        - search    : filter by reporter email or description
        - status    : pending | investigating | resolved
        - page      : int (default 1)
        - page_size : int (default 20, max 100)
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = IncidentReport.objects.select_related(
            "reporter", "resolved_by"
        ).order_by("-created_at")

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(reporter__email__icontains=search)
                | Q(reporter__first_name__icontains=search)
                | Q(reporter__last_name__icontains=search)
                | Q(description__icontains=search)
            )

        report_status = request.query_params.get("status", "").strip().lower()
        if report_status in ("pending", "investigating", "resolved"):
            qs = qs.filter(status=report_status)

        # Pagination
        try:
            page = max(1, int(request.query_params.get("page", 1)))
            page_size = min(100, max(1, int(request.query_params.get("page_size", 20))))
        except (ValueError, TypeError):
            page, page_size = 1, 20

        total = qs.count()
        start = (page - 1) * page_size
        reports = qs[start: start + page_size]

        results = []
        for r in reports:
            results.append({
                "id": r.id,
                "reporter_email": r.reporter.email if r.reporter else None,
                "reporter_name": r.reporter.get_full_name() if r.reporter else "Unknown",
                "description": r.description,
                "upload_error": r.upload_error,
                "status": r.status,
                "admin_notes": r.admin_notes,
                "resolved_by_email": r.resolved_by.email if r.resolved_by else None,
                "resolved_at": r.resolved_at,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            })

        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, -(-total // page_size)),
            "results": results,
        })


class AdminIncidentReportDetailView(APIView):
    """
    GET   /api/admin/incidents/<pk>/  – retrieve single report
    PATCH /api/admin/incidents/<pk>/  – update status and/or admin_notes

    When status changes to 'resolved', resolved_by and resolved_at are set automatically.
    """

    permission_classes = [IsAdminUser]

    def _get_report(self, pk):
        try:
            return IncidentReport.objects.select_related(
                "reporter", "resolved_by"
            ).get(pk=pk)
        except IncidentReport.DoesNotExist:
            return None

    def get(self, request, pk):
        report = self._get_report(pk)
        if not report:
            return Response({"error": "Report not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "id": report.id,
            "reporter_email": report.reporter.email if report.reporter else None,
            "reporter_name": report.reporter.get_full_name() if report.reporter else "Unknown",
            "description": report.description,
            "upload_error": report.upload_error,
            "status": report.status,
            "admin_notes": report.admin_notes,
            "resolved_by_email": report.resolved_by.email if report.resolved_by else None,
            "resolved_at": report.resolved_at,
            "created_at": report.created_at,
            "updated_at": report.updated_at,
        })

    def patch(self, request, pk):
        report = self._get_report(pk)
        if not report:
            return Response({"error": "Report not found."}, status=status.HTTP_404_NOT_FOUND)

        ip = _get_client_ip(request)
        changes_made = []

        # --- status ---
        if "status" in request.data:
            new_status = str(request.data["status"]).strip().lower()
            if new_status not in ("pending", "investigating", "resolved"):
                return Response(
                    {"error": "status must be 'pending', 'investigating', or 'resolved'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if new_status != report.status:
                old_status = report.status
                report.status = new_status
                changes_made.append("status")

                if new_status == "resolved":
                    report.resolved_by = request.user
                    report.resolved_at = timezone.now()
                    changes_made.extend(["resolved_by", "resolved_at"])
                elif old_status == "resolved":
                    # Re-opening a resolved report clears resolution metadata
                    report.resolved_by = None
                    report.resolved_at = None
                    changes_made.extend(["resolved_by", "resolved_at"])

        # --- admin_notes ---
        if "admin_notes" in request.data:
            new_notes = str(request.data["admin_notes"]).strip()[:2000]
            if new_notes != report.admin_notes:
                report.admin_notes = new_notes
                changes_made.append("admin_notes")

        if not changes_made:
            return Response(self._serialize(report))

        report.save(update_fields=changes_made + ["updated_at"])

        _write_audit(
            admin=request.user,
            action="incident_updated",
            target_type="IncidentReport",
            target_id=report.id,
            detail=(
                f"Admin {request.user.email} updated incident #{report.id}: "
                + ", ".join(changes_made)
            ),
            ip=ip,
        )

        logger.info(
            "Admin %s updated incident #%d: %s",
            request.user.email, report.id, ", ".join(changes_made),
        )

        return Response(self._serialize(report))

    def _serialize(self, r):
        return {
            "id": r.id,
            "reporter_email": r.reporter.email if r.reporter else None,
            "reporter_name": r.reporter.get_full_name() if r.reporter else "Unknown",
            "description": r.description,
            "upload_error": r.upload_error,
            "status": r.status,
            "admin_notes": r.admin_notes,
            "resolved_by_email": r.resolved_by.email if r.resolved_by else None,
            "resolved_at": r.resolved_at,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
