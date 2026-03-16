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
