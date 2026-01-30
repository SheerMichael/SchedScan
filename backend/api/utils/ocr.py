"""
OCR Utility for extracting course information from Certificate of Registration (COR) documents.

This module provides a hybrid approach:
1. For PDFs: Uses pdfplumber text extraction (fast and accurate for digital PDFs)
2. For Images: Uses pytesseract OCR with line-based text extraction

Provides separate extractors for Student and Faculty COR documents.
"""

import re
from typing import List, Dict, Optional
import logging
from abc import ABC, abstractmethod

# PDF text extraction
import pdfplumber

# Image OCR (optional - for scanned documents)
try:
    import pytesseract
    from PIL import Image
    from pdf2image import convert_from_path
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False

logger = logging.getLogger(__name__)


# Day code expansion mapping - splits multi-day codes into individual days
DAY_CODE_EXPANSION = {
    # Single days remain as-is
    'M': ['M'],
    'T': ['T'],
    'W': ['W'],
    'TH': ['TH'],
    'F': ['F'],
    'S': ['S'],
    'SU': ['SU'],
    'SUN': ['SUN'],
    # Two-day combinations
    'TF': ['T', 'F'],
    'MW': ['M', 'W'],
    'MTH': ['M', 'TH'],
    'TTH': ['T', 'TH'],
    'WS': ['W', 'S'],
    # Three-day combinations
    'MWF': ['M', 'W', 'F'],
    # Four-day combinations
    'MTWTH': ['M', 'T', 'W', 'TH'],
    # Five-day combinations
    'MTWTHF': ['M', 'T', 'W', 'TH', 'F'],
}


def expand_day_code(day_code: str) -> List[str]:
    """
    Expand a combined day code into individual day codes.
    
    Args:
        day_code: Day code like 'MTH', 'TF', 'MWF', etc.
        
    Returns:
        List of individual day codes like ['M', 'TH'] or ['T', 'F']
    """
    day_code = day_code.upper().strip()
    return DAY_CODE_EXPANSION.get(day_code, [day_code])


def split_course_by_days(course: Dict) -> List[Dict]:
    """
    Split a course with a multi-day code into separate course entries.
    Each day gets its own course entry with the same time.
    
    Args:
        course: Course dictionary with 'day' field that may contain multi-day code
        
    Returns:
        List of course dictionaries, one per day
    """
    day_code = course.get('day', '')
    days = expand_day_code(day_code)
    
    if len(days) <= 1:
        # Single day or no day - return as-is
        return [course]
    
    # Create separate course entries for each day
    split_courses = []
    for day in days:
        new_course = course.copy()
        new_course['day'] = day
        split_courses.append(new_course)
    
    logger.info(f"Split course {course.get('subject_code')} from day '{day_code}' into {len(split_courses)} separate entries: {days}")
    return split_courses


