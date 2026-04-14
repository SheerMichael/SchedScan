"""
Extraction Manager for orchestrating schedule extraction from COR documents.

This module provides a hybrid approach that:
1. Tries fast PDF text extraction first (for digital PDFs)
2. Falls back to OCR extraction if PDF extraction quality is poor
3. Uses OCR directly for image files

This ensures optimal performance while maintaining robustness.
"""

import os
from datetime import timedelta
import time
import logging
from typing import Dict, List
from django.conf import settings
from django.utils import timezone
from .pdf_extractor import get_pdf_extractor, calculate_quality_score
from .extraction import (
    normalize_candidates,
    score_candidates,
    StagedExtractionOrchestrator,
    validate_candidates,
)
from .extraction.fallbacks import should_use_fallback
from .extraction.llm_normalizer import (
    parse_document_metadata_with_llm_vision,
    parse_document_with_llm_vision,
)
from .enrollment_auto_link import sync_auto_enrollments_for_user

# Try to import OCR module - uses pytesseract (lightweight)
try:
    from .ocr import get_cor_extractor
    OCR_AVAILABLE = True
except ImportError as e:
    OCR_AVAILABLE = False
    import logging
    logging.getLogger(__name__).warning(f"OCR not available: {e}")

logger = logging.getLogger(__name__)


def _all_courses_missing_days(courses_data: List[Dict]) -> bool:
    """Return True when every extracted course has an empty day field."""
    if not courses_data:
        return False

    return all(not str(course.get('day') or '').strip() for course in courses_data)


def _normalize_student_number(value: str) -> str:
    text = str(value or '').strip()
    if not text:
        return ''

    digits_only = ''.join(ch for ch in text if ch.isdigit())
    if len(digits_only) == 9:
        return f"{digits_only[:4]}-{digits_only[4:]}"

    return text.upper()


