from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from django.db import transaction
import logging

from ..models import ParentChildLink, Notification

logger = logging.getLogger(__name__)


def _unlink_parental_connections(user):
    """
    Revoke active parent-child links tied to this user and notify connected users.

    - If deleting user is a parent: revoke links where parent=user and notify children.
    - Otherwise: revoke links where child=user and notify parents.

    Returns a dict with counts for logging/observability.
    """
    stats = {
        "links_revoked": 0,
        "notifications_created": 0,
    }

    if user.user_type == 'parent':
        links = list(
            ParentChildLink.objects.filter(parent=user, status='active').select_related('child')
        )
        if not links:
            return stats

        link_ids = [link.id for link in links]
        stats["links_revoked"] = ParentChildLink.objects.filter(
            id__in=link_ids,
            status='active',
        ).update(status='revoked')

        notifications = []
        for link in links:
            notifications.append(
                Notification(
                    user=link.child,
                    notification_type='general',
                    title='Parent Account Unlinked',
                    message='A linked parent account has been removed and access was revoked.',
                    data={
                        'type': 'parent_account_deleted',
                        'parent_id': user.id,
                        'link_id': link.id,
                    },
                )
            )

        if notifications:
            Notification.objects.bulk_create(notifications, batch_size=1000)
            stats["notifications_created"] = len(notifications)
        return stats

    links = list(
        ParentChildLink.objects.filter(child=user, status='active').select_related('parent')
    )
    if not links:
        return stats

    link_ids = [link.id for link in links]
    stats["links_revoked"] = ParentChildLink.objects.filter(
        id__in=link_ids,
        status='active',
    ).update(status='revoked')

    notifications = []
    for link in links:
        notifications.append(
            Notification(
                user=link.parent,
                notification_type='general',
                title='Child Account Unlinked',
                message='A linked child account has been removed and access was revoked.',
                data={
                    'type': 'child_account_deleted',
                    'child_id': user.id,
                    'link_id': link.id,
                },
            )
        )

    if notifications:
        Notification.objects.bulk_create(notifications, batch_size=1000)
        stats["notifications_created"] = len(notifications)

    return stats


class ChangePasswordView(APIView):
    """
    API endpoint to change user password.
    
    POST /api/auth/change-password/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "current_password": "oldpassword",
        "new_password": "newpassword"
    }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        current_password = request.data.get('current_password')
        new_password = request.data.get('new_password')

        if not current_password or not new_password:
            return Response(
                {"error": "Both current_password and new_password are required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not user.check_password(current_password):
            return Response(
                {"error": "Current password is incorrect"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(new_password) < 8:
            return Response(
                {"error": "New password must be at least 8 characters long"},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(new_password)
        user.save()

        return Response(
            {"message": "Password changed successfully"},
            status=status.HTTP_200_OK
        )


class DeleteAccountView(APIView):
    """
    API endpoint to delete user account.
    Requires password confirmation for security.
    
    POST /api/auth/delete-account/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "password": "userpassword",
        "confirmation": "DELETE"
    }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        password = request.data.get('password')
        confirmation = request.data.get('confirmation')

        if not password:
            return Response(
                {"error": "Password is required to delete account"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if confirmation != "DELETE":
            return Response(
                {"error": "Please type 'DELETE' to confirm account deletion"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not user.check_password(password):
            return Response(
                {"error": "Incorrect password"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user_email = user.email

            with transaction.atomic():
                unlink_stats = _unlink_parental_connections(user)

                # Blacklist all outstanding tokens for this user before deletion.
                # OutstandingToken uses SET_NULL on the user FK, so we must delete
                # them explicitly first to avoid orphaned / inconsistent token records.
                outstanding_tokens = OutstandingToken.objects.filter(user=user)
                BlacklistedToken.objects.filter(token__in=outstanding_tokens).delete()
                outstanding_tokens.delete()

                user.delete()

            logger.info(
                "User account deleted: %s (links_revoked=%s notifications_created=%s)",
                user_email,
                unlink_stats["links_revoked"],
                unlink_stats["notifications_created"],
            )
            return Response(
                {"message": "Account deleted successfully"},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            logger.exception(f"Error deleting account for user {user.email}: {str(e)}")
            return Response(
                {"error": "Failed to delete account"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
