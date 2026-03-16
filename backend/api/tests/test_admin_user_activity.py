"""
Tests for admin user activity endpoint payload structure and filtering.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from api.models import ClassEnrollment, Course, ParentChildLink, Schedule, User


class AdminUserActivityTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email="admin_activity@test.com",
            password="testpass123",
            first_name="Admin",
            last_name="User",
            user_type="faculty",
            is_staff=True,
        )

        self.faculty = User.objects.create_user(
            email="faculty_activity@test.com",
            password="testpass123",
            first_name="Faculty",
            last_name="Member",
            user_type="faculty",
        )

        self.student = User.objects.create_user(
            email="student_activity@test.com",
            password="testpass123",
            first_name="Student",
            last_name="One",
            user_type="student",
            student_number="2026-01001",
        )

        self.parent = User.objects.create_user(
            email="parent_activity@test.com",
            password="testpass123",
            first_name="Parent",
            last_name="One",
            user_type="parent",
        )

        self.active_schedule = Schedule.objects.create(
            user=self.student,
            title="Main Schedule",
            upload_type="student",
            semester="1ST",
            school_year="2025-2026",
            is_active=True,
        )

        Course.objects.create(
            user=self.student,
            schedule=self.active_schedule,
            subject_code="CS101",
            subject_name="Intro CS",
            start_time="07:00 AM",
            end_time="08:30 AM",
            day="M",
            location="Room 1",
        )

        ClassEnrollment.objects.create(
            faculty=self.faculty,
            student=self.student,
            subject_code="CS101",
            enrollment_type="code",
            status="active",
        )

        ParentChildLink.objects.create(
            parent=self.parent,
            child=self.student,
            status="active",
        )

        ParentChildLink.objects.create(
            parent=self.parent,
            child=self.student,
            status="revoked",
        )

    def test_admin_user_activity_returns_current_schedule_and_active_links(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(f"/api/admin/users/{self.student.id}/activity/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("current_schedule", response.data)
        self.assertIn("current_schedule_courses", response.data)
        self.assertEqual(len(response.data["current_schedule_courses"]), 1)

        self.assertEqual(len(response.data["parent_links"]), 1)
        parent_link = response.data["parent_links"][0]
        self.assertEqual(parent_link["status"], "active")
        self.assertEqual(parent_link["parent__email"], self.parent.email)

    def test_admin_user_activity_returns_enrollment_identity_fields(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(f"/api/admin/users/{self.faculty.id}/activity/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["faculty_enrollments"]), 1)

        enrollment = response.data["faculty_enrollments"][0]
        self.assertEqual(enrollment["student_id"], self.student.id)
        self.assertEqual(enrollment["student__email"], self.student.email)

    def test_non_admin_cannot_access_user_activity(self):
        self.client.force_authenticate(user=self.student)

        response = self.client.get(f"/api/admin/users/{self.student.id}/activity/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