class ExtractionManager:
    """
    Manager class that orchestrates schedule extraction using the best available method.
    
    Extraction strategy:
    - For PDF files: Try PDF text extraction first, fallback to OCR if quality is low
    - For image files: Use OCR directly
    
    Tracks extraction method, quality, and performance metrics.
    """
    
    # Quality threshold for PDF extraction (0.0 - 1.0)
    # If PDF extraction quality is below this, fallback to OCR
    PDF_QUALITY_THRESHOLD = 0.6
    
    def __init__(self, quality_threshold: float = None):
        """
        Initialize the extraction manager.
        
        Args:
            quality_threshold: Override default quality threshold (optional)
        """
        if quality_threshold is not None:
            self.quality_threshold = quality_threshold
        else:
            self.quality_threshold = self.PDF_QUALITY_THRESHOLD
        
        logger.info(f"ExtractionManager initialized with quality threshold: {self.quality_threshold}")

    def extract_student_number_for_ownership_gate(self, file_path: str) -> Dict:
        """
        Fast synchronous ownership gate for student uploads.

        This path extracts only the student number with a tight compute budget
        to reduce request latency before launching async full extraction.
        """
        start_time = time.time()
        attempts: List[str] = []

        timeout_seconds = int(getattr(settings, 'EXTRACTION_FAST_OWNERSHIP_GATE_TIMEOUT_SECONDS', 10))
        max_pages = int(getattr(settings, 'EXTRACTION_FAST_OWNERSHIP_GATE_MAX_PAGES', 1))
        retry_count = int(getattr(settings, 'EXTRACTION_FAST_OWNERSHIP_GATE_RETRY_COUNT', 0))

        doc_meta, telemetry = parse_document_metadata_with_llm_vision(
            file_path=file_path,
            upload_type='student',
            timeout_seconds_override=timeout_seconds,
            max_pages_override=max_pages,
            retry_count_override=retry_count,
        )
        attempts.append('llm_vision_metadata_gate')
        student_number = _normalize_student_number(doc_meta.get('student_number', ''))

        raw_text = ''
        if not student_number and file_path.lower().endswith('.pdf'):
            # Lightweight local fallback: first-page text scan only.
            try:
                import pdfplumber as _pdfplumber
                with _pdfplumber.open(file_path) as _pdf:
                    first_page_text = ''
                    if _pdf.pages:
                        first_page_text = _pdf.pages[0].extract_text() or ''
                raw_text = first_page_text
                digits = ''.join(ch for ch in first_page_text if ch.isdigit())
                if len(digits) >= 9:
                    for i in range(0, len(digits) - 8):
                        candidate = digits[i:i + 9]
                        normalized = _normalize_student_number(candidate)
                        if normalized:
                            student_number = normalized
                            attempts.append('pdf_first_page_metadata_fallback')
                            break
            except Exception as exc:
                logger.warning('Ownership gate PDF fallback failed: %s', exc)

        processing_time = round(time.time() - start_time, 3)
        return {
            'student_number': student_number,
            'semester': str(doc_meta.get('semester') or '').strip().upper(),
            'school_year': str(doc_meta.get('school_year') or '').strip(),
            'extraction_method': attempts[-1] if student_number else 'none',
            'confidence': 1.0 if student_number else 0.0,
            'processing_time': processing_time,
            'attempts': attempts,
            'failure_category': 'none' if student_number else 'metadata_mismatch',
            'validator_errors': [],
            'score_breakdown': {},
            'llm_used': telemetry.get('llm_used', False),
            'llm_parse_success': telemetry.get('llm_parse_success', False),
            'llm_failure_reason': telemetry.get('llm_failure_reason', ''),
            'raw_text': raw_text,
            'score_policy_upload_type': 'student',
            'score_version': str(getattr(settings, 'EXTRACTION_SCORE_VERSION', 'v1')),
            'rule_version': str(getattr(settings, 'EXTRACTION_RULE_VERSION', 'v1')),
        }

    def _accept_threshold(self, upload_type: str) -> float:
        by_type = getattr(settings, 'EXTRACTION_ACCEPT_THRESHOLD_BY_UPLOAD_TYPE', None)
        if isinstance(by_type, dict):
            scoped = by_type.get((upload_type or '').lower())
            if scoped is not None:
                return float(scoped)
        return float(getattr(settings, 'EXTRACTION_ACCEPT_THRESHOLD', 0.85))

    def _retry_threshold(self, upload_type: str) -> float:
        by_type = getattr(settings, 'EXTRACTION_RETRY_THRESHOLD_BY_UPLOAD_TYPE', None)
        if isinstance(by_type, dict):
            scoped = by_type.get((upload_type or '').lower())
            if scoped is not None:
                return float(scoped)
        return float(getattr(settings, 'EXTRACTION_RETRY_THRESHOLD', 0.60))

    def _finalize_result(
        self,
        result: Dict,
        attempts: List[str],
        upload_type: str,
        source_file_path: str = '',
    ) -> Dict:
        """
        Vision-first orchestration (vision LLM is primary, regex is fallback):

        Stage 0: Vision direct-file parser (primary).
            - Runs first on every upload when vision is enabled.
            - On success + score >= accept_threshold: early return.
            - On failure/low-confidence: keep as candidate and continue.

        Stage 1: Regex extraction scoring.
            - Scores whatever regex/OCR extraction produced.

        Stage 2: Best-candidate arbitration for low-confidence cases.
            - If both regex and vision are below threshold, keep the higher score.
        """
        accept_threshold = self._accept_threshold(upload_type)
        retry_threshold = self._retry_threshold(upload_type)

        llm_used = False
        llm_parse_success = False
        llm_failure_reason = ''
        llm_timing = {}

        _vision_stage_result = None

        if source_file_path and result.get('extraction_method') in (None, '', 'none'):
            result['extraction_method'] = 'llm_vision_parse'

        # ====================================================================
        # Stage 0: Vision direct-file parser (optional, primary when enabled)
        # ====================================================================
        if source_file_path:
            v_courses, v_meta, v_telemetry = parse_document_with_llm_vision(
                file_path=source_file_path,
                upload_type=upload_type,
            )
            llm_used = llm_used or bool(v_telemetry.get('llm_used', False))
            llm_failure_reason = str(v_telemetry.get('llm_failure_reason') or '').strip()
            llm_timing = {
                'timeout_type': str(v_telemetry.get('llm_timeout_type') or ''),
                'preprocess_seconds': float(v_telemetry.get('llm_preprocess_seconds') or 0.0),
                'request_seconds': float(v_telemetry.get('llm_request_seconds') or 0.0),
                'total_seconds': float(v_telemetry.get('llm_total_seconds') or 0.0),
                'attempt_count': len(v_telemetry.get('llm_attempt_metrics') or []),
            }

            if v_telemetry.get('llm_parse_success') and v_courses:
                llm_parse_success = True
                v_attempts = attempts + ['llm_vision_parse']
                v_validation = validate_candidates(normalize_candidates(v_courses))
                v_score = score_candidates(
                    v_validation.courses,
                    v_validation.errors,
                    v_attempts,
                    upload_type=upload_type,
                )

                if v_score.confidence >= accept_threshold:
                    logger.info(
                        'Stage 0 (LLM vision) succeeded: %d courses, confidence=%.2f',
                        len(v_validation.courses), v_score.confidence,
                    )
                    for key in ('student_number', 'semester', 'school_year'):
                        if v_meta.get(key):
                            result[key] = v_meta[key]
                    attempts[:] = v_attempts
                    result['extraction_method'] = 'llm_vision_parse'
                    result['courses'] = v_validation.courses
                    result['confidence'] = v_score.confidence
                    result['validator_errors'] = v_validation.errors
                    score_breakdown = dict(v_score.breakdown)
                    if llm_timing:
                        score_breakdown['llm_timing'] = llm_timing
                    result['score_breakdown'] = score_breakdown
                    result['failure_category'] = 'none'
                    result['llm_used'] = llm_used
                    result['llm_parse_success'] = True
                    result['llm_failure_reason'] = ''
                    result['llm_timing'] = llm_timing
                    result['score_policy_upload_type'] = (upload_type or '').lower() or 'student'
                    result['schema_version'] = str(getattr(settings, 'EXTRACTION_SCHEMA_VERSION', 'v1'))
                    result['score_version'] = str(getattr(settings, 'EXTRACTION_SCORE_VERSION', 'v1'))
                    result['rule_version'] = str(getattr(settings, 'EXTRACTION_RULE_VERSION', 'v1'))
                    result['accepted'] = True
                    return result

                _vision_stage_result = {
                    'courses': v_validation.courses,
                    'score': v_score,
                    'validation': v_validation,
                    'meta': v_meta,
                    'attempts': v_attempts,
                }

        # ====================================================================
        # Stage 1: Score regex/OCR output
        # ====================================================================
        normalized_courses = normalize_candidates(result.get('courses', []))
        if source_file_path and not attempts:
            attempts.append('llm_vision_parse')
        validation = validate_candidates(normalized_courses)
        score = score_candidates(
            validation.courses,
            validation.errors,
            attempts,
            upload_type=upload_type,
        )

        # ====================================================================
        # Stage 2: If below retry threshold, prefer best low-confidence candidate
        # ====================================================================
        if score.confidence < retry_threshold:
            best_stage = None
            if _vision_stage_result:
                best_stage = _vision_stage_result

            if best_stage and best_stage['score'].confidence > score.confidence:
                logger.info(
                    'Stage 2: using vision stage result (%.2f) over regex (%.2f)',
                    best_stage['score'].confidence, score.confidence,
                )
                for key in ('student_number', 'semester', 'school_year'):
                    if best_stage['meta'].get(key):
                        result[key] = best_stage['meta'][key]
                validation = best_stage['validation']
                score = best_stage['score']
                attempts[:] = best_stage['attempts']
                result['extraction_method'] = attempts[-1] if attempts else 'none'
                llm_parse_success = True

        # ====================================================================
        # Finalize result
        # ====================================================================
        confidence = score.confidence
        if not validation.courses:
            # No extracted rows should never carry a mid-range confidence value.
            confidence = 0.0

        if not validation.courses:
            if llm_failure_reason == 'timeout':
                failure_category = 'timeout'
            elif llm_failure_reason == 'empty_courses':
                failure_category = 'no_text'
            elif validation.errors or llm_failure_reason in {'invalid_json', 'schema_reject'}:
                failure_category = 'parse_error'
            else:
                failure_category = 'low_confidence'
        elif confidence < retry_threshold:
            failure_category = 'low_confidence'
        elif confidence < accept_threshold:
            failure_category = 'low_confidence'
        else:
            failure_category = 'none'

        result['courses'] = validation.courses
        result['confidence'] = confidence
        result['validator_errors'] = validation.errors
        score_breakdown = dict(score.breakdown)
        if llm_timing:
            score_breakdown['llm_timing'] = llm_timing
        result['score_breakdown'] = score_breakdown
        result['failure_category'] = failure_category
        result['llm_used'] = llm_used
        result['llm_parse_success'] = llm_parse_success
        result['llm_failure_reason'] = llm_failure_reason
        result['llm_timing'] = llm_timing
        result['score_policy_upload_type'] = (upload_type or '').lower() or 'student'
        result['schema_version'] = str(getattr(settings, 'EXTRACTION_SCHEMA_VERSION', 'v1'))
        result['score_version'] = str(getattr(settings, 'EXTRACTION_SCORE_VERSION', 'v1'))
        result['rule_version'] = str(getattr(settings, 'EXTRACTION_RULE_VERSION', 'v1'))
        result['accepted'] = bool(validation.courses) and confidence >= accept_threshold
        return result
    
    def extract_schedule(self, file_path: str, upload_type: str, force_ocr_fallback: bool = False) -> Dict:
        """
        Extract schedule from a document using the optimal extraction method.
        
        Args:
            file_path: Path to the uploaded file (PDF or image)
            upload_type: Either 'student' or 'faculty'
            
        Returns:
            Dictionary containing:
            - courses: List of extracted course dictionaries
            - extraction_method: Method used ('pdf_text', 'ocr', or 'ocr_fallback')
            - confidence: Quality score (0.0 - 1.0)
            - processing_time: Time taken in seconds
            - attempts: List of methods attempted
        """
        start_time = time.time()
        file_extension = os.path.splitext(file_path)[1].lower()
        
        logger.info(f"Starting extraction for {upload_type} COR: {file_path}")
        logger.info(f"File extension: {file_extension}")

        vision_only_mode = bool(getattr(settings, 'EXTRACTION_VISION_ONLY_MODE', False))
        
        # force_ocr_fallback is used by the student ownership gate to recover
        # metadata (especially student number) when direct vision parsing does
        # not return it. In that recovery path, bypass direct-file mode.
        direct_file_parse_enabled = (
            bool(getattr(settings, 'EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED', False))
            and not force_ocr_fallback
        )
        if vision_only_mode:
            direct_file_parse_enabled = True
            if force_ocr_fallback:
                logger.info('Vision-only mode is enabled; ignoring force_ocr_fallback for %s', file_path)

        if direct_file_parse_enabled:
            # Vision-first mode: bypass OCR/pdf text extraction entirely.
            result = {
                'courses': [],
                'extraction_method': 'none',
                'confidence': 0.0,
                'semester': '',
                'school_year': '',
                'student_number': '',
                'raw_text': '',
            }
            attempts = []
        else:
            orchestrator = StagedExtractionOrchestrator(
                extract_pdf=self._extract_from_pdf,
                extract_image=self._extract_from_image,
            )
            result = orchestrator.run(
                file_path=file_path,
                upload_type=upload_type,
                force_ocr_fallback=force_ocr_fallback,
            )
            attempts = result.get('attempts', [])

        # ── Fix 5: raw_text safety net ────────────────────────────────────────
        # If the extraction path did not populate raw_text, try a direct pdfplumber
        # read so the LLM primary parser always has text to work with.
        if (
            not direct_file_parse_enabled
            and not result.get('raw_text')
            and file_path.lower().endswith('.pdf')
        ):
            try:
                import pdfplumber as _pdfplumber
                with _pdfplumber.open(file_path) as _pdf:
                    _pages_text = [
                        page.extract_text() or ''
                        for page in _pdf.pages
                    ]
                fallback_text = '\n'.join(t for t in _pages_text if t).strip()
                if fallback_text:
                    result['raw_text'] = fallback_text
                    logger.info(
                        'extract_schedule: raw_text populated via pdfplumber safety-net '
                        '(%d chars)', len(fallback_text)
                    )
            except Exception as _exc:
                logger.warning(
                    'extract_schedule: raw_text safety-net pdfplumber read failed: %s', _exc
                )

        result = self._finalize_result(
            result,
            attempts,
            upload_type,
            source_file_path=file_path,
        )

        # If direct-file vision mode produced no accepted result, recover by
        # running staged extraction (pdf_text/ocr). This avoids repeated
        # low-confidence "none" outcomes when the vision call fails closed
        # (timeout, policy gate, model cold-start, etc.).
        llm_failure_reason = str(result.get('llm_failure_reason') or '').strip()
        fallback_reasons = {'timeout', 'empty_courses', 'invalid_json', 'schema_reject'}
        fallback_on_reject = bool(
            getattr(settings, 'EXTRACTION_LLM_DIRECT_FILE_FALLBACK_ON_REJECT', True)
        )
        should_fallback_from_direct = (
            direct_file_parse_enabled
            and not vision_only_mode
            and not result.get('accepted', False)
            and fallback_on_reject
            and (
                not result.get('courses')
                or result.get('failure_category') in {'low_confidence', 'parse_error'}
                or llm_failure_reason in fallback_reasons
            )
        )
        if (
            should_fallback_from_direct
        ):
            logger.warning(
                'Direct-file vision result rejected (failure_category=%s, llm_failure_reason=%s); '
                'falling back to staged extraction (file=%s, upload_type=%s)',
                result.get('failure_category', 'none'),
                llm_failure_reason,
                file_path,
                upload_type,
            )

            orchestrator = StagedExtractionOrchestrator(
                extract_pdf=self._extract_from_pdf,
                extract_image=self._extract_from_image,
            )
            fallback_result = orchestrator.run(
                file_path=file_path,
                upload_type=upload_type,
                force_ocr_fallback=force_ocr_fallback,
            )
            fallback_attempts = fallback_result.get('attempts', [])

            # Re-score fallback output without re-running stage-0 vision again.
            result = self._finalize_result(
                fallback_result,
                fallback_attempts,
                upload_type,
                source_file_path='',
            )
            result['llm_failure_reason'] = llm_failure_reason
            attempts = fallback_attempts
            result['fallback_triggered'] = True

        # Add processing time
        processing_time = time.time() - start_time
        result['processing_time'] = round(processing_time, 3)
        result['attempts'] = attempts
        
        logger.info(f"Extraction complete: method={result['extraction_method']}, "
                   f"courses={len(result['courses'])}, confidence={result['confidence']}, "
                   f"time={result['processing_time']}s")
        
        return result
    
    def _extract_from_pdf(
        self,
        file_path: str,
        upload_type: str,
        attempts: List[str],
        force_ocr_fallback: bool = False,
    ) -> Dict:
        """
        Extract schedule from PDF file using hybrid approach.
        
        Strategy:
        1. Try PDF text extraction first
        2. Validate extraction quality
        3. If quality is poor, fallback to OCR
        
        Args:
            file_path: Path to PDF file
            upload_type: 'student' or 'faculty'
            attempts: List to track attempted methods
            
        Returns:
            Extraction result dictionary
        """
        logger.info("Attempting PDF text extraction...")
        attempts.append('pdf_text')
        
        try:
            # Try PDF text extraction
            pdf_extractor = get_pdf_extractor(upload_type)
            pdf_result = pdf_extractor.extract_from_pdf(file_path)
            if isinstance(pdf_result, dict):
                courses = pdf_result.get('courses', [])
                semester = pdf_result.get('semester', '')
                school_year = pdf_result.get('school_year', '')
                student_number = pdf_result.get('student_number', '')
                raw_text = pdf_result.get('raw_text', '')
            else:
                courses = pdf_result
                semester = ''
                school_year = ''
                student_number = ''
                raw_text = ''
            quality = calculate_quality_score(courses)
            
            logger.info(f"PDF extraction results: {len(courses)} courses, quality={quality}, "
                       f"semester={semester}, school_year={school_year}")
            
            # Check if quality meets threshold
            if not should_use_fallback(
                quality=quality,
                threshold=self.quality_threshold,
                force_ocr_fallback=force_ocr_fallback,
            ):
                logger.info(f"PDF extraction quality ({quality}) meets threshold ({self.quality_threshold})")
                return {
                    'courses': courses,
                    'extraction_method': 'pdf_text',
                    'confidence': quality,
                    'semester': semester,
                    'school_year': school_year,
                    'student_number': student_number,
                    'raw_text': raw_text,
                }
            else:
                logger.warning(f"PDF extraction quality ({quality}) below threshold ({self.quality_threshold}), "
                             f"falling back to OCR")
        
        except Exception as e:
            logger.warning(f"PDF extraction failed: {str(e)}, falling back to OCR")
        
        # Fallback to OCR
        return self._extract_with_ocr_fallback(file_path, upload_type, attempts)
    
    def _extract_from_image(self, file_path: str, upload_type: str, attempts: List[str]) -> Dict:
        """
        Extract schedule from image file using OCR.
        
        Args:
            file_path: Path to image file
            upload_type: 'student' or 'faculty'
            attempts: List to track attempted methods
            
        Returns:
            Extraction result dictionary
        """
        logger.info("Image file detected, using OCR extraction")
        attempts.append('ocr')
        
        if not OCR_AVAILABLE:
            logger.error("OCR dependencies not installed. Image extraction not available.")
            raise ImportError(
                "OCR extraction requires additional dependencies (python-doctr, torch, opencv). "
                "Please use PDF files or install OCR dependencies locally."
            )
        
        try:
            ocr_extractor = get_cor_extractor(upload_type)
            courses = ocr_extractor.extract_from_document(file_path)
            quality = calculate_quality_score(courses)
            
            logger.info(f"OCR extraction results: {len(courses)} courses, quality={quality}")
            
            return {
                'courses': courses,
                'extraction_method': 'ocr',
                'confidence': quality,
                'semester': ocr_extractor.metadata.get('semester', ''),
                'school_year': ocr_extractor.metadata.get('school_year', ''),
                'student_number': ocr_extractor.metadata.get('student_number', ''),
                'raw_text': ocr_extractor.metadata.get('raw_text', ''),
            }
        
        except Exception as e:
            logger.error(f"OCR extraction failed: {str(e)}")
            raise
    
    def _extract_with_ocr_fallback(self, file_path: str, upload_type: str, attempts: List[str]) -> Dict:
        """
        Extract using OCR as fallback method.
        
        Args:
            file_path: Path to file
            upload_type: 'student' or 'faculty'
            attempts: List to track attempted methods
            
        Returns:
            Extraction result dictionary
        """
        if not OCR_AVAILABLE:
            logger.warning("OCR dependencies not installed. OCR fallback not available. "
                         "Returning empty results from PDF extraction.")
            return {
                'courses': [],
                'extraction_method': 'pdf_text_only',
                'confidence': 0.0,
                'semester': '',
                'school_year': '',
                'student_number': '',
            }
        
        logger.info("Using OCR fallback extraction...")
        attempts.append('ocr_fallback')
        
        try:
            ocr_extractor = get_cor_extractor(upload_type)
            courses = ocr_extractor.extract_from_document(file_path)
            quality = calculate_quality_score(courses)
            
            logger.info(f"OCR fallback results: {len(courses)} courses, quality={quality}")
            
            return {
                'courses': courses,
                'extraction_method': 'ocr_fallback',
                'confidence': quality,
                'semester': ocr_extractor.metadata.get('semester', ''),
                'school_year': ocr_extractor.metadata.get('school_year', ''),
                'student_number': ocr_extractor.metadata.get('student_number', ''),
                'raw_text': ocr_extractor.metadata.get('raw_text', ''),
            }
        
        except Exception as e:
            logger.error(f"OCR fallback failed: {str(e)}")
            raise



