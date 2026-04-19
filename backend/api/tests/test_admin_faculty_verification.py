"""
Regression tests for faculty verification across admin and app-facing endpoints.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from api.models import Course, Schedule, User


class AdminFacultyVerificationFlowTests(TestCase):
    def setUp(self):
        self.admin_client = APIClient()
        self.faculty_client = APIClient()

        self.admin = User.objects.create_user(
            email="admin_verify@test.com",
            password="testpass123",
            first_name="Admin",
            last_name="User",
            user_type="faculty",
            is_staff=True,
        )

        self.faculty = User.objects.create_user(
            email="faculty_verify@test.com",
            password="testpass123",
            first_name="Faculty",
            last_name="Member",
            user_type="faculty",
            is_verified=False,
        )

        self.schedule = Schedule.objects.create(
            user=self.faculty,
            title="Faculty Master Schedule",
            upload_type="faculty",
            semester="2ND",
            school_year="2025-2026",
            is_active=True,
        )

        self.subject_code = "SSP104-BS-MATH"

        Course.objects.create(
            user=self.faculty,
            schedule=self.schedule,
            subject_code=self.subject_code,
            subject_name="College Algebra",
            start_time="07:00 AM",
            end_time="09:00 AM",
            day="M",
            location="Room 101",
            source_type="faculty",
        )

        self.admin_client.force_authenticate(user=self.admin)
        self.faculty_client.force_authenticate(user=self.faculty)

    def test_admin_verification_updates_auth_profile_flag(self):
        response = self.admin_client.patch(
            f"/api/admin/users/{self.faculty.id}/",
            {"is_verified": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_verified"])

        self.faculty.refresh_from_db()
        self.assertTrue(self.faculty.is_verified)

        profile_response = self.faculty_client.get("/api/auth/user/")
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
        self.assertTrue(profile_response.data["is_verified"])

    def test_class_code_generation_blocked_until_verified(self):
        denied_response = self.faculty_client.post(
            "/api/faculty/class-code/",
            {"subject_code": self.subject_code},
            format="json",
        )
        self.assertEqual(denied_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("pending admin verification", denied_response.data.get("error", ""))

        verify_response = self.admin_client.patch(
            f"/api/admin/users/{self.faculty.id}/",
            {"is_verified": True},
            format="json",
        )
        self.assertEqual(verify_response.status_code, status.HTTP_200_OK)

        self.faculty.refresh_from_db()
        self.faculty_client.force_authenticate(user=self.faculty)

        allowed_response = self.faculty_client.post(
            "/api/faculty/class-code/",
            {"subject_code": self.subject_code},
            format="json",
        )
        self.assertEqual(allowed_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(allowed_response.data["subject_code"], self.subject_code)
        self.assertTrue(bool(allowed_response.data.get("code")))

    def test_verification_toggle_rejected_for_non_faculty(self):
        student = User.objects.create_user(
            email="student_verify@test.com",
            password="testpass123",
            first_name="Student",
            last_name="User",
            user_type="student",
            student_number="2026-11999",
        )

        response = self.admin_client.patch(
            f"/api/admin/users/{student.id}/",
            {"is_verified": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only faculty accounts", response.data.get("error", ""))


class AdminPendingFacultyVerificationQueueTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email="admin_pending@test.com",
            password="testpass123",
            first_name="Admin",
            last_name="Pending",
            user_type="faculty",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

        # Simulates a default student account that uploaded through faculty COR flow.
        self.pending_student = User.objects.create_user(
            email="pending_student@test.com",
            password="testpass123",
            first_name="Pending",
            last_name="Student",
            user_type="student",
            faculty_verification_status="pending",
            is_verified=False,
        )
        self.pending_faculty = User.objects.create_user(
            email="pending_faculty@test.com",
            password="testpass123",
            first_name="Pending",
            last_name="Faculty",
            user_type="faculty",
            faculty_verification_status="pending",
            is_verified=False,
        )
        self.rejected_user = User.objects.create_user(
            email="rejected_faculty@test.com",
            password="testpass123",
            first_name="Rejected",
            last_name="Faculty",
            user_type="faculty",
            faculty_verification_status="rejected",
            is_verified=False,
        )

        for owner in (self.pending_student, self.pending_faculty, self.rejected_user):
            schedule = Schedule.objects.create(
                user=owner,
                title="Faculty Schedule",
                upload_type="faculty",
                semester="2ND",
                school_year="2025-2026",
                is_active=False,
            )
            Course.objects.create(
                user=owner,
                schedule=schedule,
                subject_code="SSP104-BS-MATH",
                subject_name="College Algebra",
                start_time="07:00 AM",
                end_time="09:00 AM",
                day="M",
                location="Room 101",
                source_type="faculty",
            )

    def test_pending_queue_uses_verification_status_not_user_type(self):
        response = self.client.get("/api/admin/pending-verifications/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        result_ids = {entry["id"] for entry in response.data["results"]}

        self.assertIn(self.pending_student.id, result_ids)
        self.assertIn(self.pending_faculty.id, result_ids)
        self.assertNotIn(self.rejected_user.id, result_ids)

    def test_reject_removes_user_from_pending_queue(self):
        reject_response = self.client.post(
            f"/api/admin/pending-verifications/{self.pending_student.id}/reject/",
            {"reason": "Blurred schedule image"},
            format="json",
        )
        self.assertEqual(reject_response.status_code, status.HTTP_200_OK)
        self.assertEqual(reject_response.data["faculty_verification_status"], "rejected")

        self.pending_student.refresh_from_db()
        self.assertEqual(self.pending_student.faculty_verification_status, "rejected")

        pending_response = self.client.get("/api/admin/pending-verifications/")
        result_ids = {entry["id"] for entry in pending_response.data["results"]}
        self.assertNotIn(self.pending_student.id, result_ids)

    def test_approve_promotes_user_and_marks_approved(self):
        approve_response = self.client.post(
            f"/api/admin/pending-verifications/{self.pending_student.id}/approve/",
            {},
            format="json",
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)
        self.assertEqual(approve_response.data["faculty_verification_status"], "approved")
        self.assertEqual(approve_response.data["user_type"], "faculty")
        self.assertTrue(approve_response.data["is_verified"])

        self.pending_student.refresh_from_db()
        self.assertEqual(self.pending_student.faculty_verification_status, "approved")
        self.assertEqual(self.pending_student.user_type, "faculty")
        self.assertTrue(self.pending_student.is_verified)

        pending_response = self.client.get("/api/admin/pending-verifications/")
        result_ids = {entry["id"] for entry in pending_response.data["results"]}
        self.assertNotIn(self.pending_student.id, result_ids)
