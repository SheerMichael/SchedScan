"""
Tests for the Extraction & OCR Health Monitoring feature.

Covers:
  - ExtractionLog creation on upload (success & failure)
  - SubmitIncidentReportView (create, validation, auth)
  - AdminExtractionAnalyticsView (aggregate stats)
  - AdminFailedExtractionListView (pagination, search)
  - AdminIncidentReportListView (filters, pagination)
  - AdminIncidentReportDetailView (status update, admin_notes)
  - Permission checks (403 for non-staff)

Run with: python manage.py test api.tests.test_extraction_health --verbosity=2
"""

from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import ExtractionLog, IncidentReport, Course, ExtractionRequest

User = get_user_model()


class ExtractionLogModelTestCase(TestCase):
    """Verify ExtractionLog records can be created with expected defaults."""

    def test_create_success_log(self):
        log = ExtractionLog.objects.create(
            file_name="cor_test.pdf",
            file_type="pdf",
            upload_type="student",
            extraction_method="pdf_text",
            confidence=0.95,
            courses_extracted=6,
            success=True,
            processing_time=0.42,
            attempts=["pdf_text"],
        )
        self.assertTrue(log.success)
        self.assertEqual(log.courses_extracted, 6)
        self.assertEqual(log.extraction_method, "pdf_text")

    def test_create_failure_log(self):
        log = ExtractionLog.objects.create(
            file_name="bad_scan.jpg",
            file_type="jpg",
            upload_type="faculty",
            extraction_method="none",
            confidence=0.0,
            courses_extracted=0,
            success=False,
            error_message="Unable to read text from image",
            processing_time=1.5,
            attempts=["ocr"],
        )
        self.assertFalse(log.success)
        self.assertIn("Unable", log.error_message)


class IncidentReportModelTestCase(TestCase):
    """Verify IncidentReport model defaults and status transitions."""

    def test_default_status_is_pending(self):
        report = IncidentReport.objects.create(
            description="Scanner keeps crashing",
        )
        self.assertEqual(report.status, "pending")
        self.assertIsNone(report.resolved_by)
        self.assertIsNone(report.resolved_at)