class BaseCORExtractor(ABC):
    """
    Base class for extracting course information from Certificate of Registration (COR) documents.
    Supports both PDF and image formats.
    """
    
    # Regex patterns for WMSU COR format
    # Schedule ID: 3-4 letters + 5-6 digits + optional letter (e.g., BSCS222285, BPE122026P)
    SCHEDULE_ID_PATTERN = re.compile(r'([A-Z]{3,4}\d{5,6}[A-Z]?)')
    
    # Subject Code: 2-7 letters + optional space + 1-3 digits (e.g., CC 102, MATH 103, PATHFIT 2)
    SUBJECT_CODE_PATTERN = re.compile(r'([A-Z]{2,7})\s*(\d{1,3})?')
    
    # Time patterns
    TIME_PATTERN = re.compile(r'(\d{1,2}:\d{2}[AP]M)', re.IGNORECASE)
    TIME_RANGE_PATTERN = re.compile(r'(\d{1,2}:\d{2}[AP]M)\s*-\s*(\d{1,2}:\d{2}[AP]M)', re.IGNORECASE)
    
    # Day pattern
    DAY_PATTERN = re.compile(r'\b(SUN|SU|M|T|W|TH|F|S|TF|MW|MWF|MTH|TTH|WS|MTWTH|MTWTHF)\b', re.IGNORECASE)
    
    # Location pattern
    LOCATION_PATTERN = re.compile(
        r'\b(LR\s*\d+|LAB\s*\d*|CLA|CSM\s*\w*|COM\s*\d*|GYM|FIELD|EUTH\s*RM|WMSU)\b', 
        re.IGNORECASE
    )

    def __init__(self, dpi: int = 300):
        """
        Initialize the CORExtractor.
        
        Args:
            dpi: DPI for PDF to image conversion (used for scanned PDFs)
        """
        self.dpi = dpi
        logger.info(f"Initialized {self.__class__.__name__}")

    def extract_from_document(self, file_path: str) -> List[Dict]:
        """
        Extract course information from a document (PDF or image).
        
        For PDFs: Uses pdfplumber text extraction
        For Images: Uses pytesseract OCR
        
        Args:
            file_path: Path to the document file
            
        Returns:
            List of dictionaries containing course information
        """
        try:
            if file_path.lower().endswith('.pdf'):
                return self._extract_from_pdf(file_path)
            else:
                return self._extract_from_image(file_path)
        
        except Exception as e:
            logger.error(f"Error extracting from document: {str(e)}")
            raise

    def _extract_from_pdf(self, file_path: str) -> List[Dict]:
        """
        Extract courses from PDF using pdfplumber.
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            List of course dictionaries
        """
        logger.info(f"Extracting from PDF: {file_path}")
        
        all_text = ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    all_text += text + "\n"
        
        if not all_text.strip():
            logger.warning("No text extracted from PDF, trying OCR fallback...")
            if PYTESSERACT_AVAILABLE:
                return self._extract_from_pdf_with_ocr(file_path)
            else:
                logger.error("Pytesseract not available for OCR fallback")
                return []
        
        return self._parse_text(all_text)

    def _extract_from_pdf_with_ocr(self, file_path: str) -> List[Dict]:
        """
        Extract from PDF using OCR (for scanned documents).
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            List of course dictionaries
        """
        logger.info("Using OCR for scanned PDF...")
        images = convert_from_path(file_path, dpi=self.dpi)
        
        all_text = ""
        for i, image in enumerate(images):
            text = pytesseract.image_to_string(image)
            all_text += text + "\n"
        
        return self._parse_text(all_text)

    def _extract_from_image(self, file_path: str) -> List[Dict]:
        """
        Extract courses from image using pytesseract.
        
        Args:
            file_path: Path to image file
            
        Returns:
            List of course dictionaries
        """
        if not PYTESSERACT_AVAILABLE:
            raise ImportError("pytesseract is required for image OCR")
        
        logger.info(f"Extracting from image: {file_path}")
        image = Image.open(file_path)
        text = pytesseract.image_to_string(image)
        
        return self._parse_text(text)

    @abstractmethod
    def _parse_text(self, text: str) -> List[Dict]:
        """
        Parse extracted text into course dictionaries.
        Must be implemented by subclasses.
        
        Args:
            text: Full text extracted from document
            
        Returns:
            List of course dictionaries
        """
        pass


