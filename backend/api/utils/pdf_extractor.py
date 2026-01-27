"""
PDF Text Extraction Utility for extracting course information from Certificate of Registration (COR) documents.
Uses pdfplumber for direct text extraction from digitally-generated PDFs.

This module provides a fast, accurate alternative to OCR for PDFs that contain embedded text.
It uses table detection and spatial analysis to extract schedule information.
"""

import pdfplumber
import re
from typing import List, Dict, Tuple, Optional
import logging
from abc import ABC, abstractmethod

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
    # Two-day combinations
    'TF': ['T', 'F'],
    'MW': ['M', 'W'],
    'MTH': ['M', 'TH'],
    'TTH': ['T', 'TH'],
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


def calculate_quality_score(courses: List[Dict]) -> float:
    """
    Calculate a quality score for extracted courses to determine extraction success.
    
    Args:
        courses: List of extracted course dictionaries
        
    Returns:
        Quality score from 0.0 to 1.0
    """
    if not courses:
        return 0.0
    
    total_score = 0.0
    required_fields = ['subject_code', 'start_time', 'end_time', 'day']
    
    for course in courses:
        course_score = 0.0
        
        # Check required fields presence
        for field in required_fields:
            if course.get(field):
                course_score += 0.25
        
        # Bonus for having subject name and location
        if course.get('subject_name'):
            course_score += 0.1
        if course.get('location'):
            course_score += 0.1
        
        total_score += min(course_score, 1.0)
    
    # Average score across all courses
    avg_score = total_score / len(courses)
    return round(avg_score, 3)


class BasePDFExtractor(ABC):
    """
    Base class for extracting course information from PDF documents using text extraction.
    Provides common functionality for different COR formats.
    """
    
    def __init__(self):
        """Initialize the PDF extractor."""
        logger.info(f"Initialized {self.__class__.__name__}")
    
    def extract_from_pdf(self, file_path: str) -> List[Dict]:
        """
        Extract course information from a PDF document.
        
        Args:
            file_path: Path to the PDF file
            
        Returns:
            List of dictionaries containing course information
        """
        try:
            logger.info(f"Opening PDF file: {file_path}")
            with pdfplumber.open(file_path) as pdf:
                all_courses = []
                
                for page_num, page in enumerate(pdf.pages, start=1):
                    logger.info(f"Processing page {page_num}/{len(pdf.pages)}")
                    courses = self._extract_from_page(page)
                    all_courses.extend(courses)
                
                logger.info(f"Extracted {len(all_courses)} courses from PDF (before day splitting)")
                
                # Split multi-day courses into individual entries
                split_courses = []
                for course in all_courses:
                    split_courses.extend(split_course_by_days(course))
                
                logger.info(f"Total courses after day splitting: {len(split_courses)}")
                return split_courses
                
        except Exception as e:
            logger.error(f"Error extracting from PDF: {str(e)}")
            raise
    
    @abstractmethod
    def _extract_from_page(self, page) -> List[Dict]:
        """
        Extract courses from a single PDF page.
        Must be implemented by subclasses.
        
        Args:
            page: pdfplumber page object
            
        Returns:
            List of course dictionaries
        """
        pass


