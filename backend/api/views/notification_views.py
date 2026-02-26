"""
Notification Views

Endpoints for retrieving and managing user notifications.
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from api.models import Notification
from api.serializers import NotificationSerializer


class NotificationListView(APIView):
    """
    GET /api/notifications/
    Returns the authenticated user's notifications (newest first).
    Supports pagination via ?page=1&page_size=20.
    Supports filtering via ?is_read=false or ?type=class_reminder.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = Notification.objects.filter(user=request.user)

        # Optional filters
        is_read = request.query_params.get('is_read')
        if is_read is not None:
            notifications = notifications.filter(is_read=is_read.lower() == 'true')

        notif_type = request.query_params.get('type')
        if notif_type:
            notifications = notifications.filter(notification_type=notif_type)

        # Simple pagination (safe parsing)
        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except (ValueError, TypeError):
            page = 1
        try:
            page_size = min(100, max(1, int(request.query_params.get('page_size', 50))))
        except (ValueError, TypeError):
            page_size = 50
        start = (page - 1) * page_size
        end = start + page_size

        total = notifications.count()
        unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
        page_qs = notifications[start:end]

        serializer = NotificationSerializer(page_qs, many=True)
        return Response({
            'notifications': serializer.data,
            'total': total,
            'unread_count': unread_count,
            'page': page,
            'page_size': page_size,
        })


class NotificationMarkReadView(APIView):
    """
    PATCH /api/notifications/<id>/read/
    Marks a single notification as read.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, user=request.user)
        except Notification.DoesNotExist:
            return Response(
                {"error": "Notification not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        notification.is_read = True
        notification.save(update_fields=['is_read'])
        return Response({"message": "Notification marked as read."})


class NotificationMarkAllReadView(APIView):
    """
    POST /api/notifications/read-all/
    Marks all notifications as read for the authenticated user.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).update(is_read=True)

        return Response({
            "message": f"Marked {updated} notifications as read.",
            "updated": updated,
        })


class NotificationUnreadCountView(APIView):
    """
    GET /api/notifications/unread-count/
    Returns just the unread count (lightweight for badge display).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).count()
        return Response({"unread_count": count})