class StudentCORExtractor(BaseCORExtractor):
    """
    Extractor for Student Certificate of Registration documents from WMSU.
    Uses line-based parsing to extract course schedules.
    
    WMSU COR Format:
    BSCS222285 CC 102 3.00 0.00 COMPUTER PROGRAMMING 2 02:30PM-04:00PM TF LR 3
    """

    def _parse_text(self, text: str) -> List[Dict]:
        """
        Parse extracted text into course dictionaries.
        
        Args:
            text: Full text extracted from document
            
        Returns:
            List of course dictionaries
        """
        courses = []
        lines = text.split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            course = self._parse_line(line)
            if course:
                # Split multi-day courses
                split_courses = split_course_by_days(course)
                courses.extend(split_courses)
        
        logger.info(f"Extracted {len(courses)} courses from Student COR (after day splitting)")
        return courses

    def _parse_line(self, line: str) -> Optional[Dict]:
        """
        Parse a single line to extract course information.
        
        WMSU format: SCHEDULE_ID SUBJECT_CODE UNITS SUBJECT_NAME TIME DAY LOCATION
        Example: BSCS222285 CC 102 3.00 0.00 COMPUTER PROGRAMMING 2 02:30PM-04:00PM TF LR 3
        
        Args:
            line: Single line of text
            
        Returns:
            Course dictionary or None if not a valid course line
        """
        # Check for schedule ID (required indicator of course line)
        schedule_match = self.SCHEDULE_ID_PATTERN.search(line)
        if not schedule_match:
            return None
        
        # Check for time range (required for valid schedule)
        time_match = self.TIME_RANGE_PATTERN.search(line)
        if not time_match:
            return None
        
        # Extract schedule ID and get text after it
        schedule_id = schedule_match.group(1)
        after_schedule = line[schedule_match.end():].strip()
        
        # Extract subject code (first matching pattern after schedule ID)
        subj_match = self.SUBJECT_CODE_PATTERN.match(after_schedule)
        if not subj_match:
            return None
        
        subj_letters = subj_match.group(1)
        subj_num = subj_match.group(2) or ''
        subject_code = f"{subj_letters} {subj_num}".strip() if subj_num else subj_letters
        
        # Extract times
        start_time = time_match.group(1).upper()
        end_time = time_match.group(2).upper()
        
        # Extract day (look after time)
        after_time = line[time_match.end():].strip()
        day_match = self.DAY_PATTERN.search(after_time)
        day = day_match.group(1).upper() if day_match else ''
        
        # Extract location
        location_match = self.LOCATION_PATTERN.search(after_time)
        location = re.sub(r'\s+', '', location_match.group(1).upper()) if location_match else ''
        
        # Extract subject name (between units and time)
        # Find units pattern: X.XX X.XX (e.g., 3.00 0.00)
        units_pattern = re.compile(r'[\d.]+\s+[\d.]+\s+')
        units_match = units_pattern.search(after_schedule)
        
        subject_name = ''
        if units_match:
            # Subject name is between units and time
            after_units = after_schedule[units_match.end():]
            time_in_after = self.TIME_RANGE_PATTERN.search(after_units)
            if time_in_after:
                subject_name = after_units[:time_in_after.start()].strip()
        
        # Validate minimum required fields
        if not subject_code or not start_time or not end_time or not day:
            return None
        
        return {
            'subject_code': subject_code.upper(),
            'subject_name': subject_name,
            'start_time': start_time,
            'end_time': end_time,
            'day': day,
            'location': location
        }


class FacultyCORExtractor(BaseCORExtractor):
    """
    Extractor for Faculty Certificate of Registration documents.
    
    Note: This is a placeholder implementation.
    """
    
    def _parse_text(self, text: str) -> List[Dict]:
        """Parse faculty COR text."""
        logger.warning("Faculty COR extraction not yet implemented")
        return []


# Factory function to get the appropriate extractor
def get_cor_extractor(upload_type: str) -> BaseCORExtractor:
    """
    Factory function to return the appropriate COR extractor based on upload type.
    
    Args:
        upload_type: Either 'student' or 'faculty'
        
    Returns:
        Appropriate CORExtractor subclass instance
        
    Raises:
        ValueError: If upload_type is not 'student' or 'faculty'
    """
    if upload_type.lower() == 'student':
        return StudentCORExtractor()
    elif upload_type.lower() == 'faculty':
        return FacultyCORExtractor()
    else:
        raise ValueError(f"Invalid upload type: {upload_type}. Must be 'student' or 'faculty'")


# Maintain backward compatibility
CORExtractor = StudentCORExtractor