class StudentPDFExtractor(BasePDFExtractor):
    """
    Extractor for Student Certificate of Registration documents.
    Uses table detection and pattern matching to extract course schedules.
    """
    
    # Regex patterns for parsing
    SUBJECT_CODE_PATTERN = re.compile(r'^[A-Z]{4,}\d{5,}$')
    TIME_PATTERN = re.compile(r'(\d{1,2}:\d{2}\s*[AP]M)', re.IGNORECASE)
    DAY_PATTERN = re.compile(r'\b(M|T|W|TH|F|S|TF|MW|MWF|MTH|TTH|MTWTH|MTWTHF)\b', re.IGNORECASE)
    LOCATION_PATTERN = re.compile(r'\b(LR\d*|LAB\d*|CLA\d*|COM\s*LAB\d*|ROOM\s*\d+|GYM|FIELD)\b', re.IGNORECASE)
    TIME_RANGE_PATTERN = re.compile(r'(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)', re.IGNORECASE)
    
    def _extract_from_page(self, page) -> List[Dict]:
        """
        Extract courses from a single PDF page using table detection and text analysis.
        
        Args:
            page: pdfplumber page object
            
        Returns:
            List of course dictionaries
        """
        courses = []
        
        # Strategy 1: Try table extraction first (most reliable for structured PDFs)
        table_courses = self._extract_from_tables(page)
        if table_courses:
            logger.info(f"Extracted {len(table_courses)} courses using table detection")
            return table_courses
        
        # Strategy 2: Fallback to text-based extraction with spatial analysis
        logger.info("No tables detected, using text-based extraction")
        text_courses = self._extract_from_text(page)
        if text_courses:
            logger.info(f"Extracted {len(text_courses)} courses using text extraction")
            return text_courses
        
        logger.warning("No courses found on this page")
        return courses
    
    def _extract_from_tables(self, page) -> List[Dict]:
        """
        Extract courses from table structures in the PDF.
        
        Args:
            page: pdfplumber page object
            
        Returns:
            List of course dictionaries
        """
        courses = []
        
        try:
            # Extract all tables from the page
            tables = page.extract_tables()
            
            if not tables:
                return courses
            
            for table_idx, table in enumerate(tables):
                logger.debug(f"Processing table {table_idx + 1}/{len(tables)}")
                
                # Skip empty tables
                if not table or len(table) < 2:
                    continue
                
                # Try to identify header row and data rows
                for row_idx, row in enumerate(table):
                    # Skip header rows (usually first 1-2 rows)
                    if row_idx == 0:
                        continue
                    
                    # Skip empty rows
                    if not any(cell for cell in row if cell):
                        continue
                    
                    # Try to parse this row as a course
                    course = self._parse_table_row(row)
                    if course:
                        courses.append(course)
        
        except Exception as e:
            logger.warning(f"Error extracting tables: {str(e)}")
        
        return courses
    
    def _parse_table_row(self, row: List[str]) -> Optional[Dict]:
        """
        Parse a table row to extract course information.
        
        Args:
            row: List of cell values from table row
            
        Returns:
            Course dictionary or None if parsing fails
        """
        # Join all cells to create a searchable text
        row_text = ' '.join([str(cell) if cell else '' for cell in row])
        
        # Look for subject code
        subject_code = None
        for cell in row:
            if cell and self.SUBJECT_CODE_PATTERN.match(str(cell).strip()):
                subject_code = str(cell).strip()
                break
        
        if not subject_code:
            return None
        
        # Extract other fields from row text
        course = {
            'subject_code': subject_code,
            'subject_name': self._extract_subject_name(row, subject_code),
            'start_time': '',
            'end_time': '',
            'day': '',
            'location': ''
        }
        
        # Extract time range
        time_range = self.TIME_RANGE_PATTERN.search(row_text)
        if time_range:
            course['start_time'] = self._normalize_time(time_range.group(1))
            course['end_time'] = self._normalize_time(time_range.group(2))
        else:
            # Try individual times
            times = self.TIME_PATTERN.findall(row_text)
            if len(times) >= 2:
                course['start_time'] = self._normalize_time(times[0])
                course['end_time'] = self._normalize_time(times[1])
        
        # Extract day
        day_match = self.DAY_PATTERN.search(row_text)
        if day_match:
            course['day'] = day_match.group(1).upper()
        
        # Extract location
        location_match = self.LOCATION_PATTERN.search(row_text)
        if location_match:
            course['location'] = re.sub(r'\s+', '', location_match.group(1).upper())
        
        # Validate that we have minimum required fields
        if course['start_time'] and course['end_time']:
            return course
        
        return None
    
    def _extract_subject_name(self, row: List[str], subject_code: str) -> str:
        """
        Extract subject name from table row.
        
        Args:
            row: Table row cells
            subject_code: Already extracted subject code
            
        Returns:
            Subject name string
        """
        for cell in row:
            if not cell:
                continue
            
            cell_str = str(cell).strip()
            
            # Skip if it's the subject code itself
            if cell_str == subject_code:
                continue
            
            # Skip if it matches other patterns (time, day, location)
            if self.TIME_PATTERN.search(cell_str):
                continue
            if self.LOCATION_PATTERN.match(cell_str):
                continue
            if self.DAY_PATTERN.match(cell_str):
                continue
            
            # This is likely the subject name
            if len(cell_str) > 3 and not cell_str.isdigit():
                return cell_str
        
        return ''
    
    def _extract_from_text(self, page) -> List[Dict]:
        """
        Extract courses from page text using spatial analysis.
        Fallback method when table detection fails.
        
        Args:
            page: pdfplumber page object
            
        Returns:
            List of course dictionaries
        """
        courses = []
        
        try:
            # Extract words with position information
            words = page.extract_words(x_tolerance=3, y_tolerance=3)
            
            if not words:
                return courses
            
            # Sort words by position (top to bottom, left to right)
            words = sorted(words, key=lambda w: (w['top'], w['x0']))
            
            # Group words into lines
            lines = self._group_words_into_lines(words)
            
            # Find lines containing subject codes
            for line in lines:
                line_text = ' '.join([w['text'] for w in line])
                
                # Check if this line contains a subject code
                subject_code_match = self.SUBJECT_CODE_PATTERN.search(line_text)
                if not subject_code_match:
                    continue
                
                # Try to parse this line as a course
                course = self._parse_text_line(line_text)
                if course:
                    courses.append(course)
        
        except Exception as e:
            logger.warning(f"Error extracting from text: {str(e)}")
        
        return courses
    
    def _group_words_into_lines(self, words: List[Dict]) -> List[List[Dict]]:
        """
        Group words into lines based on vertical position.
        
        Args:
            words: List of word dictionaries with position info
            
        Returns:
            List of lines, where each line is a list of words
        """
        if not words:
            return []
        
        lines = []
        current_line = [words[0]]
        current_y = words[0]['top']
        
        for word in words[1:]:
            # If word is on roughly the same Y position, add to current line
            if abs(word['top'] - current_y) < 5:  # 5 pixel tolerance
                current_line.append(word)
            else:
                # Start new line
                lines.append(current_line)
                current_line = [word]
                current_y = word['top']
        
        # Add last line
        if current_line:
            lines.append(current_line)
        
        return lines
    
    def _parse_text_line(self, line_text: str) -> Optional[Dict]:
        """
        Parse a line of text to extract course information.
        
        Args:
            line_text: Text content of the line
            
        Returns:
            Course dictionary or None if parsing fails
        """
        # Extract subject code
        subject_code_match = self.SUBJECT_CODE_PATTERN.search(line_text)
        if not subject_code_match:
            return None
        
        subject_code = subject_code_match.group(0)
        
        course = {
            'subject_code': subject_code,
            'subject_name': '',
            'start_time': '',
            'end_time': '',
            'day': '',
            'location': ''
        }
        
        # Extract time range
        time_range = self.TIME_RANGE_PATTERN.search(line_text)
        if time_range:
            course['start_time'] = self._normalize_time(time_range.group(1))
            course['end_time'] = self._normalize_time(time_range.group(2))
        else:
            # Try individual times
            times = self.TIME_PATTERN.findall(line_text)
            if len(times) >= 2:
                course['start_time'] = self._normalize_time(times[0])
                course['end_time'] = self._normalize_time(times[1])
        
        # Extract day
        day_match = self.DAY_PATTERN.search(line_text)
        if day_match:
            course['day'] = day_match.group(1).upper()
        
        # Extract location
        location_match = self.LOCATION_PATTERN.search(line_text)
        if location_match:
            course['location'] = re.sub(r'\s+', '', location_match.group(1).upper())
        
        # Extract subject name (text between subject code and time/day/location)
        # Remove subject code from text
        remaining_text = line_text.replace(subject_code, '', 1)
        # Remove times, days, locations
        for pattern in [self.TIME_PATTERN, self.DAY_PATTERN, self.LOCATION_PATTERN]:
            remaining_text = pattern.sub('', remaining_text)
        # Clean up and extract
        subject_name = remaining_text.strip()
        if len(subject_name) > 3:
            course['subject_name'] = subject_name
        
        # Validate minimum required fields
        if course['start_time'] and course['end_time']:
            return course
        
        return None
    
    def _normalize_time(self, time_str: str) -> str:
        """
        Normalize time string to consistent format (HH:MMAM/PM).
        
        Args:
            time_str: Time string in various formats
            
        Returns:
            Normalized time string
        """
        # Remove spaces between time and AM/PM
        time_str = re.sub(r'\s+', '', time_str.strip())
        
        # Ensure AM/PM is uppercase
        time_str = time_str.upper()
        
        # Ensure format is HH:MMAM or HH:MMPM
        match = re.match(r'(\d{1,2}):(\d{2})(AM|PM)', time_str)
        if match:
            hour = match.group(1).zfill(2)
            minute = match.group(2)
            period = match.group(3)
            return f"{hour}:{minute}{period}"
        
        return time_str


