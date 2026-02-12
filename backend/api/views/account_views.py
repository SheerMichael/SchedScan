from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
import logging

logger = logging.getLogger(__name__)


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
            user.delete()
            logger.info(f"User account deleted: {user_email}")
            return Response(
                {"message": "Account deleted successfully"},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            logger.error(f"Error deleting account: {str(e)}")
            return Response(
                {"error": "Failed to delete account"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
