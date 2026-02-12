from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import get_user_model
import logging

from ..serializers import (
    PasswordResetRequestSerializer,
    PasswordResetVerifySerializer,
    PasswordResetConfirmSerializer,
)
from ..models import PasswordResetCode

User = get_user_model()
logger = logging.getLogger(__name__)


class PasswordResetRequestView(APIView):
    """
    POST /api/auth/password-reset/request/
    Request body: { "email": "user@example.com" }
    Always returns success to prevent email enumeration.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        try:
            user = User.objects.get(email=email)
            reset_code = PasswordResetCode.create_for_user(user)

            from django.core.mail import send_mail
            from django.conf import settings

            send_mail(
                subject='SchedScan - Password Reset Code',
                message=(
                    f'Hi {user.first_name},\n\n'
                    f'Your password reset code is: {reset_code.code}\n\n'
                    f'This code will expire in 10 minutes.\n\n'
                    f'If you did not request this, please ignore this email.\n\n'
                    f'— SchedScan Team'
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )
            logger.info(f"Password reset code sent to {email}")
        except User.DoesNotExist:
            logger.info(f"Password reset requested for non-existent email: {email}")
        except Exception as e:
            logger.error(f"Failed to send password reset email to {email}: {str(e)}")

        return Response({
            "message": "If an account with that email exists, a reset code has been sent."
        }, status=status.HTTP_200_OK)


class PasswordResetVerifyView(APIView):
    """
    POST /api/auth/password-reset/verify/
    Request body: { "email": "user@example.com", "code": "123456" }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        code = serializer.validated_data['code']

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({
                "valid": False, "error": "Invalid or expired code."
            }, status=status.HTTP_400_BAD_REQUEST)

        reset_code = PasswordResetCode.objects.filter(
            user=user, code=code, is_used=False, is_verified=False,
        ).order_by('-created_at').first()

        if not reset_code or reset_code.is_expired:
            return Response({
                "valid": False, "error": "Invalid or expired code."
            }, status=status.HTTP_400_BAD_REQUEST)

        import uuid
        reset_code.is_verified = True
        reset_code.reset_token = uuid.uuid4()
        reset_code.save()

        logger.info(f"Password reset code verified for {email}")
        return Response({
            "valid": True, "reset_token": str(reset_code.reset_token)
        }, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """
    POST /api/auth/password-reset/confirm/
    Request body: { "reset_token": "uuid-string", "new_password": "..." }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reset_token = serializer.validated_data['reset_token']
        new_password = serializer.validated_data['new_password']

        reset_code = PasswordResetCode.objects.filter(
            reset_token=reset_token, is_verified=True, is_used=False,
        ).select_related('user').first()

        if not reset_code or reset_code.is_expired:
            return Response({
                "error": "Invalid or expired reset token."
            }, status=status.HTTP_400_BAD_REQUEST)

        user = reset_code.user
        user.set_password(new_password)
        user.save()

        reset_code.is_used = True
        reset_code.save()

        logger.info(f"Password reset completed for {user.email}")
        return Response({
            "message": "Password has been reset successfully."
        }, status=status.HTTP_200_OK)
