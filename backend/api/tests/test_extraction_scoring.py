from django.test import TestCase, override_settings

from api.utils.extraction.scoring import score_candidates


class ExtractionScoringTestCase(TestCase):
    @override_settings(EXTRACTION_PARSER_RELIABILITY_PRIOR={"pdf_text": 0.9})
    def test_score_is_high_for_valid_complete_course(self):
        result = score_candidates(
            courses=[
                {
                    "subject_code": "CC 102",
                    "subject_name": "COMPUTER PROGRAMMING 2",
                    "day": "T",
                    "start_time": "02:30PM",
                    "end_time": "04:00PM",
                    "location": "LR3",
                }
            ],
            validator_errors=[],
            attempts=["pdf_text"],
        )

        self.assertGreaterEqual(result.confidence, 0.85)
        self.assertIn("completeness", result.breakdown)
        self.assertIn("validity", result.breakdown)

    def test_score_drops_with_validation_errors(self):
        result = score_candidates(
            courses=[],
            validator_errors=["invalid day token", "invalid time format"],
            attempts=["ocr_fallback"],
        )

        self.assertLess(result.confidence, 0.60)
        self.assertLess(result.breakdown["validity"], 1.0)

    def test_agreement_penalty_applies_for_multiple_attempts(self):
        single = score_candidates(
            courses=[
                {
                    "subject_code": "CC 102",
                    "day": "T",
                    "start_time": "02:30PM",
                    "end_time": "04:00PM",
                }
            ],
            validator_errors=[],
            attempts=["pdf_text"],
        )
        multi = score_candidates(
            courses=[
                {
                    "subject_code": "CC 102",
                    "day": "T",
                    "start_time": "02:30PM",
                    "end_time": "04:00PM",
                }
            ],
            validator_errors=[],
            attempts=["pdf_text", "ocr_fallback"],
        )

        self.assertLess(multi.breakdown["agreement"], single.breakdown["agreement"])
