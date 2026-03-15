from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.db import transaction
import os
import tempfile
import traceback
import logging

from ..serializers import CourseSerializer
from ..models import Course, ExtractionLog, IncidentReport
from ..permissions import IsAdminUser
from ..utils.extraction_manager import ExtractionManager

User = get_user_model()
logger = logging.getLogger(__name__)


class BaseCORUploadView(APIView):
    """
    Base class for COR upload endpoints.
    Provides common functionality for file validation and processing.
    """
    permission_classes = [IsAuthenticated]
    upload_type = None  # Must be set by subclass ('student' or 'faculty')

    def _write_extraction_log(
        self,
        *,
        user,
        uploaded_file,
        extraction_method='none',
        confidence=0.0,
        courses_extracted=0,
        success=False,
        error_message='',
        processing_time=0.0,
        attempts=None,
    ):
        try:
            file_ext = os.path.splitext(uploaded_file.name)[1].lower().lstrip('.')
            ExtractionLog.objects.create(
                user=user,
                file_name=uploaded_file.name,
                file_type=file_ext,
                upload_type=self.upload_type,
                extraction_method=extraction_method,
                confidence=confidence,
                courses_extracted=courses_extracted,
                success=success,
                error_message=(error_message or '')[:2000],
                processing_time=processing_time,
                attempts=attempts or [],
            )
        except Exception:
            logger.exception("Failed to write ExtractionLog")
    
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
            # Save uploaded file to a local temporary file
            # (works with any storage backend, including S3)
            file_extension = os.path.splitext(uploaded_file.name)[1].lower()
            with tempfile.NamedTemporaryFile(
                delete=False,
                suffix=file_extension,
                prefix=f"cor_{self.upload_type}_{request.user.id}_",
            ) as tmp:
                for chunk in uploaded_file.chunks():
                    tmp.write(chunk)
                temp_file_path = tmp.name
            
            logger.info(f"Processing {self.upload_type.upper()} COR for user {request.user.id}: {uploaded_file.name}")
            
            # Use ExtractionManager for hybrid PDF/OCR extraction
            manager = ExtractionManager()
            result = manager.extract_schedule(temp_file_path, self.upload_type)
            
            courses_data = result['courses']
            extracted_student_number = result.get('student_number', '')
            extraction_metadata = {
                'method': result['extraction_method'],
                'confidence': result['confidence'],
                'processing_time_seconds': result['processing_time'],
                'attempts': result.get('attempts', []),
                'semester': result.get('semester', ''),
                'school_year': result.get('school_year', ''),
            }
            
            logger.info(f"Extraction completed using {result['extraction_method']} method "
                       f"(confidence: {result['confidence']}, time: {result['processing_time']}s)")
            
            # Verify COR ownership: check that the student number in the COR
            # matches the student number the user registered with
            if self.upload_type == 'student' and extracted_student_number:
                user_student_number = getattr(request.user, 'student_number', None)
                if user_student_number and extracted_student_number != user_student_number:
                    logger.warning(
                        f"COR verification failed for user {request.user.id}: "
                        f"COR student number '{extracted_student_number}' does not match "
                        f"user student number '{user_student_number}'"
                    )
                    self._write_extraction_log(
                        user=request.user,
                        uploaded_file=uploaded_file,
                        extraction_method=result['extraction_method'],
                        confidence=result['confidence'],
                        courses_extracted=0,
                        success=False,
                        error_message=(
                            "COR verification failed: extracted student number "
                            f"'{extracted_student_number}' does not match registered "
                            f"student number '{user_student_number}'."
                        ),
                        processing_time=result['processing_time'],
                        attempts=result.get('attempts', []),
                    )
                    return Response(
                        {
                            "error": "COR verification failed. The student number in "
                                     "this COR does not match your registered student "
                                     f"number ({user_student_number}). "
                                     "Please upload your own COR.",
                        },
                        status=status.HTTP_403_FORBIDDEN
                    )
            
            if not courses_data:
                self._write_extraction_log(
                    user=request.user,
                    uploaded_file=uploaded_file,
                    extraction_method=result['extraction_method'],
                    confidence=result['confidence'],
                    courses_extracted=0,
                    success=False,
                    error_message=(
                        f"No courses found in extracted {self.upload_type.upper()} COR document."
                    ),
                    processing_time=result['processing_time'],
                    attempts=result.get('attempts', []),
                )
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
            with transaction.atomic():
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
            
            # Write extraction telemetry (success)
            self._write_extraction_log(
                user=request.user,
                uploaded_file=uploaded_file,
                extraction_method=result['extraction_method'],
                confidence=result['confidence'],
                courses_extracted=len(created_courses),
                success=True,
                processing_time=result['processing_time'],
                attempts=result.get('attempts', []),
            )
            
            return Response(
                {
                    "message": f"Successfully processed {self.upload_type.upper()} COR and created {len(created_courses)} courses",
                    "courses": serializer.data,
                    "total_courses": len(created_courses),
                    "upload_type": self.upload_type,
                    "semester": extraction_metadata.get('semester', ''),
                    "school_year": extraction_metadata.get('school_year', ''),
                    "extraction_metadata": extraction_metadata
                },
                status=status.HTTP_201_CREATED
            )
        
        except Exception as e:
            logger.error(f"Error processing {self.upload_type.upper()} COR for user {request.user.id}: {str(e)}")
            
            # Write extraction telemetry (failure)
            self._write_extraction_log(
                user=request.user,
                uploaded_file=uploaded_file,
                extraction_method='none',
                confidence=0.0,
                courses_extracted=0,
                success=False,
                error_message=traceback.format_exc(),
                processing_time=0.0,
                attempts=[],
            )
            
            return Response(
                {
                    "error": "Failed to process the document. Please try again or use a different file.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        finally:
            # Clean up temporary file
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
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
    API endpoint to delete all courses for all users (admin-only operation).

    DELETE /api/courses/delete-all/
    Headers: Authorization: Bearer <admin_access_token>

    Response: {
        "message": "Successfully deleted N courses for all users",
        "deleted_count": N
    }
    """
    # Restricted to staff admins – ordinary users must never reach this.
    permission_classes = [IsAdminUser]
    
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
                    "error": "Failed to delete courses.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SubmitIncidentReportView(APIView):
    """
    POST /api/reports/submit/

    Allows authenticated mobile users to submit a problem report
    from the Scanner's "Submit Report" modal.

    Request body:
        {
            "description": "Ayaw mag scan / Kulang schedule",
            "upload_error": "Failed to process the document..."  (optional)
        }

    Response (201):
        { "id": 1, "status": "pending", "created_at": "..." }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        description = str(request.data.get("description", "")).strip()
        upload_error = str(request.data.get("upload_error", "")).strip()

        if not description:
            return Response(
                {"error": "Description is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Enforce max length
        description = description[:500]
        upload_error = upload_error[:2000]

        report = IncidentReport.objects.create(
            reporter=request.user,
            description=description,
            upload_error=upload_error,
            status="pending",
        )

        logger.info(
            "Incident report #%d submitted by user %s",
            report.id,
            request.user.email,
        )

        return Response(
            {
                "id": report.id,
                "status": report.status,
                "created_at": report.created_at,
            },
            status=status.HTTP_201_CREATED,
        )
