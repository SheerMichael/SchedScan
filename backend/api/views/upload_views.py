from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db import IntegrityError
from django.conf import settings
from django.utils import timezone
import os
import tempfile
import traceback
import logging
import re
import hashlib
import threading
from uuid import uuid4

from ..serializers import CourseSerializer
from ..models import Course, ExtractionLog, IncidentReport, ExtractionRequest, ExtractionJob
from ..permissions import IsAdminUser
from ..utils.extraction_manager import ExtractionManager, run_extraction_job

User = get_user_model()
logger = logging.getLogger(__name__)


class BaseCORUploadView(APIView):
    """
    Base class for COR upload endpoints.
    Provides common functionality for file validation and processing.
    """
    permission_classes = [IsAuthenticated]
    upload_type = None  # Must be set by subclass ('student' or 'faculty')

    _student_number_pattern = re.compile(r"\b(\d{4})-(\d)(\d{1,5})(\d)\b")
    _student_number_flexible_pattern = re.compile(r"\b(\d{4})[-\s]?(\d{5})\b")
    _student_number_digits_pattern = re.compile(r"\b(\d{9})\b")
    _email_pattern = re.compile(r"\b([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)([A-Za-z0-9._%+-])@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b")

    def _normalize_student_number(self, value: str) -> str:
        text = str(value or '').strip()
        if not text:
            return ''

        flexible = self._student_number_flexible_pattern.search(text)
        if flexible:
            return f"{flexible.group(1)}-{flexible.group(2)}"

        digits_only = ''.join(ch for ch in text if ch.isdigit())
        if len(digits_only) == 9:
            return f"{digits_only[:4]}-{digits_only[4:]}"

        return text.upper()

    def _extract_student_number_from_text(self, value: str) -> str:
        text = str(value or '')
        if not text:
            return ''

        flexible = self._student_number_flexible_pattern.search(text)
        if flexible:
            return f"{flexible.group(1)}-{flexible.group(2)}"

        contiguous = self._student_number_digits_pattern.search(text)
        if contiguous:
            digits = contiguous.group(1)
            return f"{digits[:4]}-{digits[4:]}"

        return ''

    def _redact_text(self, value: str) -> str:
        text = (value or "")

        def _mask_student_number(match):
            year, first, middle, last = match.groups()
            return f"{year}-{first}{'*' * len(middle)}{last}"

        def _mask_email(match):
            first, middle, last, domain = match.groups()
            return f"{first}{'*' * len(middle)}{last}@{domain}"

        text = self._student_number_pattern.sub(_mask_student_number, text)
        text = self._email_pattern.sub(_mask_email, text)
        return text

    def _build_raw_text_preview(self, uploaded_file, extraction_result: dict) -> str:
        raw_text = extraction_result.get('raw_text', '')
        if not raw_text:
            # Fallback preview from extracted fields if raw source text is unavailable.
            course_lines = []
            for course in extraction_result.get('courses', [])[:10]:
                line = " | ".join([
                    str(course.get('subject_code', '')).strip(),
                    str(course.get('day', '')).strip(),
                    str(course.get('start_time', '')).strip(),
                    str(course.get('end_time', '')).strip(),
                    str(course.get('location', '')).strip(),
                ])
                course_lines.append(line)
            raw_text = "\n".join(course_lines)

        extension = os.path.splitext(os.path.basename(getattr(uploaded_file, 'name', '')))[1].lower()
        file_name = f"uploaded{extension}" if extension else "uploaded_file"
        preview = f"file={file_name}\n{raw_text}" if raw_text else file_name
        return self._redact_text(preview)[:2000]

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
        failure_category='none',
        validator_errors=None,
        score_breakdown=None,
        template_family='',
        review_required=False,
        llm_used=False,
        llm_parse_success=False,
        llm_failure_reason='',
        raw_text_preview='',
        score_policy_upload_type='',
        schema_version='v1',
        score_version='v1',
        rule_version='v1',
    ):
        try:
            file_ext = os.path.splitext(uploaded_file.name)[1].lower().lstrip('.')
            enriched_score_breakdown = dict(score_breakdown or {})
            enriched_score_breakdown.update({
                'policy_upload_type': score_policy_upload_type or self.upload_type,
                'schema_version': schema_version,
                'score_version': score_version,
                'rule_version': rule_version,
            })
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
                raw_text_preview=(raw_text_preview or '')[:2000],
                processing_time=processing_time,
                attempts=attempts or [],
                failure_category=failure_category,
                validator_errors=validator_errors or [],
                score_breakdown=enriched_score_breakdown,
                template_family=template_family,
                review_required=review_required,
                llm_used=llm_used,
                llm_parse_success=llm_parse_success,
                llm_failure_reason=str(llm_failure_reason or '')[:40],
            )
        except Exception:
            logger.exception("Failed to write ExtractionLog")

    def _build_idempotency_context(self, request, user, file_hash: str) -> dict:
        request_id = str(
            request.headers.get('X-Request-ID')
            or request.data.get('request_id')
            or uuid4()
        )
        provided_key = str(
            request.headers.get('Idempotency-Key')
            or request.data.get('idempotency_key')
            or ''
        ).strip()
        if provided_key:
            idempotency_key = provided_key[:128]
        else:
            minute_bucket = timezone.now().strftime('%Y%m%d%H%M')
            idempotency_key = hashlib.sha256(
                f"{user.id}:{file_hash}:{self.upload_type}:{minute_bucket}".encode('utf-8')
            ).hexdigest()

        return {
            'request_id': request_id,
            'idempotency_key': idempotency_key,
            'extraction_run_id': str(uuid4()),
            'schema_version': str(getattr(settings, 'EXTRACTION_SCHEMA_VERSION', 'v1')),
            'file_hash': file_hash,
        }

    def _find_finalized_request(self, *, user, idempotency_key: str):
        return ExtractionRequest.objects.filter(
            user=user,
            idempotency_key=idempotency_key,
            is_finalized=True,
        ).first()

    def _get_or_create_locked_request_run(self, *, user, context: dict):
        try:
            run, _ = ExtractionRequest.objects.select_for_update().get_or_create(
                user=user,
                idempotency_key=context['idempotency_key'],
                defaults={
                    'request_id': context['request_id'],
                    'extraction_run_id': context['extraction_run_id'],
                    'schema_version': context['schema_version'],
                    'upload_type': self.upload_type,
                    'file_hash': context['file_hash'],
                },
            )
            return run
        except IntegrityError:
            # Another request won the unique-key race; lock existing row.
            return ExtractionRequest.objects.select_for_update().get(
                user=user,
                idempotency_key=context['idempotency_key'],
            )

    def _finalize_idempotent_response(
        self,
        *,
        user,
        context: dict,
        payload: dict,
        status_code: int,
    ):
        with transaction.atomic():
            run = self._get_or_create_locked_request_run(user=user, context=context)

            if run.is_finalized and run.response_status and isinstance(run.response_payload, dict):
                return run.response_payload, run.response_status, True

            run.request_id = context['request_id']
            run.extraction_run_id = context['extraction_run_id']
            run.schema_version = context['schema_version']
            run.upload_type = self.upload_type
            run.file_hash = context['file_hash']
            run.response_payload = payload
            run.response_status = status_code
            run.is_finalized = True
            run.status = 'succeeded' if 200 <= status_code < 300 else 'failed'
            run.save()

        return payload, status_code, False
    
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
        idempotency_context = None
        
        try:
            # Save uploaded file to a local temporary file
            # (works with any storage backend, including S3)
            file_extension = os.path.splitext(uploaded_file.name)[1].lower()
            with tempfile.NamedTemporaryFile(
                delete=False,
                suffix=file_extension,
                prefix=f"cor_{self.upload_type}_{request.user.id}_",
            ) as tmp:
                file_hash_builder = hashlib.sha256()
                for chunk in uploaded_file.chunks():
                    tmp.write(chunk)
                    file_hash_builder.update(chunk)
                temp_file_path = tmp.name
            file_hash = file_hash_builder.hexdigest()
            idempotency_context = self._build_idempotency_context(request, request.user, file_hash)

            existing_run = self._find_finalized_request(
                user=request.user,
                idempotency_key=idempotency_context['idempotency_key'],
            )
            if existing_run and existing_run.response_status and isinstance(existing_run.response_payload, dict):
                replay_payload = dict(existing_run.response_payload)
                replay_payload['idempotency'] = {
                    'request_id': existing_run.request_id,
                    'idempotency_key': existing_run.idempotency_key,
                    'extraction_run_id': existing_run.extraction_run_id,
                    'schema_version': existing_run.schema_version,
                    'hit': True,
                }
                return Response(replay_payload, status=existing_run.response_status)
            
            logger.info(f"Processing {self.upload_type.upper()} COR for user {request.user.id}: {uploaded_file.name}")

            # ------------------------------------------------------------------
            # Student COR: synchronous ownership check BEFORE launching async job
            # We need to verify the student number in the file matches the user
            # before accepting the upload.  This is a security gate — it must
            # stay synchronous.  Faculty uploads have no ownership requirement.
            # ------------------------------------------------------------------
            if self.upload_type == 'student':

                manager = ExtractionManager()
                result = manager.extract_schedule(temp_file_path, self.upload_type)

                courses_data = result['courses']
                extracted_student_number = self._normalize_student_number(result.get('student_number', ''))
                extraction_metadata = {
                    'method': result['extraction_method'],
                    'confidence': result['confidence'],
                    'processing_time_seconds': result['processing_time'],
                    'attempts': result.get('attempts', []),
                    'llm_failure_reason': result.get('llm_failure_reason', ''),
                    'semester': result.get('semester', ''),
                    'school_year': result.get('school_year', ''),
                    'failure_category': result.get('failure_category', 'none'),
                    'validator_errors': result.get('validator_errors', []),
                    'score_breakdown': result.get('score_breakdown', {}),
                    'request_id': idempotency_context['request_id'],
                    'idempotency_key': idempotency_context['idempotency_key'],
                    'extraction_run_id': idempotency_context['extraction_run_id'],
                    'schema_version': idempotency_context['schema_version'],
                    'score_version': result.get('score_version', str(getattr(settings, 'EXTRACTION_SCORE_VERSION', 'v1'))),
                    'rule_version': result.get('rule_version', str(getattr(settings, 'EXTRACTION_RULE_VERSION', 'v1'))),
                    'score_policy_upload_type': result.get('score_policy_upload_type', self.upload_type),
                }
                redacted_preview = self._build_raw_text_preview(uploaded_file, result)

                logger.info(
                    f"Student COR ownership check: method={result['extraction_method']}, "
                    f"confidence={result['confidence']}, student_number={extracted_student_number!r}"
                )

                # Re-run with stronger OCR fallback if student number not found
                if not extracted_student_number:
                    stronger_fallback_result = manager.extract_schedule(
                        temp_file_path,
                        self.upload_type,
                        force_ocr_fallback=True,
                    )
                    extracted_student_number = self._normalize_student_number(
                        stronger_fallback_result.get('student_number', '')
                    )
                    if extracted_student_number:
                        result = stronger_fallback_result
                        courses_data = result['courses']
                        extraction_metadata.update({
                            'method': result['extraction_method'],
                            'confidence': result['confidence'],
                            'processing_time_seconds': result['processing_time'],
                            'attempts': result.get('attempts', []),
                            'llm_failure_reason': result.get('llm_failure_reason', ''),
                            'semester': result.get('semester', ''),
                            'school_year': result.get('school_year', ''),
                            'failure_category': result.get('failure_category', 'none'),
                            'validator_errors': result.get('validator_errors', []),
                            'score_breakdown': result.get('score_breakdown', {}),
                        })
                        redacted_preview = self._build_raw_text_preview(uploaded_file, result)

                if not extracted_student_number:
                    extracted_student_number = self._extract_student_number_from_text(
                        result.get('raw_text', '')
                    )
                    if extracted_student_number:
                        extraction_metadata['student_number_recovered_from_raw_text'] = True

                strict_ownership_mode = bool(getattr(settings, 'EXTRACTION_STRICT_OWNERSHIP_MODE', False))
                if not extracted_student_number:
                    missing_status = status.HTTP_403_FORBIDDEN if strict_ownership_mode else status.HTTP_422_UNPROCESSABLE_ENTITY
                    self._write_extraction_log(
                        user=request.user,
                        uploaded_file=uploaded_file,
                        extraction_method=result['extraction_method'],
                        confidence=result['confidence'],
                        courses_extracted=0,
                        success=False,
                        error_message='Student number missing from extraction after stronger fallback pass.',
                        processing_time=result['processing_time'],
                        attempts=result.get('attempts', []),
                        failure_category='metadata_mismatch',
                        validator_errors=result.get('validator_errors', []),
                        score_breakdown=result.get('score_breakdown', {}),
                        review_required=True,
                        llm_used=result.get('llm_used', False),
                        llm_parse_success=result.get('llm_parse_success', False),
                        llm_failure_reason=result.get('llm_failure_reason', ''),
                        raw_text_preview=redacted_preview,
                        score_policy_upload_type=result.get('score_policy_upload_type', self.upload_type),
                        schema_version=extraction_metadata.get('schema_version', 'v1'),
                        score_version=extraction_metadata.get('score_version', 'v1'),
                        rule_version=extraction_metadata.get('rule_version', 'v1'),
                    )
                    payload = {
                        "error": "Unable to verify COR ownership because student number could not be extracted.",
                        "code": "STUDENT_NUMBER_MISSING",
                        "retryable": True,
                        "message": "Please upload a clearer COR with visible header details including your student number.",
                        "courses": [],
                        "total_courses": 0,
                        "extraction_metadata": extraction_metadata,
                    }
                    payload, final_status, replayed = self._finalize_idempotent_response(
                        user=request.user,
                        context=idempotency_context,
                        payload=payload,
                        status_code=missing_status,
                    )
                    payload['idempotency'] = {
                        **{k: idempotency_context[k] for k in ('request_id', 'idempotency_key', 'extraction_run_id', 'schema_version')},
                        'hit': replayed,
                    }
                    return Response(payload, status=final_status)

                user_student_number = self._normalize_student_number(
                    getattr(request.user, 'student_number', None)
                )
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
                        failure_category='metadata_mismatch',
                        validator_errors=result.get('validator_errors', []),
                        score_breakdown=result.get('score_breakdown', {}),
                        review_required=True,
                        llm_used=result.get('llm_used', False),
                        llm_parse_success=result.get('llm_parse_success', False),
                        llm_failure_reason=result.get('llm_failure_reason', ''),
                        raw_text_preview=redacted_preview,
                        score_policy_upload_type=result.get('score_policy_upload_type', self.upload_type),
                        schema_version=extraction_metadata.get('schema_version', 'v1'),
                        score_version=extraction_metadata.get('score_version', 'v1'),
                        rule_version=extraction_metadata.get('rule_version', 'v1'),
                    )
                    payload = {
                        "error": "COR verification failed. The student number in "
                                 "this COR does not match your registered student "
                                 f"number ({user_student_number}). "
                                 "Please upload your own COR.",
                    }
                    payload, final_status, replayed = self._finalize_idempotent_response(
                        user=request.user,
                        context=idempotency_context,
                        payload=payload,
                        status_code=status.HTTP_403_FORBIDDEN,
                    )
                    payload['idempotency'] = {
                        **{k: idempotency_context[k] for k in ('request_id', 'idempotency_key', 'extraction_run_id', 'schema_version')},
                        'hit': replayed,
                    }
                    return Response(payload, status=final_status)
                # end if self.upload_type == 'student'

            # ------------------------------------------------------------------
            # Launch async extraction job
            # ------------------------------------------------------------------
            # The ownership check above (for student CORs) already ran a sync
            # extraction pass to get the student number.  Now we create the
            # ExtractionJob and hand the temp file to the background thread.
            # For faculty uploads, the temp file path is passed directly.
            #
            # IMPORTANT: do NOT add a finally: os.unlink(temp_file_path) here.
            # Cleanup is owned by run_extraction_job() after the job completes.
            # ------------------------------------------------------------------
            job = ExtractionJob.objects.create(
                user=request.user,
                upload_type=self.upload_type,
                file_name=uploaded_file.name,
                status='pending',
                _temp_file_path=temp_file_path,
            )
            # Transfer temp-file ownership to the background thread
            temp_file_path = None  # Prevent the finally block from deleting it

            thread = threading.Thread(
                target=run_extraction_job,
                args=(job.job_id,),
                daemon=True,
                name=f"extraction-job-{job.job_id}",
            )
            thread.start()

            logger.info(
                "Launched async extraction thread for job %s (user=%s, type=%s)",
                job.job_id, request.user.id, self.upload_type,
            )

            return Response(
                {
                    "job_id": str(job.job_id),
                    "status": "processing",
                    "message": (
                        "Your file is being processed. "
                        "We'll notify you when it's ready."
                    ),
                },
                status=status.HTTP_202_ACCEPTED,
            )

        except Exception as e:
            logger.error(f"Error processing {self.upload_type.upper()} COR for user {request.user.id}: {str(e)}")

            # Write extraction telemetry (pre-thread failure only)
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
                failure_category='system_error',
            )

            return Response(
                {"error": "Failed to process the document. Please try again or use a different file."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        finally:
            # Only clean up if we still own the temp file (i.e. job creation
            # failed before we could transfer ownership to the thread).
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                logger.info(f"Cleaned up orphaned temp file: {temp_file_path}")


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
