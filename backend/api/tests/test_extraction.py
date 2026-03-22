"""
Unit tests for the hybrid PDF extraction system.
Tests PDF extraction, OCR fallback, extraction manager, and quality validation.

Run with: python manage.py test api.tests.test_extraction
"""

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import Mock, patch, MagicMock
import os
from rest_framework.test import APIClient

from api.utils.pdf_extractor import (
    StudentPDFExtractor,
    FacultyPDFExtractor,
    get_pdf_extractor,
    expand_day_code,
    split_course_by_days,
    calculate_quality_score
)
from api.utils.extraction_manager import ExtractionManager
from api.utils.ocr import StudentCORExtractor
from api.utils.ocr import FacultyCORExtractor

User = get_user_model()


class DayCodeExpansionTestCase(TestCase):
    """Test day code expansion functionality"""
    
    def test_single_day_codes(self):
        """Test that single day codes return themselves"""
        self.assertEqual(expand_day_code('M'), ['M'])
        self.assertEqual(expand_day_code('T'), ['T'])
        self.assertEqual(expand_day_code('W'), ['W'])
        self.assertEqual(expand_day_code('TH'), ['TH'])
        self.assertEqual(expand_day_code('F'), ['F'])
        self.assertEqual(expand_day_code('S'), ['S'])
    
    def test_multi_day_codes(self):
        """Test that multi-day codes expand correctly"""
        self.assertEqual(expand_day_code('MTH'), ['M', 'TH'])
        self.assertEqual(expand_day_code('MWF'), ['M', 'W', 'F'])
        self.assertEqual(expand_day_code('TTH'), ['T', 'TH'])
        self.assertEqual(expand_day_code('MTWTH'), ['M', 'T', 'W', 'TH'])
        self.assertEqual(expand_day_code('MTWTHF'), ['M', 'T', 'W', 'TH', 'F'])
    
    def test_case_insensitivity(self):
        """Test that day codes are case insensitive"""
        self.assertEqual(expand_day_code('mth'), ['M', 'TH'])
        self.assertEqual(expand_day_code('MtH'), ['M', 'TH'])
        self.assertEqual(expand_day_code('mwf'), ['M', 'W', 'F'])


class CourseSplittingTestCase(TestCase):
    """Test course splitting by days"""
    
    def test_single_day_no_split(self):
        """Test that single day courses are not split"""
        course = {
            'subject_code': 'BSCS101',
            'subject_name': 'Programming',
            'day': 'M',
            'start_time': '08:00AM',
            'end_time': '10:00AM',
            'location': 'LR1'
        }
        result = split_course_by_days(course)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['day'], 'M')
    
    def test_multi_day_split(self):
        """Test that multi-day courses are split correctly"""
        course = {
            'subject_code': 'BSCS102',
            'subject_name': 'Data Structures',
            'day': 'MTH',
            'start_time': '01:00PM',
            'end_time': '03:00PM',
            'location': 'LR2'
        }
        result = split_course_by_days(course)
        
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['day'], 'M')
        self.assertEqual(result[1]['day'], 'TH')
        
        # Verify all other fields are preserved
        for split_course in result:
            self.assertEqual(split_course['subject_code'], 'BSCS102')
            self.assertEqual(split_course['start_time'], '01:00PM')
            self.assertEqual(split_course['location'], 'LR2')
    
    def test_three_day_split(self):
        """Test splitting of three-day courses"""
        course = {
            'subject_code': 'BSCS103',
            'day': 'MWF',
            'start_time': '10:00AM',
            'end_time': '11:00AM'
        }
        result = split_course_by_days(course)
        
        self.assertEqual(len(result), 3)
        self.assertEqual([c['day'] for c in result], ['M', 'W', 'F'])