class FacultyPDFExtractor(BasePDFExtractor):
    """
    Extractor for Faculty Certificate of Registration documents.
    
    Note: This is a placeholder implementation. Faculty COR extraction logic
    will be implemented in a future update as faculty documents have different
    formats and validation rules.
    """
    
    def _extract_from_page(self, page) -> List[Dict]:
        """
        Extract courses from a faculty COR page.
        
        Args:
            page: pdfplumber page object
            
        Returns:
            List of course dictionaries
        """
        # TODO: Implement faculty-specific extraction logic
        logger.warning("Faculty PDF extraction not yet implemented")
        return []


# Factory function to get the appropriate PDF extractor
def get_pdf_extractor(upload_type: str) -> BasePDFExtractor:
    """
    Factory function to return the appropriate PDF extractor based on upload type.
    
    Args:
        upload_type: Either 'student' or 'faculty'
        
    Returns:
        Appropriate PDFExtractor subclass instance
        
    Raises:
        ValueError: If upload_type is not 'student' or 'faculty'
    """
    if upload_type.lower() == 'student':
        return StudentPDFExtractor()
    elif upload_type.lower() == 'faculty':
        return FacultyPDFExtractor()
    else:
        raise ValueError(f"Invalid upload type: {upload_type}. Must be 'student' or 'faculty'")
