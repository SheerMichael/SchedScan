"""
Custom DRF permission classes for SchedScan.
"""
from rest_framework.permissions import BasePermission


class IsAdminUser(BasePermission):
    """
    Grants access only to users with is_staff=True (admin dashboard users).
    Returns a clear 403 message for non-admins.
    """
    message = "You do not have admin privileges."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )


class IsVerifiedFaculty(BasePermission):
    """
    Grants access only to authenticated faculty users who are admin-verified.
    """
    message = (
        "Your faculty account is pending admin verification. "
        "This faculty feature is disabled until verification is approved."
    )

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        if user.user_type != 'faculty':
            self.message = "Only faculty accounts can access this endpoint."
            return False

        if not user.is_verified:
            self.message = (
                "Your faculty account is pending admin verification. "
                "This faculty feature is disabled until verification is approved."
            )
            return False

        return True