class SubmitIncidentReportViewTestCase(TestCase):
    """Test POST /api/reports/submit/"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="student@test.com",
            password="pass1234",
            first_name="Test",
            last_name="User",
        )

    def test_unauthenticated_returns_401(self):
        resp = self.client.post("/api/reports/submit/", {"description": "fail"})
        self.assertEqual(resp.status_code, 401)

    def test_missing_description_returns_400(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/reports/submit/", {})
        self.assertEqual(resp.status_code, 400)

    def test_blank_description_returns_400(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/reports/submit/", {"description": "   "})
        self.assertEqual(resp.status_code, 400)

    def test_successful_submission(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/reports/submit/", {
            "description": "OCR failed to read my COR",
            "upload_error": "Unable to process",
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["status"], "pending")
        self.assertEqual(IncidentReport.objects.count(), 1)
        report = IncidentReport.objects.first()
        self.assertEqual(report.reporter, self.user)
        self.assertEqual(report.description, "OCR failed to read my COR")

    def test_description_truncated_to_500(self):
        self.client.force_authenticate(user=self.user)
        long_text = "x" * 600
        resp = self.client.post("/api/reports/submit/", {"description": long_text})
        self.assertEqual(resp.status_code, 201)
        report = IncidentReport.objects.first()
        self.assertEqual(len(report.description), 500)


class UploadExtractionTelemetryViewTestCase(TestCase):
    """Validate upload-path telemetry and transaction behavior for OCR health."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="ocr_user@test.com",
            password="pass1234",
            first_name="OCR",
            last_name="User",
            student_number="2024-0001",
        )
        self.client.force_authenticate(user=self.user)

    def _post_upload(self, filename="test_cor.pdf"):
        upload = SimpleUploadedFile(
            filename,
            b"fake-pdf-content",
            content_type="application/pdf",
        )
        return self.client.post("/api/upload-cor/student/", {"file": upload}, format="multipart")

    def _post_upload_with_idempotency_key(self, key: str, filename="test_cor.pdf"):
        upload = SimpleUploadedFile(
            filename,
            b"fake-pdf-content",
            content_type="application/pdf",
        )
        return self.client.post(
            "/api/upload-cor/student/",
            {"file": upload},
            format="multipart",
            HTTP_IDEMPOTENCY_KEY=key,
        )

    @patch("api.views.upload_views.ExtractionManager")
    def test_no_courses_is_logged_as_failed_extraction(self, mock_manager_class):
        mock_manager = mock_manager_class.return_value
        mock_manager.extract_schedule.return_value = {
            "courses": [],
            "student_number": "2024-0001",
            "extraction_method": "pdf_text",
            "confidence": 0.72,
            "processing_time": 0.21,
            "attempts": ["pdf_text"],
            "semester": "1st",
            "school_year": "2025-2026",
        }

        response = self._post_upload()
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data.get("code"), "NO_COURSES_EXTRACTED")
        self.assertTrue(response.data.get("retryable"))
        self.assertEqual(response.data.get("total_courses"), 0)

        self.assertEqual(ExtractionLog.objects.count(), 1)
        log = ExtractionLog.objects.first()
        self.assertFalse(log.success)
        self.assertEqual(log.courses_extracted, 0)
        self.assertEqual(log.extraction_method, "pdf_text")
        self.assertIn("No courses found", log.error_message)

    @patch("api.views.upload_views.ExtractionManager")
    def test_student_number_mismatch_is_logged_as_failed_extraction(self, mock_manager_class):
        mock_manager = mock_manager_class.return_value
        mock_manager.extract_schedule.return_value = {
            "courses": [{"subject_code": "CS101"}],
            "student_number": "2024-9999",
            "extraction_method": "pdf_text",
            "confidence": 0.88,
            "processing_time": 0.19,
            "attempts": ["pdf_text"],
            "semester": "1st",
            "school_year": "2025-2026",
        }

        response = self._post_upload()
        self.assertEqual(response.status_code, 403)

        self.assertEqual(ExtractionLog.objects.count(), 1)
        log = ExtractionLog.objects.first()
        self.assertFalse(log.success)
        self.assertIn("COR verification failed", log.error_message)

    @patch("api.views.upload_views.ExtractionManager")
    def test_course_creation_is_atomic_when_mid_loop_failure_occurs(self, mock_manager_class):
        mock_manager = mock_manager_class.return_value
        mock_manager.extract_schedule.return_value = {
            "courses": [
                {
                    "subject_code": "CS101",
                    "subject_name": "Intro to CS",
                    "start_time": "08:00AM",
                    "end_time": "09:00AM",
                    "day": "M",
                    "location": "R1",
                },
                {
                    "subject_code": "CS102",
                    "subject_name": "Data Structures",
                    "start_time": "09:00AM",
                    "end_time": "10:00AM",
                    "day": "T",
                    "location": "R2",
                },
            ],
            "student_number": "2024-0001",
            "extraction_method": "pdf_text",
            "confidence": 0.91,
            "processing_time": 0.31,
            "attempts": ["pdf_text"],
            "semester": "1st",
            "school_year": "2025-2026",
        }

        original_create = Course.objects.create
        call_count = {"n": 0}

        def flaky_create(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 2:
                raise Exception("Simulated DB insert failure")
            return original_create(*args, **kwargs)

        with patch("api.views.upload_views.Course.objects.create", side_effect=flaky_create):
            response = self._post_upload()

        self.assertEqual(response.status_code, 500)
        self.assertEqual(Course.objects.filter(user=self.user).count(), 0)

        self.assertEqual(ExtractionLog.objects.count(), 1)
        log = ExtractionLog.objects.first()
        self.assertFalse(log.success)
        self.assertEqual(log.extraction_method, "none")

    @patch("api.views.upload_views.ExtractionManager")
    def test_idempotency_key_replays_success_without_duplicate_courses(self, mock_manager_class):
        mock_manager = mock_manager_class.return_value
        mock_manager.extract_schedule.return_value = {
            "courses": [
                {
                    "subject_code": "CS101",
                    "subject_name": "Intro to CS",
                    "start_time": "08:00AM",
                    "end_time": "09:00AM",
                    "day": "M",
                    "location": "R1",
                }
            ],
            "student_number": "2024-0001",
            "extraction_method": "pdf_text",
            "confidence": 0.91,
            "processing_time": 0.31,
            "attempts": ["pdf_text"],
            "semester": "1st",
            "school_year": "2025-2026",
            "failure_category": "none",
            "validator_errors": [],
            "score_breakdown": {
                "completeness": 1.0,
                "validity": 1.0,
                "consistency": 1.0,
                "parser_reliability": 0.92,
                "agreement": 1.0,
            },
        }

        key = "student-upload-123"
        first = self._post_upload_with_idempotency_key(key)
        second = self._post_upload_with_idempotency_key(key)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(Course.objects.filter(user=self.user).count(), 1)
        self.assertEqual(ExtractionRequest.objects.filter(user=self.user, idempotency_key=key).count(), 1)
        self.assertTrue(second.data.get("idempotency", {}).get("hit"))

    @patch("api.views.upload_views.ExtractionManager")
    def test_idempotency_replay_skips_second_extraction_call(self, mock_manager_class):
        mock_manager = mock_manager_class.return_value
        mock_manager.extract_schedule.return_value = {
            "courses": [
                {
                    "subject_code": "CS101",
                    "subject_name": "Intro to CS",
                    "start_time": "08:00AM",
                    "end_time": "09:00AM",
                    "day": "M",
                    "location": "R1",
                }
            ],
            "student_number": "2024-0001",
            "extraction_method": "pdf_text",
            "confidence": 0.91,
            "processing_time": 0.31,
            "attempts": ["pdf_text"],
            "semester": "1st",
            "school_year": "2025-2026",
            "failure_category": "none",
            "validator_errors": [],
            "score_breakdown": {
                "completeness": 1.0,
                "validity": 1.0,
                "consistency": 1.0,
                "parser_reliability": 0.92,
                "agreement": 1.0,
            },
        }

        key = "student-upload-replay-once"
        first = self._post_upload_with_idempotency_key(key)
        second = self._post_upload_with_idempotency_key(key)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(mock_manager.extract_schedule.call_count, 1)
        self.assertTrue(second.data.get("idempotency", {}).get("hit"))


# ---------------------------------------------------------------------------
# Admin Endpoint Tests
# ---------------------------------------------------------------------------

class AdminEndpointMixin:
    """Shared setup for admin endpoint tests."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="admin@test.com",
            password="adminpass",
            first_name="Admin",
            last_name="User",
            is_staff=True,
        )
        self.regular_user = User.objects.create_user(
            email="user@test.com",
            password="userpass",
            first_name="Regular",
            last_name="User",
        )


class AdminExtractionAnalyticsViewTestCase(AdminEndpointMixin, TestCase):
    """Test GET /api/admin/extraction/analytics/"""

    def setUp(self):
        super().setUp()
        # Create test data
        for i in range(8):
            ExtractionLog.objects.create(
                file_name=f"file_{i}.pdf",
                file_type="pdf",
                upload_type="student",
                extraction_method="pdf_text" if i < 6 else "ocr_fallback",
                confidence=0.9 if i < 6 else 0.4,
                courses_extracted=5 if i < 6 else 0,
                success=i < 6,
                processing_time=0.3 + (i * 0.1),
            )

    def test_non_staff_returns_403(self):
        self.client.force_authenticate(user=self.regular_user)
        resp = self.client.get("/api/admin/extraction/analytics/")
        self.assertEqual(resp.status_code, 403)

    def test_returns_correct_totals(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/extraction/analytics/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total_extractions"], 8)
        self.assertEqual(resp.data["successful"], 6)
        self.assertEqual(resp.data["failed"], 2)
        self.assertAlmostEqual(resp.data["success_rate"], 0.75, places=2)

    def test_method_breakdown(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/extraction/analytics/")
        self.assertIn("pdf_text", resp.data["method_breakdown"])
        self.assertIn("ocr_fallback", resp.data["method_breakdown"])
        self.assertEqual(resp.data["method_breakdown"]["pdf_text"], 6)

    def test_custom_days_param(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/extraction/analytics/?days=1")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["period_days"], 1)

    def test_days_param_is_clamped_to_max(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/extraction/analytics/?days=999")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["period_days"], 365)


class AdminExtractionChartViewTestCase(AdminEndpointMixin, TestCase):
    """Test GET /api/admin/extraction/analytics/chart/"""

    def test_returns_daily_data(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/extraction/analytics/chart/?days=7")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["data"]), 7)
        # Each entry should have date, label, success, failure
        entry = resp.data["data"][0]
        self.assertIn("date", entry)
        self.assertIn("label", entry)
        self.assertIn("success", entry)
        self.assertIn("failure", entry)

    def test_days_param_is_clamped_to_max(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/extraction/analytics/chart/?days=999")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["days"], 90)

    def test_chart_totals_match_analytics_totals_for_same_period(self):
        self.client.force_authenticate(user=self.admin)

        now = timezone.now()
        old = now - timedelta(days=40)
        in_window_1 = now - timedelta(days=2)
        in_window_2 = now - timedelta(days=1)

        old_log = ExtractionLog.objects.create(
            file_name="old_fail.pdf",
            file_type="pdf",
            upload_type="student",
            extraction_method="none",
            confidence=0.0,
            courses_extracted=0,
            success=False,
        )
        in_window_success_log = ExtractionLog.objects.create(
            file_name="in_window_success.pdf",
            file_type="pdf",
            upload_type="student",
            extraction_method="pdf_text",
            confidence=0.9,
            courses_extracted=3,
            success=True,
        )
        in_window_fail_log = ExtractionLog.objects.create(
            file_name="in_window_fail.pdf",
            file_type="pdf",
            upload_type="student",
            extraction_method="none",
            confidence=0.0,
            courses_extracted=0,
            success=False,
        )

        ExtractionLog.objects.filter(pk=old_log.pk).update(created_at=old)
        ExtractionLog.objects.filter(pk=in_window_success_log.pk).update(created_at=in_window_1)
        ExtractionLog.objects.filter(pk=in_window_fail_log.pk).update(created_at=in_window_2)

        analytics = self.client.get("/api/admin/extraction/analytics/?days=7")
        chart = self.client.get("/api/admin/extraction/analytics/chart/?days=7")

        self.assertEqual(analytics.status_code, 200)
        self.assertEqual(chart.status_code, 200)

        chart_success = sum(day["success"] for day in chart.data["data"])
        chart_failure = sum(day["failure"] for day in chart.data["data"])

        self.assertEqual(chart_success, analytics.data["successful"])
        self.assertEqual(chart_failure, analytics.data["failed"])


class AdminFailedExtractionListViewTestCase(AdminEndpointMixin, TestCase):
    """Test GET /api/admin/extraction/failed/"""

    def setUp(self):
        super().setUp()
        for i in range(5):
            ExtractionLog.objects.create(
                file_name=f"bad_file_{i}.pdf",
                file_type="pdf",
                upload_type="student",
                extraction_method="none",
                confidence=0.0,
                courses_extracted=0,
                success=False,
                error_message=f"Error reading file {i}",
            )
        # Also create a success log (should NOT appear in results)
        ExtractionLog.objects.create(
            file_name="good_file.pdf",
            file_type="pdf",
            upload_type="student",
            extraction_method="pdf_text",
            confidence=0.95,
            courses_extracted=6,
            success=True,
        )

    def test_returns_only_failures(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/extraction/failed/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 5)
        for r in resp.data["results"]:
            self.assertIn("bad_file", r["file_name"])

    def test_search_filter(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/extraction/failed/?search=bad_file_3")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)

    def test_pagination(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/extraction/failed/?page_size=2&page=1")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 2)
        self.assertEqual(resp.data["total_pages"], 3)

    def test_non_staff_returns_403(self):
        self.client.force_authenticate(user=self.regular_user)
        resp = self.client.get("/api/admin/extraction/failed/")
        self.assertEqual(resp.status_code, 403)


class AdminIncidentReportListViewTestCase(AdminEndpointMixin, TestCase):
    """Test GET /api/admin/incidents/"""

    def setUp(self):
        super().setUp()
        IncidentReport.objects.create(
            reporter=self.regular_user,
            description="Scanner broken",
            status="pending",
        )
        IncidentReport.objects.create(
            reporter=self.regular_user,
            description="OCR wrong result",
            status="investigating",
        )
        IncidentReport.objects.create(
            reporter=self.regular_user,
            description="All good now",
            status="resolved",
        )

    def test_returns_all_reports(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/incidents/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 3)

    def test_filter_by_status(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/incidents/?status=pending")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["description"], "Scanner broken")

    def test_search_by_description(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/incidents/?search=OCR")
        self.assertEqual(resp.data["count"], 1)

    def test_invalid_status_filter_is_ignored(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/incidents/?status=unknown_status")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 3)

    def test_non_staff_returns_403(self):
        self.client.force_authenticate(user=self.regular_user)
        resp = self.client.get("/api/admin/incidents/")
        self.assertEqual(resp.status_code, 403)


class AdminIncidentReportDetailViewTestCase(AdminEndpointMixin, TestCase):
    """Test GET / PATCH /api/admin/incidents/<pk>/"""

    def setUp(self):
        super().setUp()
        self.report = IncidentReport.objects.create(
            reporter=self.regular_user,
            description="My COR scan failed",
            upload_error="No text found",
            status="pending",
        )

    def test_get_single_report(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"/api/admin/incidents/{self.report.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["description"], "My COR scan failed")

    def test_get_nonexistent_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/incidents/9999/")
        self.assertEqual(resp.status_code, 404)

    def test_update_status_to_investigating(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(
            f"/api/admin/incidents/{self.report.id}/",
            {"status": "investigating"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "investigating")
        self.assertIsNone(resp.data["resolved_by_email"])

    def test_update_status_to_resolved_sets_metadata(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(
            f"/api/admin/incidents/{self.report.id}/",
            {"status": "resolved"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "resolved")
        self.assertEqual(resp.data["resolved_by_email"], self.admin.email)
        self.assertIsNotNone(resp.data["resolved_at"])

    def test_reopen_resolved_clears_metadata(self):
        # First resolve
        self.client.force_authenticate(user=self.admin)
        self.client.patch(
            f"/api/admin/incidents/{self.report.id}/",
            {"status": "resolved"},
        )
        # Then reopen
        resp = self.client.patch(
            f"/api/admin/incidents/{self.report.id}/",
            {"status": "pending"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "pending")
        self.assertIsNone(resp.data["resolved_by_email"])
        self.assertIsNone(resp.data["resolved_at"])

    def test_update_admin_notes(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(
            f"/api/admin/incidents/{self.report.id}/",
            {"admin_notes": "Looks like a regex issue"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["admin_notes"], "Looks like a regex issue")

    def test_invalid_status_returns_400(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(
            f"/api/admin/incidents/{self.report.id}/",
            {"status": "invalid_status"},
        )
        self.assertEqual(resp.status_code, 400)

    def test_non_staff_returns_403(self):
        self.client.force_authenticate(user=self.regular_user)
        resp = self.client.patch(
            f"/api/admin/incidents/{self.report.id}/",
            {"status": "resolved"},
        )
        self.assertEqual(resp.status_code, 403)
