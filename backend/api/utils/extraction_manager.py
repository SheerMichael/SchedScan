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
from .pdf_extractor import get_pdf_extractor, calculate_quality_score

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
    
    def extract_schedule(self, file_path: str, upload_type: str) -> Dict:
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
        attempts = []
        
        logger.info(f"Starting extraction for {upload_type} COR: {file_path}")
        logger.info(f"File extension: {file_extension}")
        
        # Determine extraction strategy based on file type
        if file_extension == '.pdf':
            result = self._extract_from_pdf(file_path, upload_type, attempts)
        else:
            # Image files (.jpg, .jpeg, .png) - use OCR directly
            result = self._extract_from_image(file_path, upload_type, attempts)
        
        # Add processing time
        processing_time = time.time() - start_time
        result['processing_time'] = round(processing_time, 3)
        result['attempts'] = attempts
        
        logger.info(f"Extraction complete: method={result['extraction_method']}, "
                   f"courses={len(result['courses'])}, confidence={result['confidence']}, "
                   f"time={result['processing_time']}s")
        
        return result
    
    def _extract_from_pdf(self, file_path: str, upload_type: str, attempts: List[str]) -> Dict:
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
            courses = pdf_result['courses']
            semester = pdf_result.get('semester', '')
            school_year = pdf_result.get('school_year', '')
            quality = calculate_quality_score(courses)
            
            logger.info(f"PDF extraction results: {len(courses)} courses, quality={quality}, "
                       f"semester={semester}, school_year={school_year}")
            
            # Check if quality meets threshold
            if quality >= self.quality_threshold:
                logger.info(f"PDF extraction quality ({quality}) meets threshold ({self.quality_threshold})")
                return {
                    'courses': courses,
                    'extraction_method': 'pdf_text',
                    'confidence': quality,
                    'semester': semester,
                    'school_year': school_year,
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