# ---------------------------------------------------------------------------
# Async job runner — called by background threads launched from upload views
# ---------------------------------------------------------------------------

def run_extraction_job(job_id) -> None:
    """
    Execute a full extraction pipeline for the given ExtractionJob.

    Designed to run in a daemon thread launched from the upload view.
    The upload view has already:
      - Written the uploaded file to a temp path stored in job._temp_file_path
      - Created the ExtractionJob row with status='pending'

    This function:
      1. Sets status → 'processing'
      2. Runs ExtractionManager.extract_schedule() (LLM primary, regex fallback)
      3. On accepted result: writes Course rows, sets status → 'done'
      4. On rejected result: sets status → 'failed'
      5. On ANY unhandled exception: sets status → 'failed', logs full traceback
      6. After terminal state: fires push notification to user's device
      7. Always: deletes the temp file in finally block

    CRITICAL: The outer try/except must never be removed.  Without it a thread
    crash leaves the job stuck in 'processing' and the user is never notified.
    """
    import os
    import uuid as _uuid
    import traceback as _traceback

    # Local imports to avoid circular imports at module level
    from django.contrib.auth import get_user_model
    from api.models import ExtractionJob, Course, ExtractionLog, Notification, Schedule
    from api.utils.notification_service import NotificationService

    logger.info("run_extraction_job: starting job %s", job_id)

    job = None
    temp_file_path = None

    try:
        # ── 1. Load job and transition to 'processing' ──────────────────────
        try:
            job = ExtractionJob.objects.get(pk=job_id)

        except ExtractionJob.DoesNotExist:
            logger.error("run_extraction_job: job %s not found in DB", job_id)
            return

        temp_file_path = job._temp_file_path or ''
        job.status = 'processing'
        job.save(update_fields=['status', 'updated_at'])
        logger.info("run_extraction_job: job %s → processing (file=%s)", job_id, temp_file_path)

        if not temp_file_path or not os.path.exists(temp_file_path):
            raise FileNotFoundError(
                f"Temp file missing or not found: {temp_file_path!r}"
            )

        # ── 2. Run extraction ────────────────────────────────────────────────
        manager = ExtractionManager()
        result = manager.extract_schedule(temp_file_path, job.upload_type)

        courses_data = result.get('courses', [])
        accepted = result.get('accepted', False)

        if accepted and courses_data and _all_courses_missing_days(courses_data):
            raw_method = result.get('extraction_method', 'none')
            if (
                'llm_vision_parse' in result.get('attempts', [])
                or raw_method == 'llm_vision_parse'
                or 'llm_full_parse' in result.get('attempts', [])
                or raw_method == 'llm_full_parse'
                or 'llm_normalize' in result.get('attempts', [])
            ):
                failed_job_method = 'llm'
            elif raw_method and raw_method != 'none':
                failed_job_method = raw_method
            elif result.get('attempts'):
                failed_job_method = result['attempts'][-1]
            else:
                failed_job_method = 'none'

            result['failure_category'] = 'missing_day'
            job.status = 'failed'
            job.extraction_method = failed_job_method
            job.failure_category = 'missing_day'
            job.confidence = result.get('confidence')
            job.error_message = (
                'Extraction rejected: all extracted courses are missing day values. '
                'Re-upload a clearer timetable with visible day columns.'
            )
            job.llm_failure_reason = str(result.get('llm_failure_reason') or '')[:40]
            job._temp_file_path = ''
            job.save()

            logger.warning(
                "run_extraction_job: job %s -> failed (missing_day, courses=%d)",
                job_id,
                len(courses_data),
            )

            _write_extraction_log_for_job(job, result, success=False)
            _send_extraction_job_notification(job, success=False)
            return

        if accepted and courses_data:
            # ── Fix 6: Student number ownership re-check (async path) ────────
            # The sync ownership check happened before job creation. Re-verify
            # that the student number the LLM extracted still matches the
            # authenticated user before writing any Course rows.
            if job.upload_type == 'student':
                extracted_sn = _normalize_student_number(result.get('student_number', ''))
                user_sn = _normalize_student_number(getattr(job.user, 'student_number', ''))
                if user_sn and not extracted_sn:
                    logger.warning(
                        "run_extraction_job: student number missing for student job %s. Failing ownership gate.",
                        job_id,
                    )
                    job.status = 'failed'
                    job.failure_category = 'metadata_mismatch'
                    job.error_message = (
                        "Unable to verify ownership because student number could not be extracted."
                    )
                    job.confidence = result.get('confidence')
                    job.llm_failure_reason = str(result.get('llm_failure_reason') or '')[:40]
                    job._temp_file_path = ''
                    job.save()
                    _write_extraction_log_for_job(job, result, success=False)
                    _send_extraction_job_notification(job, success=False)
                    return

                if extracted_sn and user_sn and extracted_sn != user_sn:
                    logger.warning(
                        "run_extraction_job: student number mismatch — "
                        "extracted=%r, user=%r, job=%s. Failing job.",
                        extracted_sn, user_sn, job_id,
                    )
                    job.status = 'failed'
                    job.failure_category = 'ownership_mismatch'
                    job.error_message = (
                        f"Extracted student number ({extracted_sn}) does not match "
                        f"the authenticated user ({user_sn})."
                    )
                    job.confidence = result.get('confidence')
                    job.llm_failure_reason = str(result.get('llm_failure_reason') or '')[:40]
                    job._temp_file_path = ''
                    job.save()
                    _write_extraction_log_for_job(job, result, success=False)
                    _send_extraction_job_notification(job, success=False)
                    return

            # ── 3a. Success: write Course rows ───────────────────────────────
            from django.db import transaction
            
            # Determine extraction_method EARLY (before transaction) so we always have it
            raw_method = result.get('extraction_method', 'none')
            if (
                'llm_vision_parse' in result.get('attempts', [])
                or raw_method == 'llm_vision_parse'
                or 'llm_full_parse' in result.get('attempts', [])
                or raw_method == 'llm_full_parse'
                or 'llm_normalize' in result.get('attempts', [])
            ):
                job_method = 'llm'
            else:
                job_method = 'regex_fallback' if 'ocr_fallback' in result.get('attempts', []) else 'none'
            
            # Write schedule + courses with error tracking
            written_count = 0
            try:
                with transaction.atomic():
                    semester = str(result.get('semester') or '').strip()
                    school_year = str(result.get('school_year') or '').strip()
                    title_parts = [job.upload_type.title(), 'Schedule']
                    if semester:
                        title_parts.append(semester)
                    if school_year:
                        title_parts.append(school_year)
                    created_stamp = timezone.localtime(timezone.now()).strftime('%Y-%m-%d %H:%M')
                    auto_title = f"{' '.join(title_parts)} ({created_stamp})"

                    saved_schedule = Schedule.objects.create(
                        user=job.user,
                        title=auto_title,
                        upload_type=job.upload_type,
                        semester=semester,
                        school_year=school_year,
                        is_active=False,
                    )

                    for course_dict in courses_data:
                        Course.objects.create(
                            user=job.user,
                            schedule=saved_schedule,
                            subject_code=course_dict.get('subject_code', ''),
                            subject_name=course_dict.get('subject_name', ''),
                            start_time=course_dict.get('start_time', ''),
                            end_time=course_dict.get('end_time', ''),
                            day=course_dict.get('day', ''),
                            location=course_dict.get('location', ''),
                            source_type=job.upload_type,
                        )
                        written_count += 1
                
                logger.info(
                    "run_extraction_job: wrote %d courses for job %s into schedule %s (method=%s)",
                    written_count, job_id, saved_schedule.id, job_method
                )
            except Exception as course_write_error:
                logger.error(
                    "run_extraction_job: CRITICAL - failed to write %d courses for job %s: %s",
                    len(courses_data), job_id, str(course_write_error),
                    exc_info=True
                )
                # Still fail the job but preserve the error context
                job.status = 'failed'
                job.extraction_method = job_method
                job.courses = []  # Clear courses since they weren't written
                job.confidence = result.get('confidence')
                job.failure_category = 'system_error'
                job.error_message = f"Extracted {len(courses_data)} courses but database write failed: {str(course_write_error)[:500]}"
                job.llm_failure_reason = ''
                job._temp_file_path = ''
                job.save()
                
                _write_extraction_log_for_job(job, result, success=False)
                _send_extraction_job_notification(job, success=False)
                return

            job.status = 'done'
            job.extraction_method = job_method
            job.courses = courses_data
            job.student_number = _normalize_student_number(result.get('student_number', ''))
            job.semester = result.get('semester', '')
            job.school_year = result.get('school_year', '')
            job.confidence = result.get('confidence')
            job.failure_category = 'none'
            job.llm_failure_reason = ''
            job._temp_file_path = ''
            job.save()

            logger.info(
                "run_extraction_job: job %s → done (%d courses written, confidence=%.2f, method=%s)",
                job_id, written_count, result.get('confidence', 0.0), job_method,
            )

            # Keep faculty/student auto-links in sync after async schedule persistence.
            try:
                sync_auto_enrollments_for_user(job.user)
            except Exception:
                logger.exception(
                    "run_extraction_job: auto-link sync failed for user %s (job=%s)",
                    job.user.id,
                    job_id,
                )

            # ── Telemetry ────────────────────────────────────────────────────
            _write_extraction_log_for_job(job, result, success=True)

            # ── Push notification ────────────────────────────────────────────
            _send_extraction_job_notification(job, success=True)

        else:
            # ── 3b. Rejected by quality gate ─────────────────────────────────
            failure_reason = result.get('failure_category', 'low_confidence') or 'low_confidence'
            raw_method = result.get('extraction_method', 'none')
            if (
                'llm_vision_parse' in result.get('attempts', [])
                or raw_method == 'llm_vision_parse'
                or 'llm_full_parse' in result.get('attempts', [])
                or raw_method == 'llm_full_parse'
                or 'llm_normalize' in result.get('attempts', [])
            ):
                failed_job_method = 'llm'
            elif raw_method and raw_method != 'none':
                failed_job_method = raw_method
            elif result.get('attempts'):
                failed_job_method = result['attempts'][-1]
            else:
                failed_job_method = 'none'

            job.status = 'failed'
            job.extraction_method = failed_job_method
            job.failure_category = failure_reason
            job.confidence = result.get('confidence')
            job.error_message = (
                f"Extraction rejected by quality gate: "
                f"confidence={result.get('confidence', 0.0):.2f}, "
                f"courses={len(courses_data)}, "
                f"accepted={accepted}"
            )
            job.llm_failure_reason = str(result.get('llm_failure_reason') or '')[:40]
            job._temp_file_path = ''
            job.save()

            logger.warning(
                "run_extraction_job: job %s → failed (%s, confidence=%.2f)",
                job_id, failure_reason, result.get('confidence', 0.0),
            )

            _write_extraction_log_for_job(job, result, success=False)
            _send_extraction_job_notification(job, success=False)

    except Exception:
        # ── CRITICAL SAFETY NET ──────────────────────────────────────────────
        # Any unhandled exception must NOT leave the job stuck in 'processing'.
        tb = _traceback.format_exc()
        logger.exception("run_extraction_job: unhandled exception in job %s", job_id)

        if job is not None:
            try:
                job.status = 'failed'
                job.failure_category = 'system_error'
                job.error_message = tb[:4000]
                job.llm_failure_reason = ''
                job._temp_file_path = ''
                job.save()
                _send_extraction_job_notification(job, success=False)
            except Exception:
                logger.exception(
                    "run_extraction_job: ALSO failed to save failure state for job %s", job_id
                )

    finally:
        # ── Temp file cleanup ────────────────────────────────────────────────
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                logger.info("run_extraction_job: cleaned up temp file %s", temp_file_path)
            except OSError:
                logger.warning(
                    "run_extraction_job: could not delete temp file %s", temp_file_path
                )


