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
                "day": "TUESX",
                "start_time": "02:30PM",
                "end_time": "04:00PM",
            }
        ])

        self.assertEqual(len(result.courses), 0)
        self.assertTrue(any("invalid day token" in err for err in result.errors))

    def test_full_day_name_is_accepted(self):
        result = validate_candidates([
            {
                "subject_code": "ECON 101",
                "day": "MON",
                "start_time": "07:00AM",
                "end_time": "08:30AM",
                "location": "CLA 17",
            }
        ])

        self.assertEqual(result.errors, [])
        self.assertEqual(len(result.courses), 1)
        self.assertEqual(result.courses[0]["day"], "M")

    def test_unmarked_time_pair_is_inferred(self):
        result = validate_candidates([
            {
                "subject_code": "US101",
                "day": "THU",
                "start_time": "5:30",
                "end_time": "7:00",
                "location": "LR 5",
            }
        ])

        self.assertEqual(result.errors, [])
        self.assertEqual(len(result.courses), 1)
        self.assertEqual(result.courses[0]["start_time"], "05:30PM")
        self.assertEqual(result.courses[0]["end_time"], "07:00PM")

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
