"""
OCR Utility for extracting course information from Certificate of Registration (COR) documents.

This module provides a hybrid approach:
1. For PDFs: Uses pdfplumber text extraction (fast and accurate for digital PDFs)
2. For Images: Uses pytesseract OCR with line-based text extraction

Provides separate extractors for Student and Faculty COR documents.
"""

import os
import re
from typing import List, Dict, Optional
import logging
from abc import ABC, abstractmethod

# PDF text extraction
import pdfplumber
import shutil

# Image OCR (optional - for scanned documents)
try:
    import pytesseract
    from PIL import Image
    from pdf2image import convert_from_path
    PYTESSERACT_AVAILABLE = True
    
    # Auto-detect tesseract path - check common locations
    tesseract_paths = [
        '/usr/bin/tesseract',
        '/usr/local/bin/tesseract',
        '/app/.apt/usr/bin/tesseract',  # DigitalOcean App Platform with Aptfile
        '/heroku/vendor/tesseract/bin/tesseract',  # Heroku
    ]
    
    # Try to find tesseract using shutil.which first
    tesseract_cmd = shutil.which('tesseract')
    
    if not tesseract_cmd:
        # Fall back to checking common paths
        for path in tesseract_paths:
            if os.path.isfile(path):
                tesseract_cmd = path
                break
    
    if tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        logging.getLogger(__name__).info(f"Tesseract found at: {tesseract_cmd}")
    else:
        logging.getLogger(__name__).warning("Tesseract not found in common paths")
        
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
    'FS': ['F', 'S'],
    'THS': ['TH', 'S'],
    # Three-day combinations
    'MWF': ['M', 'W', 'F'],
    'MFS': ['M', 'F', 'S'],
    'WFS': ['W', 'F', 'S'],
    'TFS': ['T', 'F', 'S'],
    'TTHS': ['T', 'TH', 'S'],   # Tue + Thu + Sat (seen on WMSU SUMMER COR)
    'MTHS': ['M', 'TH', 'S'],
    'MTTHS': ['M', 'T', 'TH', 'S'],
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
    DAY_PATTERN = re.compile(
        r'\b(SUN|SU|MTWTHF|MTWTH|MTTHS|TTHS|MWF|MFS|WFS|TFS|THS|FS|TTH|TF|MW|MTH|WS|M|T|W|TH|F|S)\b',
        re.IGNORECASE
    )
    
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
        # Metadata extracted during processing
        self.metadata = {'semester': '', 'school_year': '', 'student_number': '', 'raw_text': ''}
        logger.info(f"Initialized {self.__class__.__name__}")
    
    # Pattern for extracting semester and school year
    # Matches: "1ST 2025-2026", "2ND 2022-2023", "SUMMER 2024-2025"
    SCHOOL_YEAR_PATTERN = re.compile(
        r'(1ST|2ND|SUMMER)\s+(\d{4}\s*-\s*\d{4})',
        re.IGNORECASE
    )
    
    # Pattern for extracting student number from COR header.
    # Two variants to handle both same-line and next-line layouts:
    #   Same-line:  "Student number 2022-01191"  (common in handwritten/OCR docs)
    #   Next-line:  "Student Number\n... 2022-01191"  (digital COR format)
    # Also tolerates OCR noise in the label (e.g. "Stuoent", "5tudent").
    STUDENT_NUMBER_SAME_LINE_PATTERN = re.compile(
        r'Stu[a-z]?[do][a-z]?[e3]?n[a-z]?[t]?\s+[nN][u][m][bB][e3][r]\s+(\d{4}[\-–]\d{4,6})',
        re.IGNORECASE
    )
    STUDENT_NUMBER_NEXT_LINE_PATTERN = re.compile(
        r'Stu[a-z]?[do][a-z]?[e3]?n[a-z]?[t]?\s+[nN][u][m][bB][e3][r]\s*[\n\r].*?(\d{4}[\-–]\d{4,6})',
        re.MULTILINE | re.IGNORECASE | re.DOTALL
    )
    # Kept for backward-compatibility (used by subclass checks if any)
    STUDENT_NUMBER_PATTERN = STUDENT_NUMBER_SAME_LINE_PATTERN
    
    def _extract_school_year_from_text(self, text: str) -> Dict:
        """
        Extract semester, school year, and student number from COR text.

        Handles:
        - Same-line format: "Student number 2022-01191"
        - Next-line format: "Student Number\\n... 2022-01191" (digital COR)
        - OCR noise in label characters
        - Falls back to any YYYY-NNNNN near the word 'number'
        
        Args:
            text: Full text extracted from document
            
        Returns:
            Dictionary with 'semester', 'school_year', and 'student_number' keys
        """
        metadata = {'semester': '', 'school_year': '', 'student_number': ''}
        
        # Search within the first portion of the text (header area)
        header_text = text[:1000] if len(text) > 1000 else text
        
        match = self.SCHOOL_YEAR_PATTERN.search(header_text)
        if match:
            metadata['semester'] = match.group(1).upper()
            metadata['school_year'] = match.group(2).replace(' ', '')
            logger.info(f"OCR found semester: {metadata['semester']}, "
                       f"school_year: {metadata['school_year']}")

        # --- Student number extraction (smart, context-aware) ---
        student_number = ''

        # Strategy 1: same-line — "Student number 2022-01191"
        sn_match = self.STUDENT_NUMBER_SAME_LINE_PATTERN.search(header_text)
        if sn_match:
            student_number = sn_match.group(1).replace('–', '-')
            logger.info(f"OCR found student number (same-line): {student_number}")

        # Strategy 2: next-line — "Student Number\n... 2022-01191"
        if not student_number:
            sn_match = self.STUDENT_NUMBER_NEXT_LINE_PATTERN.search(header_text)
            if sn_match:
                student_number = sn_match.group(1).replace('–', '-')
                logger.info(f"OCR found student number (next-line): {student_number}")

        # Strategy 3: context-aware fallback — find any YYYY-NNNNN near the word 'number'
        if not student_number:
            sn_fallback = re.search(
                r'(?:number|num|no\.?)[^\n]{0,40}?(\d{4}[\-–]\d{4,6})',
                header_text,
                re.IGNORECASE,
            )
            if sn_fallback:
                student_number = sn_fallback.group(1).replace('–', '-')
                logger.info(f"OCR found student number (context fallback): {student_number}")

        # Strategy 4: last resort — any YYYY-NNNNN in the header that isn't a year range
        if not student_number:
            for candidate in re.findall(r'(\d{4}[\-–]\d{4,6})', header_text):
                candidate = candidate.replace('–', '-')
                # Exclude school-year ranges like "2024-2025"
                parts = candidate.split('-')
                if len(parts) == 2 and len(parts[1]) <= 4 and parts[1].isdigit() and int(parts[1]) > 2000:
                    continue  # looks like a year range, skip
                student_number = candidate
                logger.info(f"OCR found student number (last-resort): {student_number}")
                break

        if student_number:
            metadata['student_number'] = student_number
        else:
            logger.warning("OCR could not extract student number from header text")
        
        return metadata

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
        Also extracts school year metadata and stores it in self.metadata.
        
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
        
        # Extract school year metadata from text
        self.metadata = self._extract_school_year_from_text(all_text)
        self.metadata['raw_text'] = all_text
        
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
        # Use 200 DPI - balance between speed and quality
        images = convert_from_path(file_path, dpi=200)
        
        all_text = ""
        for i, image in enumerate(images):
            text = pytesseract.image_to_string(image)
            all_text += text + "\n"
        self.metadata['raw_text'] = all_text
        
        return self._parse_text(all_text)

    def _optimize_image_for_ocr(self, image: Image.Image) -> Image.Image:
        """
        Optimize image for OCR - only resize extremely large images.
        
        Args:
            image: PIL Image object
            
        Returns:
            Optimized PIL Image
        """
        width, height = image.size
        max_dimension = 4000  # Only resize very large images to prevent memory issues
        
        if width > max_dimension or height > max_dimension:
            ratio = min(max_dimension / width, max_dimension / height)
            new_size = (int(width * ratio), int(height * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
            logger.info(f"Resized large image from {width}x{height} to {new_size[0]}x{new_size[1]}")
        
        return image

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
        
        # Optimize image for faster OCR
        image = self._optimize_image_for_ocr(image)
        
        # Use psm 6 for better table/block detection
        text = pytesseract.image_to_string(image, config='--psm 6')
        
        # Extract metadata (semester, school year, student number) from text
        self.metadata = self._extract_school_year_from_text(text)
        self.metadata['raw_text'] = text
        
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
        
        Tries the formal WMSU COR parser first (requires schedule ID prefix).
        If no courses are found, falls back to a handwritten-format parser
        that handles simple lines like:  "OS  1:00 pm - 3:00 pm  LR1"
        
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
        
        # If formal parser found nothing, try the handwritten fallback
        if not courses:
            logger.info("Formal parser found no courses — trying handwritten fallback parser")
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                course = self._parse_handwritten_line(line)
                if course:
                    split_courses = split_course_by_days(course)
                    courses.extend(split_courses)
        
        logger.info(f"Extracted {len(courses)} courses from Student COR (after day splitting)")
        return courses

    # Handwritten / simple format time pattern: 1:00 pm or 1:00pm
    _HW_TIME_RANGE = re.compile(
        r'(\d{1,2}:\d{2}\s*[aApP][mM])\s*[-\u2013]\s*(\d{1,2}:\d{2}\s*[aApP][mM])',
        re.IGNORECASE,
    )
    _HW_SUBJ = re.compile(r'^([A-Z]{2,8}(?:\s*\d{1,3})?)', re.IGNORECASE)

    def _normalize_hw_time(self, t: str) -> str:
        """Normalize '1:00 pm' → '01:00PM'."""
        t = re.sub(r'\s+', '', t.strip().upper())
        m = re.match(r'(\d{1,2}):(\d{2})(AM|PM)', t)
        if m:
            return f"{int(m.group(1)):02d}:{m.group(2)}{m.group(3)}"
        return t

    def _parse_handwritten_line(self, line: str) -> Optional[Dict]:
        """
        Parse a simple handwritten / informal COR line.
        Expected format:  SUBJECT_CODE  START_TIME - END_TIME  [ROOM]
        Example:  OS  1:00 pm - 3:00 pm  LR1

        Does NOT require a schedule-ID prefix.
        """
        # Must have a recognisable time range
        time_match = self._HW_TIME_RANGE.search(line)
        if not time_match:
            return None

        # Subject code must appear BEFORE the time range
        before_time = line[:time_match.start()].strip()
        subj_match = self._HW_SUBJ.match(before_time)
        if not subj_match:
            return None

        subject_code = subj_match.group(1).strip().upper()
        # Skip obvious header words
        if subject_code in ('SUBJECT', 'SUB', 'COURSE', 'CODE'):
            return None

        start_time = self._normalize_hw_time(time_match.group(1))
        end_time   = self._normalize_hw_time(time_match.group(2))

        # Extract day (after time, if present)
        after_time = line[time_match.end():].strip()
        day_match = self.DAY_PATTERN.search(after_time)
        day = day_match.group(1).upper() if day_match else ''

        # Extract location
        location_match = self.LOCATION_PATTERN.search(after_time)
        location = re.sub(r'\s+', '', location_match.group(1).upper()) if location_match else ''

        if not subject_code or not start_time or not end_time:
            return None

        return {
            'subject_code': subject_code,
            'subject_name': '',
            'start_time': start_time,
            'end_time': end_time,
            'day': day,
            'location': location,
        }

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
        
        # Validate minimum required fields (day is soft — will be stored as '' if missing)
        if not subject_code or not start_time or not end_time:
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
    Extractor for Faculty Individual Daily Program (IDP) documents.
    
    Parses faculty schedules from OCR text, handling common OCR errors
    and extracting:
    - Day of week (MON, TUE, WED, THU, FRI, SAT)
    - Subject codes (e.g., OS137-BSCS-3A)
    - Time ranges (e.g., 9:00-11:00)
    - Room/Location (e.g., LR 3, TBA)
    """
    
    # Day patterns for row identification
    DAY_LABELS = {
        'MON': 'M', 'MONDAY': 'M',
        'TUE': 'T', 'TUESDAY': 'T',
        'WED': 'W', 'WEDNESDAY': 'W',
        'THU': 'TH', 'THURSDAY': 'TH',
        'FRI': 'F', 'FRIDAY': 'F',
        'SAT': 'S', 'SATURDAY': 'S',
    }
    
    # Subject pattern: "OS137-BSCS-3A" or "05137 - BSCS-3A" or "MIT204-MIT-1"
    IDP_SUBJECT_PATTERN = re.compile(
        r'([A-Z0-9]{2,}\d{2,4})\s*[-–=]\s*([A-Z]{2,})\s*(?:[-–]\s*)?(\d*[A-Z]*)',
        re.IGNORECASE
    )
    
    # Alternative pattern for schedule codes like "(BSCS125870)"
    SCHEDULE_CODE_PATTERN = re.compile(r'\(([A-Z]{3,4}\d{5,6})\)', re.IGNORECASE)
    
    # Time pattern: find pairs of times like "9:00-11:00" or "1:00-4:00"
    # More flexible to handle OCR noise
    IDP_TIME_PATTERN = re.compile(r'(\d{1,2}:\d{2})\s*[-–/]\s*(\d{1,2}:\d{2})')
    
    # Room/Location pattern - handles OCR variations like iR3 -> LR3, CLA
    IDP_ROOM_PATTERN = re.compile(
        r'\b([iIlL][Rr]\s*\d+|CLA\s*\d*|COM\s*LAB(?:\s*\d+)?|TBA|GYM|FIELD|LAB\d*)\b',
        re.IGNORECASE
    )
    
    # Keywords to skip (lines with these but no subject pattern)
    SKIP_KEYWORDS = [
        'ADMIN FUNCTION', 'STUDENT CONSULTATION', 'LESSON PREPARATION',
        'PRODUCTION', 'EXTENSION', 'ADVISING', 'DTR', 'ATTENDANCE',
        'QUASI', 'OVERLOAD', 'CONTACT HOURS', 'ACTIVITIES', 'TOTAL'
    ]
    
    def _extract_from_image(self, file_path: str) -> List[Dict]:
        """
        Extract courses from image using pytesseract with preprocessing.
        Overrides base method to add image scaling for better OCR.
        
        Args:
            file_path: Path to image file
            
        Returns:
            List of course dictionaries
        """
        if not PYTESSERACT_AVAILABLE:
            raise ImportError("pytesseract is required for image OCR")
        
        logger.info(f"Extracting from faculty IDP image: {file_path}")
        image = Image.open(file_path)
        
        # Try multiple OCR attempts and combine results
        all_courses = []
        seen_courses = set()  # Track unique courses by (subject, day, start_time)
        raw_text_parts = []
        
        # Attempt 1: Original size with psm 6
        text1 = pytesseract.image_to_string(image, config='--psm 6')
        raw_text_parts.append(text1)
        courses1 = self._parse_text(text1)
        for c in courses1:
            key = (c['subject_code'], c['day'], c['start_time'])
            if key not in seen_courses:
                seen_courses.add(key)
                all_courses.append(c)
        
        # Attempt 2: Scaled 2x — only run if the first pass found nothing.
        # Phone/Messenger photos are already high-res; running a 2x upscale on
        # them doubles OCR time (~50s → ~100s) without adding courses.
        # If attempt 1 found courses, the image quality was sufficient.
        width, height = image.size
        if width < 3000 and not all_courses:
            scaled = image.resize((width * 2, height * 2), Image.LANCZOS)
            text2 = pytesseract.image_to_string(scaled, config='--psm 6')
            raw_text_parts.append(text2)
            courses2 = self._parse_text(text2)
            for c in courses2:
                key = (c['subject_code'], c['day'], c['start_time'])
                if key not in seen_courses:
                    seen_courses.add(key)
                    all_courses.append(c)
        
        self.metadata['raw_text'] = '\n'.join(part for part in raw_text_parts if part)

        logger.info(f"Combined OCR extracted {len(all_courses)} unique courses")
        return all_courses
    
    def _parse_text(self, text: str) -> List[Dict]:
        """
        Parse faculty IDP text extracted via OCR.
        
        Args:
            text: Full text extracted from document
            
        Returns:
            List of course dictionaries
        """
        courses = []
        lines = text.split('\n')
        current_day = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Skip header rows and non-teaching sections
            upper_line = line.upper()
            if any(keyword in upper_line for keyword in self.SKIP_KEYWORDS):
                if not self.IDP_SUBJECT_PATTERN.search(line):
                    continue
            
            # Check if this line starts with a day label
            day_found = self._extract_day_from_line(line)
            if day_found:
                current_day = day_found
            
            # Try to parse course from this line
            course = self._parse_idp_line(line, current_day)
            if course:
                # Split multi-day courses
                split_courses = split_course_by_days(course)
                courses.extend(split_courses)
        
        logger.info(f"Extracted {len(courses)} courses from Faculty IDP (OCR)")
        return courses
    
    def _extract_day_from_line(self, line: str) -> Optional[str]:
        """
        Extract day code from the beginning of a line.
        Handles OCR variations like 'rmon', 'THu', etc.
        
        Args:
            line: Line of text
            
        Returns:
            Day code (M, T, W, TH, F, S) or None
        """
        # Clean up common OCR errors
        clean_line = line.upper().strip()
        
        # Handle OCR variations
        ocr_day_variations = {
            'RMON': 'MON', 'RMON|': 'MON', 'MON|': 'MON', '|MON': 'MON',
            '|TUE': 'TUE', 'ITUE': 'TUE',
            '|WED': 'WED', 'IWED': 'WED',
            '|THU': 'THU', 'ITHU': 'THU', 'THU|': 'THU',
            '|FRI': 'FRI', 'IFRI': 'FRI',
            '|SAT': 'SAT', 'ISAT': 'SAT',
        }
        
        for ocr_var, correct in ocr_day_variations.items():
            if clean_line.startswith(ocr_var):
                clean_line = correct + clean_line[len(ocr_var):]
                break
        
        # Accept very short day headers that often appear in row labels.
        day_header_shortcuts = {
            'M': 'M',
            'T': 'T',
            'W': 'W',
            'TH': 'TH',
            'F': 'F',
            'S': 'S',
        }
        if clean_line in day_header_shortcuts:
            return day_header_shortcuts[clean_line]

        # Handle OCR substitutions in day tokens before matching.
        normalized_line = clean_line
        normalized_line = re.sub(r'\bM0N(?:DAY)?\b', 'MON', normalized_line)
        normalized_line = re.sub(r'\bTUE5(?:DAY)?\b', 'TUE', normalized_line)
        normalized_line = re.sub(r'\bWEDNE5DAY\b', 'WEDNESDAY', normalized_line)
        normalized_line = re.sub(r'\bTHU[R]?5(?:DAY)?\b', 'THU', normalized_line)
        normalized_line = re.sub(r'\bFR[1I](?:DAY)?\b', 'FRI', normalized_line)
        normalized_line = re.sub(r'\b5AT(?:URDAY)?\b', 'SAT', normalized_line)

        for label, code in self.DAY_LABELS.items():
            if normalized_line.startswith(label):
                return code
        
        return None

    def _extract_day_anywhere(self, line: str) -> Optional[str]:
        """
        Extract day token from anywhere in a noisy OCR line.

        This is used as a fallback when row headers are not cleanly detected.
        """
        upper_line = line.upper()
        explicit_day_patterns = [
            (r'\bMON(?:DAY)?\b', 'M'),
            (r'\bTUE(?:SDAY)?\b', 'T'),
            (r'\bWED(?:NESDAY)?\b', 'W'),
            (r'\bTHU(?:RSDAY)?\b', 'TH'),
            (r'\bFRI(?:DAY)?\b', 'F'),
            (r'\bSAT(?:URDAY)?\b', 'S'),
            # OCR-variant tokens
            (r'\bM0N(?:DAY)?\b', 'M'),
            (r'\bTUE5(?:DAY)?\b', 'T'),
            (r'\bWEDNE5DAY\b', 'W'),
            (r'\bTHU5(?:DAY)?\b', 'TH'),
            (r'\bFR[1I](?:DAY)?\b', 'F'),
            (r'\b5AT(?:URDAY)?\b', 'S'),
        ]
        for pattern, code in explicit_day_patterns:
            if re.search(pattern, upper_line):
                return code

        short_token_match = re.search(r'\b(M|T|W|TH|F|S)\b', upper_line)
        if short_token_match:
            return short_token_match.group(1)
        return None
    
    def _parse_idp_line(self, line: str, current_day: Optional[str]) -> Optional[Dict]:
        """
        Parse an IDP line to extract course information.
        
        Args:
            line: Line of text from OCR
            current_day: Current day context from previous lines
            
        Returns:
            Course dictionary or None if parsing fails
        """
        # Look for subject code pattern
        subject_match = self.IDP_SUBJECT_PATTERN.search(line)
        if not subject_match:
            return None
        
        # Build subject code
        subj_prefix = subject_match.group(1).upper()
        # Fix common OCR errors: O -> 0, but keep OS as OS
        if subj_prefix.startswith('O') and len(subj_prefix) > 1 and subj_prefix[1].isdigit():
            subj_prefix = '0' + subj_prefix[1:]
        subj_prefix = subj_prefix.replace('0S', 'OS')
        
        subj_program = subject_match.group(2).upper()
        subj_section = subject_match.group(3).upper() if subject_match.group(3) else ''
        
        # Build subject code - include section if present
        if subj_section:
            subject_code = f"{subj_prefix}-{subj_program}-{subj_section}"
        else:
            subject_code = f"{subj_prefix}-{subj_program}"
        
        # Check if this is a lab section
        if 'LAB' in line.upper():
            subject_code += " Lab"
        
        # Extract time range - try multiple patterns
        time_match = self.IDP_TIME_PATTERN.search(line)
        
        if not time_match:
            # Try finding individual times and pair them
            times = re.findall(r'(\d{1,2}:\d{2})', line)
            if len(times) >= 2:
                # Use first two times found
                start_time = self._convert_to_12hr(times[0], line_context=line)
                end_time = self._convert_to_12hr(times[1], line_context=line)
            else:
                # Can't find valid time - skip this entry
                return None
        else:
            start_time = self._convert_to_12hr(time_match.group(1), line_context=line)
            end_time = self._convert_to_12hr(time_match.group(2), line_context=line)

        # Fail closed on ambiguous or invalid time tokens.
        if not start_time or not end_time:
            return None

        # Correct meridiem mismatches caused by the heuristic boundary.
        # e.g. 5:30-7:00 → 05:30PM-07:00AM → correction → 05:30PM-07:00PM
        start_time, end_time = self._fix_time_pair_meridiem(start_time, end_time)
        
        # Extract room/location
        room_match = self.IDP_ROOM_PATTERN.search(line)
        location = ''
        if room_match:
            loc = room_match.group(1).upper()
            # Fix OCR errors: iR -> LR, IR -> LR, lR -> LR
            loc = re.sub(r'^[iIlL][Rr]', 'LR', loc)
            location = loc.replace(' ', '')
        
        # Get day from line or use current context
        day = (
            self._extract_day_from_line(line)
            or self._extract_day_anywhere(line)
            or current_day
            or ''
        )
        
        course = {
            'subject_code': subject_code,
            'subject_name': '',  # IDP doesn't include full subject names
            'start_time': start_time,
            'end_time': end_time,
            'day': day,
            'location': location
        }
        
        logger.debug(f"Parsed IDP course (OCR): {course}")
        return course
    
    def _normalize_ocr_time_token(self, time_str: str) -> str:
        token = (time_str or '').upper().strip()
        token = token.replace('.', ':').replace(';', ':')
        token = token.replace('O', '0')
        token = re.sub(r'\s+', '', token)
        return token

    def _extract_meridiem_hint(self, line_context: str, time_token: str) -> Optional[str]:
        """
        Extract AM/PM from nearby OCR text when explicitly present.
        """
        upper_line = (line_context or '').upper()
        token = self._normalize_ocr_time_token(time_token)
        hour_minute = token[:5] if len(token) >= 4 else token

        nearby = re.search(
            rf"{re.escape(hour_minute)}\s*([AP])\.?M\.?",
            upper_line,
            re.IGNORECASE,
        )
        if nearby:
            return nearby.group(1).upper() + 'M'

        if 'AM' in upper_line and 'PM' not in upper_line:
            return 'AM'
        if 'PM' in upper_line and 'AM' not in upper_line:
            return 'PM'
        return None

    def _fix_time_pair_meridiem(
        self,
        start_time: Optional[str],
        end_time: Optional[str],
    ) -> tuple:
        """
        Correct start/end meridiem mismatches caused by the hour-boundary
        heuristic in _convert_to_12hr().

        Problem: 5:30-7:00 → heuristic makes 5 → PM and 7 → AM, giving
        05:30PM-07:00AM (start > end). The real class is 5:30 PM – 7:00 PM.

        Fix: if start_minutes > end_minutes, try flipping end meridiem.
        Use the flipped value only when it resolves the inversion.
        Handles:
          5:30-7:00  → 05:30PM-07:00AM → fixed to 05:30PM-07:00PM
          1:30-7:00  → 01:30PM-07:00AM → fixed to 01:30PM-07:00PM
        Leaves valid pairs unchanged:
          7:00-8:30  → 07:00AM-08:30AM (already valid)
          11:30-1:00 → 11:30AM-01:00PM (already valid, crossover)
        """
        if not start_time or not end_time:
            return start_time, end_time

        def _to_minutes(t: str) -> int:
            """Convert '05:30PM' / '11:30AM' to minutes since midnight."""
            try:
                t = t.upper().strip()
                if t.endswith('AM') or t.endswith('PM'):
                    suffix = t[-2:]
                    hh, mm = t[:-2].split(':')
                    h, m = int(hh), int(mm)
                    if suffix == 'PM' and h != 12:
                        h += 12
                    elif suffix == 'AM' and h == 12:
                        h = 0
                    return h * 60 + m
            except Exception:
                pass
            return -1

        start_min = _to_minutes(start_time)
        end_min = _to_minutes(end_time)

        if start_min < 0 or end_min < 0 or start_min <= end_min:
            return start_time, end_time  # already valid or unparseable

        # start > end — try flipping end meridiem
        upper_end = end_time.upper()
        if upper_end.endswith('AM'):
            end_alt = end_time[:-2] + 'PM'
        elif upper_end.endswith('PM'):
            end_alt = end_time[:-2] + 'AM'
        else:
            return start_time, end_time

        if start_min < _to_minutes(end_alt):
            logger.debug(
                "Fixed time pair meridiem: %s-%s → %s-%s",
                start_time, end_time, start_time, end_alt,
            )
            return start_time, end_alt

        return start_time, end_time  # return original; validator will catch it

    def _convert_to_12hr(self, time_str: str, line_context: str = '') -> Optional[str]:
        """
        Convert time string to 12-hour format.
        Handles OCR variations like "9.00" instead of "9:00".
        
        Args:
            time_str: Time like "9:00", "13:00", "1.00"
            
        Returns:
            Time in format "09:00AM" or "01:00PM"
        """
        try:
            time_str = self._normalize_ocr_time_token(time_str)

            suffix_match = re.search(r'([AP])M?$', time_str)
            explicit_suffix = suffix_match.group(1) + 'M' if suffix_match else None
            if explicit_suffix:
                time_str = re.sub(r'([AP])M?$', '', time_str)
            
            parts = time_str.split(':')
            hour = int(parts[0])
            minute = parts[1] if len(parts) > 1 else '00'

            if not minute.isdigit() or len(minute) != 2:
                return None
            minute_val = int(minute)
            if minute_val > 59:
                return None

            suffix = explicit_suffix or self._extract_meridiem_hint(line_context, time_str)

            if suffix == 'AM':
                if hour == 12:
                    return f"12:{minute}AM"
                if 1 <= hour <= 11:
                    return f"{hour:02d}:{minute}AM"
                if hour == 0:
                    return f"12:{minute}AM"
                return None

            if suffix == 'PM':
                if hour == 12:
                    return f"12:{minute}PM"
                if 1 <= hour <= 11:
                    return f"{hour:02d}:{minute}PM"
                if 13 <= hour <= 23:
                    return f"{hour - 12:02d}:{minute}PM"
                return None
            
            # Handle 24-hour format (13:00 - 23:00)
            if hour >= 13:
                return f"{hour - 12:02d}:{minute}PM"
            elif hour == 12:
                return f"12:{minute}PM"
            elif hour == 0:
                return f"12:{minute}AM"
            elif 1 <= hour <= 11:
                # Faculty IDP documents omit AM/PM markers — apply university
                # schedule heuristics to disambiguate:
                #   Hours 1–6  → PM  (no university runs 1AM–6AM classes)
                #   Hours 7–11 → AM  (standard morning session block)
                # This correctly handles WMSU IDP times like:
                #   5:30-7:00  → 05:30PM-07:00PM  (evening)
                #   7:00-8:30  → 07:00AM-08:30AM  (morning)
                #   11:30-1:00 → 11:30AM-01:00PM  (noon crossover)
                #   1:30-4:30  → 01:30PM-04:30PM  (afternoon)
                if hour <= 6:
                    return f"{hour:02d}:{minute}PM"
                else:
                    return f"{hour:02d}:{minute}AM"
        except Exception:
            return None


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