class QualityScoringTestCase(TestCase):
    """Test quality scoring functionality"""
    
    def test_empty_courses(self):
        """Test that empty course list returns 0"""
        self.assertEqual(calculate_quality_score([]), 0.0)
    
    def test_perfect_course(self):
        """Test course with all fields gets high score"""
        courses = [{
            'subject_code': 'BSCS101',
            'subject_name': 'Programming',
            'start_time': '08:00AM',
            'end_time': '10:00AM',
            'day': 'M',
            'location': 'LR1'
        }]
        score = calculate_quality_score(courses)
        self.assertGreaterEqual(score, 0.9)  # Should be close to 1.0
    
    def test_minimal_course(self):
        """Test course with only required fields"""
        courses = [{
            'subject_code': 'BSCS101',
            'start_time': '08:00AM',
            'end_time': '10:00AM',
            'day': 'M'
        }]
        score = calculate_quality_score(courses)
        self.assertGreaterEqual(score, 0.6)  # Should meet threshold
        self.assertLess(score, 0.8)  # But not perfect
    
    def test_incomplete_course(self):
        """Test course missing required fields gets low score"""
        courses = [{
            'subject_code': 'BSCS101',
            'day': 'M'
            # Missing times
        }]
        score = calculate_quality_score(courses)
        self.assertLess(score, 0.6)  # Should be below threshold
    
    def test_multiple_courses_average(self):
        """Test that quality is averaged across multiple courses"""
        courses = [
            {  # Perfect course
                'subject_code': 'BSCS101',
                'subject_name': 'Programming',
                'start_time': '08:00AM',
                'end_time': '10:00AM',
                'day': 'M',
                'location': 'LR1'
            },
            {  # Minimal course
                'subject_code': 'BSCS102',
                'start_time': '10:00AM',
                'end_time': '12:00PM',
                'day': 'T'
            }
        ]
        score = calculate_quality_score(courses)
        self.assertGreater(score, 0.6)  # Average should be good
        self.assertLess(score, 1.0)  # But not perfect


class PDFExtractorTestCase(TestCase):
    """Test PDF extractor functionality"""
    
    def test_get_student_extractor(self):
        """Test factory returns StudentPDFExtractor"""
        extractor = get_pdf_extractor('student')
        self.assertIsInstance(extractor, StudentPDFExtractor)
    
    def test_get_faculty_extractor(self):
        """Test factory returns FacultyPDFExtractor"""
        extractor = get_pdf_extractor('faculty')
        self.assertIsInstance(extractor, FacultyPDFExtractor)
    
    def test_invalid_upload_type(self):
        """Test factory raises error for invalid type"""
        with self.assertRaises(ValueError):
            get_pdf_extractor('invalid')
    
    @patch('pdfplumber.open')
    def test_student_pdf_extractor_initialization(self, mock_pdf):
        """Test StudentPDFExtractor initializes correctly"""
        extractor = StudentPDFExtractor()
        self.assertIsNotNone(extractor)
    
    def test_normalize_time(self):
        """Test time normalization"""
        extractor = StudentPDFExtractor()
        
        # Test various formats
        self.assertEqual(extractor._normalize_time('8:00AM'), '08:00AM')
        self.assertEqual(extractor._normalize_time('8:00 AM'), '08:00AM')
        self.assertEqual(extractor._normalize_time('08:00AM'), '08:00AM')
        self.assertEqual(extractor._normalize_time('2:30PM'), '02:30PM')


class FacultyOCRDayRecoveryTestCase(TestCase):
    """Regression tests for faculty OCR day extraction robustness."""

    def setUp(self):
        self.extractor = FacultyCORExtractor()

    def test_extract_day_anywhere_handles_full_day_word(self):
        line = 'OS137-BSCS-3A 9:00-11:00 MONDAY LR 3'
        day = self.extractor._extract_day_anywhere(line)
        self.assertEqual(day, 'M')

    def test_extract_day_anywhere_handles_common_ocr_variation(self):
        line = 'OS137-BSCS-3A 9:00-11:00 M0N LR 3'
        day = self.extractor._extract_day_anywhere(line)
        self.assertEqual(day, 'M')

    def test_parse_idp_line_uses_anywhere_day_fallback(self):
        line = 'OS137-BSCS-3A 9:00AM-11:00AM THURSDAY LR 3'
        course = self.extractor._parse_idp_line(line, current_day=None)
        self.assertIsNotNone(course)
        self.assertEqual(course['day'], 'TH')


