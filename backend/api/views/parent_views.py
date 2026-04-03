from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
import logging

from ..serializers import (
    PushTokenSerializer,
    ChildInfoSerializer,
    ChildScheduleSerializer,
    ScheduleSerializer,
    ParentChildLinkSerializer,
    ParentLinkRequestSerializer,
    StudentSearchResultSerializer,
)
from ..models import Schedule, ParentChildLink, ParentLinkRequest, Notification, Payment

User = get_user_model()
logger = logging.getLogger(__name__)


class RegisterPushTokenView(APIView):
    """
    POST /api/push-token/
    Register or update Expo push notification token.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PushTokenSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        token = serializer.validated_data['expo_push_token']
        request.user.expo_push_token = token
        request.user.save(update_fields=['expo_push_token'])

        logger.info(f"Push token registered for user {request.user.id}")
        return Response({
            "message": "Push token registered successfully",
            "expo_push_token": token
        }, status=status.HTTP_200_OK)


class ParentChildSearchView(APIView):
    """
    GET /api/parent/children/search/?q=anna
    Parents search for student accounts before sending a link request.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        query = request.query_params.get('q', '').strip()

        if user.user_type != 'parent':
            return Response({"error": "This endpoint is for parents only"}, status=status.HTTP_403_FORBIDDEN)
        if len(query) < 2:
            return Response({"results": [], "count": 0})

        students = User.objects.filter(
            user_type='student'
        ).filter(
            Q(first_name__icontains=query) |
            Q(last_name__icontains=query) |
            Q(email__icontains=query) |
            Q(student_number__icontains=query)
        ).order_by('first_name', 'last_name')[:20]

        data = StudentSearchResultSerializer(students, many=True).data
        return Response({"results": data, "count": len(data)})


class ParentLinkRequestView(APIView):
    """
    GET  /api/parent/link-requests/  - list this parent's requests
    POST /api/parent/link-requests/  - create a new request to a student
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.user_type != 'parent':
            return Response({"error": "This endpoint is for parents only"}, status=status.HTTP_403_FORBIDDEN)

        requests = ParentLinkRequest.objects.filter(parent=user).select_related('parent', 'child')
        return Response({"requests": ParentLinkRequestSerializer(requests, many=True).data})

    def post(self, request):
        user = request.user
        child_id = request.data.get('child_id')

        if user.user_type != 'parent':
            return Response({"error": "This endpoint is for parents only"}, status=status.HTTP_403_FORBIDDEN)
        if not child_id:
            return Response({"error": "child_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            child = User.objects.get(id=child_id, user_type='student')
        except User.DoesNotExist:
            return Response({"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND)

        if ParentChildLink.objects.filter(parent=user, child=child, status='active').exists():
            return Response(
                {"error": f"You are already linked to {child.get_full_name()}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ParentLinkRequest.objects.filter(parent=user, child=child, status='pending').exists():
            return Response(
                {"error": "You already have a pending request for this student"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Enforce payment gate at request time so students don't approve blocked requests.
        active_children = ParentChildLink.objects.filter(parent=user, status='active').count()
        pending_requests = ParentLinkRequest.objects.filter(parent=user, status='pending').count()
        paid_slots = Payment.objects.filter(parent=user, status='completed').count()
        total_allowed = 1 + paid_slots
        reserved_slots = active_children + pending_requests

        if reserved_slots >= total_allowed:
            return Response(
                {"error": "Payment required to add another child", "needs_payment": True},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )

        link_request = ParentLinkRequest.objects.create(parent=user, child=child)

        Notification.objects.create(
            user=child,
            notification_type='general',
            title='New parent connection request',
            message=f"{user.get_full_name()} requested to connect as your parent.",
            data={
                'type': 'parent_link_request',
                'request_id': link_request.id,
                'parent_id': user.id,
            },
        )

        logger.info(f"Parent {user.id} requested link with student {child.id}")
        return Response(
            {
                "message": f"Request sent to {child.get_full_name()}",
                "request": ParentLinkRequestSerializer(link_request).data,
            },
            status=status.HTTP_201_CREATED,
        )


class StudentParentLinkRequestListView(APIView):
    """
    GET /api/student/parent-link-requests/
    Students list pending parent link requests.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.user_type != 'student':
            return Response({"error": "This endpoint is for students only"}, status=status.HTTP_403_FORBIDDEN)

        requests = ParentLinkRequest.objects.filter(
            child=user,
            status='pending',
        ).select_related('parent', 'child')

        return Response({"requests": ParentLinkRequestSerializer(requests, many=True).data})


