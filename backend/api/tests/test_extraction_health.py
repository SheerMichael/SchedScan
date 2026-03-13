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

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import ExtractionLog, IncidentReport

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