class ExtractionManagerTestCase(TestCase):
    """Test extraction manager orchestration"""
    
    def test_initialization_default_threshold(self):
        """Test manager initializes with default threshold"""
        manager = ExtractionManager()
        self.assertEqual(manager.quality_threshold, 0.6)
    
    def test_initialization_custom_threshold(self):
        """Test manager accepts custom threshold"""
        manager = ExtractionManager(quality_threshold=0.8)
        self.assertEqual(manager.quality_threshold, 0.8)
    
    @patch('api.utils.extraction_manager.get_pdf_extractor')
    def test_pdf_extraction_success(self, mock_get_extractor):
        """Test successful PDF extraction"""
        # Mock PDF extractor
        mock_extractor = Mock()
        mock_extractor.extract_from_pdf.return_value = [
            {
                'subject_code': 'BSCS101',
                'subject_name': 'Programming',
                'start_time': '08:00AM',
                'end_time': '10:00AM',
                'day': 'M',
                'location': 'LR1'
            }
        ]
        mock_get_extractor.return_value = mock_extractor
        
        manager = ExtractionManager()
        result = manager.extract_schedule('/fake/path.pdf', 'student')
        
        self.assertEqual(result['extraction_method'], 'pdf_text')
        self.assertGreaterEqual(result['confidence'], 0.6)
        self.assertIn('pdf_text', result['attempts'])
        self.assertEqual(len(result['courses']), 1)
    
    @patch('api.utils.extraction_manager.get_cor_extractor')
    def test_image_extraction_uses_ocr_directly(self, mock_get_ocr):
        """Test that image files use OCR directly"""
        # Mock OCR extractor
        mock_ocr = Mock()
        mock_ocr.extract_from_document.return_value = [
            {
                'subject_code': 'BSCS101',
                'start_time': '08:00AM',
                'end_time': '10:00AM',
                'day': 'M'
            }
        ]
        mock_get_ocr.return_value = mock_ocr
        
        manager = ExtractionManager()
        result = manager.extract_schedule('/fake/path.jpg', 'student')
        
        self.assertEqual(result['extraction_method'], 'ocr')
        self.assertIn('ocr', result['attempts'])
        self.assertNotIn('pdf_text', result['attempts'])
    
    @patch('api.utils.extraction_manager.get_cor_extractor')
    @patch('api.utils.extraction_manager.get_pdf_extractor')
    def test_pdf_extraction_fallback_to_ocr(self, mock_get_pdf, mock_get_ocr):
        """Test fallback to OCR when PDF quality is low"""
        # Mock PDF extractor returning poor quality data
        mock_pdf_extractor = Mock()
        mock_pdf_extractor.extract_from_pdf.return_value = [
            {
                'subject_code': 'BSCS101',
                # Missing required fields - low quality
            }
        ]
        mock_get_pdf.return_value = mock_pdf_extractor
        
        # Mock OCR extractor returning good data
        mock_ocr = Mock()
        mock_ocr.extract_from_document.return_value = [
            {
                'subject_code': 'BSCS101',
                'start_time': '08:00AM',
                'end_time': '10:00AM',
                'day': 'M',
                'location': 'LR1'
            }
        ]
        mock_get_ocr.return_value = mock_ocr
        
        manager = ExtractionManager()
        result = manager.extract_schedule('/fake/path.pdf', 'student')
        
        self.assertEqual(result['extraction_method'], 'ocr_fallback')
        self.assertIn('pdf_text', result['attempts'])
        self.assertIn('ocr_fallback', result['attempts'])


