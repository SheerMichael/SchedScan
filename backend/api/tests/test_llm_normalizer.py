import json
import os
import tempfile
from unittest.mock import Mock, patch

import requests
from django.test import SimpleTestCase, override_settings

from api.utils.extraction.llm_normalizer import (
    normalize_with_llm,
    parse_document_metadata_with_llm_vision,
    parse_document_with_llm_vision,
    parse_with_llm,
)


class LLMNormalizerTestCase(SimpleTestCase):
    def setUp(self):
        self.seed_courses = [
            {
                'subject_code': 'CS101',
                'subject_name': 'Intro to CS',
                'day': 'M',
                'start_time': '08:00AM',
                'end_time': '09:00AM',
                'location': 'R1',
            }
        ]

    @override_settings(EXTRACTION_LLM_NORMALIZATION_ENABLED=False)
    def test_disabled_flag_returns_seed_courses(self):
        courses, telemetry = normalize_with_llm(
            extracted_text='sample text',
            seed_courses=self.seed_courses,
        )

        self.assertEqual(courses, self.seed_courses)
        self.assertFalse(telemetry['llm_used'])
        self.assertFalse(telemetry['llm_parse_success'])

    @override_settings(
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='llama3.2:3b',
        EXTRACTION_LLM_TIMEOUT_SECONDS=2,
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_timeout_fails_closed(self, mock_post):
        mock_post.side_effect = requests.Timeout('timed out')

        courses, telemetry = normalize_with_llm(
            extracted_text='sample text',
            seed_courses=self.seed_courses,
        )

        self.assertEqual(courses, self.seed_courses)
        self.assertTrue(telemetry['llm_used'])
        self.assertFalse(telemetry['llm_parse_success'])

    @override_settings(
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='llama3.2:3b',
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_malformed_json_fails_closed(self, mock_post):
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {'response': 'not-json'}
        mock_post.return_value = mock_response

        courses, telemetry = normalize_with_llm(
            extracted_text='sample text',
            seed_courses=self.seed_courses,
        )

        self.assertEqual(courses, self.seed_courses)
        self.assertTrue(telemetry['llm_used'])
        self.assertFalse(telemetry['llm_parse_success'])

    @override_settings(
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='llama3.2:3b',
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_unknown_keys_are_ignored(self, mock_post):
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            'response': (
                '{"courses": ['
                '{"subject_code": "CS101", "subject_name": "Intro to CS", '
                '"day": "M", "start_time": "08:00AM", '
                '"end_time": "09:00AM", "location": "R1"}'
                '], "hacked": true}'
            )
        }
        mock_post.return_value = mock_response

        courses, telemetry = normalize_with_llm(
            extracted_text='sample text',
            seed_courses=self.seed_courses,
        )

        self.assertEqual(len(courses), 1)
        self.assertEqual(courses[0]['subject_code'], 'CS101')
        self.assertTrue(telemetry['llm_used'])
        self.assertTrue(telemetry['llm_parse_success'])

    @override_settings(
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='llama3.2:3b',
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_success_returns_normalized_courses(self, mock_post):
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            'response': (
                '{"courses": ['
                '{"subject_code": "CS101", "subject_name": "Intro to CS", '
                '"day": "M", "start_time": "08:00AM", '
                '"end_time": "09:00AM", "location": "R1"}'
                ']}'
            )
        }
        mock_post.return_value = mock_response

        courses, telemetry = normalize_with_llm(
            extracted_text='sample text',
            seed_courses=self.seed_courses,
        )

        self.assertEqual(len(courses), 1)
        self.assertEqual(courses[0]['subject_code'], 'CS101')
        self.assertTrue(telemetry['llm_used'])
        self.assertTrue(telemetry['llm_parse_success'])

    @override_settings(
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='llama3.2:latest',
        EXTRACTION_LLM_REQUIRE_PINNED_MODEL=True,
    )
    def test_latest_tag_rejected_when_pinning_required(self):
        courses, telemetry = normalize_with_llm(
            extracted_text='sample text',
            seed_courses=self.seed_courses,
        )

        self.assertEqual(courses, self.seed_courses)
        self.assertTrue(telemetry['llm_used'])
        self.assertFalse(telemetry['llm_parse_success'])

    @override_settings(
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='llama3.2:3b',
        EXTRACTION_LLM_REQUIRE_MODEL_DIGEST=True,
        EXTRACTION_LLM_MODEL_DIGEST='',
    )
    def test_missing_digest_rejected_when_digest_required(self):
        courses, telemetry = normalize_with_llm(
            extracted_text='sample text',
            seed_courses=self.seed_courses,
        )

        self.assertEqual(courses, self.seed_courses)
        self.assertTrue(telemetry['llm_used'])
        self.assertFalse(telemetry['llm_parse_success'])

    @override_settings(
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='llama3.2:3b',
        EXTRACTION_LLM_API_KEY='test-secret-key-abc123',
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_api_key_header_sent_when_configured(self, mock_post):
        """X-Api-Key must be present in the outbound POST when the setting is set."""
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            'response': (
                '{"courses": ['
                '{"subject_code": "CS101", "subject_name": "Intro to CS", '
                '"day": "M", "start_time": "08:00AM", '
                '"end_time": "09:00AM", "location": "R1"}'
                ']}'
            )
        }
        mock_post.return_value = mock_response

        normalize_with_llm(
            extracted_text='sample text',
            seed_courses=self.seed_courses,
        )

        self.assertTrue(mock_post.called)
        sent_headers = mock_post.call_args.kwargs.get('headers', {})
        self.assertIn('X-Api-Key', sent_headers)
        self.assertEqual(sent_headers['X-Api-Key'], 'test-secret-key-abc123')

    @override_settings(
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='llama3.2:3b',
        EXTRACTION_LLM_API_KEY='',
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_no_api_key_header_when_empty(self, mock_post):
        """X-Api-Key must NOT be present when the setting is empty (local-dev mode)."""
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            'response': (
                '{"courses": ['
                '{"subject_code": "CS101", "subject_name": "Intro to CS", '
                '"day": "M", "start_time": "08:00AM", '
                '"end_time": "09:00AM", "location": "R1"}'
                ']}'
            )
        }
        mock_post.return_value = mock_response

        normalize_with_llm(
            extracted_text='sample text',
            seed_courses=self.seed_courses,
        )

        self.assertTrue(mock_post.called)
        sent_headers = mock_post.call_args.kwargs.get('headers', {})
        self.assertNotIn('X-Api-Key', sent_headers)


class ParseWithLLMTestCase(SimpleTestCase):
    """Tests for the full-document parse_with_llm() function."""

    FULL_PARSE_SETTINGS = dict(
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_FULL_PARSE_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='llama3.2:3b',
        EXTRACTION_LLM_REQUIRE_PINNED_MODEL=False,
    )

    # Minimal valid LLM response for a student handwritten note
    VALID_LLM_RESPONSE = json.dumps({
        'doc_metadata': {
            'student_number': '2022-01191',
            'semester': '1ST',
            'school_year': '2025-2026',
        },
        'courses': [
            {
                'subject_code': 'OS',
                'subject_name': '',
                'day': '',
                'start_time': '01:00PM',
                'end_time': '03:00PM',
                'location': 'LR1',
            },
            {
                'subject_code': 'ML',
                'subject_name': '',
                'day': '',
                'start_time': '07:00AM',
                'end_time': '09:00AM',
                'location': 'LR2',
            },
        ],
    })

    def _make_mock_response(self, text: str) -> Mock:
        m = Mock()
        m.raise_for_status.return_value = None
        m.json.return_value = {'response': text}
        return m

    @override_settings(
        EXTRACTION_LLM_FULL_PARSE_ENABLED=False,
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='llama3.2:3b',
    )
    def test_disabled_flag_returns_empty(self):
        """parse_with_llm returns empty when FULL_PARSE_ENABLED=False."""
        courses, meta, telemetry = parse_with_llm(
            raw_text='Student number 2022-01191\nOS 1:00 pm - 3:00 pm LR1',
            upload_type='student',
        )
        self.assertEqual(courses, [])
        self.assertFalse(telemetry['llm_used'])
        self.assertFalse(telemetry['llm_parse_success'])

    @override_settings(**FULL_PARSE_SETTINGS)
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_success_returns_courses_and_metadata(self, mock_post):
        """parse_with_llm returns courses and doc_metadata on success."""
        import json as _json
        mock_post.return_value = self._make_mock_response(self.VALID_LLM_RESPONSE)

        courses, meta, telemetry = parse_with_llm(
            raw_text='Student number 2022-01191\nOS 1:00 pm - 3:00 pm LR1',
            upload_type='student',
        )

        self.assertTrue(telemetry['llm_used'])
        self.assertTrue(telemetry['llm_parse_success'])
        self.assertEqual(len(courses), 2)
        self.assertEqual(courses[0]['subject_code'], 'OS')
        self.assertEqual(meta['student_number'], '2022-01191')
        self.assertEqual(meta['semester'], '1ST')

    @override_settings(**FULL_PARSE_SETTINGS)
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_timeout_fails_closed(self, mock_post):
        """parse_with_llm returns empty on timeout — never raises."""
        mock_post.side_effect = requests.Timeout('timed out')

        courses, meta, telemetry = parse_with_llm(
            raw_text='some raw text',
            upload_type='student',
        )

        self.assertEqual(courses, [])
        self.assertTrue(telemetry['llm_used'])
        self.assertFalse(telemetry['llm_parse_success'])

    @override_settings(**FULL_PARSE_SETTINGS)
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_malformed_json_fails_closed(self, mock_post):
        """parse_with_llm returns empty when LLM returns non-JSON."""
        mock_post.return_value = self._make_mock_response('not-valid-json')

        courses, meta, telemetry = parse_with_llm(
            raw_text='some raw text',
            upload_type='student',
        )

        self.assertEqual(courses, [])
        self.assertTrue(telemetry['llm_used'])
        self.assertFalse(telemetry['llm_parse_success'])

    @override_settings(**FULL_PARSE_SETTINGS)
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_wrapped_json_payload_is_recovered(self, mock_post):
        wrapped = (
            'Here is the extracted JSON:\n'
            + self.VALID_LLM_RESPONSE
            + '\nDone.'
        )
        mock_post.return_value = self._make_mock_response(wrapped)

        courses, meta, telemetry = parse_with_llm(
            raw_text='Student number 2022-01191\nOS 1:00 pm - 3:00 pm LR1',
            upload_type='student',
        )

        self.assertTrue(telemetry['llm_parse_success'])
        self.assertGreaterEqual(len(courses), 1)
        self.assertEqual(meta['student_number'], '2022-01191')

    @override_settings(**FULL_PARSE_SETTINGS)
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_course_unknown_keys_are_ignored_by_sanitizer(self, mock_post):
        payload = json.dumps({
            'doc_metadata': {'student_number': '2022-01191', 'semester': '1ST', 'school_year': '2025-2026'},
            'courses': [
                {
                    'subject_code': 'OS',
                    'subject_name': '',
                    'day': 'M',
                    'start_time': '01:00PM',
                    'end_time': '03:00PM',
                    'location': 'LR1',
                    'extra_field': 'should be dropped',
                }
            ],
        })
        mock_post.return_value = self._make_mock_response(payload)

        courses, _, telemetry = parse_with_llm(
            raw_text='OS 1:00 pm - 3:00 pm LR1',
            upload_type='student',
        )

        self.assertTrue(telemetry['llm_parse_success'])
        self.assertEqual(len(courses), 1)
        self.assertNotIn('extra_field', courses[0])

    @override_settings(**FULL_PARSE_SETTINGS)
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_unknown_top_level_keys_logs_and_continues(self, mock_post):
        """parse_with_llm logs unknown top-level keys but still processes valid courses.

        Policy change (Fix 4): unknown extra keys are tolerated — the LLM may emit
        harmless metadata keys like 'notes' or 'summary'. Discarding the entire response
        for one unexpected key was too aggressive and caused real extractions to fail.
        """
        # Response has a valid 'courses' list plus an unexpected 'injected' key
        response_with_extra_key = json.dumps({
            'courses': [
                {
                    'subject_code': 'OS',
                    'subject_name': '',
                    'day': 'M',
                    'start_time': '01:00PM',
                    'end_time': '03:00PM',
                    'location': 'LR1',
                }
            ],
            'doc_metadata': {'student_number': '2022-01191', 'semester': '1ST', 'school_year': '2025-2026'},
            'injected': True,   # ← unknown key — should be ignored, not fatal
        })
        mock_post.return_value = self._make_mock_response(response_with_extra_key)

        courses, meta, telemetry = parse_with_llm(
            raw_text='some raw text',
            upload_type='student',
        )

        # The valid course data must still be extracted
        self.assertTrue(telemetry['llm_parse_success'])
        self.assertEqual(len(courses), 1)
        self.assertEqual(courses[0]['subject_code'], 'OS')

    @override_settings(**FULL_PARSE_SETTINGS)
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_faculty_upload_type_prompt(self, mock_post):
        """parse_with_llm passes upload_type to prompt (no student_number expected)."""
        faculty_response = json.dumps({
            'doc_metadata': {'student_number': None, 'semester': None, 'school_year': None},
            'courses': [
                {
                    'subject_code': 'OS137-BSCS-3A',
                    'subject_name': '',
                    'day': 'M',
                    'start_time': '09:00AM',
                    'end_time': '11:00AM',
                    'location': 'LR3',
                }
            ],
        })
        mock_post.return_value = self._make_mock_response(faculty_response)

        courses, meta, telemetry = parse_with_llm(
            raw_text='MON OS137-BSCS-3A 9:00-11:00 LR3',
            upload_type='faculty',
        )

        self.assertTrue(telemetry['llm_parse_success'])
        self.assertEqual(len(courses), 1)
        self.assertEqual(meta['student_number'], '')  # null → empty string
        # Verify the prompt contained 'FACULTY'
        sent_prompt = mock_post.call_args.kwargs.get('json', {}).get('prompt', '')
        self.assertIn('FACULTY', sent_prompt)

class NormalizeWithLLMUnknownKeyToleranceTestCase(SimpleTestCase):
    @override_settings(
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='llama3.2:3b',
        EXTRACTION_LLM_BASE_URL='http://localhost:11434',
        EXTRACTION_LLM_TIMEOUT_SECONDS=2,
        EXTRACTION_LLM_REQUIRE_PINNED_MODEL=True,
        EXTRACTION_LLM_REQUIRE_MODEL_DIGEST=False,
        EXTRACTION_LLM_MODEL_DIGEST='',
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    @patch('api.utils.extraction.llm_normalizer.requests.get')
    def test_unknown_top_level_keys_are_ignored(self, mock_get, mock_post):
        mock_get.return_value = Mock(status_code=200)
        mock_get.return_value.raise_for_status = Mock()
        mock_get.return_value.json.return_value = {
            'models': [{'name': 'llama3.2:3b', 'digest': 'abc'}]
        }

        payload = {
            'courses': [
                {
                    'subject_code': 'OS',
                    'subject_name': '',
                    'day': '',
                    'start_time': '01:00PM',
                    'end_time': '03:00PM',
                    'location': 'LR1',
                }
            ],
            'notes': 'extra key from model',
        }
        mock_post.return_value = Mock(status_code=200)
        mock_post.return_value.raise_for_status = Mock()
        mock_post.return_value.json.return_value = {'response': json.dumps(payload)}

        courses, telemetry = normalize_with_llm(
            extracted_text='OS 1:00 pm - 3:00 pm LR1',
            seed_courses=[],
        )

        self.assertTrue(telemetry['llm_parse_success'])
        self.assertEqual(len(courses), 1)
        self.assertEqual(courses[0]['subject_code'], 'OS')


class ParseDocumentWithLLMVisionTestCase(SimpleTestCase):
    @override_settings(
        EXTRACTION_LLM_VISION_PARSE_ENABLED=False,
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='granite3.2-vision:2b',
    )
    def test_disabled_flag_returns_empty(self):
        courses, meta, telemetry = parse_document_with_llm_vision(
            file_path='/tmp/does-not-matter.png',
            upload_type='student',
        )
        self.assertEqual(courses, [])
        self.assertFalse(telemetry['llm_used'])
        self.assertFalse(telemetry['llm_parse_success'])

    @override_settings(
        EXTRACTION_LLM_VISION_PARSE_ENABLED=True,
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_VISION_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_REQUIRE_PINNED_MODEL=False,
        EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL=False,
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_success_parses_image_document(self, mock_post):
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(b'fake-image-bytes')
            tmp_path = tmp.name

        try:
            payload = json.dumps({
                'doc_metadata': {
                    'student_number': '2022-01191',
                    'semester': '1ST',
                    'school_year': '2025-2026',
                },
                'courses': [
                    {
                        'subject_code': 'OS',
                        'subject_name': '',
                        'day': '',
                        'start_time': '01:00PM',
                        'end_time': '03:00PM',
                        'location': 'LR1',
                    }
                ],
            })
            mock_post.return_value = Mock(status_code=200)
            mock_post.return_value.raise_for_status = Mock()
            mock_post.return_value.json.return_value = {'response': payload}

            courses, meta, telemetry = parse_document_with_llm_vision(
                file_path=tmp_path,
                upload_type='student',
            )

            self.assertTrue(telemetry['llm_used'])
            self.assertTrue(telemetry['llm_parse_success'])
            self.assertEqual(len(courses), 1)
            self.assertEqual(meta['student_number'], '2022-01191')
            sent_payload = mock_post.call_args.kwargs.get('json', {})
            self.assertEqual(sent_payload.get('model'), 'granite3.2-vision:2b')
            self.assertTrue(bool(sent_payload.get('images')))
        finally:
            os.unlink(tmp_path)


class ParseDocumentMetadataWithLLMVisionTestCase(SimpleTestCase):
    @override_settings(
        EXTRACTION_LLM_VISION_PARSE_ENABLED=True,
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_VISION_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL=False,
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_metadata_gate_extracts_student_number(self, mock_post):
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(b'fake-image-bytes')
            tmp_path = tmp.name

        try:
            payload = json.dumps({
                'doc_metadata': {
                    'student_number': '202201191',
                },
            })
            mock_post.return_value = Mock(status_code=200)
            mock_post.return_value.raise_for_status = Mock()
            mock_post.return_value.json.return_value = {'response': payload}

            meta, telemetry = parse_document_metadata_with_llm_vision(
                file_path=tmp_path,
                upload_type='student',
                timeout_seconds_override=5,
                max_pages_override=1,
                retry_count_override=0,
            )

            self.assertTrue(telemetry['llm_used'])
            self.assertTrue(telemetry['llm_parse_success'])
            self.assertEqual(meta['student_number'], '2022-01191')
        finally:
            os.unlink(tmp_path)

    @override_settings(
        EXTRACTION_LLM_VISION_PARSE_ENABLED=True,
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_VISION_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL=False,
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_metadata_gate_empty_returns_metadata_missing(self, mock_post):
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(b'fake-image-bytes')
            tmp_path = tmp.name

        try:
            mock_post.return_value = Mock(status_code=200)
            mock_post.return_value.raise_for_status = Mock()
            mock_post.return_value.json.return_value = {
                'response': json.dumps({'doc_metadata': {'student_number': None}})
            }

            meta, telemetry = parse_document_metadata_with_llm_vision(
                file_path=tmp_path,
                upload_type='student',
            )

            self.assertEqual(meta['student_number'], '')
            self.assertFalse(telemetry['llm_parse_success'])
            self.assertEqual(telemetry['llm_failure_reason'], 'metadata_missing')
        finally:
            os.unlink(tmp_path)

    @override_settings(
        EXTRACTION_LLM_VISION_PARSE_ENABLED=True,
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_VISION_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_REQUIRE_PINNED_MODEL=False,
        EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL=False,
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_student_number_compact_digits_are_normalized(self, mock_post):
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(b'fake-image-bytes')
            tmp_path = tmp.name

        try:
            payload = json.dumps({
                'doc_metadata': {
                    'student_number': '202201191',
                    'semester': '1ST',
                    'school_year': '2025-2026',
                },
                'courses': [
                    {
                        'subject_code': 'OS',
                        'subject_name': '',
                        'day': '',
                        'start_time': '07:00AM',
                        'end_time': '09:00AM',
                        'location': 'LR1',
                    }
                ],
            })
            mock_post.return_value = Mock(status_code=200)
            mock_post.return_value.raise_for_status = Mock()
            mock_post.return_value.json.return_value = {'response': payload}

            courses, meta, telemetry = parse_document_with_llm_vision(
                file_path=tmp_path,
                upload_type='student',
            )

            self.assertTrue(telemetry['llm_parse_success'])
            self.assertEqual(len(courses), 1)
            self.assertEqual(meta['student_number'], '2022-01191')
        finally:
            os.unlink(tmp_path)

    @override_settings(
        EXTRACTION_LLM_VISION_PARSE_ENABLED=True,
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_VISION_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_REQUIRE_PINNED_MODEL=False,
        EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL=False,
        EXTRACTION_LLM_VISION_RETRY_COUNT=1,
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_timeout_retries_once_then_succeeds(self, mock_post):
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(b'fake-image-bytes')
            tmp_path = tmp.name

        try:
            success_payload = json.dumps({
                'doc_metadata': {
                    'student_number': '',
                    'semester': '1ST',
                    'school_year': '2025-2026',
                },
                'courses': [
                    {
                        'subject_code': 'US101',
                        'subject_name': '',
                        'day': 'M',
                        'start_time': '05:30PM',
                        'end_time': '07:00PM',
                        'location': 'LR5',
                    }
                ],
            })

            success_response = Mock(status_code=200)
            success_response.raise_for_status = Mock()
            success_response.json.return_value = {'response': success_payload}

            mock_post.side_effect = [requests.Timeout('timed out'), success_response]

            courses, meta, telemetry = parse_document_with_llm_vision(
                file_path=tmp_path,
                upload_type='faculty',
            )

            self.assertEqual(mock_post.call_count, 2)
            self.assertTrue(telemetry['llm_parse_success'])
            self.assertEqual(telemetry['llm_failure_reason'], '')
            self.assertEqual(len(courses), 1)
            self.assertEqual(meta['semester'], '1ST')
        finally:
            os.unlink(tmp_path)

    @override_settings(
        EXTRACTION_LLM_VISION_PARSE_ENABLED=True,
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_VISION_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_REQUIRE_PINNED_MODEL=False,
        EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL=False,
        EXTRACTION_LLM_VISION_RETRY_COUNT=0,
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_read_timeout_sets_timeout_type_and_attempt_timing(self, mock_post):
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(b'fake-image-bytes')
            tmp_path = tmp.name

        try:
            mock_post.side_effect = requests.ReadTimeout('read timed out')

            courses, meta, telemetry = parse_document_with_llm_vision(
                file_path=tmp_path,
                upload_type='faculty',
            )

            self.assertEqual(courses, [])
            self.assertFalse(telemetry['llm_parse_success'])
            self.assertEqual(telemetry['llm_failure_reason'], 'timeout')
            self.assertEqual(telemetry.get('llm_timeout_type'), 'read')
            self.assertGreaterEqual(float(telemetry.get('llm_total_seconds') or 0.0), 0.0)
            self.assertGreaterEqual(float(telemetry.get('llm_request_seconds') or 0.0), 0.0)
            attempts = telemetry.get('llm_attempt_metrics') or []
            self.assertEqual(len(attempts), 1)
            self.assertEqual(attempts[0].get('outcome'), 'timeout_read')
        finally:
            os.unlink(tmp_path)

    @override_settings(
        EXTRACTION_LLM_VISION_PARSE_ENABLED=True,
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_VISION_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_REQUIRE_PINNED_MODEL=False,
        EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL=False,
        EXTRACTION_LLM_VISION_RETRY_COUNT=1,
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_invalid_json_retries_once_then_fails(self, mock_post):
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(b'fake-image-bytes')
            tmp_path = tmp.name

        try:
            bad_response = Mock(status_code=200)
            bad_response.raise_for_status = Mock()
            bad_response.json.return_value = {'response': '{not-valid-json'}
            mock_post.side_effect = [bad_response, bad_response]

            courses, meta, telemetry = parse_document_with_llm_vision(
                file_path=tmp_path,
                upload_type='faculty',
            )

            self.assertEqual(mock_post.call_count, 2)
            self.assertEqual(courses, [])
            self.assertFalse(telemetry['llm_parse_success'])
            self.assertEqual(telemetry['llm_failure_reason'], 'invalid_json')
        finally:
            os.unlink(tmp_path)

    @override_settings(
        EXTRACTION_LLM_VISION_PARSE_ENABLED=True,
        EXTRACTION_LLM_NORMALIZATION_ENABLED=True,
        EXTRACTION_LLM_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_VISION_MODEL_NAME='granite3.2-vision:2b',
        EXTRACTION_LLM_REQUIRE_PINNED_MODEL=False,
        EXTRACTION_LLM_VISION_REQUIRE_PINNED_MODEL=False,
        EXTRACTION_LLM_VISION_RETRY_COUNT=1,
    )
    @patch('api.utils.extraction.llm_normalizer.requests.post')
    def test_schema_reject_retries_once_then_fails(self, mock_post):
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(b'fake-image-bytes')
            tmp_path = tmp.name

        try:
            schema_bad_response = Mock(status_code=200)
            schema_bad_response.raise_for_status = Mock()
            schema_bad_response.json.return_value = {
                'response': json.dumps({'doc_metadata': {}, 'courses': 'not-a-list'})
            }
            mock_post.side_effect = [schema_bad_response, schema_bad_response]

            courses, meta, telemetry = parse_document_with_llm_vision(
                file_path=tmp_path,
                upload_type='faculty',
            )

            self.assertEqual(mock_post.call_count, 2)
            self.assertEqual(courses, [])
            self.assertFalse(telemetry['llm_parse_success'])
            self.assertEqual(telemetry['llm_failure_reason'], 'schema_reject')
        finally:
            os.unlink(tmp_path)

