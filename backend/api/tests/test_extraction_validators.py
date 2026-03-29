from django.test import TestCase

from api.utils.extraction.validators import validate_candidates


class ExtractionValidatorsTestCase(TestCase):
    def test_valid_course_is_normalized(self):
        result = validate_candidates([
            {
                "subject_code": "cc 102",
                "day": "tf",
                "start_time": "2:30pm",
                "end_time": "4:00pm",
                "location": "LR3",
            }
        ])

        self.assertEqual(result.errors, [])
        self.assertEqual(len(result.courses), 2)
        self.assertEqual(result.courses[0]["subject_code"], "CC 102")
        self.assertEqual(result.courses[0]["start_time"], "02:30PM")

    def test_invalid_day_is_rejected(self):
        result = validate_candidates([
            {
                "subject_code": "CC 102",
                "day": "TUES",
                "start_time": "02:30PM",
                "end_time": "04:00PM",
            }
        ])

        self.assertEqual(len(result.courses), 0)
        self.assertTrue(any("invalid day token" in err for err in result.errors))

    def test_invalid_time_range_is_rejected(self):
        result = validate_candidates([
            {
                "subject_code": "CC 102",
                "day": "T",
                "start_time": "04:00PM",
                "end_time": "02:30PM",
            }
        ])

        self.assertEqual(len(result.courses), 0)
        self.assertTrue(any("start_time >= end_time" in err for err in result.errors))

    def test_duplicate_collapse_keeps_higher_confidence(self):
        courses = [
            {
                "subject_code": "CC 102",
                "day": "T",
                "start_time": "02:30PM",
                "end_time": "04:00PM",
                "location": "LR3",
                "metadata": {"field_confidence": {"day": 0.6}},
            },
            {
                "subject_code": "CC 102",
                "day": "T",
                "start_time": "02:30PM",
                "end_time": "04:00PM",
                "location": "LR3",
                "metadata": {"field_confidence": {"day": 0.95}},
            },
        ]

        result = validate_candidates(courses)
        self.assertEqual(len(result.courses), 1)
        self.assertEqual(result.courses[0]["metadata"]["field_confidence"]["day"], 0.95)

    def test_missing_day_is_soft_required(self):
        result = validate_candidates([
            {
                "subject_code": "CC 102",
                "day": "",
                "start_time": "02:30PM",
                "end_time": "04:00PM",
                "location": "LR3",
            }
        ])

        self.assertEqual(result.errors, [])
        self.assertEqual(len(result.courses), 1)
        self.assertEqual(result.courses[0]["day"], "")
