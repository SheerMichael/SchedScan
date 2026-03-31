"""
Unit tests for PII redaction logic in BaseCORUploadView._redact_text().

These are security regression tests — if any of these fail, PII could leak
into ExtractionLog.raw_text_preview and be visible in the admin dashboard.
"""
import re

from django.test import SimpleTestCase

# Import the regex patterns directly from the view so tests stay in sync
# with the production implementation.
from api.views.upload_views import BaseCORUploadView


class RedactionTestCase(SimpleTestCase):
    """
    Tests for student number and email masking.
    Uses a throw-away BaseCORUploadView instance (no upload needed).
    """

    def setUp(self):
        # BaseCORUploadView cannot be instantiated without a request, but
        # _redact_text is a plain method that only touches self for its
        # compiled regex patterns — both of which are class-level attributes.
        # We bypass the view machinery entirely.
        self.view = BaseCORUploadView.__new__(BaseCORUploadView)

    # ------------------------------------------------------------------ #
    # Student number masking                                               #
    # ------------------------------------------------------------------ #

    def test_student_number_middle_digits_masked(self):
        result = self.view._redact_text('Student: 2022-01191')
        # Middle digits between first and last digit of the number part masked
        self.assertNotIn('2022-01191', result)
        self.assertIn('2022-', result)
        # The format should keep year, first digit, stars, last digit
        self.assertRegex(result, r'2022-\d\*+\d')

    def test_student_number_various_lengths(self):
        cases = [
            '2021-12345',
            '2023-99999',
            '2020-10001',
        ]
        for raw in cases:
            with self.subTest(raw=raw):
                result = self.view._redact_text(raw)
                self.assertNotIn(raw, result)
                self.assertRegex(result, r'\d{4}-\d\*+\d')

    def test_student_number_not_altered_without_match(self):
        text = 'No personal data here.'
        result = self.view._redact_text(text)
        self.assertEqual(result, text)

    def test_student_number_year_and_boundary_preserved(self):
        """Year (YYYY-) prefix and last digit must survive redaction."""
        result = self.view._redact_text('ID: 2022-01191 enrolled')
        self.assertIn('2022-', result)
        # Last digit of the numeric part (1) must appear
        self.assertRegex(result, r'2022-\d\*+1')

    # ------------------------------------------------------------------ #
    # Email masking                                                         #
    # ------------------------------------------------------------------ #

    def test_email_local_part_masked(self):
        result = self.view._redact_text('Contact: john.doe@example.com')
        self.assertNotIn('john.doe', result)
        self.assertIn('@example.com', result)

    def test_email_first_and_last_char_preserved(self):
        """First and last characters of the local-part must be kept."""
        result = self.view._redact_text('user: john.doe@example.com')
        # local part is "john.doe" → first='j', last='e'
        self.assertRegex(result, r'j\*+e@example\.com')

    def test_email_domain_not_masked(self):
        result = self.view._redact_text('admin@schedscan.app')
        self.assertIn('@schedscan.app', result)

    def test_short_email_does_not_crash(self):
        """A 3-char local part (first + zero middle + last) should not raise."""
        result = self.view._redact_text('ab@x.com')
        # ab = first 'a', middle '', last 'b' → 'a*b@x.com' — no crash required
        self.assertIsInstance(result, str)

    # ------------------------------------------------------------------ #
    # Mixed PII                                                            #
    # ------------------------------------------------------------------ #

    def test_both_student_number_and_email_masked_together(self):
        raw = 'Student 2022-01191 (john.doe@example.com) enrolled'
        result = self.view._redact_text(raw)
        self.assertNotIn('01191', result)
        self.assertNotIn('john.doe', result)
        self.assertIn('@example.com', result)
        self.assertIn('2022-', result)

    def test_plain_text_unchanged(self):
        text = 'Schedule for Monday: CC 102 02:30PM-04:00PM LR3'
        result = self.view._redact_text(text)
        self.assertEqual(result, text)

    # ------------------------------------------------------------------ #
    # Student number normalization/extraction                              #
    # ------------------------------------------------------------------ #

    def test_normalize_student_number_accepts_hyphen_and_compact(self):
        self.assertEqual(self.view._normalize_student_number('2023-20243'), '2023-20243')
        self.assertEqual(self.view._normalize_student_number('202320243'), '2023-20243')
        self.assertEqual(self.view._normalize_student_number('2023 20243'), '2023-20243')

    def test_extract_student_number_from_text_supports_common_formats(self):
        text_a = 'Student Number: 2023-20243 Registered'
        text_b = 'Student Number 202320243 is valid'
        text_c = 'Student Number 2023 20243'

        self.assertEqual(self.view._extract_student_number_from_text(text_a), '2023-20243')
        self.assertEqual(self.view._extract_student_number_from_text(text_b), '2023-20243')
        self.assertEqual(self.view._extract_student_number_from_text(text_c), '2023-20243')
