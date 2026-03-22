"""
Extraction Manager for orchestrating schedule extraction from COR documents.

This module provides a hybrid approach that:
1. Tries fast PDF text extraction first (for digital PDFs)
2. Falls back to OCR extraction if PDF extraction quality is poor
3. Uses OCR directly for image files

This ensures optimal performance while maintaining robustness.
"""

import os
import time
import logging
from typing import Dict, List
from django.conf import settings
from .pdf_extractor import get_pdf_extractor, calculate_quality_score
from .extraction import (
    normalize_candidates,
    score_candidates,
    StagedExtractionOrchestrator,
    validate_candidates,
)
from .extraction.fallbacks import should_use_fallback
from .extraction.llm_normalizer import normalize_with_llm

# Try to import OCR module - uses pytesseract (lightweight)
try:
    from .ocr import get_cor_extractor
    OCR_AVAILABLE = True
except ImportError as e:
    OCR_AVAILABLE = False
    import logging
    logging.getLogger(__name__).warning(f"OCR not available: {e}")

logger = logging.getLogger(__name__)


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

    def _finalize_result(self, result: Dict, attempts: List[str], upload_type: str) -> Dict:
        normalized_courses = normalize_candidates(result.get('courses', []))
        validation = validate_candidates(normalized_courses)
        score = score_candidates(
            validation.courses,
            validation.errors,
            attempts,
            upload_type=upload_type,
        )
        llm_used = False
        llm_parse_success = False

        accept_threshold = self._accept_threshold(upload_type)
        retry_threshold = self._retry_threshold(upload_type)

        if retry_threshold <= score.confidence < accept_threshold:
            llm_courses, llm_meta = normalize_with_llm(
                extracted_text=str(result.get('raw_text', '')),
                seed_courses=validation.courses,
            )
            llm_used = bool(llm_meta.get('llm_used', False))
            llm_parse_success = bool(llm_meta.get('llm_parse_success', False))
            if llm_parse_success:
                llm_attempts = attempts + ['llm_normalize']
                validation = validate_candidates(normalize_candidates(llm_courses))
                score = score_candidates(
                    validation.courses,
                    validation.errors,
                    llm_attempts,
                    upload_type=upload_type,
                )
                attempts[:] = llm_attempts

        confidence = score.confidence
        if validation.errors:
            failure_category = 'parse_error'
        elif confidence < retry_threshold:
            failure_category = 'low_confidence'
        elif confidence < accept_threshold:
            failure_category = 'low_confidence'
        else:
            failure_category = 'none'

        result['courses'] = validation.courses
        result['confidence'] = confidence
        result['validator_errors'] = validation.errors
        result['score_breakdown'] = score.breakdown
        result['failure_category'] = failure_category
        result['llm_used'] = llm_used
        result['llm_parse_success'] = llm_parse_success
        result['score_policy_upload_type'] = (upload_type or '').lower() or 'student'
        result['schema_version'] = str(getattr(settings, 'EXTRACTION_SCHEMA_VERSION', 'v1'))
        result['score_version'] = str(getattr(settings, 'EXTRACTION_SCORE_VERSION', 'v1'))
        result['rule_version'] = str(getattr(settings, 'EXTRACTION_RULE_VERSION', 'v1'))
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

        result = self._finalize_result(result, attempts, upload_type)

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


# Convenience function for quick extraction
def extract_schedule_from_file(file_path: str, upload_type: str = 'student') -> Dict:
    """
    Convenience function to extract schedule from a file.
    
    Args:
        file_path: Path to the COR file (PDF or image)
        upload_type: Either 'student' or 'faculty' (default: 'student')
        
    Returns:
        Extraction result dictionary
    """
    manager = ExtractionManager()
    return manager.extract_schedule(file_path, upload_type)
