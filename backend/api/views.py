from django.shortcuts import render
from django.http import JsonResponse
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
import os
import logging

from .serializers import (
    RegisterSerializer,
    LoginSerializer,
    UserSerializer,
    UserWithTokenSerializer,
    CourseSerializer
)
from .models import Course
from .utils.ocr import get_cor_extractor

User = get_user_model()
logger = logging.getLogger(__name__)


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


class BaseCORUploadView(APIView):
    """
    Base class for COR upload endpoints.
    Provides common functionality for file validation and processing.
    """
    permission_classes = [IsAuthenticated]
    upload_type = None  # Must be set by subclass ('student' or 'faculty')
    
    def post(self, request):
        # Check if file was uploaded
        if 'file' not in request.FILES:
            return Response(
                {"error": "No file uploaded. Please provide a file."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        uploaded_file = request.FILES['file']
        
        # Validate file type
        allowed_extensions = ['.pdf', '.png', '.jpg', '.jpeg']
        file_extension = os.path.splitext(uploaded_file.name)[1].lower()
        
        if file_extension not in allowed_extensions:
            return Response(
                {
                    "error": f"Invalid file type. Allowed types: {', '.join(allowed_extensions)}"
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        temp_file_path = None
        
        try:
            # Save uploaded file temporarily
            temp_file_name = f"temp_{self.upload_type}_cor_{request.user.id}_{uploaded_file.name}"
            temp_file_path = default_storage.save(
                f"temp/{temp_file_name}",
                ContentFile(uploaded_file.read())
            )
            full_temp_path = default_storage.path(temp_file_path)
            
            logger.info(f"Processing {self.upload_type.upper()} COR for user {request.user.id}: {temp_file_name}")
            
            # Get appropriate OCR extractor based on upload type
            extractor = get_cor_extractor(self.upload_type)
            
            # Extract course information
            courses_data = extractor.extract_from_document(full_temp_path)
            
            if not courses_data:
                return Response(
                    {
                        "warning": "No courses found in the document",
                        "message": f"The document was processed but no course information could be extracted. Please check if the document is a valid {self.upload_type.upper()} COR.",
                        "courses": [],
                        "total_courses": 0
                    },
                    status=status.HTTP_200_OK
                )
            
            # Create Course objects in database
            created_courses = []
            for course_dict in courses_data:
                course = Course.objects.create(
                    user=request.user,
                    subject_code=course_dict.get('subject_code', ''),
                    subject_name=course_dict.get('subject_name', ''),
                    start_time=course_dict.get('start_time', ''),
                    end_time=course_dict.get('end_time', ''),
                    day=course_dict.get('day', ''),
                    location=course_dict.get('location', '')
                )
                created_courses.append(course)
            
            # Serialize created courses
            serializer = CourseSerializer(created_courses, many=True)
            
            logger.info(f"Successfully created {len(created_courses)} courses for user {request.user.id} ({self.upload_type.upper()} COR)")
            
            return Response(
                {
                    "message": f"Successfully processed {self.upload_type.upper()} COR and created {len(created_courses)} courses",
                    "courses": serializer.data,
                    "total_courses": len(created_courses),
                    "upload_type": self.upload_type
                },
                status=status.HTTP_201_CREATED
            )
        
        except Exception as e:
            logger.error(f"Error processing {self.upload_type.upper()} COR for user {request.user.id}: {str(e)}")
            return Response(
                {
                    "error": "Failed to process the document",
                    "details": str(e)
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        finally:
            # Clean up temporary file
            if temp_file_path and default_storage.exists(temp_file_path):
                default_storage.delete(temp_file_path)
                logger.info(f"Cleaned up temporary file: {temp_file_path}")


class UploadStudentCORView(BaseCORUploadView):
    """
    API endpoint to upload and process Student Certificate of Registration (COR) documents.
    
    POST /api/upload-cor/student/
    Headers: Authorization: Bearer <access_token>
    Request body (multipart/form-data): {
        "file": <PDF or image file>
    }
    
    Response: {
        "message": "Successfully processed STUDENT COR and created N courses",
        "courses": [
            {
                "id": 1,
                "subject_code": "BSCS125781",
                "subject_name": "SOFTWARE ENGINEERING",
                "start_time": "07:00AM",
                "end_time": "09:00AM",
                "day": "S",
                "location": "LR7"
            },
            ...
        ],
        "total_courses": N,
        "upload_type": "student"
    }
    """
    upload_type = 'student'


class UploadFacultyCORView(BaseCORUploadView):
    """
    API endpoint to upload and process Faculty Certificate of Registration (COR) documents.
    
    POST /api/upload-cor/faculty/
    Headers: Authorization: Bearer <access_token>
    Request body (multipart/form-data): {
        "file": <PDF or image file>
    }
    
    Response: {
        "message": "Successfully processed FACULTY COR and created N courses",
        "courses": [
            {
                "id": 1,
                "subject_code": "BSCS125781",
                "subject_name": "SOFTWARE ENGINEERING",
                "start_time": "07:00AM",
                "end_time": "09:00AM",
                "day": "S",
                "location": "LR7"
            },
            ...
        ],
        "total_courses": N,
        "upload_type": "faculty"
    }
    
    Note: Faculty COR extraction is currently a placeholder and will return empty results
    until the faculty-specific extraction logic is implemented.
    """
    upload_type = 'faculty'


class UserCoursesView(generics.ListAPIView):
    """
    API endpoint to retrieve all courses for the authenticated user.
    
    GET /api/courses/
    Headers: Authorization: Bearer <access_token>
    
    Response: [
        {
            "id": 1,
            "subject_code": "BSCS125781",
            "subject_name": "SOFTWARE ENGINEERING",
            "start_time": "07:00AM",
            "end_time": "09:00AM",
            "day": "S",
            "location": "LR7",
            "created_at": "2025-11-19T...",
            "updated_at": "2025-11-19T..."
        },
        ...
    ]
    """
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Course.objects.filter(user=self.request.user)


class DeleteAllCoursesView(APIView):
    """
    API endpoint to delete all courses for all users (admin operation).
    
    DELETE /api/courses/delete-all/
    Headers: Authorization: Bearer <access_token>
    
    Response: {
        "message": "Successfully deleted N courses for all users",
        "deleted_count": N
    }
    """
    permission_classes = [IsAuthenticated]
    
    def delete(self, request):
        try:
            # Delete all courses for ALL users (admin operation for clearing data)
            deleted_count, _ = Course.objects.all().delete()
            
            logger.info(f"Deleted {deleted_count} courses for all users (requested by user {request.user.id})")
            
            return Response(
                {
                    "message": f"Successfully deleted {deleted_count} courses for all users",
                    "deleted_count": deleted_count
                },
                status=status.HTTP_200_OK
            )
        except Exception as e:
            logger.error(f"Error deleting all courses: {str(e)}")
            return Response(
                {
                    "error": "Failed to delete courses",
                    "details": str(e)
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )