"""
Faculty-Student Connection views.
Handles class codes, enrollment, faculty tasks, completion tracking,
faculty mode activation, and enrollment preview.
"""
import os
import mimetypes
from django.conf import settings
from django.utils import timezone
from django.http import FileResponse
from django.db.models import Q, Prefetch, Count, Subquery, OuterRef, BooleanField, Value
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from ..models import (
    ClassCode, ClassEnrollment, FacultyTask, FacultyTaskFile, FacultyTaskCompletion, Course, Schedule, User
)
from ..serializers import (
    ClassCodeSerializer, ClassEnrollmentSerializer,
    FacultyTaskSerializer, FacultyTaskWithStatsSerializer,
    FacultyTaskStudentSerializer, UserSerializer,
)
from ..utils.timetable_generator import generate_and_save_timetable

import logging

logger = logging.getLogger(__name__)


# ============================================
# Pagination
# ============================================

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


# ============================================
# Class Code Endpoints (Faculty only)
# ============================================

class ClassCodeView(APIView):
    """
    Generate or list class codes for a subject.

    POST /api/faculty/class-code/
    Body: {"subject_code": "CS101"}
    → Generates a new 8-char code, deactivates the previous one.

    GET /api/faculty/class-code/?subject_code=CS101
    → Lists active class codes (optionally filtered by subject_code).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.user_type != 'faculty':
            return Response(
                {"error": "Only faculty can generate class codes."},
                status=status.HTTP_403_FORBIDDEN
            )

        subject_code = request.data.get('subject_code')
        if not subject_code:
            return Response(
                {"error": "subject_code is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Deactivate any existing active codes for this faculty + subject
        ClassCode.objects.filter(
            faculty=user,
            subject_code=subject_code,
            is_active=True
        ).update(is_active=False)

        # Generate new code
        code = ClassCode.objects.create(
            faculty=user,
            subject_code=subject_code,
            code=ClassCode.generate_code()
        )

        serializer = ClassCodeSerializer(code)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def get(self, request):
        user = request.user
        if user.user_type != 'faculty':
            return Response(
                {"error": "Only faculty can view class codes."},
                status=status.HTTP_403_FORBIDDEN
            )

        codes = ClassCode.objects.filter(faculty=user, is_active=True)
        subject_code = request.query_params.get('subject_code')
        if subject_code:
            codes = codes.filter(subject_code=subject_code)

        serializer = ClassCodeSerializer(codes, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ============================================
# Faculty Mode Activation
# ============================================

class FacultyModeActivateView(APIView):
    """
    Activate faculty mode for the current user.
    This is called when a user uploads a faculty schedule and confirms
    they want to switch to faculty mode.

    POST /api/faculty/activate/
    Body: (empty)

    Requirements:
    - The user must have at least one schedule with upload_type='faculty'.
    - The user must currently be a student (guard against redundant calls).

    Response: Updated user object with user_type='faculty'.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        if user.user_type == 'faculty':
            return Response(
                {"message": "You are already in faculty mode.",
                 "user": UserSerializer(user).data},
                status=status.HTTP_200_OK
            )

        if user.user_type == 'parent':
            return Response(
                {"error": "Parent accounts cannot switch to faculty mode."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Verify the user actually has a faculty schedule
        has_faculty_schedule = Schedule.objects.filter(
            user=user,
            upload_type='faculty'
        ).exists()

        if not has_faculty_schedule:
            return Response(
                {"error": "You must upload a faculty schedule before activating faculty mode."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Promote user to faculty
        user.user_type = 'faculty'
        user.save(update_fields=['user_type'])

        logger.info(f"User {user.email} activated faculty mode")

        return Response({
            "message": "Faculty mode activated successfully.",
            "user": UserSerializer(user).data,
        }, status=status.HTTP_200_OK)


class FacultyModeCheckView(APIView):
    """
    Check whether the current user is eligible for faculty mode.

    GET /api/faculty/check/

    Returns:
    - is_faculty: whether user_type is already 'faculty'
    - has_faculty_schedule: whether they have at least one faculty schedule
    - faculty_schedule_count: number of faculty schedules
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        faculty_count = Schedule.objects.filter(
            user=user,
            upload_type='faculty'
        ).count()

        return Response({
            "is_faculty": user.user_type == 'faculty',
            "has_faculty_schedule": faculty_count > 0,
            "faculty_schedule_count": faculty_count,
            "user_type": user.user_type,
        }, status=status.HTTP_200_OK)


# ============================================
# Class Code Preview (for students)
# ============================================

class ClassCodePreviewView(APIView):
    """
    Preview class code details before enrolling.
    Returns subject metadata so the student can confirm before joining.

    POST /api/student/enroll/preview/
    Body: {"code": "ABCD1234"}

    Response: {
        "code": "ABCD1234",
        "subject_code": "CS101",
        "faculty_name": "Prof. John Doe",
        "faculty_email": "john@school.edu",
        "subject_details": [
            {
                "subject_name": "Software Engineering",
                "day": "M",
                "start_time": "07:00AM",
                "end_time": "09:00AM",
                "location": "LR7"
            },
            ...
        ],
        "already_enrolled": false
    }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        code_str = request.data.get('code', '').strip().upper()
        if not code_str:
            return Response(
                {"error": "code is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Find the class code
        try:
            class_code = ClassCode.objects.select_related('faculty').get(
                code=code_str, is_active=True
            )
        except ClassCode.DoesNotExist:
            return Response(
                {"error": "Invalid or expired class code."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get the faculty's course details for this subject
        faculty_courses = Course.objects.filter(
            user=class_code.faculty,
            subject_code=class_code.subject_code,
            schedule__upload_type='faculty'
        ).values(
            'subject_name', 'day', 'start_time', 'end_time', 'location'
        ).distinct()

        # Check if already enrolled
        already_enrolled = ClassEnrollment.objects.filter(
            student=user,
            faculty=class_code.faculty,
            subject_code=class_code.subject_code,
            status='active'
        ).exists()

        return Response({
            "code": class_code.code,
            "subject_code": class_code.subject_code,
            "faculty_name": class_code.faculty.get_full_name(),
            "faculty_email": class_code.faculty.email,
            "subject_details": list(faculty_courses),
            "already_enrolled": already_enrolled,
        }, status=status.HTTP_200_OK)


# ============================================
# Enrollment Endpoints
# ============================================

class StudentEnrollView(APIView):
    """
    Enroll a student in a faculty's class using a class code.

    POST /api/student/enroll/
    Body: {"code": "ABCD1234"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.user_type not in ('student', 'faculty'):
            return Response(
                {"error": "Only students and faculty can enroll using class codes."},
                status=status.HTTP_403_FORBIDDEN
            )

        code_str = request.data.get('code', '').strip().upper()
        if not code_str:
            return Response(
                {"error": "code is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Find the class code
        try:
            class_code = ClassCode.objects.get(code=code_str, is_active=True)
        except ClassCode.DoesNotExist:
            return Response(
                {"error": "Invalid or expired class code."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check for existing active enrollment
        existing = ClassEnrollment.objects.filter(
            student=user,
            faculty=class_code.faculty,
            subject_code=class_code.subject_code,
            status='active'
        ).first()

        if existing:
            return Response(
                {"error": "You are already enrolled in this class.",
                 "enrollment": ClassEnrollmentSerializer(existing).data},
                status=status.HTTP_409_CONFLICT
            )

        # Prevent faculty from enrolling in their own class
        if user == class_code.faculty:
            return Response(
                {"error": "You cannot enroll in your own class."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create enrollment
        enrollment = ClassEnrollment.objects.create(
            faculty=class_code.faculty,
            student=user,
            subject_code=class_code.subject_code,
            enrollment_type='code',
            status='active'
        )

        logger.info(
            f"Student {user.email} enrolled in {class_code.subject_code} "
            f"with faculty {class_code.faculty.email} via code {code_str}"
        )

        serializer = ClassEnrollmentSerializer(enrollment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class StudentEnrollmentListView(APIView):
    """
    List a student's active enrollments.

    GET /api/student/enrollments/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.user_type not in ('student', 'faculty'):
            return Response(
                {"error": "Only students and faculty can view enrollments."},
                status=status.HTTP_403_FORBIDDEN
            )

        enrollments = ClassEnrollment.objects.filter(
            student=user,
            status='active'
        ).select_related('faculty', 'student')
        serializer = ClassEnrollmentSerializer(enrollments, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class FacultyEnrolledStudentsView(APIView):
    """
    List students enrolled in a faculty's class for a specific subject.

    GET /api/faculty/enrolled-students/?subject_code=CS101
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.user_type != 'faculty':
            return Response(
                {"error": "Only faculty can view enrolled students."},
                status=status.HTTP_403_FORBIDDEN
            )

        subject_code = request.query_params.get('subject_code')
        if not subject_code:
            return Response(
                {"error": "subject_code query param is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        enrollments = ClassEnrollment.objects.filter(
            faculty=user,
            subject_code=subject_code,
            status='active'
        ).select_related('student')

        serializer = ClassEnrollmentSerializer(enrollments, many=True)
        return Response({
            "subject_code": subject_code,
            "enrolled_count": enrollments.count(),
            "enrollments": serializer.data
        }, status=status.HTTP_200_OK)


# ============================================
# Faculty Task Endpoints (Faculty side)
# ============================================

class FacultyTaskListCreateView(APIView):
    """
    List and create faculty tasks for a subject.

    GET /api/faculty/tasks/?subject_code=CS101
    POST /api/faculty/tasks/
    Body: {"subject_code": "CS101", "text": "Submit lab report", "due_date": null}
    Supports multipart/form-data for file uploads.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        user = request.user
        if user.user_type != 'faculty':
            return Response(
                {"error": "Only faculty can manage faculty tasks."},
                status=status.HTTP_403_FORBIDDEN
            )

        tasks = FacultyTask.objects.filter(faculty=user).prefetch_related('completions', 'files')
        subject_code = request.query_params.get('subject_code')
        if subject_code:
            tasks = tasks.filter(subject_code=subject_code)

        # Paginate
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(tasks, request)
        if page is not None:
            serializer = FacultyTaskWithStatsSerializer(
                page, many=True, context={'request': request}
            )
            return paginator.get_paginated_response(serializer.data)

        serializer = FacultyTaskWithStatsSerializer(
            tasks, many=True, context={'request': request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        user = request.user
        if user.user_type != 'faculty':
            return Response(
                {"error": "Only faculty can create faculty tasks."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Validate that the faculty actually teaches this subject
        subject_code = request.data.get('subject_code')
        if subject_code:
            teaches_subject = Course.objects.filter(
                user=user,
                subject_code=subject_code,
                schedule__upload_type='faculty'
            ).exists()
            if not teaches_subject:
                return Response(
                    {"error": f"You don't have '{subject_code}' in any of your faculty schedules."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Validate file attachments if provided
        # Accept multiple files via 'files' key, or legacy single 'file' key
        uploaded_files = request.FILES.getlist('files') or []
        legacy_file = request.FILES.get('file')
        if legacy_file and not uploaded_files:
            uploaded_files = [legacy_file]

        ALLOWED_EXTENSIONS = ('.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.ppt', '.pptx')
        ALLOWED_MIMETYPES = (
            'application/pdf',
            'image/png', 'image/jpeg',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        )
        MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB per file
        MAX_FILES = 5  # Maximum files per task

        if len(uploaded_files) > MAX_FILES:
            return Response(
                {"error": f"Too many files. Maximum {MAX_FILES} files per task."},
                status=status.HTTP_400_BAD_REQUEST
            )

        for uploaded_file in uploaded_files:
            file_ext = os.path.splitext(uploaded_file.name)[1].lower()
            if file_ext not in ALLOWED_EXTENSIONS:
                return Response(
                    {"error": f"Invalid file type '{file_ext}' for '{uploaded_file.name}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if uploaded_file.content_type and uploaded_file.content_type not in ALLOWED_MIMETYPES:
                return Response(
                    {"error": f"Invalid content type '{uploaded_file.content_type}' for '{uploaded_file.name}'."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if uploaded_file.size > MAX_FILE_SIZE:
                return Response(
                    {"error": f"File too large: '{uploaded_file.name}' ({uploaded_file.size // (1024*1024)} MB). Max allowed: 10 MB per file."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        serializer = FacultyTaskSerializer(
            data=request.data,
            context={'request': request}
        )
        if serializer.is_valid():
            task = serializer.save()
            # Create FacultyTaskFile records for each uploaded file
            for uploaded_file in uploaded_files:
                FacultyTaskFile.objects.create(
                    task=task,
                    file=uploaded_file,
                    file_name=uploaded_file.name,
                    file_size=uploaded_file.size or 0,
                )
            # Return with stats (prefetch the newly created files)
            task = FacultyTask.objects.prefetch_related('files', 'completions').get(pk=task.pk)
            stats_serializer = FacultyTaskWithStatsSerializer(task, context={'request': request})
            return Response(stats_serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class FacultyTaskDetailView(APIView):
    """
    Update or delete a faculty task.

    PATCH /api/faculty/tasks/<id>/
    Body: {"text": "Updated text"}

    DELETE /api/faculty/tasks/<id>/
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        user = request.user
        if user.user_type != 'faculty':
            return Response(
                {"error": "Only faculty can modify faculty tasks."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            task = FacultyTask.objects.get(pk=pk, faculty=user)
        except FacultyTask.DoesNotExist:
            return Response(
                {"error": "Task not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = FacultyTaskSerializer(task, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            stats_serializer = FacultyTaskWithStatsSerializer(task)
            return Response(stats_serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        user = request.user
        if user.user_type != 'faculty':
            return Response(
                {"error": "Only faculty can delete faculty tasks."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            task = FacultyTask.objects.get(pk=pk, faculty=user)
        except FacultyTask.DoesNotExist:
            return Response(
                {"error": "Task not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Clean up files from storage before deleting the task
        # New multi-file model
        for task_file in task.files.all():
            try:
                task_file.file.delete(save=False)
            except Exception:
                logger.warning(f"Failed to delete file {task_file.id} for task {task.id}")
        # Legacy single-file field
        if task.file:
            try:
                task.file.delete(save=False)
            except Exception:
                logger.warning(f"Failed to delete legacy file for task {task.id}")

        task.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FacultyTaskStatsView(APIView):
    """
    Get detailed completion stats for a faculty task.

    GET /api/faculty/tasks/<id>/stats/
    Returns: completion count, enrolled count, and list of students with status.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        user = request.user
        if user.user_type != 'faculty':
            return Response(
                {"error": "Only faculty can view task stats."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            task = FacultyTask.objects.get(pk=pk, faculty=user)
        except FacultyTask.DoesNotExist:
            return Response(
                {"error": "Task not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get all enrolled students
        enrollments = ClassEnrollment.objects.filter(
            faculty=user,
            subject_code=task.subject_code,
            status='active'
        ).select_related('student')

        # Get completions
        completions = {
            c.student_id: c
            for c in task.completions.all()
        }

        students = []
        for enrollment in enrollments:
            completion = completions.get(enrollment.student_id)
            students.append({
                "student_id": enrollment.student_id,
                "student_name": enrollment.student.get_full_name(),
                "student_email": enrollment.student.email,
                "is_completed": completion.is_completed if completion else False,
                "completed_at": completion.completed_at if completion and completion.is_completed else None,
            })

        completed_count = sum(1 for s in students if s['is_completed'])

        return Response({
            "task_id": task.id,
            "text": task.text,
            "subject_code": task.subject_code,
            "completed_count": completed_count,
            "total_enrolled": len(students),
            "students": students,
        }, status=status.HTTP_200_OK)


class FacultyTaskFileDownloadView(APIView):
    """
    Download a file attached to a faculty task.
    Accessible to the faculty owner and enrolled students.

    Supports both the new multi-file model (FacultyTaskFile) and legacy
    single-file field on FacultyTask. The 'file_id' query param selects
    which FacultyTaskFile to download. When omitted, falls back to the
    legacy single-file field (backward compat).

    GET /api/faculty/tasks/<id>/file/
    GET /api/faculty/tasks/<id>/file/?file_id=3
    → Returns JSON metadata: { download_url, file_name, file_size, storage }

    GET /api/faculty/tasks/<id>/file/?raw=1
    GET /api/faculty/tasks/<id>/file/?raw=1&file_id=3
    → Streams the actual file bytes (local storage only).
    """
    permission_classes = [IsAuthenticated]

    def _is_s3_file(self, file_field):
        """Check if a file field uses S3-based storage."""
        try:
            storage_cls = file_field.storage.__class__.__name__
            return 'S3' in storage_cls or 's3' in storage_cls
        except Exception:
            return False

    def _check_task_access(self, request, pk):
        """Validate task exists and user is authorized. Returns (task, error_response)."""
        try:
            task = FacultyTask.objects.get(pk=pk)
        except FacultyTask.DoesNotExist:
            logger.warning(f"File download 404: Task pk={pk} does not exist.")
            return None, Response(
                {"error": "Task not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        user = request.user
        is_faculty_owner = (task.faculty_id == user.id)
        is_enrolled = ClassEnrollment.objects.filter(
            student=user,
            faculty=task.faculty,
            subject_code=task.subject_code,
            status='active'
        ).exists()

        if not is_faculty_owner and not is_enrolled:
            return None, Response(
                {"error": "You don't have access to this file."},
                status=status.HTTP_403_FORBIDDEN
            )

        return task, None

    def _resolve_file(self, task, file_id):
        """
        Resolve which file to serve.
        Returns (file_field, file_name, file_size) or (None, None, None).
        """
        if file_id:
            try:
                task_file = FacultyTaskFile.objects.get(pk=file_id, task=task)
                return task_file.file, task_file.file_name, task_file.file_size
            except FacultyTaskFile.DoesNotExist:
                return None, None, None

        # No file_id: try first FacultyTaskFile, then legacy field
        first_file = task.files.first()
        if first_file:
            return first_file.file, first_file.file_name, first_file.file_size

        # Legacy single-file
        if task.file:
            size = None
            try:
                size = task.file.size
            except Exception:
                pass
            return task.file, task.file_name or os.path.basename(task.file.name), size

        return None, None, None

    def get(self, request, pk):
        task, error = self._check_task_access(request, pk)
        if error:
            return error

        file_id = request.query_params.get('file_id')
        file_field, file_name, file_size = self._resolve_file(task, file_id)

        if not file_field:
            return Response(
                {"error": "No file attached to this task."},
                status=status.HTTP_404_NOT_FOUND
            )

        # ---- raw=1: stream the actual bytes ----
        if request.query_params.get('raw') == '1':
            return self._stream_file(file_field, file_name, file_size, pk)

        # ---- Default: return lightweight JSON metadata ----
        if self._is_s3_file(file_field):
            try:
                file_url = file_field.url
                logger.info(f"File download: Returning pre-signed URL for task pk={pk}")
                return Response({
                    "download_url": file_url,
                    "file_name": file_name,
                    "file_size": file_size,
                    "storage": "s3",
                }, status=status.HTTP_200_OK)
            except Exception as e:
                logger.error(f"Failed to generate pre-signed URL for task {pk}: {e}")
                return Response(
                    {"error": "Failed to generate download URL."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        # Local storage
        raw_path = request.build_absolute_uri(request.get_full_path())
        if '?' in raw_path:
            raw_path += '&raw=1'
        else:
            raw_path += '?raw=1'
        return Response({
            "download_url": raw_path,
            "file_name": file_name,
            "file_size": file_size,
            "storage": "local",
        }, status=status.HTTP_200_OK)

    def _stream_file(self, file_field, file_name, file_size, pk):
        """Stream the file bytes with Content-Length for progress tracking."""
        content_type, _ = mimetypes.guess_type(file_name or file_field.name)
        content_type = content_type or 'application/octet-stream'

        try:
            file_handle = file_field.open('rb')
        except Exception as e:
            logger.error(
                f"Failed to open file for task {pk}: {e}. "
                f"File field value: '{file_field.name}'. "
                f"Storage backend: {file_field.storage.__class__.__name__}. "
                f"If using ephemeral container storage (no DO_SPACES_BUCKET), "
                f"files are lost on container restart."
            )
            return Response(
                {"error": "File not found on server. It may have been deleted or the server was restarted. "
                          "Contact your administrator to configure persistent file storage."},
                status=status.HTTP_404_NOT_FOUND
            )

        response = FileResponse(
            file_handle,
            content_type=content_type
        )
        safe_name = os.path.basename(file_name or file_field.name).replace('"', '\\"')
        response['Content-Disposition'] = f'attachment; filename="{safe_name}"'

        if file_size is not None and file_size > 0:
            response['Content-Length'] = str(file_size)
        else:
            try:
                response['Content-Length'] = str(file_field.size)
            except Exception:
                pass

        return response


# ============================================
# Student Faculty Task Endpoints
# ============================================

class StudentFacultyTaskListView(APIView):
    """
    Get faculty tasks for subjects the student is enrolled in.

    GET /api/student/faculty-tasks/?subject_code=CS101
    Returns tasks from enrolled faculty, with the student's completion status.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.user_type != 'student':
            return Response(
                {"error": "Only students can view faculty tasks."},
                status=status.HTTP_403_FORBIDDEN
            )

        subject_code = request.query_params.get('subject_code')

        # Get faculty IDs the student is enrolled with for this subject
        enrollment_filter = Q(student=user, status='active')
        if subject_code:
            enrollment_filter &= Q(subject_code=subject_code)

        enrolled_faculty_ids = ClassEnrollment.objects.filter(
            enrollment_filter
        ).values_list('faculty_id', flat=True).distinct()

        if not enrolled_faculty_ids:
            return Response([], status=status.HTTP_200_OK)

        # Get faculty tasks for those enrollments
        task_filter = Q(faculty_id__in=enrolled_faculty_ids)
        if subject_code:
            task_filter &= Q(subject_code=subject_code)

        # Prefetch only this student's completions to avoid N+1
        tasks = FacultyTask.objects.filter(task_filter).prefetch_related(
            'files',
            Prefetch(
                'completions',
                queryset=FacultyTaskCompletion.objects.filter(student=user),
                to_attr='student_completions'
            )
        ).select_related('faculty').order_by('-created_at')

        # Paginate
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(tasks, request)
        if page is not None:
            serializer = FacultyTaskStudentSerializer(
                page, many=True,
                context={'request': request}
            )
            return paginator.get_paginated_response(serializer.data)

        serializer = FacultyTaskStudentSerializer(
            tasks, many=True,
            context={'request': request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class StudentFacultyTaskCompleteView(APIView):
    """
    Toggle completion of a faculty task for the current student.

    POST /api/student/faculty-tasks/<id>/complete/
    Body: {"is_completed": true}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        if user.user_type != 'student':
            return Response(
                {"error": "Only students can complete faculty tasks."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            task = FacultyTask.objects.get(pk=pk)
        except FacultyTask.DoesNotExist:
            return Response(
                {"error": "Task not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Verify student is enrolled for this subject
        is_enrolled = ClassEnrollment.objects.filter(
            student=user,
            faculty=task.faculty,
            subject_code=task.subject_code,
            status='active'
        ).exists()

        if not is_enrolled:
            return Response(
                {"error": "You are not enrolled in this class."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_completed = request.data.get('is_completed', True)

        # Get or create completion record
        completion, created = FacultyTaskCompletion.objects.get_or_create(
            task=task,
            student=user,
            defaults={
                'is_completed': is_completed,
                'completed_at': timezone.now() if is_completed else None,
            }
        )

        if not created:
            completion.is_completed = is_completed
            completion.completed_at = timezone.now() if is_completed else None
            completion.save()

        return Response({
            "task_id": task.id,
            "is_completed": completion.is_completed,
            "completed_at": completion.completed_at,
        }, status=status.HTTP_200_OK)


class StudentFacultyTaskCountsView(APIView):
    """
    Get faculty task counts for multiple subject codes in a single request.
    Similar to TaskCountsView but for faculty tasks.

    POST /api/student/faculty-tasks/counts/
    Body: {"subject_codes": ["CS101", "MATH201"]}
    Response: {"CS101": {"total": 3, "incomplete": 2}, ...}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.user_type != 'student':
            return Response(
                {"error": "Only students can view faculty task counts."},
                status=status.HTTP_403_FORBIDDEN
            )

        subject_codes = request.data.get('subject_codes', [])

        if not isinstance(subject_codes, list):
            return Response(
                {"error": "subject_codes must be a list"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get enrolled faculty for these subjects
        enrollments = ClassEnrollment.objects.filter(
            student=user,
            subject_code__in=subject_codes,
            status='active'
        ).values('faculty_id', 'subject_code')

        # Build a map of subject_code -> faculty_ids
        subject_faculty = {}
        for e in enrollments:
            subject_faculty.setdefault(e['subject_code'], []).append(e['faculty_id'])

        counts = {}
        for code in subject_codes:
            faculty_ids = subject_faculty.get(code, [])
            if not faculty_ids:
                counts[code] = {'total': 0, 'incomplete': 0}
                continue

            tasks = FacultyTask.objects.filter(
                faculty_id__in=faculty_ids,
                subject_code=code
            )
            total = tasks.count()

            # Count completed by this student
            completed = FacultyTaskCompletion.objects.filter(
                task__in=tasks,
                student=user,
                is_completed=True
            ).count()

            counts[code] = {
                'total': total,
                'incomplete': total - completed
            }

        return Response(counts, status=status.HTTP_200_OK)


# ============================================
# Unenroll / Remove Endpoints
# ============================================

class StudentUnenrollView(APIView):
    """
    Allow a student to leave (unenroll from) a faculty's class.

    POST /api/student/unenroll/
    Body: {"enrollment_id": 5}
      or: {"faculty_email": "prof@test.com", "subject_code": "CS101"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.user_type not in ('student', 'faculty'):
            return Response(
                {"error": "Only students and faculty can unenroll from classes."},
                status=status.HTTP_403_FORBIDDEN
            )

        enrollment_id = request.data.get('enrollment_id')
        if enrollment_id:
            try:
                enrollment = ClassEnrollment.objects.get(
                    pk=enrollment_id, student=user, status='active'
                )
            except ClassEnrollment.DoesNotExist:
                return Response(
                    {"error": "Enrollment not found."},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # Fallback: look up by faculty + subject_code
            subject_code = request.data.get('subject_code')
            faculty_email = request.data.get('faculty_email')
            if not subject_code or not faculty_email:
                return Response(
                    {"error": "Provide enrollment_id, or both faculty_email and subject_code."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            try:
                enrollment = ClassEnrollment.objects.get(
                    student=user,
                    faculty__email=faculty_email,
                    subject_code=subject_code,
                    status='active'
                )
            except ClassEnrollment.DoesNotExist:
                return Response(
                    {"error": "Enrollment not found."},
                    status=status.HTTP_404_NOT_FOUND
                )

        enrollment.status = 'removed'
        enrollment.save(update_fields=['status'])

        logger.info(
            f"Student {user.email} unenrolled from {enrollment.subject_code} "
            f"with faculty {enrollment.faculty.email}"
        )

        return Response(
            {"message": "Successfully unenrolled.", "enrollment_id": enrollment.id},
            status=status.HTTP_200_OK
        )


class FacultyRemoveStudentView(APIView):
    """
    Allow a faculty member to remove a student from their class.

    POST /api/faculty/remove-student/
    Body: {"enrollment_id": 5}
      or: {"student_email": "student@test.com", "subject_code": "CS101"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.user_type != 'faculty':
            return Response(
                {"error": "Only faculty can remove students."},
                status=status.HTTP_403_FORBIDDEN
            )

        enrollment_id = request.data.get('enrollment_id')
        if enrollment_id:
            try:
                enrollment = ClassEnrollment.objects.get(
                    pk=enrollment_id, faculty=user, status='active'
                )
            except ClassEnrollment.DoesNotExist:
                return Response(
                    {"error": "Enrollment not found."},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            subject_code = request.data.get('subject_code')
            student_email = request.data.get('student_email')
            if not subject_code or not student_email:
                return Response(
                    {"error": "Provide enrollment_id, or both student_email and subject_code."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            try:
                enrollment = ClassEnrollment.objects.get(
                    faculty=user,
                    student__email=student_email,
                    subject_code=subject_code,
                    status='active'
                )
            except ClassEnrollment.DoesNotExist:
                return Response(
                    {"error": "Enrollment not found."},
                    status=status.HTTP_404_NOT_FOUND
                )

        enrollment.status = 'removed'
        enrollment.save(update_fields=['status'])

        logger.info(
            f"Faculty {user.email} removed student {enrollment.student.email} "
            f"from {enrollment.subject_code}"
        )

        return Response(
            {"message": "Student removed.", "enrollment_id": enrollment.id},
            status=status.HTTP_200_OK
        )


# ============================================
# Enroll + Sync to Calendar
# ============================================

class StudentEnrollSyncView(APIView):
    """
    Enroll via class code AND sync the faculty's courses to the
    student's active schedule, with conflict detection.

    POST /api/student/enroll/sync/
    Body: {"code": "ABCD1234", "force": false}

    Response (success, no conflicts):
    {
        "enrolled": true,
        "synced": true,
        "courses_added": 3,
        "enrollment": { ... }
    }

    Response (conflicts detected, force=false):
    {
        "enrolled": true,
        "synced": false,
        "has_conflicts": true,
        "conflicts": [
            {
                "day": "M",
                "new_course": {"subject_code": "CS101", ...},
                "existing_course": {"subject_code": "MATH201", ...},
                "overlap_minutes": 30
            }
        ],
        "enrollment": { ... }
    }

    If force=true, courses are added despite conflicts.
    If user has no active schedule, a new one is created automatically.
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

    def post(self, request):
        user = request.user
        if user.user_type not in ('student', 'faculty'):
            return Response(
                {"error": "Only students and faculty can use this endpoint."},
                status=status.HTTP_403_FORBIDDEN
            )

        code_str = request.data.get('code', '').strip().upper()
        force = request.data.get('force', False)

        if not code_str:
            return Response(
                {"error": "code is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # --- Step 1: Find class code ---
        try:
            class_code = ClassCode.objects.select_related('faculty').get(
                code=code_str, is_active=True
            )
        except ClassCode.DoesNotExist:
            return Response(
                {"error": "Invalid or expired class code."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Prevent self-enrollment
        if user == class_code.faculty:
            return Response(
                {"error": "You cannot enroll in your own class."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # --- Step 2: Enroll (idempotent) ---
        enrollment, enrolled_now = ClassEnrollment.objects.get_or_create(
            student=user,
            faculty=class_code.faculty,
            subject_code=class_code.subject_code,
            status='active',
            defaults={'enrollment_type': 'code'}
        )

        if not enrolled_now:
            # Already enrolled — still allow syncing
            pass

        # --- Step 3: Fetch faculty courses for this subject ---
        faculty_courses = list(Course.objects.filter(
            user=class_code.faculty,
            subject_code=class_code.subject_code,
            schedule__upload_type='faculty'
        ).values(
            'subject_code', 'subject_name', 'start_time',
            'end_time', 'day', 'location'
        ).distinct())

        if not faculty_courses:
            return Response({
                "enrolled": True,
                "synced": False,
                "message": "Enrolled successfully, but no schedule data available from the instructor to sync.",
                "enrollment": ClassEnrollmentSerializer(enrollment).data,
            }, status=status.HTTP_200_OK)

        # --- Step 4: Get or create active schedule ---
        active_schedule = Schedule.objects.filter(
            user=user, is_active=True
        ).first()

        if not active_schedule:
            # Create a new schedule for the user
            active_schedule = Schedule.objects.create(
                user=user,
                title="My Schedule",
                upload_type='student',
                is_active=True,
            )

        # --- Step 5: Check for conflicts ---
        existing_courses = list(active_schedule.courses.values(
            'subject_code', 'subject_name', 'start_time',
            'end_time', 'day', 'location'
        ))

        conflicts = []
        for new_c in faculty_courses:
            for existing_c in existing_courses:
                if new_c['day'] != existing_c['day']:
                    continue

                s1 = self._parse_time(new_c['start_time'])
                e1 = self._parse_time(new_c['end_time'])
                s2 = self._parse_time(existing_c['start_time'])
                e2 = self._parse_time(existing_c['end_time'])

                overlap_start = max(s1, s2)
                overlap_end = min(e1, e2)

                if overlap_start < overlap_end:
                    conflicts.append({
                        "day": new_c['day'],
                        "new_course": {
                            "subject_code": new_c['subject_code'],
                            "subject_name": new_c.get('subject_name', ''),
                            "start_time": new_c['start_time'],
                            "end_time": new_c['end_time'],
                            "location": new_c.get('location', ''),
                        },
                        "existing_course": {
                            "subject_code": existing_c['subject_code'],
                            "subject_name": existing_c.get('subject_name', ''),
                            "start_time": existing_c['start_time'],
                            "end_time": existing_c['end_time'],
                            "location": existing_c.get('location', ''),
                        },
                        "overlap_minutes": overlap_end - overlap_start,
                    })

        if conflicts and not force:
            return Response({
                "enrolled": True,
                "synced": False,
                "has_conflicts": True,
                "conflicts": conflicts,
                "enrollment": ClassEnrollmentSerializer(enrollment).data,
            }, status=status.HTTP_200_OK)

        # --- Step 6: Add courses to active schedule ---
        # Skip courses that already exist (same subject, day, time)
        added = 0
        for course_data in faculty_courses:
            exists = active_schedule.courses.filter(
                subject_code=course_data['subject_code'],
                day=course_data['day'],
                start_time=course_data['start_time'],
                end_time=course_data['end_time'],
            ).exists()

            if not exists:
                Course.objects.create(
                    user=user,
                    schedule=active_schedule,
                    subject_code=course_data['subject_code'],
                    subject_name=course_data.get('subject_name', ''),
                    start_time=course_data['start_time'],
                    end_time=course_data['end_time'],
                    day=course_data['day'],
                    location=course_data.get('location', ''),
                    source_type='student',
                )
                added += 1

        # --- Step 7: Regenerate timetable image ---
        if added > 0:
            try:
                all_courses = list(active_schedule.courses.values(
                    'subject_code', 'subject_name', 'start_time',
                    'end_time', 'day', 'location'
                ))
                image_path = generate_and_save_timetable(
                    schedule_id=active_schedule.id,
                    courses=all_courses,
                    title=active_schedule.title,
                    upload_type=active_schedule.upload_type,
                    user_id=user.id,
                    user_name=user.get_full_name()
                )
                active_schedule.timetable_image = image_path
                active_schedule.save(update_fields=['timetable_image'])
                logger.info(
                    f"Regenerated timetable for schedule {active_schedule.id} "
                    f"after enroll+sync of {class_code.subject_code}"
                )
            except Exception as e:
                logger.error(
                    f"Failed to regenerate timetable for schedule "
                    f"{active_schedule.id}: {str(e)}"
                )

        logger.info(
            f"User {user.email} enrolled in {class_code.subject_code} "
            f"via code {code_str} and synced {added} courses"
        )

        return Response({
            "enrolled": True,
            "synced": True,
            "courses_added": added,
            "has_conflicts": len(conflicts) > 0,
            "enrollment": ClassEnrollmentSerializer(enrollment).data,
        }, status=status.HTTP_201_CREATED)


# ============================================
# Auto-Enrollment Helper
# ============================================

def auto_enroll_on_schedule_create(user, subject_codes):
    """
    Auto-enroll students/faculty based on matching subject codes.
    Called after a schedule is created.

    - If user is a student: find faculty with matching subject codes and enroll.
    - If user is faculty: find students with matching subject codes and enroll.
    """
    if not subject_codes:
        return

    unique_codes = list(set(subject_codes))
    created_count = 0

    if user.user_type == 'student':
        # Find faculty who teach these subjects (from their courses/schedules)
        faculty_courses = Course.objects.filter(
            subject_code__in=unique_codes,
            user__user_type='faculty'
        ).values('user_id', 'subject_code').distinct()

        for fc in faculty_courses:
            _, created = ClassEnrollment.objects.get_or_create(
                student=user,
                faculty_id=fc['user_id'],
                subject_code=fc['subject_code'],
                status='active',
                defaults={'enrollment_type': 'auto'}
            )
            if created:
                created_count += 1

    elif user.user_type == 'faculty':
        # Find students who have these subjects
        student_courses = Course.objects.filter(
            subject_code__in=unique_codes,
            user__user_type='student'
        ).values('user_id', 'subject_code').distinct()

        for sc in student_courses:
            _, created = ClassEnrollment.objects.get_or_create(
                student_id=sc['user_id'],
                faculty=user,
                subject_code=sc['subject_code'],
                status='active',
                defaults={'enrollment_type': 'auto'}
            )
            if created:
                created_count += 1

    if created_count > 0:
        logger.info(
            f"Auto-enrolled {created_count} connections for {user.email} "
            f"with subject codes: {unique_codes}"
        )