# ---------------------------------------------------------------------------
# Internal helpers for run_extraction_job
# ---------------------------------------------------------------------------

def _write_extraction_log_for_job(job, result: dict, *, success: bool) -> None:
    """Write an ExtractionLog record for a completed async job."""
    from api.models import ExtractionLog

    try:
        ExtractionLog.objects.create(
            user=job.user,
            file_name=job.file_name or 'unknown',
            file_type=(job.file_name.rsplit('.', 1)[-1].lower() if '.' in (job.file_name or '') else 'unknown'),
            upload_type=job.upload_type,
            extraction_method=result.get('extraction_method', 'none'),
            confidence=result.get('confidence', 0.0) or 0.0,
            courses_extracted=len(result.get('courses', [])) if success else 0,
            success=success,
            error_message=(job.error_message or '')[:2000],
            processing_time=result.get('processing_time', 0.0) or 0.0,
            attempts=result.get('attempts', []),
            failure_category=result.get('failure_category', 'none') or 'none',
            validator_errors=result.get('validator_errors', []),
            score_breakdown=result.get('score_breakdown', {}),
            llm_used=result.get('llm_used', False),
            llm_parse_success=result.get('llm_parse_success', False),
            llm_failure_reason=str(result.get('llm_failure_reason') or '')[:40],
            raw_text_preview='',  # Not exposed for async path (text not stored in job)
        )
    except Exception:
        logger.exception("_write_extraction_log_for_job: failed to write ExtractionLog for job %s", job.job_id)


