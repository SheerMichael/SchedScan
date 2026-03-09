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
