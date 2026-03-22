from unittest.mock import Mock, patch

import requests
from django.test import SimpleTestCase, override_settings

from api.utils.extraction.llm_normalizer import normalize_with_llm


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