def _send_extraction_job_notification(job, *, success: bool) -> None:
    """
    Fire a push notification and create a Notification DB record for a completed job.
    Silently swallows errors so a push failure never breaks the job runner.
    """
    from api.models import Notification
    from api.utils.notification_service import NotificationService

    try:
        if success:
            title = "Schedule Ready"
            body = "Your schedule has been extracted and saved!"
            notif_type = 'general'
        else:
            title = "Extraction Failed"
            body = "We couldn't read your schedule — please try re-uploading."
            notif_type = 'general'

        data_payload = {
            "type": "extraction_job",
            "job_id": str(job.job_id),
            "status": job.status,
        }

        # Persist in-app notification
        Notification.objects.create(
            user=job.user,
            notification_type=notif_type,
            title=title,
            message=body,
            data=data_payload,
        )

        # Fire push if the user has a token
        token = getattr(job.user, 'expo_push_token', None)
        if token:
            service = NotificationService()
            service.send_push_notification(
                token=token,
                title=title,
                body=body,
                data=data_payload,
            )

    except Exception:
        logger.exception(
            "_send_extraction_job_notification: failed to notify user for job %s", job.job_id
        )


def recover_stale_processing_jobs(
    *,
    max_age_minutes: int = 5,
    notify_user: bool = True,
    dry_run: bool = False,
) -> int:
    """
    Mark stale extraction jobs as failed.

    A stale job is any ExtractionJob still in `processing` status whose
    `updated_at` is older than max_age_minutes.

    Returns:
        Number of stale jobs found (dry_run) or recovered (non-dry_run).
    """
    from api.models import ExtractionJob

    cutoff = timezone.now() - timedelta(minutes=max_age_minutes)
    stale_jobs = list(
        ExtractionJob.objects.select_related('user').filter(
            status='processing',
            updated_at__lt=cutoff,
        )
    )

    if not stale_jobs:
        return 0

    if dry_run:
        logger.info(
            "recover_stale_processing_jobs: found %d stale jobs older than %d minutes",
            len(stale_jobs),
            max_age_minutes,
        )
        return len(stale_jobs)

    recovered = 0
    for job in stale_jobs:
        temp_path = (job._temp_file_path or '').strip()
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
                logger.info(
                    "recover_stale_processing_jobs: deleted stale temp file %s for job %s",
                    temp_path,
                    job.job_id,
                )
            except OSError:
                logger.warning(
                    "recover_stale_processing_jobs: failed to delete stale temp file %s for job %s",
                    temp_path,
                    job.job_id,
                )

        job.status = 'failed'
        job.failure_category = 'system_error'
        job.error_message = (
            "Job marked as failed by stale-job recovery after server restart "
            f"(older than {max_age_minutes} minutes in processing state)."
        )
        job._temp_file_path = ''
        job.save(update_fields=[
            'status',
            'failure_category',
            'error_message',
            '_temp_file_path',
            'updated_at',
        ])

        if notify_user:
            _send_extraction_job_notification(job, success=False)

        recovered += 1

    logger.warning(
        "recover_stale_processing_jobs: recovered %d stale jobs older than %d minutes",
        recovered,
        max_age_minutes,
    )
    return recovered


# ---------------------------------------------------------------------------
# Convenience function for quick synchronous extraction (unchanged)
# ---------------------------------------------------------------------------

def extract_schedule_from_file(file_path: str, upload_type: str = 'student') -> Dict:
    """
    Convenience function to extract schedule from a file synchronously.

    Args:
        file_path: Path to the COR file (PDF or image)
        upload_type: Either 'student' or 'faculty' (default: 'student')

    Returns:
        Extraction result dictionary
    """
    manager = ExtractionManager()
    return manager.extract_schedule(file_path, upload_type)