class StudentParentLinkRequestApproveView(APIView):
    """
    POST /api/student/parent-link-requests/<request_id>/approve/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        user = request.user
        if user.user_type != 'student':
            return Response({"error": "This endpoint is for students only"}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            link_request = ParentLinkRequest.objects.select_for_update().select_related('parent', 'child').filter(
                id=request_id,
                child=user,
                status='pending',
            ).first()

            if not link_request:
                return Response({"error": "Pending request not found"}, status=status.HTTP_404_NOT_FOUND)

            if ParentChildLink.objects.filter(
                parent=link_request.parent,
                child=user,
                status='active',
            ).exists():
                link_request.status = 'approved'
                link_request.resolved_at = timezone.now()
                link_request.save(update_fields=['status', 'resolved_at'])
                return Response({"message": "Parent is already linked to this student"}, status=status.HTTP_200_OK)

            link = ParentChildLink.objects.create(
                parent=link_request.parent,
                child=user,
                status='active',
            )

            link_request.status = 'approved'
            link_request.resolved_at = timezone.now()
            link_request.save(update_fields=['status', 'resolved_at'])

        Notification.objects.create(
            user=link_request.parent,
            notification_type='general',
            title='Parent request approved',
            message=f"{user.get_full_name()} approved your parent connection request.",
            data={
                'type': 'parent_link_approved',
                'request_id': link_request.id,
                'child_id': user.id,
            },
        )

        return Response(
            {
                "message": f"Approved request from {link_request.parent.get_full_name()}",
                "link_id": link.id,
            },
            status=status.HTTP_200_OK,
        )


class StudentParentLinkRequestRejectView(APIView):
    """
    POST /api/student/parent-link-requests/<request_id>/reject/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        user = request.user
        if user.user_type != 'student':
            return Response({"error": "This endpoint is for students only"}, status=status.HTTP_403_FORBIDDEN)

        link_request = ParentLinkRequest.objects.select_related('parent', 'child').filter(
            id=request_id,
            child=user,
            status='pending',
        ).first()

        if not link_request:
            return Response({"error": "Pending request not found"}, status=status.HTTP_404_NOT_FOUND)

        link_request.status = 'rejected'
        link_request.resolved_at = timezone.now()
        link_request.save(update_fields=['status', 'resolved_at'])

        Notification.objects.create(
            user=link_request.parent,
            notification_type='general',
            title='Parent request rejected',
            message=f"{user.get_full_name()} rejected your parent connection request.",
            data={
                'type': 'parent_link_rejected',
                'request_id': link_request.id,
                'child_id': user.id,
            },
        )

        return Response(
            {"message": f"Rejected request from {link_request.parent.get_full_name()}"},
            status=status.HTTP_200_OK,
        )


class ChildScheduleView(APIView):
    """
    GET /api/parent/child/schedule/?child_id=123
    Parents view their linked child's active schedule.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        child_id = request.query_params.get('child_id')

        if user.user_type != 'parent':
            return Response({"error": "Only parent accounts can access this endpoint"},
                            status=status.HTTP_403_FORBIDDEN)

        links_query = ParentChildLink.objects.filter(parent=user, status='active').select_related('child')

        if child_id:
            link = links_query.filter(child_id=child_id).first()
            if not link:
                return Response({"error": "Child not found or not linked to you."},
                                status=status.HTTP_404_NOT_FOUND)
        else:
            link = links_query.first()
            if not link:
                return Response({"error": "No linked child found. Please link to a student first."},
                                status=status.HTTP_404_NOT_FOUND)

        child = link.child
        active_schedule = Schedule.objects.filter(
            user=child, is_active=True
        ).prefetch_related('courses').first()

        return Response({
            "child": ChildInfoSerializer(child).data,
            "schedule": ScheduleSerializer(active_schedule).data if active_schedule else None,
            "has_active_schedule": active_schedule is not None
        })


class LinkedParentsView(APIView):
    """
    GET /api/student/parents/
    Students view linked parents.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.user_type == 'parent':
            return Response({"error": "This endpoint is for students only"},
                            status=status.HTTP_403_FORBIDDEN)

        links = ParentChildLink.objects.filter(child=user).select_related('parent')
        result = [{
            "id": link.id,
            "parent_id": link.parent.id,
            "parent_name": link.parent.get_full_name(),
            "parent_email": link.parent.email,
            "status": link.status,
            "linked_at": link.linked_at
        } for link in links]

        return Response({"parents": result})


class RevokeParentAccessView(APIView):
    """
    DELETE /api/student/parents/<link_id>/revoke/
    Students revoke a parent's access.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, link_id):
        user = request.user
        if user.user_type == 'parent':
            return Response({"error": "This endpoint is for students only"},
                            status=status.HTTP_403_FORBIDDEN)

        try:
            link = ParentChildLink.objects.get(id=link_id, child=user)
        except ParentChildLink.DoesNotExist:
            return Response({"error": "Link not found"}, status=status.HTTP_404_NOT_FOUND)

        link.status = 'revoked'
        link.save()

        logger.info(f"Student {user.id} revoked access for parent {link.parent.id}")
        return Response({"message": f"Access revoked for {link.parent.get_full_name()}"})


class ChildLinkView(APIView):
    """
    GET    /api/parent/child/             — List all linked children.
    DELETE /api/parent/child/?child_id=X  — Unlink from a child.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.user_type != 'parent':
            return Response({"error": "This endpoint is for parents only"},
                            status=status.HTTP_403_FORBIDDEN)

        links = ParentChildLink.objects.filter(
            parent=user, status='active'
        ).select_related('child').order_by('-linked_at')

        children = [{
            "link_id": link.id,
            "child": ChildInfoSerializer(link.child).data,
            "linked_at": link.linked_at
        } for link in links]

        return Response({
            "children": children,
            "count": len(children),
            "has_linked_children": len(children) > 0
        })

    def delete(self, request):
        user = request.user
        child_id = request.query_params.get('child_id')

        if user.user_type != 'parent':
            return Response({"error": "This endpoint is for parents only"},
                            status=status.HTTP_403_FORBIDDEN)
        if not child_id:
            return Response({"error": "child_id parameter is required"},
                            status=status.HTTP_400_BAD_REQUEST)

        link = ParentChildLink.objects.filter(
            parent=user, child_id=child_id, status='active'
        ).first()

        if not link:
            return Response({"error": "Link not found"}, status=status.HTTP_404_NOT_FOUND)

        child_name = link.child.get_full_name()
        link.delete()

        logger.info(f"Parent {user.id} unlinked from child {child_id}")
        return Response({"message": f"Successfully unlinked from {child_name}"})
