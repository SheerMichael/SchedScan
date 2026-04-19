from django.http import JsonResponse
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
import re

from ..serializers import (
    RegisterSerializer,
    LoginSerializer,
    UserSerializer,
    UserWithTokenSerializer,
)

User = get_user_model()


# Test endpoint
def index(request):
    return JsonResponse({"message": "SchedScan backend is running!"})


class RegisterView(generics.CreateAPIView):
    """
    API endpoint for user registration.
    
    POST /api/auth/register/
    Request body: {
        "email": "user@example.com",
        "password": "securepassword",
        "password2": "securepassword",  // optional
        "first_name": "John",
        "last_name": "Doe",
        "profile_picture": <file>  // optional
    }
    
    Response: {
        "user": {
            "id": 1,
            "email": "user@example.com",
            "first_name": "John",
            "last_name": "Doe",
            "profile_picture": "url/to/picture"
        },
        "tokens": {
            "refresh": "...",
            "access": "..."
        }
    }
    """
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Generate tokens for the newly registered user
        user_serializer = UserWithTokenSerializer(user)
        
        return Response(
            {
                "user": UserSerializer(user).data,
                "tokens": user_serializer.data['tokens'],
                "message": "User registered successfully"
            },
            status=status.HTTP_201_CREATED
        )


class LoginView(APIView):
    """
    API endpoint for user login.
    
    POST /api/auth/login/
    Request body: {
        "email": "user@example.com",
        "password": "securepassword"
    }
    
    Response: {
        "user": {
            "id": 1,
            "email": "user@example.com",
            "first_name": "John",
            "last_name": "Doe",
            "profile_picture": "url/to/picture"
        },
        "tokens": {
            "refresh": "...",
            "access": "..."
        }
    }
    """
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = serializer.validated_data['user']
        
        # Generate tokens
        user_with_token = UserWithTokenSerializer(user)
        
        return Response(
            {
                "user": UserSerializer(user).data,
                "tokens": user_with_token.data['tokens'],
                "message": "Login successful"
            },
            status=status.HTTP_200_OK
        )


class LogoutView(APIView):
    """
    API endpoint for user logout (blacklist refresh token).
    
    POST /api/auth/logout/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "refresh": "refresh_token_here"
    }
    
    Response: {
        "message": "Logout successful"
    }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if not refresh_token:
                return Response(
                    {"error": "Refresh token is required"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            token = RefreshToken(refresh_token)
            token.blacklist()
            
            return Response(
                {"message": "Logout successful"},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class UserProfileView(generics.RetrieveUpdateAPIView):
    """
    API endpoint to retrieve or update the authenticated user's profile.
    
    GET /api/auth/user/
    Headers: Authorization: Bearer <access_token>
    
    Response: {
        "id": 1,
        "email": "user@example.com",
        "first_name": "John",
        "last_name": "Doe",
        "profile_picture": "url/to/picture",
        "created_at": "2025-11-03T..."
    }
    
    PATCH/PUT /api/auth/user/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "first_name": "UpdatedName",
        "last_name": "UpdatedLastName",
        "profile_picture": <file>
    }
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


_STUDENT_NUMBER_REGEX = re.compile(r'^\d{4}-\d{4,6}$')


class SetStudentNumberView(APIView):
    """
    One-time endpoint to set an authenticated user's student number.

    PATCH /api/auth/student-number/
    Headers: Authorization: Bearer <access_token>
    Request body: { "student_number": "2022-01191" }

    Rules:
    - Number must match format YYYY-NNNNN.
    - Number must be unique across all users.
    - Number is immutable once set (prevents gaming COR ownership checks).
      If the user already has a student number, this endpoint returns 409.

    Response (200): { "user": <UserSerializer data> }
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        user = request.user

        # Immutability guard
        if user.student_number:
            return Response(
                {
                    "error": "Student number is already set and cannot be changed.",
                    "code": "STUDENT_NUMBER_ALREADY_SET",
                    "student_number": user.student_number,
                },
                status=status.HTTP_409_CONFLICT,
            )

        student_number = str(request.data.get('student_number', '') or '').strip()

        if not student_number:
            return Response(
                {"error": "student_number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not _STUDENT_NUMBER_REGEX.match(student_number):
            return Response(
                {
                    "error": "Invalid student number format. Use YYYY-NNNNN (e.g., 2022-01191).",
                    "code": "INVALID_FORMAT",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Uniqueness check
        if User.objects.filter(student_number=student_number).exclude(pk=user.pk).exists():
            return Response(
                {
                    "error": "This student number is already registered to another account.",
                    "code": "STUDENT_NUMBER_TAKEN",
                },
                status=status.HTTP_409_CONFLICT,
            )

        user.student_number = student_number
        user.save(update_fields=['student_number', 'updated_at'])

        return Response(
            {"user": UserSerializer(user).data},
            status=status.HTTP_200_OK,
        )
