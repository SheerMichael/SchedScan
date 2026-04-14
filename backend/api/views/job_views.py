"""
Polling endpoint for async extraction jobs.

GET /api/extraction-jobs/{job_id}/

Returns the current state of an ExtractionJob so the frontend
can poll until the job reaches a terminal state (done or failed).

Frontend polling strategy (recommended):
  - Poll every 3 seconds
    - Max 40 attempts with backoff (~3-4 minutes total)
  - On done: store courses from push notification or re-fetch /api/courses/
  - On failed: show error + retry prompt
"""
import logging
import uuid
from django.utils import timezone
from datetime import timedelta
from django.conf import settings

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import ExtractionJob

logger = logging.getLogger(__name__)


def _mark_stale_job_failed(job) -> bool:
    """
    Mark long-running pending/processing jobs as failed.

    This protects clients from indefinite "processing" when in-process worker
    threads are interrupted by process restarts or infrastructure recycling.
    """
    if job.status not in ('pending', 'processing'):
        return False

    max_age_minutes = int(getattr(settings, 'EXTRACTION_STALE_JOB_MAX_AGE_MINUTES', 5))
    max_age_minutes = max(1, max_age_minutes)
    cutoff = timezone.now() - timedelta(minutes=max_age_minutes)

    # updated_at is auto_now; if it's too old, this job is stale.
    if not job.updated_at or job.updated_at > cutoff:
        return False

    job.status = 'failed'
    job.failure_category = 'system_error'
    job.error_message = (
        'Extraction exceeded expected processing window and was marked failed. '
        'Please retry upload.'
    )
    job.save(update_fields=['status', 'failure_category', 'error_message', 'updated_at'])
    logger.warning(
        'ExtractionJobStatusView: auto-failed stale job %s (user=%s, upload_type=%s, age_minutes=%s)',
        job.job_id,
        job.user_id,
        job.upload_type,
        max_age_minutes,
    )
    return True


