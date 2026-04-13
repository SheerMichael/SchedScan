"""
Unit tests for the hybrid PDF extraction system.
Tests PDF extraction, OCR fallback, extraction manager, and quality validation.

Run with: python manage.py test api.tests.test_extraction
"""

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import Mock, patch, MagicMock
import os
from datetime import timedelta
from rest_framework.test import APIClient
from django.utils import timezone

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


class StudentHandwrittenOCRParsingTestCase(TestCase):
    """Regression tests for handwritten student image parsing."""

    def setUp(self):
        self.extractor = StudentCORExtractor()

    def test_parse_handwritten_line_accepts_optional_meridiem(self):
        line = 'OS 7:00-9:00 LR1'
        course = self.extractor._parse_handwritten_line(line)
        self.assertIsNotNone(course)
        self.assertEqual(course['subject_code'], 'OS')
        self.assertEqual(course['start_time'], '07:00')
        self.assertEqual(course['end_time'], '09:00')

    def test_parse_handwritten_line_handles_dot_separator_and_lp_location(self):
        line = 'SE 1.00PM - 3:00PM LP2'
        course = self.extractor._parse_handwritten_line(line)
        self.assertIsNotNone(course)
        self.assertEqual(course['subject_code'], 'SE')
        self.assertEqual(course['start_time'], '01:00PM')
        self.assertEqual(course['end_time'], '03:00PM')
        self.assertEqual(course['location'], 'LP2')


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

    @override_settings(EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED=True)
    @patch('api.utils.extraction_manager.StagedExtractionOrchestrator')
    def test_force_ocr_fallback_bypasses_direct_file_mode(self, mock_orchestrator_class):
        """force_ocr_fallback must disable direct-file vision shortcut."""
        mock_orchestrator = Mock()
        mock_orchestrator.run.return_value = {
            'courses': [
                {
                    'subject_code': 'BSCS101',
                    'start_time': '08:00AM',
                    'end_time': '10:00AM',
                    'day': 'M',
                }
            ],
            'extraction_method': 'ocr_fallback',
            'confidence': 0.9,
            'attempts': ['pdf_text', 'ocr_fallback'],
            'raw_text': 'Student Number 2023-20243',
        }
        mock_orchestrator_class.return_value = mock_orchestrator

        manager = ExtractionManager()
        result = manager.extract_schedule('/fake/path.pdf', 'student', force_ocr_fallback=True)

        mock_orchestrator.run.assert_called_once()
        self.assertEqual(result['extraction_method'], 'ocr_fallback')
        self.assertIn('ocr_fallback', result['attempts'])

    @override_settings(
        EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED=True,
        EXTRACTION_LLM_DIRECT_FILE_FALLBACK_ON_REJECT=True,
    )
    @patch('api.utils.extraction_manager.parse_document_with_llm_vision')
    @patch('api.utils.extraction_manager.StagedExtractionOrchestrator')
    def test_direct_file_reject_with_empty_courses_falls_back_to_staged(
        self,
        mock_orchestrator_class,
        mock_parse_vision,
    ):
        """Direct-file mode should recover via staged extraction when vision fails closed."""
        mock_parse_vision.return_value = (
            [],
            {'student_number': '', 'semester': '', 'school_year': ''},
            {
                'llm_used': True,
                'llm_parse_success': False,
                'llm_failure_reason': 'invalid_json',
            },
        )

        mock_orchestrator = Mock()
        mock_orchestrator.run.return_value = {
            'courses': [
                {
                    'subject_code': 'BSCS101',
                    'start_time': '08:00AM',
                    'end_time': '10:00AM',
                    'day': 'M',
                    'location': 'LR1',
                }
            ],
            'extraction_method': 'ocr_fallback',
            'confidence': 0.9,
            'attempts': ['ocr_fallback'],
            'student_number': '2022-01191',
            'semester': '1ST',
            'school_year': '2025-2026',
            'raw_text': 'Student number 2022-01191',
        }
        mock_orchestrator_class.return_value = mock_orchestrator

        manager = ExtractionManager()
        result = manager.extract_schedule('/fake/path.jpg', 'student')

        mock_orchestrator.run.assert_called_once()
        self.assertTrue(result.get('fallback_triggered', False))
        self.assertGreaterEqual(len(result.get('courses', [])), 1)

    @override_settings(
        EXTRACTION_LLM_DIRECT_FILE_PARSE_ENABLED=True,
        EXTRACTION_LLM_DIRECT_FILE_FALLBACK_ON_REJECT=True,
        EXTRACTION_VISION_ONLY_MODE=True,
    )
    @patch('api.utils.extraction_manager.parse_document_with_llm_vision')
    @patch('api.utils.extraction_manager.StagedExtractionOrchestrator')
    def test_vision_only_mode_disables_staged_fallback_on_timeout(
        self,
        mock_orchestrator_class,
        mock_parse_vision,
    ):
        """Vision-only mode must not run staged OCR fallback when vision times out."""
        mock_parse_vision.return_value = (
            [],
            {'student_number': '', 'semester': '', 'school_year': ''},
            {
                'llm_used': True,
                'llm_parse_success': False,
                'llm_failure_reason': 'timeout',
            },
        )

        manager = ExtractionManager()
        result = manager.extract_schedule('/fake/path.jpg', 'student')

        mock_orchestrator_class.assert_not_called()
        self.assertEqual(result.get('failure_category'), 'timeout')
        self.assertEqual(result.get('confidence'), 0.0)
        self.assertEqual(result.get('extraction_method'), 'llm_vision_parse')
        self.assertFalse(result.get('accepted', True))


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
        """Student COR upload uses extraction manager for ownership check and returns 202."""
        # Mock extraction manager
        mock_manager = Mock()
        mock_manager.extract_student_number_for_ownership_gate.return_value = {
            'student_number': '2022-01191',
            'extraction_method': 'llm_vision_metadata_gate',
            'confidence': 1.0,
            'processing_time': 0.3,
            'attempts': ['llm_vision_metadata_gate'],
            'failure_category': 'none',
            'validator_errors': [],
            'score_breakdown': {},
            'llm_failure_reason': '',
        }
        mock_manager_class.return_value = mock_manager

        # Create fake PDF file
        pdf_file = SimpleUploadedFile(
            "test_cor.pdf",
            b"fake pdf content",
            content_type="application/pdf"
        )

        with patch('api.views.upload_views._submit_extraction_job', return_value=True) as mock_submit_job:
            response = self.client.post(
                '/api/upload-cor/student/',
                {'file': pdf_file},
                format='multipart'
            )

        # Upload now returns 202 Accepted (async) instead of 201 Created (sync)
        self.assertEqual(response.status_code, 202)
        self.assertIn('job_id', response.data)
        self.assertEqual(response.data['status'], 'processing')
        self.assertIn('message', response.data)
        mock_submit_job.assert_called_once()

    @patch('api.views.upload_views.ExtractionManager')
    def test_student_upload_ownership_mismatch_returns_non_retryable_payload(self, mock_manager_class):
        """Sync ownership mismatch should return explicit non-retryable failure metadata."""
        mock_manager = Mock()
        mock_manager.extract_student_number_for_ownership_gate.return_value = {
            'student_number': '2022-99999',
            'extraction_method': 'llm_vision_metadata_gate',
            'confidence': 0.99,
            'processing_time': 0.35,
            'attempts': ['llm_vision_metadata_gate'],
            'failure_category': 'none',
            'validator_errors': [],
            'score_breakdown': {},
            'llm_failure_reason': '',
        }
        mock_manager_class.return_value = mock_manager

        pdf_file = SimpleUploadedFile(
            'other_student_cor.pdf',
            b'fake pdf content',
            content_type='application/pdf'
        )

        with patch('api.views.upload_views._submit_extraction_job') as mock_submit_job:
            response = self.client.post(
                '/api/upload-cor/student/',
                {'file': pdf_file},
                format='multipart'
            )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data.get('code'), 'OWNERSHIP_MISMATCH')
        self.assertEqual(response.data.get('failure_category'), 'ownership_mismatch')
        self.assertFalse(response.data.get('retryable', True))
        self.assertIn('Please upload your own COR', response.data.get('message', ''))
        mock_submit_job.assert_not_called()

    @patch('api.views.upload_views.ExtractionManager')
    def test_retry_response_preserves_legacy_keys_with_enhanced_metadata(self, mock_manager_class):
        """Low-confidence student upload still returns 202 (quality rejection now async)."""
        mock_manager = Mock()
        mock_manager.extract_student_number_for_ownership_gate.return_value = {
            'student_number': '2022-01191',
            'extraction_method': 'llm_vision_metadata_gate',
            'confidence': 1.0,
            'processing_time': 0.35,
            'attempts': ['llm_vision_metadata_gate'],
            'failure_category': 'none',
            'validator_errors': [],
            'score_breakdown': {},
            'llm_failure_reason': '',
        }
        mock_manager_class.return_value = mock_manager

        pdf_file = SimpleUploadedFile(
            'test_cor.pdf',
            b'fake pdf content',
            content_type='application/pdf'
        )

        with patch('api.views.upload_views._submit_extraction_job', return_value=True):
            response = self.client.post(
                '/api/upload-cor/student/',
                {'file': pdf_file},
                format='multipart'
            )

        # The sync ownership check won't reject on low confidence — it passes
        # and hands off to the async thread which will fail internally.
        self.assertEqual(response.status_code, 202)
        self.assertIn('job_id', response.data)


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


class AsyncExtractionJobTestCase(TestCase):
    """
    Tests for the async extraction job lifecycle:
    - Upload view returns 202 with job_id
    - Polling endpoint returns correct shape for each status
    - Ownership enforcement on polling endpoint
    - run_extraction_job() sets status 'done' on success
    - run_extraction_job() sets status 'failed' on exception (safety net)
    - run_extraction_job() cleans up the temp file
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='asynctest@example.com',
            password='testpass123',
            first_name='Async',
            last_name='Tester',
            student_number='2022-09999',
        )
        self.other_user = User.objects.create_user(
            email='other@example.com',
            password='testpass123',
            first_name='Other',
            last_name='User',
            student_number='2022-88888',
        )
        self.client.force_authenticate(user=self.user)

    # ------------------------------------------------------------------
    # Upload view: returns 202
    # ------------------------------------------------------------------

    @patch('api.views.upload_views.run_extraction_job')
    @patch('api.views.upload_views.ExtractionManager')
    def test_student_upload_returns_202(self, mock_manager_class, mock_run_job):
        """Student COR upload passes ownership check and returns 202 Accepted."""
        mock_manager = Mock()
        mock_manager.extract_student_number_for_ownership_gate.return_value = {
            'student_number': '2022-09999',
            'extraction_method': 'llm_vision_metadata_gate',
            'confidence': 1.0,
            'processing_time': 0.3,
            'attempts': ['llm_vision_metadata_gate'],
            'failure_category': 'none',
            'validator_errors': [],
            'score_breakdown': {},
            'llm_failure_reason': '',
        }
        mock_manager_class.return_value = mock_manager

        # Prevent the real background thread from executing
        mock_run_job.return_value = None

        pdf_file = SimpleUploadedFile(
            'test_cor.pdf', b'fake pdf content', content_type='application/pdf'
        )

        with patch('api.views.upload_views._submit_extraction_job', return_value=True) as mock_submit_job:
            response = self.client.post(
                '/api/upload-cor/student/',
                {'file': pdf_file},
                format='multipart',
            )

        self.assertEqual(response.status_code, 202)
        self.assertIn('job_id', response.data)
        self.assertEqual(response.data['status'], 'processing')
        self.assertIn('message', response.data)
        mock_submit_job.assert_called_once()

    @override_settings(
        EXTRACTION_ASYNC_MAX_INFLIGHT_PER_USER=1,
        EXTRACTION_ASYNC_MAX_INFLIGHT_GLOBAL=5,
    )
    @patch('api.views.upload_views.ExtractionManager')
    def test_student_upload_rejected_when_user_inflight_limit_reached(self, mock_manager_class):
        from api.models import ExtractionJob

        ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='existing.pdf',
            status='processing',
        )

        pdf_file = SimpleUploadedFile(
            'test_cor.pdf', b'fake pdf content', content_type='application/pdf'
        )

        with patch('api.views.upload_views._submit_extraction_job') as mock_submit_job:
            response = self.client.post(
                '/api/upload-cor/student/',
                {'file': pdf_file},
                format='multipart',
            )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data.get('code'), 'EXTRACTION_BUSY')
        self.assertTrue(response.data.get('retryable', False))
        self.assertEqual(response.data.get('inflight', {}).get('user_limit'), 1)
        mock_manager_class.assert_not_called()
        mock_submit_job.assert_not_called()

    @override_settings(
        EXTRACTION_ASYNC_MAX_INFLIGHT_PER_USER=3,
        EXTRACTION_ASYNC_MAX_INFLIGHT_GLOBAL=1,
    )
    def test_faculty_upload_rejected_when_global_inflight_limit_reached(self):
        from api.models import ExtractionJob

        ExtractionJob.objects.create(
            user=self.other_user,
            upload_type='student',
            file_name='other-user-job.pdf',
            status='pending',
        )

        pdf_file = SimpleUploadedFile(
            'faculty_cor.pdf', b'faculty bytes', content_type='application/pdf'
        )

        with patch('api.views.upload_views._submit_extraction_job') as mock_submit_job:
            response = self.client.post(
                '/api/upload-cor/faculty/',
                {'file': pdf_file},
                format='multipart',
            )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data.get('code'), 'EXTRACTION_BUSY')
        self.assertEqual(response.data.get('inflight', {}).get('global_limit'), 1)
        mock_submit_job.assert_not_called()

    @override_settings(
        EXTRACTION_ASYNC_MAX_INFLIGHT_PER_USER=5,
        EXTRACTION_ASYNC_MAX_INFLIGHT_GLOBAL=5,
    )
    @patch('api.views.upload_views._submit_extraction_job')
    @patch('api.views.upload_views.ExtractionManager')
    def test_upload_rejected_when_worker_slots_saturated(self, mock_manager_class, mock_submit_job):
        from api.models import ExtractionJob

        mock_submit_job.return_value = False
        mock_manager = Mock()
        mock_manager.extract_student_number_for_ownership_gate.return_value = {
            'student_number': '2022-09999',
            'extraction_method': 'llm_vision_metadata_gate',
            'confidence': 1.0,
            'processing_time': 0.3,
            'attempts': ['llm_vision_metadata_gate'],
            'failure_category': 'none',
            'validator_errors': [],
            'score_breakdown': {},
            'llm_failure_reason': '',
        }
        mock_manager_class.return_value = mock_manager

        pdf_file = SimpleUploadedFile(
            'test_cor.pdf', b'fake pdf content', content_type='application/pdf'
        )

        response = self.client.post(
            '/api/upload-cor/student/',
            {'file': pdf_file},
            format='multipart',
        )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data.get('code'), 'EXTRACTION_BUSY')
        self.assertTrue(response.data.get('retryable', False))
        self.assertEqual(ExtractionJob.objects.count(), 0)

    @patch('api.utils.extraction_manager._send_extraction_job_notification')
    @patch('api.utils.extraction_manager._write_extraction_log_for_job')
    @patch('api.utils.extraction_manager.ExtractionManager')
    def test_run_extraction_job_student_missing_number_fails(self, mock_manager_class, mock_log, mock_notify):
        """Async student jobs must fail when student number is missing and ownership cannot be verified."""
        import tempfile
        from api.models import ExtractionJob
        from api.utils.extraction_manager import run_extraction_job

        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            f.write(b'fake image')
            temp_path = f.name

        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='student_image.jpg',
            status='pending',
            _temp_file_path=temp_path,
        )

        mock_manager = Mock()
        mock_manager.extract_schedule.return_value = {
            'courses': [
                {
                    'subject_code': 'BSCS101',
                    'subject_name': 'Programming',
                    'start_time': '08:00AM',
                    'end_time': '10:00AM',
                    'day': 'M',
                    'location': 'LR1',
                }
            ],
            'extraction_method': 'llm_vision_parse',
            'confidence': 0.90,
            'processing_time': 1.0,
            'attempts': ['llm_vision_parse'],
            'student_number': '',
            'failure_category': 'none',
            'validator_errors': [],
            'score_breakdown': {},
            'accepted': True,
        }
        mock_manager_class.return_value = mock_manager

        run_extraction_job(job.job_id)

        job.refresh_from_db()
        self.assertEqual(job.status, 'failed')
        self.assertEqual(job.failure_category, 'metadata_mismatch')
        self.assertIn('Unable to verify ownership', job.error_message)
        mock_notify.assert_called_once_with(job, success=False)

    @patch('api.views.upload_views.ExtractionManager')
    def test_faculty_upload_returns_202_without_ownership_check(self, mock_manager_class):
        """Faculty COR upload skips ownership check and returns 202 directly."""
        # Mock should NOT be called for faculty (no sync extraction for ownership)
        mock_manager = Mock()
        mock_manager_class.return_value = mock_manager

        pdf_file = SimpleUploadedFile(
            'faculty_cor.pdf', b'fake faculty pdf', content_type='application/pdf'
        )

        self.client.force_authenticate(user=self.user)

        with patch('api.views.upload_views._submit_extraction_job', return_value=True):
            response = self.client.post(
                '/api/upload-cor/faculty/',
                {'file': pdf_file},
                format='multipart',
            )

        self.assertEqual(response.status_code, 202)
        self.assertIn('job_id', response.data)
        # ExtractionManager should NOT have been instantiated for faculty
        mock_manager_class.assert_not_called()

    @patch('api.views.upload_views.ExtractionManager')
    def test_student_image_upload_defers_sync_ownership_and_returns_202(self, mock_manager_class):
        """Student image upload defers sync ownership check and should return 202 quickly."""
        image_file = SimpleUploadedFile(
            'student_schedule.jpg', b'fake image bytes', content_type='image/jpeg'
        )

        self.client.force_authenticate(user=self.user)

        with patch('api.views.upload_views._submit_extraction_job', return_value=True):
            response = self.client.post(
                '/api/upload-cor/student/',
                {'file': image_file},
                format='multipart',
            )

        self.assertEqual(response.status_code, 202)
        self.assertIn('job_id', response.data)
        mock_manager_class.assert_not_called()

    @patch('api.views.upload_views.ExtractionManager')
    def test_student_image_content_type_with_pdf_filename_still_defers_sync(self, mock_manager_class):
        """Image MIME should win over misleading filename extension for student uploads."""
        image_file = SimpleUploadedFile(
            'cor.pdf', b'fake image bytes', content_type='image/jpeg'
        )

        self.client.force_authenticate(user=self.user)

        with patch('api.views.upload_views._submit_extraction_job', return_value=True):
            response = self.client.post(
                '/api/upload-cor/student/',
                {'file': image_file},
                format='multipart',
            )

        self.assertEqual(response.status_code, 202)
        self.assertIn('job_id', response.data)
        mock_manager_class.assert_not_called()

    @patch('api.utils.extraction_manager._send_extraction_job_notification')
    @patch('api.utils.extraction_manager._write_extraction_log_for_job')
    @patch('api.utils.extraction_manager.ExtractionManager')
    def test_run_extraction_job_failed_rejection_persists_method(self, mock_manager_class, mock_log, mock_notify):
        """Rejected async jobs should still persist the best-known extraction method."""
        import tempfile
        from api.models import ExtractionJob
        from api.utils.extraction_manager import run_extraction_job

        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            f.write(b'fake image')
            temp_path = f.name

        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='student_image.jpg',
            status='pending',
            _temp_file_path=temp_path,
        )

        mock_manager = Mock()
        mock_manager.extract_schedule.return_value = {
            'courses': [],
            'extraction_method': 'ocr',
            'confidence': 0.511,
            'processing_time': 2.0,
            'attempts': ['ocr'],
            'failure_category': 'low_confidence',
            'validator_errors': [],
            'score_breakdown': {},
            'accepted': False,
            'llm_failure_reason': 'timeout',
        }
        mock_manager_class.return_value = mock_manager

        run_extraction_job(job.job_id)

        job.refresh_from_db()
        self.assertEqual(job.status, 'failed')
        self.assertEqual(job.failure_category, 'low_confidence')
        self.assertEqual(job.extraction_method, 'ocr')
        mock_notify.assert_called_once_with(job, success=False)

    # ------------------------------------------------------------------
    # Polling endpoint: status shapes
    # ------------------------------------------------------------------

    def _make_job(self, user=None, status='pending'):
        from api.models import ExtractionJob
        return ExtractionJob.objects.create(
            user=user or self.user,
            upload_type='student',
            file_name='test.pdf',
            status=status,
        )

    def test_poll_pending_returns_processing(self):
        job = self._make_job(status='pending')
        response = self.client.get(f'/api/extraction-jobs/{job.job_id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'processing')
        self.assertEqual(response.data['job_id'], str(job.job_id))

    def test_poll_processing_returns_processing(self):
        job = self._make_job(status='processing')
        response = self.client.get(f'/api/extraction-jobs/{job.job_id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'processing')

    def test_poll_stale_processing_job_auto_fails(self):
        from django.utils import timezone
        from datetime import timedelta

        job = self._make_job(status='processing')
        stale_time = timezone.now() - timedelta(minutes=30)
        type(job).objects.filter(pk=job.pk).update(updated_at=stale_time)

        response = self.client.get(f'/api/extraction-jobs/{job.job_id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'failed')
        self.assertEqual(response.data.get('failure_category'), 'system_error')

    def test_poll_done_returns_courses(self):
        from api.models import ExtractionJob
        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='test.pdf',
            status='done',
            courses=[{'subject_code': 'BSCS101', 'day': 'M', 'start_time': '08:00AM', 'end_time': '10:00AM'}],
            confidence=0.95,
            extraction_method='llm',
        )
        response = self.client.get(f'/api/extraction-jobs/{job.job_id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'done')
        self.assertEqual(response.data['total_courses'], 1)
        self.assertIn('courses', response.data)
        self.assertIn('confidence', response.data)

    def test_poll_failed_returns_failure_info(self):
        from api.models import ExtractionJob
        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='test.pdf',
            status='failed',
            failure_category='low_confidence',
        )
        response = self.client.get(f'/api/extraction-jobs/{job.job_id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'failed')
        self.assertIn('failure_category', response.data)
        self.assertIn('message', response.data)
        self.assertTrue(response.data.get('retryable', False))

    def test_poll_failed_ownership_mismatch_returns_specific_message_and_not_retryable(self):
        from api.models import ExtractionJob
        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='test.pdf',
            status='failed',
            failure_category='ownership_mismatch',
        )

        response = self.client.get(f'/api/extraction-jobs/{job.job_id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'failed')
        self.assertEqual(response.data.get('failure_category'), 'ownership_mismatch')
        self.assertFalse(response.data.get('retryable', True))
        self.assertIn('did not match your registered number', response.data.get('message', ''))

    def test_poll_another_users_job_returns_403(self):
        job = self._make_job(user=self.other_user)
        response = self.client.get(f'/api/extraction-jobs/{job.job_id}/')
        self.assertEqual(response.status_code, 403)

    def test_poll_nonexistent_job_returns_404(self):
        import uuid
        fake_id = uuid.uuid4()
        response = self.client.get(f'/api/extraction-jobs/{fake_id}/')
        self.assertEqual(response.status_code, 404)

    def test_recent_jobs_returns_only_authenticated_users_jobs(self):
        own_job = self._make_job(status='processing')
        other_job = self._make_job(user=self.other_user, status='processing')

        response = self.client.get('/api/extraction-jobs/recent/?limit=5')
        self.assertEqual(response.status_code, 200)
        self.assertIn('jobs', response.data)

        job_ids = [item['job_id'] for item in response.data['jobs']]
        self.assertIn(str(own_job.job_id), job_ids)
        self.assertNotIn(str(other_job.job_id), job_ids)

    def test_recent_jobs_upload_type_filter(self):
        from api.models import ExtractionJob

        ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='student.pdf',
            status='done',
            courses=[{'subject_code': 'BSCS101'}],
            confidence=0.90,
        )
        ExtractionJob.objects.create(
            user=self.user,
            upload_type='faculty',
            file_name='faculty.pdf',
            status='processing',
        )

        response = self.client.get('/api/extraction-jobs/recent/?upload_type=student&limit=10')
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data.get('count', 0), 1)
        self.assertTrue(all(item['upload_type'] == 'student' for item in response.data['jobs']))

    # ------------------------------------------------------------------
    # run_extraction_job: lifecycle
    # ------------------------------------------------------------------

    @patch('api.utils.extraction_manager._send_extraction_job_notification')
    @patch('api.utils.extraction_manager._write_extraction_log_for_job')
    @patch('api.utils.extraction_manager.ExtractionManager')
    def test_run_extraction_job_success(self, mock_manager_class, mock_log, mock_notify):
        """run_extraction_job() sets status=done and writes courses on success."""
        import tempfile, os
        from api.models import ExtractionJob, Schedule, Course
        from api.utils.extraction_manager import run_extraction_job

        # Create a real temp file
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            f.write(b'fake pdf')
            temp_path = f.name

        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='test.pdf',
            status='pending',
            _temp_file_path=temp_path,
        )

        mock_manager = Mock()
        mock_manager.extract_schedule.return_value = {
            'courses': [
                {
                    'subject_code': 'BSCS101',
                    'subject_name': 'Programming',
                    'start_time': '08:00AM',
                    'end_time': '10:00AM',
                    'day': 'M',
                    'location': 'LR1',
                }
            ],
            'extraction_method': 'pdf_text',
            'confidence': 0.95,
            'processing_time': 0.3,
            'attempts': ['pdf_text'],
            'student_number': '2022-09999',
            'failure_category': 'none',
            'validator_errors': [],
            'score_breakdown': {},
            'accepted': True,
        }
        mock_manager_class.return_value = mock_manager

        run_extraction_job(job.job_id)

        job.refresh_from_db()
        self.assertEqual(job.status, 'done')
        self.assertEqual(len(job.courses), 1)
        self.assertEqual(Schedule.objects.filter(user=self.user, upload_type='student').count(), 1)
        saved_schedule = Schedule.objects.filter(user=self.user, upload_type='student').latest('id')
        linked_courses = Course.objects.filter(schedule=saved_schedule, user=self.user)
        self.assertEqual(linked_courses.count(), 1)
        self.assertEqual(linked_courses.first().subject_code, 'BSCS101')
        mock_notify.assert_called_once_with(job, success=True)
        # Temp file should be cleaned up
        self.assertFalse(os.path.exists(temp_path))

    @patch('api.utils.extraction_manager._send_extraction_job_notification')
    @patch('api.utils.extraction_manager._write_extraction_log_for_job')
    @patch('api.utils.extraction_manager.ExtractionManager')
    def test_run_extraction_job_triggers_schedule_based_auto_linking(self, mock_manager_class, mock_log, mock_notify):
        """Async extraction should auto-link student to faculty when schedule slots align."""
        import tempfile, os
        from api.models import ExtractionJob, ClassEnrollment, Schedule, Course
        from api.utils.extraction_manager import run_extraction_job

        faculty = User.objects.create_user(
            email='faculty_autolink@test.com',
            password='testpass123',
            first_name='Faculty',
            last_name='Auto',
            user_type='faculty',
        )
        faculty_schedule = Schedule.objects.create(
            user=faculty,
            title='Faculty Schedule',
            upload_type='faculty',
            is_active=True,
        )
        Course.objects.create(
            user=faculty,
            schedule=faculty_schedule,
            subject_code='BSCS101',
            subject_name='Programming',
            start_time='08:00AM',
            end_time='10:00AM',
            day='M',
            location='LR1',
        )

        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            f.write(b'fake pdf')
            temp_path = f.name

        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='test.pdf',
            status='pending',
            _temp_file_path=temp_path,
        )

        mock_manager = Mock()
        mock_manager.extract_schedule.return_value = {
            'courses': [
                {
                    'subject_code': 'BSCS101',
                    'subject_name': 'Programming',
                    'start_time': '08:05AM',
                    'end_time': '10:00AM',
                    'day': 'M',
                    'location': 'LR1',
                }
            ],
            'extraction_method': 'pdf_text',
            'confidence': 0.95,
            'processing_time': 0.3,
            'attempts': ['pdf_text'],
            'student_number': '2022-09999',
            'failure_category': 'none',
            'validator_errors': [],
            'score_breakdown': {},
            'accepted': True,
        }
        mock_manager_class.return_value = mock_manager

        run_extraction_job(job.job_id)

        self.assertTrue(
            ClassEnrollment.objects.filter(
                student=self.user,
                faculty=faculty,
                subject_code='BSCS101',
                enrollment_type='auto',
                status='active',
            ).exists()
        )
        self.assertFalse(os.path.exists(temp_path))

    @patch('api.utils.extraction_manager._send_extraction_job_notification')
    @patch('api.utils.extraction_manager._write_extraction_log_for_job')
    @patch('api.utils.extraction_manager.ExtractionManager')
    def test_run_extraction_job_accepts_normalized_student_number_match(self, mock_manager_class, mock_log, mock_notify):
        """Async ownership check should normalize compact student numbers from handwritten docs."""
        import tempfile, os
        from api.models import ExtractionJob
        from api.utils.extraction_manager import run_extraction_job

        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            f.write(b'fake image')
            temp_path = f.name

        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='handwritten.jpg',
            status='pending',
            _temp_file_path=temp_path,
        )

        mock_manager = Mock()
        mock_manager.extract_schedule.return_value = {
            'courses': [
                {
                    'subject_code': 'OS',
                    'subject_name': '',
                    'start_time': '07:00AM',
                    'end_time': '09:00AM',
                    'day': '',
                    'location': 'LR1',
                }
            ],
            'extraction_method': 'llm_vision_parse',
            'confidence': 0.90,
            'processing_time': 1.0,
            'attempts': ['llm_vision_parse'],
            'student_number': '202209999',
            'semester': '1ST',
            'school_year': '2025-2026',
            'failure_category': 'none',
            'validator_errors': [],
            'score_breakdown': {},
            'accepted': True,
            'llm_failure_reason': '',
        }
        mock_manager_class.return_value = mock_manager

        run_extraction_job(job.job_id)

        job.refresh_from_db()
        self.assertEqual(job.status, 'done')
        self.assertEqual(job.student_number, '2022-09999')
        mock_notify.assert_called_once_with(job, success=True)
        self.assertFalse(os.path.exists(temp_path))

    @patch('api.utils.extraction_manager._send_extraction_job_notification')
    @patch('api.utils.extraction_manager._write_extraction_log_for_job')
    @patch('api.utils.extraction_manager.ExtractionManager')
    def test_run_extraction_job_student_ownership_mismatch_fails(self, mock_manager_class, mock_log, mock_notify):
        """Accepted extraction must fail if extracted student number does not match job user."""
        import tempfile, os
        from api.models import ExtractionJob
        from api.utils.extraction_manager import run_extraction_job

        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            f.write(b'fake pdf')
            temp_path = f.name

        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='test.pdf',
            status='pending',
            _temp_file_path=temp_path,
        )

        mock_manager = Mock()
        mock_manager.extract_schedule.return_value = {
            'courses': [
                {
                    'subject_code': 'BSCS101',
                    'subject_name': 'Programming',
                    'start_time': '08:00AM',
                    'end_time': '10:00AM',
                    'day': 'M',
                    'location': 'LR1',
                }
            ],
            'extraction_method': 'llm_full_parse',
            'confidence': 0.95,
            'processing_time': 0.3,
            'attempts': ['llm_full_parse'],
            'student_number': '2022-00001',
            'failure_category': 'none',
            'validator_errors': [],
            'score_breakdown': {},
            'accepted': True,
        }
        mock_manager_class.return_value = mock_manager

        run_extraction_job(job.job_id)

        job.refresh_from_db()
        self.assertEqual(job.status, 'failed')
        self.assertEqual(job.failure_category, 'ownership_mismatch')
        self.assertIn('does not match', job.error_message)
        mock_log.assert_called_once_with(job, mock_manager.extract_schedule.return_value, success=False)
        mock_notify.assert_called_once_with(job, success=False)
        self.assertFalse(os.path.exists(temp_path))

    @patch('api.utils.extraction_manager._send_extraction_job_notification')
    @patch('api.utils.extraction_manager.ExtractionManager')
    def test_run_extraction_job_exception_sets_failed(self, mock_manager_class, mock_notify):
        """
        CRITICAL: run_extraction_job() must set status=failed on unhandled exception.
        Without this, jobs would hang in 'processing' forever.
        """
        import tempfile, os
        from api.models import ExtractionJob
        from api.utils.extraction_manager import run_extraction_job

        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            f.write(b'fake pdf')
            temp_path = f.name

        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='test.pdf',
            status='pending',
            _temp_file_path=temp_path,
        )

        # Simulate a catastrophic exception inside the extraction
        mock_manager = Mock()
        mock_manager.extract_schedule.side_effect = RuntimeError("Simulated crash")
        mock_manager_class.return_value = mock_manager

        run_extraction_job(job.job_id)  # Must not raise

        job.refresh_from_db()
        self.assertEqual(job.status, 'failed')
        self.assertEqual(job.failure_category, 'system_error')
        self.assertIn('RuntimeError', job.error_message)
        mock_notify.assert_called_once_with(job, success=False)

    @patch('api.utils.extraction_manager._send_extraction_job_notification')
    @patch('api.utils.extraction_manager.ExtractionManager')
    def test_run_extraction_job_cleans_up_temp_file(self, mock_manager_class, mock_notify):
        """run_extraction_job() always deletes the temp file, even on exception."""
        import tempfile, os
        from api.models import ExtractionJob
        from api.utils.extraction_manager import run_extraction_job

        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            f.write(b'fake pdf')
            temp_path = f.name

        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='test.pdf',
            status='pending',
            _temp_file_path=temp_path,
        )

        mock_manager = Mock()
        mock_manager.extract_schedule.side_effect = RuntimeError("Crash")
        mock_manager_class.return_value = mock_manager

        run_extraction_job(job.job_id)

        self.assertFalse(os.path.exists(temp_path), "Temp file should be deleted after job completes")

    @patch('api.utils.extraction_manager._send_extraction_job_notification')
    def test_recover_stale_processing_jobs_marks_old_jobs_failed(self, mock_notify):
        """Stale recovery marks only old processing jobs as failed."""
        from api.models import ExtractionJob
        from api.utils.extraction_manager import recover_stale_processing_jobs

        stale_job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='stale.pdf',
            status='processing',
        )
        fresh_job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='fresh.pdf',
            status='processing',
        )

        stale_time = timezone.now() - timedelta(minutes=10)
        ExtractionJob.objects.filter(job_id=stale_job.job_id).update(updated_at=stale_time)

        recovered = recover_stale_processing_jobs(max_age_minutes=5, notify_user=True)

        self.assertEqual(recovered, 1)
        stale_job.refresh_from_db()
        fresh_job.refresh_from_db()

        self.assertEqual(stale_job.status, 'failed')
        self.assertEqual(stale_job.failure_category, 'system_error')
        self.assertIn('stale-job recovery', stale_job.error_message)

        self.assertEqual(fresh_job.status, 'processing')
        mock_notify.assert_called_once_with(stale_job, success=False)

    @patch('api.utils.extraction_manager._send_extraction_job_notification')
    def test_recover_stale_processing_jobs_dry_run_does_not_modify(self, mock_notify):
        """Dry-run reports stale jobs without modifying them."""
        from api.models import ExtractionJob
        from api.utils.extraction_manager import recover_stale_processing_jobs

        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='dryrun.pdf',
            status='processing',
        )
        stale_time = timezone.now() - timedelta(minutes=10)
        ExtractionJob.objects.filter(job_id=job.job_id).update(updated_at=stale_time)

        recovered = recover_stale_processing_jobs(max_age_minutes=5, notify_user=True, dry_run=True)

        self.assertEqual(recovered, 1)
        job.refresh_from_db()
        self.assertEqual(job.status, 'processing')
        mock_notify.assert_not_called()

    @patch('api.utils.extraction_manager._send_extraction_job_notification')
    def test_recover_stale_processing_jobs_cleans_stale_temp_file(self, mock_notify):
        """Stale recovery deletes leftover temp file from abandoned jobs."""
        import tempfile
        from api.models import ExtractionJob
        from api.utils.extraction_manager import recover_stale_processing_jobs

        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            f.write(b'stale temp file')
            temp_path = f.name

        job = ExtractionJob.objects.create(
            user=self.user,
            upload_type='student',
            file_name='stale-temp.pdf',
            status='processing',
            _temp_file_path=temp_path,
        )
        stale_time = timezone.now() - timedelta(minutes=10)
        ExtractionJob.objects.filter(job_id=job.job_id).update(updated_at=stale_time)

        recovered = recover_stale_processing_jobs(max_age_minutes=5, notify_user=False)

        self.assertEqual(recovered, 1)
        self.assertFalse(os.path.exists(temp_path))
        job.refresh_from_db()
        self.assertEqual(job._temp_file_path, '')
        mock_notify.assert_not_called()

