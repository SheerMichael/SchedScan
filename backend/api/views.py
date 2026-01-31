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
    CourseSerializer,
    ScheduleSerializer,
    ScheduleListSerializer,
    TaskSerializer,
    PushTokenSerializer
)
from .models import Course, Schedule, Task
from .utils.extraction_manager import ExtractionManager

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
            
            # Use ExtractionManager for hybrid PDF/OCR extraction
            manager = ExtractionManager()
            result = manager.extract_schedule(full_temp_path, self.upload_type)
            
            courses_data = result['courses']
            extraction_metadata = {
                'method': result['extraction_method'],
                'confidence': result['confidence'],
                'processing_time_seconds': result['processing_time'],
                'attempts': result.get('attempts', [])
            }
            
            logger.info(f"Extraction completed using {result['extraction_method']} method "
                       f"(confidence: {result['confidence']}, time: {result['processing_time']}s)")
            
            if not courses_data:
                return Response(
                    {
                        "warning": "No courses found in the document",
                        "message": f"The document was processed but no course information could be extracted. Please check if the document is a valid {self.upload_type.upper()} COR.",
                        "courses": [],
                        "total_courses": 0,
                        "extraction_metadata": extraction_metadata
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
                    "upload_type": self.upload_type,
                    "extraction_metadata": extraction_metadata
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


# ============== Schedule CRUD Views ==============

class ScheduleListCreateView(generics.ListCreateAPIView):
    """
    API endpoint to list all schedules or create a new schedule.
    
    GET /api/schedules/
    Headers: Authorization: Bearer <access_token>
    Query params:
        - upload_type: Filter by 'student' or 'faculty' (optional)
    
    Response: [
        {
            "id": 1,
            "title": "1st Semester 2025",
            "upload_type": "student",
            "is_active": true,
            "course_count": 8,
            "created_at": "2025-12-01T...",
            "updated_at": "2025-12-01T..."
        },
        ...
    ]
    
    POST /api/schedules/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "title": "1st Semester 2025",
        "upload_type": "student",
        "is_active": true,
        "courses": [
            {
                "subject_code": "BSCS125781",
                "subject_name": "SOFTWARE ENGINEERING",
                "start_time": "07:00AM",
                "end_time": "09:00AM",
                "day": "M",
                "location": "LR7"
            },
            ...
        ]
    }
    
    Response: {
        "id": 1,
        "title": "1st Semester 2025",
        "upload_type": "student",
        "is_active": true,
        "courses": [...],
        "created_at": "2025-12-01T...",
        "updated_at": "2025-12-01T..."
    }
    """
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ScheduleSerializer
        return ScheduleListSerializer
    
    def get_queryset(self):
        queryset = Schedule.objects.filter(user=self.request.user)
        upload_type = self.request.query_params.get('upload_type', None)
        if upload_type:
            queryset = queryset.filter(upload_type=upload_type)
        return queryset


class ScheduleDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    API endpoint to retrieve, update, or delete a specific schedule.
    
    GET /api/schedules/<id>/
    Headers: Authorization: Bearer <access_token>
    
    Response: {
        "id": 1,
        "title": "1st Semester 2025",
        "upload_type": "student",
        "is_active": true,
        "courses": [...],
        "created_at": "2025-12-01T...",
        "updated_at": "2025-12-01T..."
    }
    
    PUT/PATCH /api/schedules/<id>/
    Headers: Authorization: Bearer <access_token>
    Request body: { "title": "Updated Title", "is_active": true, ... }
    
    DELETE /api/schedules/<id>/
    Headers: Authorization: Bearer <access_token>
    """
    serializer_class = ScheduleSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Schedule.objects.filter(user=self.request.user)


class ScheduleSetActiveView(APIView):
    """
    API endpoint to set a schedule as active (deactivates all others).
    
    POST /api/schedules/<id>/set-active/
    Headers: Authorization: Bearer <access_token>
    
    Response: {
        "message": "Schedule set as active",
        "schedule": { ... }
    }
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request, pk):
        try:
            schedule = Schedule.objects.get(pk=pk, user=request.user)
            
            # Deactivate all other schedules
            Schedule.objects.filter(user=request.user, is_active=True).update(is_active=False)
            
            # Activate this schedule
            schedule.is_active = True
            schedule.save()
            
            serializer = ScheduleSerializer(schedule)
            
            return Response(
                {
                    "message": "Schedule set as active",
                    "schedule": serializer.data
                },
                status=status.HTTP_200_OK
            )
        except Schedule.DoesNotExist:
            return Response(
                {"error": "Schedule not found"},
                status=status.HTTP_404_NOT_FOUND
            )


class ScheduleActiveView(APIView):
    """
    API endpoint to get the currently active schedule.
    
    GET /api/schedules/active/
    Headers: Authorization: Bearer <access_token>
    
    Response: {
        "id": 1,
        "title": "1st Semester 2025",
        "upload_type": "student",
        "is_active": true,
        "courses": [...],
        ...
    }
    
    Returns null/empty if no active schedule.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            schedule = Schedule.objects.get(user=request.user, is_active=True)
            serializer = ScheduleSerializer(schedule)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Schedule.DoesNotExist:
            return Response(None, status=status.HTTP_200_OK)


class ScheduleClearActiveView(APIView):
    """
    API endpoint to clear the active schedule (deactivate current).
    
    POST /api/schedules/clear-active/
    Headers: Authorization: Bearer <access_token>
    
    Response: {
        "message": "Active schedule cleared"
    }
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        Schedule.objects.filter(user=request.user, is_active=True).update(is_active=False)
        return Response(
            {"message": "Active schedule cleared"},
            status=status.HTTP_200_OK
        )


class ScheduleTimetableDownloadView(APIView):
    """
    API endpoint to download the generated timetable image for a schedule.
    
    GET /api/schedules/<id>/timetable/
    Headers: Authorization: Bearer <access_token>
    
    Response: PNG image file download
    
    If timetable doesn't exist, it will be generated on-demand.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk):
        from django.http import FileResponse, HttpResponse
        from .utils.timetable_generator import generate_timetable_image
        
        try:
            schedule = Schedule.objects.get(pk=pk, user=request.user)
        except Schedule.DoesNotExist:
            return Response(
                {"error": "Schedule not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if timetable image exists
        if schedule.timetable_image and schedule.timetable_image.name:
            try:
                # Return existing file
                response = FileResponse(
                    schedule.timetable_image.open('rb'),
                    content_type='image/png'
                )
                filename = f"timetable_{schedule.title.replace(' ', '_')}.png"
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                return response
            except Exception as e:
                logger.warning(f"Could not open existing timetable file: {e}")
        
        # Generate on-demand if not exists
        try:
            courses_data = list(schedule.courses.values(
                'subject_code', 'subject_name', 'start_time', 
                'end_time', 'day', 'location'
            ))
            
            image_buffer = generate_timetable_image(
                courses=courses_data,
                title=schedule.title,
                upload_type=schedule.upload_type,
                user_name=request.user.get_full_name()
            )
            
            response = HttpResponse(image_buffer.getvalue(), content_type='image/png')
            filename = f"timetable_{schedule.title.replace(' ', '_')}.png"
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
            
        except Exception as e:
            logger.error(f"Error generating timetable: {str(e)}")
            return Response(
                {"error": "Failed to generate timetable", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# =============================================================================
# Task Management Views
# =============================================================================

class TaskListCreateView(generics.ListCreateAPIView):
    """
    API endpoint to list and create tasks for a specific subject code.
    
    GET /api/tasks/?subject_code=CS101
    Headers: Authorization: Bearer <access_token>
    
    Response: [
        {
            "id": 1,
            "subject_code": "CS101",
            "text": "Complete assignment 1",
            "is_completed": false,
            "created_at": "2025-12-02T...",
            "updated_at": "2025-12-02T..."
        }
    ]
    
    POST /api/tasks/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "subject_code": "CS101",
        "text": "Complete assignment 1"
    }
    """
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Filter tasks by subject_code query param.
        """
        queryset = Task.objects.filter(user=self.request.user)
        subject_code = self.request.query_params.get('subject_code', None)
        if subject_code:
            queryset = queryset.filter(subject_code=subject_code)
        return queryset.order_by('-created_at')


class TaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    API endpoint to retrieve, update, or delete a specific task.
    
    GET /api/tasks/<id>/
    PATCH /api/tasks/<id>/
    DELETE /api/tasks/<id>/
    
    Headers: Authorization: Bearer <access_token>
    
    PATCH Request body (to mark as completed):
    {
        "is_completed": true
    }
    """
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Only allow access to user's own tasks.
        """
        return Task.objects.filter(user=self.request.user)


# =============================================================================
# Account Management Views
# =============================================================================

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

        # Validate required fields
        if not current_password or not new_password:
            return Response(
                {"error": "Both current_password and new_password are required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify current password
        if not user.check_password(current_password):
            return Response(
                {"error": "Current password is incorrect"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate new password length
        if len(new_password) < 8:
            return Response(
                {"error": "New password must be at least 8 characters long"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Set new password
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

        # Validate required fields
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

        # Verify password
        if not user.check_password(password):
            return Response(
                {"error": "Incorrect password"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Delete user account (this will cascade delete related data)
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


# =============================================================================
# Push Notification Views
# =============================================================================

class RegisterPushTokenView(APIView):
    """
    API endpoint to register or update Expo push notification token.
    
    POST /api/push-token/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "expo_push_token": "ExponentPushToken[xxxxxxxxxxxxxx]"
    }
    
    Response: {
        "message": "Push token registered successfully",
        "expo_push_token": "ExponentPushToken[xxxxxxxxxxxxxx]"
    }
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = PushTokenSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        token = serializer.validated_data['expo_push_token']
        
        # Save token to user
        request.user.expo_push_token = token
        request.user.save(update_fields=['expo_push_token'])
        
        logger.info(f"Push token registered for user {request.user.id}")
        
        return Response(
            {
                "message": "Push token registered successfully",
                "expo_push_token": token
            },
            status=status.HTTP_200_OK
        )


class MergeSchedulesView(APIView):
    """
    API endpoint to merge two schedules (e.g., student and faculty) into a new combined schedule.
    Detects time conflicts between courses and allows the user to choose how to handle them.
    
    POST /api/schedules/merge/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "schedule_ids": [1, 2],  // IDs of schedules to merge
        "title": "Merged Schedule",  // Title for the new merged schedule
        "conflict_resolution": "keep_both" | "keep_first" | "keep_second" | "skip_conflicts"
    }
    
    Response (success): {
        "message": "Successfully merged 2 schedules into 'Merged Schedule'",
        "schedule": { ...merged schedule data... },
        "conflicts_found": 2,
        "conflicts_resolved": "keep_both"
    }
    
    Response (conflicts detected - when conflict_resolution not provided): {
        "has_conflicts": true,
        "conflicts": [
            {
                "day": "M",
                "course1": { "subject_code": "CS101", "start_time": "08:00AM", ... },
                "course2": { "subject_code": "MATH201", "start_time": "08:30AM", ... },
                "overlap_minutes": 30
            },
            ...
        ],
        "message": "Time conflicts detected. Please specify conflict_resolution strategy."
    }
    """
    permission_classes = [IsAuthenticated]
    
    def _parse_time(self, time_str: str) -> int:
        """Convert time string (e.g., '08:00AM') to minutes from midnight."""
        import re
        match = re.match(r'(\d{1,2}):(\d{2})(AM|PM)', time_str.upper())
        if not match:
            return 0
        
        hours = int(match.group(1))
        minutes = int(match.group(2))
        period = match.group(3)
        
        if period == 'PM' and hours != 12:
            hours += 12
        elif period == 'AM' and hours == 12:
            hours = 0
        
        return hours * 60 + minutes
    
    def _times_overlap(self, start1: str, end1: str, start2: str, end2: str) -> tuple:
        """
        Check if two time ranges overlap.
        Returns (overlaps: bool, overlap_minutes: int)
        """
        s1 = self._parse_time(start1)
        e1 = self._parse_time(end1)
        s2 = self._parse_time(start2)
        e2 = self._parse_time(end2)
        
        # Check for overlap
        overlap_start = max(s1, s2)
        overlap_end = min(e1, e2)
        
        if overlap_start < overlap_end:
            return True, overlap_end - overlap_start
        return False, 0
    
    def _find_conflicts(self, courses1: list, courses2: list) -> list:
        """
        Find all time conflicts between two lists of courses.
        Returns list of conflict dictionaries.
        """
        conflicts = []
        
        for c1 in courses1:
            for c2 in courses2:
                # Only check courses on the same day
                if c1['day'] != c2['day']:
                    continue
                
                overlaps, overlap_minutes = self._times_overlap(
                    c1['start_time'], c1['end_time'],
                    c2['start_time'], c2['end_time']
                )
                
                if overlaps:
                    conflicts.append({
                        'day': c1['day'],
                        'course1': c1,
                        'course2': c2,
                        'overlap_minutes': overlap_minutes
                    })
        
        return conflicts
    
    def post(self, request):
        schedule_ids = request.data.get('schedule_ids', [])
        title = request.data.get('title', 'Merged Schedule')
        conflict_resolution = request.data.get('conflict_resolution', None)
        
        # Validate input
        if len(schedule_ids) < 2:
            return Response(
                {"error": "At least 2 schedule IDs are required to merge"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Fetch schedules
        schedules = []
        for sid in schedule_ids:
            try:
                schedule = Schedule.objects.get(pk=sid, user=request.user)
                schedules.append(schedule)
            except Schedule.DoesNotExist:
                return Response(
                    {"error": f"Schedule with ID {sid} not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        # Get courses from all schedules
        all_courses = []
        courses_by_schedule = []
        
        for schedule in schedules:
            courses = list(schedule.courses.values(
                'subject_code', 'subject_name', 'start_time',
                'end_time', 'day', 'location'
            ))
            courses_by_schedule.append(courses)
            all_courses.extend(courses)
        
        # Find conflicts between all schedule pairs
        all_conflicts = []
        for i in range(len(courses_by_schedule)):
            for j in range(i + 1, len(courses_by_schedule)):
                conflicts = self._find_conflicts(
                    courses_by_schedule[i],
                    courses_by_schedule[j]
                )
                all_conflicts.extend(conflicts)
        
        # If conflicts exist and no resolution strategy provided, return conflicts
        if all_conflicts and not conflict_resolution:
            return Response({
                "has_conflicts": True,
                "conflicts": all_conflicts,
                "conflict_count": len(all_conflicts),
                "message": "Time conflicts detected. Please specify conflict_resolution strategy.",
                "available_strategies": [
                    {"value": "keep_both", "description": "Keep all courses (allow overlapping schedules)"},
                    {"value": "keep_first", "description": "Keep courses from the first schedule only"},
                    {"value": "keep_second", "description": "Keep courses from the second schedule only"},
                    {"value": "skip_conflicts", "description": "Skip all conflicting courses from both schedules"}
                ]
            }, status=status.HTTP_200_OK)
        
        # Apply conflict resolution
        merged_courses = []
        
        if conflict_resolution == 'keep_both' or not all_conflicts:
            # Keep all courses (including conflicts)
            merged_courses = all_courses
        
        elif conflict_resolution == 'keep_first':
            # Keep first schedule's courses, only add non-conflicting from others
            merged_courses = courses_by_schedule[0].copy()
            for courses in courses_by_schedule[1:]:
                for course in courses:
                    has_conflict = False
                    for existing in merged_courses:
                        if existing['day'] == course['day']:
                            overlaps, _ = self._times_overlap(
                                existing['start_time'], existing['end_time'],
                                course['start_time'], course['end_time']
                            )
                            if overlaps:
                                has_conflict = True
                                break
                    if not has_conflict:
                        merged_courses.append(course)
        
        elif conflict_resolution == 'keep_second':
            # Keep second schedule's courses as priority
            merged_courses = courses_by_schedule[-1].copy() if len(courses_by_schedule) > 1 else []
            for courses in courses_by_schedule[:-1]:
                for course in courses:
                    has_conflict = False
                    for existing in merged_courses:
                        if existing['day'] == course['day']:
                            overlaps, _ = self._times_overlap(
                                existing['start_time'], existing['end_time'],
                                course['start_time'], course['end_time']
                            )
                            if overlaps:
                                has_conflict = True
                                break
                    if not has_conflict:
                        merged_courses.append(course)
        
        elif conflict_resolution == 'skip_conflicts':
            # Skip all courses that have any conflict
            conflicting_courses = set()
            for conflict in all_conflicts:
                # Create hashable keys for conflicting courses
                c1_key = (conflict['course1']['subject_code'], conflict['course1']['day'], 
                         conflict['course1']['start_time'])
                c2_key = (conflict['course2']['subject_code'], conflict['course2']['day'],
                         conflict['course2']['start_time'])
                conflicting_courses.add(c1_key)
                conflicting_courses.add(c2_key)
            
            for course in all_courses:
                course_key = (course['subject_code'], course['day'], course['start_time'])
                if course_key not in conflicting_courses:
                    merged_courses.append(course)
        
        else:
            return Response(
                {"error": f"Invalid conflict_resolution strategy: {conflict_resolution}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Remove duplicates (same subject, day, time)
        seen = set()
        unique_courses = []
        for course in merged_courses:
            key = (course['subject_code'], course['day'], course['start_time'], course['end_time'])
            if key not in seen:
                seen.add(key)
                unique_courses.append(course)
        
        # Create the merged schedule
        merged_schedule = Schedule.objects.create(
            user=request.user,
            title=title,
            upload_type='student',  # Default to student for merged schedules
            is_active=False
        )
        
        # Create courses for the merged schedule
        for course_data in unique_courses:
            Course.objects.create(
                user=request.user,
                schedule=merged_schedule,
                **course_data
            )
        
        # Serialize the response
        serializer = ScheduleSerializer(merged_schedule)
        
        logger.info(f"User {request.user.id} merged {len(schedule_ids)} schedules into schedule {merged_schedule.id} "
                   f"with {len(unique_courses)} courses (conflicts: {len(all_conflicts)}, resolution: {conflict_resolution})")
        
        return Response({
            "message": f"Successfully merged {len(schedule_ids)} schedules into '{title}'",
            "schedule": serializer.data,
            "total_courses": len(unique_courses),
            "conflicts_found": len(all_conflicts),
            "conflicts_resolved": conflict_resolution or "none"
        }, status=status.HTTP_201_CREATED)