import json
from unittest.mock import Mock, patch

import requests
from django.test import SimpleTestCase, override_settings

from api.utils.extraction.llm_normalizer import normalize_with_llm, parse_with_llm


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
    def test_unknown_keys_fail_closed(self, mock_post):
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            'response': '{"courses": [{"subject_code": "CS101"}], "hacked": true}'
        }
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
    def test_unknown_top_level_keys_fail_closed(self, mock_post):
        """parse_with_llm rejects response with unexpected top-level keys."""
        bad = json.dumps({'courses': [], 'doc_metadata': {}, 'injected': True})
        mock_post.return_value = self._make_mock_response(bad)

        courses, meta, telemetry = parse_with_llm(
            raw_text='some raw text',
            upload_type='student',
        )

        self.assertEqual(courses, [])
        self.assertFalse(telemetry['llm_parse_success'])

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

