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
    PushTokenSerializer,
    InviteCodeSerializer,
    ParentChildLinkSerializer,
    ChildInfoSerializer,
    ChildScheduleSerializer
)
from .models import Course, Schedule, Task, ParentChildLink, InviteCode
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
        - include_courses: If 'true', include full course details (optional)
    
    Response (default - lightweight list): [
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
    
    Response (with include_courses=true): [
        {
            "id": 1,
            "title": "1st Semester 2025",
            "upload_type": "student",
            "is_active": true,
            "courses": [...],  // Full course details
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
        # Support include_courses query param to return full details in list view
        # This avoids N+1 queries when frontend needs full schedule data
        include_courses = self.request.query_params.get('include_courses', '').lower() == 'true'
        if include_courses:
            return ScheduleSerializer
        return ScheduleListSerializer
    
    def get_queryset(self):
        queryset = Schedule.objects.filter(user=self.request.user)
        upload_type = self.request.query_params.get('upload_type', None)
        if upload_type:
            queryset = queryset.filter(upload_type=upload_type)
        # Prefetch courses to optimize queries when including course details
        # This prevents N+1 queries when serializing nested courses
        include_courses = self.request.query_params.get('include_courses', '').lower() == 'true'
        if include_courses:
            queryset = queryset.prefetch_related('courses')
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


class TaskCountsView(APIView):
    """
    API endpoint to get task counts for multiple subject codes in a single request.
    This avoids N+1 queries where frontend would otherwise make N separate API calls
    to get task counts for each subject code displayed on the home screen.
    
    POST /api/tasks/counts/
    Headers: Authorization: Bearer <access_token>
    Request body: {
        "subject_codes": ["CS101", "MATH201", "ENG100"]
    }
    
    Response: {
        "CS101": {"total": 3, "incomplete": 2},
        "MATH201": {"total": 1, "incomplete": 0},
        "ENG100": {"total": 0, "incomplete": 0}
    }
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        subject_codes = request.data.get('subject_codes', [])
        
        if not isinstance(subject_codes, list):
            return Response(
                {"error": "subject_codes must be a list"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Use aggregation for efficient counting
        from django.db.models import Count, Q
        
        # Get counts for all requested subject codes in a single query
        task_counts = Task.objects.filter(
            user=request.user,
            subject_code__in=subject_codes
        ).values('subject_code').annotate(
            total=Count('id'),
            incomplete=Count('id', filter=Q(is_completed=False))
        )
        
        # Convert to dict format
        counts = {item['subject_code']: {
            'total': item['total'],
            'incomplete': item['incomplete']
        } for item in task_counts}
        
        # Fill in zeros for subject codes with no tasks
        for code in subject_codes:
            if code not in counts:
                counts[code] = {'total': 0, 'incomplete': 0}
        
        return Response(counts, status=status.HTTP_200_OK)


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
        "conflict_resolution": "keep_both" | "keep_faculty" | "keep_student" | "skip_conflicts" | "per_conflict",
        "conflict_choices": [  // Required when using "per_conflict" resolution
            {
                "conflict_id": "conflict_0",
                "choice": "keep_course1" | "keep_course2" | "keep_both" | "skip_both"
            }
        ]
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
                "id": "conflict_0",
                "day": "M",
                "course1": { "subject_code": "CS101", "start_time": "08:00AM", "source_type": "faculty", ... },
                "course2": { "subject_code": "MATH201", "start_time": "08:30AM", "source_type": "student", ... },
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
        Returns list of conflict dictionaries with unique IDs.
        """
        conflicts = []
        conflict_index = 0
        
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
                        'id': f'conflict_{conflict_index}',
                        'day': c1['day'],
                        'course1': c1,
                        'course2': c2,
                        'overlap_minutes': overlap_minutes
                    })
                    conflict_index += 1
        
        return conflicts
    
    def _get_course_key(self, course: dict) -> tuple:
        """Generate a unique key for a course."""
        return (course['subject_code'], course['day'], course['start_time'], course['end_time'])
    
    def post(self, request):
        schedule_ids = request.data.get('schedule_ids', [])
        title = request.data.get('title', 'Merged Schedule')
        conflict_resolution = request.data.get('conflict_resolution', None)
        conflict_choices = request.data.get('conflict_choices', [])
        
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
        
        # Get courses from all schedules, tracking their source type
        all_courses = []
        courses_by_schedule = []
        faculty_courses = []
        student_courses = []
        
        for schedule in schedules:
            courses = list(schedule.courses.values(
                'subject_code', 'subject_name', 'start_time',
                'end_time', 'day', 'location'
            ))
            # Add source_type to each course based on the schedule's upload_type
            for course in courses:
                source_type = schedule.upload_type if schedule.upload_type in ['student', 'faculty'] else 'student'
                course['source_type'] = source_type
                
                if source_type == 'faculty':
                    faculty_courses.append(course)
                else:
                    student_courses.append(course)
            
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
        
        # Re-index conflicts to ensure unique IDs
        for idx, conflict in enumerate(all_conflicts):
            conflict['id'] = f'conflict_{idx}'
        
        # If conflicts exist and no resolution strategy provided, return conflicts
        if all_conflicts and not conflict_resolution:
            return Response({
                "has_conflicts": True,
                "conflicts": all_conflicts,
                "conflict_count": len(all_conflicts),
                "message": "Time conflicts detected. Please specify conflict_resolution strategy.",
                "available_strategies": [
                    {"value": "keep_both", "description": "Keep all courses (allow overlapping schedules)"},
                    {"value": "keep_faculty", "description": "Keep faculty courses, add non-conflicting student courses"},
                    {"value": "keep_student", "description": "Keep student courses, add non-conflicting faculty courses"},
                    {"value": "skip_conflicts", "description": "Skip all conflicting courses from both schedules"},
                    {"value": "per_conflict", "description": "Manually choose for each conflict"}
                ]
            }, status=status.HTTP_200_OK)
        
        # Apply conflict resolution
        merged_courses = []
        
        if conflict_resolution == 'keep_both' or not all_conflicts:
            # Keep all courses (including conflicts)
            merged_courses = all_courses
        
        elif conflict_resolution == 'keep_faculty':
            # Keep faculty courses, only add non-conflicting student courses
            merged_courses = faculty_courses.copy()
            for course in student_courses:
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
        
        elif conflict_resolution == 'keep_student':
            # Keep student courses as priority
            merged_courses = student_courses.copy()
            for course in faculty_courses:
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
                c1_key = self._get_course_key(conflict['course1'])
                c2_key = self._get_course_key(conflict['course2'])
                conflicting_courses.add(c1_key)
                conflicting_courses.add(c2_key)
            
            for course in all_courses:
                course_key = self._get_course_key(course)
                if course_key not in conflicting_courses:
                    merged_courses.append(course)
        
        elif conflict_resolution == 'per_conflict':
            # Handle per-conflict resolution
            if not conflict_choices:
                return Response(
                    {"error": "conflict_choices is required when using per_conflict resolution"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create a map of conflict choices
            choices_map = {c['conflict_id']: c['choice'] for c in conflict_choices}
            
            # Track which courses to include/exclude
            courses_to_include = set()
            courses_to_exclude = set()
            
            for conflict in all_conflicts:
                conflict_id = conflict['id']
                choice = choices_map.get(conflict_id, 'keep_both')  # Default to keep_both
                
                c1_key = self._get_course_key(conflict['course1'])
                c2_key = self._get_course_key(conflict['course2'])
                
                if choice == 'keep_course1':
                    courses_to_include.add(c1_key)
                    courses_to_exclude.add(c2_key)
                elif choice == 'keep_course2':
                    courses_to_include.add(c2_key)
                    courses_to_exclude.add(c1_key)
                elif choice == 'keep_both':
                    courses_to_include.add(c1_key)
                    courses_to_include.add(c2_key)
                elif choice == 'skip_both':
                    courses_to_exclude.add(c1_key)
                    courses_to_exclude.add(c2_key)
            
            # Add all courses that are not explicitly excluded
            for course in all_courses:
                course_key = self._get_course_key(course)
                # Include if explicitly included or not in any conflict
                if course_key in courses_to_include or course_key not in courses_to_exclude:
                    merged_courses.append(course)
        
        # Legacy support: keep_first and keep_second still work
        elif conflict_resolution == 'keep_first':
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
        
        # Create the merged schedule and set it as active
        merged_schedule = Schedule.objects.create(
            user=request.user,
            title=title,
            upload_type='merged',  # Use 'merged' type for merged schedules
            is_active=True  # Automatically set as active so it shows in calendar
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


# ============================================
# Parental View Endpoints
# ============================================

class GenerateInviteCodeView(APIView):
    """
    API endpoint for students to generate an invite code for parents.
    
    POST /api/auth/invite-code/generate/
    
    Response: {
        "code": "ABC123XYZ0",
        "message": "Share this code with your parent..."
    }
    
    Only students/faculty can generate codes.
    Generating a new code invalidates any previous unused codes.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        user = request.user
        
        # Only students and faculty can generate invite codes
        if user.user_type == 'parent':
            return Response(
                {"error": "Parents cannot generate invite codes"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Invalidate any existing active codes for this student
        InviteCode.objects.filter(
            student=user,
            is_active=True,
            used=False
        ).update(is_active=False)
        
        # Generate new code
        code = InviteCode.generate_code()
        invite = InviteCode.objects.create(
            student=user,
            code=code
        )
        
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
            return Response(
                {"error": "Parents cannot have invite codes"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        active_code = InviteCode.objects.filter(
            student=user,
            is_active=True,
            used=False
        ).first()
        
        if active_code:
            return Response({
                "code": active_code.code,
                "created_at": active_code.created_at
            })
        
        return Response({"code": None, "message": "No active invite code"})


class UseInviteCodeView(APIView):
    """
    API endpoint for parents to use an invite code and link to a student.
    
    POST /api/auth/invite-code/use/
    Request body: { "code": "ABC123XYZ0" }
    
    Response: {
        "message": "Successfully linked...",
        "child": { ... }
    }
    
    Only parents can use invite codes.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        user = request.user
        code = request.data.get('code', '').strip().upper()
        
        # Only parents can use invite codes
        if user.user_type != 'parent':
            return Response(
                {"error": "Only parent accounts can use invite codes"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if parent already has a linked child
        existing_link = ParentChildLink.objects.filter(
            parent=user,
            status='active'
        ).first()
        
        if existing_link:
            return Response(
                {"error": "You already have a linked child. Unlink first to link a new child."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not code:
            return Response(
                {"error": "Invite code is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Find the invite code
        invite = InviteCode.objects.filter(
            code=code,
            is_active=True,
            used=False
        ).first()
        
        if not invite:
            return Response(
                {"error": "Invalid or expired invite code"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Prevent self-linking
        if invite.student == user:
            return Response(
                {"error": "You cannot link to yourself"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create the parent-child link
        from django.utils import timezone
        
        link = ParentChildLink.objects.create(
            parent=user,
            child=invite.student,
            status='active'
        )
        
        # Mark code as used
        invite.used = True
        invite.used_by = user
        invite.used_at = timezone.now()
        invite.save()
        
        logger.info(f"Parent {user.id} linked to student {invite.student.id} using code {code}")
        
        return Response({
            "message": f"Successfully linked to {invite.student.get_full_name()}",
            "child": ChildInfoSerializer(invite.student).data,
            "linked_at": link.linked_at
        }, status=status.HTTP_201_CREATED)


class ChildScheduleView(APIView):
    """
    API endpoint for parents to view their linked child's active schedule.
    
    GET /api/parent/child/schedule/
    
    Response: {
        "child": { ... },
        "schedule": { ... } or null,
        "has_active_schedule": true/false
    }
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = request.user
        
        # Only parents can access this
        if user.user_type != 'parent':
            return Response(
                {"error": "Only parent accounts can access this endpoint"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get the linked child
        link = ParentChildLink.objects.filter(
            parent=user,
            status='active'
        ).select_related('child').first()
        
        if not link:
            return Response(
                {"error": "No linked child found. Please link to a student first."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        child = link.child
        
        # Get child's active schedule with courses
        active_schedule = Schedule.objects.filter(
            user=child,
            is_active=True
        ).prefetch_related('courses').first()
        
        return Response({
            "child": ChildInfoSerializer(child).data,
            "schedule": ScheduleSerializer(active_schedule).data if active_schedule else None,
            "has_active_schedule": active_schedule is not None
        })


class LinkedParentsView(APIView):
    """
    API endpoint for students to view and manage linked parents.
    
    GET /api/student/parents/
    Returns list of linked parents.
    
    DELETE /api/student/parents/<parent_id>/revoke/
    Revokes a parent's access.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = request.user
        
        if user.user_type == 'parent':
            return Response(
                {"error": "This endpoint is for students only"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        links = ParentChildLink.objects.filter(
            child=user
        ).select_related('parent')
        
        result = []
        for link in links:
            result.append({
                "id": link.id,
                "parent_id": link.parent.id,
                "parent_name": link.parent.get_full_name(),
                "parent_email": link.parent.email,
                "status": link.status,
                "linked_at": link.linked_at
            })
        
        return Response({"parents": result})


class RevokeParentAccessView(APIView):
    """
    API endpoint for students to revoke a parent's access.
    
    DELETE /api/student/parents/<link_id>/revoke/
    """
    permission_classes = [IsAuthenticated]
    
    def delete(self, request, link_id):
        user = request.user
        
        if user.user_type == 'parent':
            return Response(
                {"error": "This endpoint is for students only"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            link = ParentChildLink.objects.get(id=link_id, child=user)
        except ParentChildLink.DoesNotExist:
            return Response(
                {"error": "Link not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        link.status = 'revoked'
        link.save()
        
        logger.info(f"Student {user.id} revoked access for parent {link.parent.id}")
        
        return Response({
            "message": f"Access revoked for {link.parent.get_full_name()}"
        })


class ChildLinkView(APIView):
    """
    API endpoint for parents to view and manage their child link.
    
    GET /api/parent/child/
    Returns linked child info.
    
    DELETE /api/parent/child/
    Unlinks from child.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = request.user
        
        if user.user_type != 'parent':
            return Response(
                {"error": "This endpoint is for parents only"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        link = ParentChildLink.objects.filter(
            parent=user,
            status='active'
        ).select_related('child').first()
        
        if not link:
            return Response({
                "child": None,
                "has_linked_child": False
            })
        
        return Response({
            "child": ChildInfoSerializer(link.child).data,
            "linked_at": link.linked_at,
            "has_linked_child": True
        })
    
    def delete(self, request):
        user = request.user
        
        if user.user_type != 'parent':
            return Response(
                {"error": "This endpoint is for parents only"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        link = ParentChildLink.objects.filter(
            parent=user,
            status='active'
        ).first()
        
        if not link:
            return Response(
                {"error": "No linked child to unlink"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        child_name = link.child.get_full_name()
        link.delete()
        
        logger.info(f"Parent {user.id} unlinked from their child")
        
        return Response({
            "message": f"Successfully unlinked from {child_name}"
        })