class ExtractionJobStatusView(APIView):
    """
    GET /api/extraction-jobs/{job_id}/

    Returns the current status of an async extraction job.

    Ownership is enforced: a user may only poll their own jobs.

    Responses:
      200  pending/processing  →  { job_id, status: "processing" }
      200  done                →  { job_id, status: "done", courses, confidence, ... }
      200  failed              →  { job_id, status: "failed", failure_category, message }
      403                      →  { error: "You do not have permission to view this job." }
      404                      →  { error: "Job not found." }
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, job_id):
        # Validate job_id format
        try:
            uuid.UUID(str(job_id))
        except (ValueError, AttributeError):
            return Response({"error": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        # Fetch job
        try:
            job = ExtractionJob.objects.select_related('user').get(job_id=job_id)
        except ExtractionJob.DoesNotExist:
            return Response({"error": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        # Ownership check
        if job.user_id != request.user.id:
            logger.warning(
                "ExtractionJobStatusView: user %s attempted to access job %s owned by user %s",
                request.user.id, job_id, job.user_id,
            )
            return Response(
                {"error": "You do not have permission to view this job."},
                status=status.HTTP_403_FORBIDDEN,
            )

        _mark_stale_job_failed(job)
        # Refresh after stale recovery attempt.
        job.refresh_from_db(fields=['status', 'failure_category', 'error_message', 'updated_at'])

        job_status = job.status

        if job_status in ('pending', 'processing'):
            return Response(
                {
                    "job_id": str(job.job_id),
                    "status": "processing",
                    "message": "Your schedule is being processed. Please check back shortly.",
                },
                status=status.HTTP_200_OK,
            )

        if job_status == 'done':
            return Response(
                {
                    "job_id": str(job.job_id),
                    "status": "done",
                    "upload_type": job.upload_type,
                    "courses": job.courses or [],
                    "total_courses": len(job.courses) if job.courses else 0,
                    "confidence": job.confidence,
                    "extraction_method": job.extraction_method or 'unknown',
                    "semester": job.semester or '',
                    "school_year": job.school_year or '',
                    "message": "Your schedule has been successfully extracted and saved.",
                },
                status=status.HTTP_200_OK,
            )

        if job_status == 'failed':
            failure_messages = {
                'timeout': (
                    "The vision model timed out while reading your document. "
                    "Please retry in a moment."
                ),
                'low_confidence': (
                    "The document quality was too low to extract your schedule reliably. "
                    "Please re-upload a clearer document."
                ),
                'parse_error': (
                    "We couldn't parse the extracted schedule structure. "
                    "Please re-upload a clearer document."
                ),
                'metadata_mismatch': (
                    "The student number in the document did not match your registered number. "
                    "Please upload your own COR."
                ),
                'ownership_mismatch': (
                    "The student number in the document did not match your registered number. "
                    "Please upload your own COR."
                ),
                'no_text': (
                    "No schedule text could be found in the document. "
                    "Please ensure the schedule is clearly visible."
                ),
                'system_error': (
                    "A system error occurred while processing your document. "
                    "Please try again in a moment."
                ),
            }
            failure_category = job.failure_category or 'system_error'
            user_message = failure_messages.get(
                failure_category,
                "Extraction failed. Please try re-uploading your document.",
            )
            return Response(
                {
                    "job_id": str(job.job_id),
                    "status": "failed",
                    "failure_category": failure_category,
                    "message": user_message,
                    "retryable": failure_category not in {'metadata_mismatch', 'ownership_mismatch'},
                },
                status=status.HTTP_200_OK,
            )

        # Unknown status — shouldn't happen, treat as error
        logger.error(
            "ExtractionJobStatusView: job %s has unexpected status %r", job_id, job_status
        )
        return Response(
            {
                "job_id": str(job.job_id),
                "status": job_status,
                "message": "Unknown job state. Please contact support.",
            },
            status=status.HTTP_200_OK,
        )


class ExtractionJobRecentView(APIView):
    """
    GET /api/extraction-jobs/recent/?limit=5&upload_type=student

    Returns recent extraction jobs for the authenticated user.
    Used by mobile to recover when upload POST times out but backend job continues.
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _parse_upload_type(request):
        upload_type = (request.query_params.get('upload_type') or '').strip().lower()
        allowed_upload_types = {'student', 'faculty'}
        if upload_type and upload_type not in allowed_upload_types:
            return None
        return upload_type

    def get(self, request):
        raw_limit = request.query_params.get('limit', '5')
        try:
            limit = int(raw_limit)
        except (TypeError, ValueError):
            limit = 5
        limit = max(1, min(limit, 20))

        upload_type = self._parse_upload_type(request)
        if upload_type is None:
            return Response(
                {"error": "Invalid upload_type. Expected 'student' or 'faculty'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = ExtractionJob.objects.filter(
            user=request.user,
            user_hidden_at__isnull=True,
        )
        if upload_type:
            qs = qs.filter(upload_type=upload_type)
        jobs = qs.order_by('-created_at')[:limit]

        serialized = []
        for job in jobs:
            entry = {
                "job_id": str(job.job_id),
                "status": job.status,
                "upload_type": job.upload_type,
                "file_name": job.file_name,
                "confidence": job.confidence,
                "extraction_method": job.extraction_method or '',
                "failure_category": job.failure_category or '',
                "created_at": timezone.localtime(job.created_at).isoformat(),
                "updated_at": timezone.localtime(job.updated_at).isoformat(),
            }

            if job.status == 'done':
                entry.update(
                    {
                        "courses": job.courses or [],
                        "total_courses": len(job.courses) if job.courses else 0,
                        "semester": job.semester or '',
                        "school_year": job.school_year or '',
                        "message": "Your schedule has been successfully extracted and saved.",
                    }
                )
            elif job.status == 'failed':
                entry.update(
                    {
                        "message": "Extraction failed. Please try re-uploading your document.",
                        "retryable": (job.failure_category or '') not in {'metadata_mismatch', 'ownership_mismatch'},
                    }
                )
            else:
                entry.update(
                    {
                        "message": "Your schedule is being processed.",
                    }
                )

            serialized.append(entry)

        return Response(
            {
                "count": len(serialized),
                "jobs": serialized,
            },
            status=status.HTTP_200_OK,
        )

    def delete(self, request):
        """
        DELETE /api/extraction-jobs/recent/?upload_type=student

        Clears recent extraction history for the authenticated user.
        Safety: only terminal jobs (done/failed) are hidden so active processing jobs remain trackable.
        This preserves admin observability and analytics while honoring user-facing clear history.
        """
        upload_type = self._parse_upload_type(request)
        if upload_type is None:
            return Response(
                {"error": "Invalid upload_type. Expected 'student' or 'faculty'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = ExtractionJob.objects.filter(user=request.user)
        if upload_type:
            qs = qs.filter(upload_type=upload_type)

        terminal_qs = qs.filter(status__in=['done', 'failed'], user_hidden_at__isnull=True)
        remaining_processing = qs.exclude(status__in=['done', 'failed']).count()
        hidden_count = terminal_qs.update(user_hidden_at=timezone.now())

        return Response(
            {
                "deleted_count": hidden_count,
                "hidden_count": hidden_count,
                "remaining_processing": remaining_processing,
                "message": "Recent extraction history cleared.",
            },
            status=status.HTTP_200_OK,
        )