class ExtractionViewIntegrationTestCase(TestCase):
    """Integration tests for extraction views"""
    
    def setUp(self):
        """Create test user and authenticate"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            student_number='2022-01191',
        )
        self.client.force_authenticate(user=self.user)
    
    @patch('api.views.upload_views.ExtractionManager')
    def test_upload_student_cor_with_pdf_extraction(self, mock_manager_class):
        """Test student COR upload uses extraction manager"""
        # Mock extraction manager
        mock_manager = Mock()
        mock_manager.extract_schedule.return_value = {
            'courses': [
                {
                    'subject_code': 'BSCS101',
                    'subject_name': 'Programming',
                    'start_time': '08:00AM',
                    'end_time': '10:00AM',
                    'day': 'M',
                    'location': 'LR1'
                }
            ],
            'extraction_method': 'pdf_text',
            'confidence': 0.95,
            'processing_time': 0.3,
            'attempts': ['pdf_text'],
            'student_number': '2022-01191',
            'failure_category': 'none',
            'validator_errors': [],
            'score_breakdown': {
                'completeness': 1.0,
                'validity': 1.0,
                'consistency': 1.0,
                'parser_reliability': 0.95,
                'agreement': 1.0,
            },
        }
        mock_manager_class.return_value = mock_manager
        
        # Create fake PDF file
        pdf_file = SimpleUploadedFile(
            "test_cor.pdf",
            b"fake pdf content",
            content_type="application/pdf"
        )
        
        response = self.client.post(
            '/api/upload-cor/student/',
            {'file': pdf_file},
            format='multipart'
        )
        
        self.assertEqual(response.status_code, 201)
        self.assertIn('extraction_metadata', response.data)
        self.assertEqual(response.data['extraction_metadata']['method'], 'pdf_text')
        self.assertEqual(response.data['extraction_metadata']['confidence'], 0.95)
        self.assertIn('message', response.data)
        self.assertIn('courses', response.data)
        self.assertIn('total_courses', response.data)
        self.assertIn('upload_type', response.data)
        self.assertIn('semester', response.data)
        self.assertIn('school_year', response.data)
        self.assertIn('idempotency', response.data)

        metadata = response.data['extraction_metadata']
        self.assertIn('failure_category', metadata)
        self.assertIn('validator_errors', metadata)
        self.assertIn('score_breakdown', metadata)
        self.assertIn('request_id', metadata)
        self.assertIn('idempotency_key', metadata)
        self.assertIn('extraction_run_id', metadata)
        self.assertIn('schema_version', metadata)
        self.assertIn('score_version', metadata)
        self.assertIn('rule_version', metadata)
        self.assertIn('score_policy_upload_type', metadata)

    @patch('api.views.upload_views.ExtractionManager')
    def test_retry_response_preserves_legacy_keys_with_enhanced_metadata(self, mock_manager_class):
        mock_manager = Mock()
        mock_manager.extract_schedule.return_value = {
            'courses': [],
            'extraction_method': 'pdf_text',
            'confidence': 0.55,
            'processing_time': 0.35,
            'attempts': ['pdf_text', 'ocr_fallback'],
            'student_number': '2022-01191',
            'failure_category': 'low_confidence',
            'validator_errors': ['Course[0] invalid day token: TUES'],
            'score_breakdown': {
                'completeness': 0.4,
                'validity': 0.5,
                'consistency': 0.5,
                'parser_reliability': 0.68,
                'agreement': 0.7,
            },
        }
        mock_manager_class.return_value = mock_manager

        pdf_file = SimpleUploadedFile(
            'test_cor.pdf',
            b'fake pdf content',
            content_type='application/pdf'
        )
        response = self.client.post(
            '/api/upload-cor/student/',
            {'file': pdf_file},
            format='multipart'
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn('courses', response.data)
        self.assertIn('total_courses', response.data)
        self.assertIn('extraction_metadata', response.data)

        metadata = response.data['extraction_metadata']
        self.assertEqual(metadata['failure_category'], 'low_confidence')
        self.assertIn('validator_errors', metadata)
        self.assertIn('score_breakdown', metadata)


class PerformanceTestCase(TestCase):
    """Performance benchmark tests"""
    
    @patch('api.utils.extraction_manager.get_pdf_extractor')
    def test_pdf_extraction_performance(self, mock_get_extractor):
        """Test that PDF extraction is faster than 1 second"""
        import time
        
        # Mock quick PDF extraction
        mock_extractor = Mock()
        mock_extractor.extract_from_pdf.return_value = [
            {
                'subject_code': 'BSCS101',
                'subject_name': 'Programming',
                'start_time': '08:00AM',
                'end_time': '10:00AM',
                'day': 'M',
                'location': 'LR1'
            }
        ]
        mock_get_extractor.return_value = mock_extractor
        
        manager = ExtractionManager()
        
        start = time.time()
        result = manager.extract_schedule('/fake/path.pdf', 'student')
        elapsed = time.time() - start
        
        # PDF extraction should be very fast (< 1 second even with mocks)
        self.assertLess(result['processing_time'], 1.0)
        self.assertEqual(result['extraction_method'], 'pdf_text')


# Run tests with: python manage.py test api.tests.test_extraction --verbosity=2
