from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
import logging

from ..serializers import (
    PushTokenSerializer,
    InviteCodeSerializer,
    ChildInfoSerializer,
    ChildScheduleSerializer,
    ScheduleSerializer,
    ParentChildLinkSerializer,
)
from ..models import Schedule, ParentChildLink, InviteCode

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


class GenerateInviteCodeView(APIView):
    """
    POST /api/auth/invite-code/generate/ — Generate invite code (students only).
    GET  /api/auth/invite-code/generate/ — Get current active code.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.user_type == 'parent':
            return Response({"error": "Parents cannot generate invite codes"},
                            status=status.HTTP_403_FORBIDDEN)

        InviteCode.objects.filter(student=user, is_active=True, used=False).update(is_active=False)

        code = InviteCode.generate_code()
        invite = InviteCode.objects.create(student=user, code=code)

        logger.info(f"User {user.id} generated invite code {code}")
        return Response({
            "code": invite.code,
            "created_at": invite.created_at,
            "message": "Share this code with your parent. They can use it to link their account and view your schedule."
        }, status=status.HTTP_201_CREATED)

    def get(self, request):
        """Get current active invite code if one exists."""
        user = request.user
        if user.user_type == 'parent':
            return Response({"error": "Parents cannot have invite codes"},
                            status=status.HTTP_403_FORBIDDEN)

        active_code = InviteCode.objects.filter(student=user, is_active=True, used=False).first()
        if active_code:
            return Response({"code": active_code.code, "created_at": active_code.created_at})
        return Response({"code": None, "message": "No active invite code"})


class ValidateInviteCodeView(APIView):
    """
    GET /api/auth/invite-code/validate/?code=ABC123XYZ0
    Validate an invite code without using it. Any user can call this.
    """
    permission_classes = []

    def get(self, request):
        code = request.query_params.get('code', '').strip().upper()
        if not code or len(code) != 10:
            return Response({"valid": False, "error": "Invalid code format"},
                            status=status.HTTP_400_BAD_REQUEST)

        invite = InviteCode.objects.filter(
            code=code, is_active=True, used=False
        ).select_related('student').first()

        if invite:
            return Response({
                "valid": True,
                "student_name": f"{invite.student.first_name} {invite.student.last_name}"
            })
        return Response({"valid": False, "error": "Code not found or already used"},
                        status=status.HTTP_404_NOT_FOUND)


class UseInviteCodeView(APIView):
    """
    POST /api/auth/invite-code/use/
    Parents use an invite code to link to a student.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        code = request.data.get('code', '').strip().upper()

        if user.user_type != 'parent':
            return Response({"error": "Only parent accounts can use invite codes"},
                            status=status.HTTP_403_FORBIDDEN)
        if not code:
            return Response({"error": "Invite code is required"},
                            status=status.HTTP_400_BAD_REQUEST)

        invite = InviteCode.objects.filter(code=code, is_active=True, used=False).first()
        if not invite:
            return Response({"error": "Invalid or expired invite code"},
                            status=status.HTTP_400_BAD_REQUEST)
        if invite.student == user:
            return Response({"error": "You cannot link to yourself"},
                            status=status.HTTP_400_BAD_REQUEST)

        if ParentChildLink.objects.filter(parent=user, child=invite.student, status='active').exists():
            return Response(
                {"error": f"You are already linked to {invite.student.get_full_name()}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Payment gate + link creation in an atomic transaction to prevent race conditions
        from ..models import Payment
        from django.utils import timezone
        from django.db import transaction

        with transaction.atomic():
            # Lock the parent's existing links to prevent concurrent requests
            active_children = ParentChildLink.objects.select_for_update().filter(
                parent=user, status='active'
            ).count()

            if active_children >= 1:
                paid_slots = Payment.objects.filter(parent=user, status='completed').count()
                total_allowed = 1 + paid_slots
                if active_children >= total_allowed:
                    return Response(
                        {"error": "Payment required to add another child", "needs_payment": True},
                        status=status.HTTP_402_PAYMENT_REQUIRED
                    )

            link = ParentChildLink.objects.create(parent=user, child=invite.student, status='active')

            invite.used = True
            invite.used_by = user
            invite.used_at = timezone.now()
            invite.save()

        logger.info(f"Parent {user.id} linked to student {invite.student.id}")
        return Response({
            "message": f"Successfully linked to {invite.student.get_full_name()}",
            "child": ChildInfoSerializer(invite.student).data,
            "linked_at": link.linked_at
        }, status=status.HTTP_201_CREATED)


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
