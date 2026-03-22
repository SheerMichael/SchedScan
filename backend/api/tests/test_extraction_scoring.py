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

    @override_settings(
        EXTRACTION_SCORE_WEIGHTS_BY_UPLOAD_TYPE={
            "student": {
                "completeness": 0.25,
                "validity": 0.25,
                "consistency": 0.20,
                "parser_reliability": 0.15,
                "agreement": 0.15,
            },
            "faculty": {
                "completeness": 0.50,
                "validity": 0.20,
                "consistency": 0.20,
                "parser_reliability": 0.05,
                "agreement": 0.05,
            },
        }
    )
    def test_upload_type_weight_policy_changes_confidence(self):
        shared_input = dict(
            courses=[
                {
                    "subject_code": "CC 102",
                    "day": "T",
                    "start_time": "02:30PM",
                    "end_time": "04:00PM",
                    "subject_name": "",
                    "location": "",
                }
            ],
            validator_errors=[],
            attempts=["ocr_fallback"],
        )

        student = score_candidates(upload_type="student", **shared_input)
        faculty = score_candidates(upload_type="faculty", **shared_input)

        self.assertNotEqual(student.confidence, faculty.confidence)
