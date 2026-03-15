from datetime import date

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from api.models import CalendarEvent, Holiday


class CalendarRangeViewsTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.student = User.objects.create_user(
            email="student@example.com",
            password="testpass123",
            first_name="Stu",
            last_name="Dent",
            user_type="student",
            student_number="2026-0001",
        )
        self.admin = User.objects.create_user(
            email="admin@example.com",
            password="testpass123",
            first_name="Ad",
            last_name="Min",
            user_type="faculty",
            is_staff=True,
        )

    def test_public_holiday_recurring_cross_month_range_included(self):
        Holiday.objects.create(
            name="Christmas Break",
            date=date(2026, 12, 25),
            end_date=date(2027, 1, 5),
            holiday_type="recurring",
            created_by=self.admin,
        )

        self.client.force_authenticate(user=self.student)
        response = self.client.get("/api/holidays/", {"year": 2027, "month": 1})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Christmas Break")

    def test_public_holiday_one_time_overlap_range_included(self):
        Holiday.objects.create(
            name="Year Shift Holiday",
            date=date(2026, 12, 30),
            end_date=date(2027, 1, 2),
            holiday_type="one_time",
            created_by=self.admin,
        )

        self.client.force_authenticate(user=self.student)
        response = self.client.get("/api/holidays/", {"year": 2027, "month": 1})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in response.data}
        self.assertIn("Year Shift Holiday", names)

    def test_public_calendar_event_recurring_cross_month_range_included(self):
        CalendarEvent.objects.create(
            title="Enrollment Window",
            description="Recurring enrollment",
            date=date(2026, 12, 28),
            end_date=date(2027, 1, 7),
            event_type="recurring",
            visibility="all",
            created_by=self.admin,
        )

        self.client.force_authenticate(user=self.student)
        response = self.client.get("/api/calendar-events/", {"year": 2027, "month": 1})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {item["title"] for item in response.data}
        self.assertIn("Enrollment Window", titles)

    def test_admin_calendar_event_year_month_overlap_included(self):
        CalendarEvent.objects.create(
            title="Registration Period",
            description="One-time span",
            date=date(2026, 12, 30),
            end_date=date(2027, 1, 2),
            event_type="one_time",
            visibility="all",
            created_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/admin/calendar-events/", {"year": 2027, "month": 1})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {item["title"] for item in response.data}
        self.assertIn("Registration Period", titles)

    def test_admin_calendar_event_month_only_overlap_included(self):
        CalendarEvent.objects.create(
            title="Midterm Week",
            description="Cross-month one-time span",
            date=date(2027, 1, 30),
            end_date=date(2027, 2, 2),
            event_type="one_time",
            visibility="all",
            created_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/admin/calendar-events/", {"month": 2})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {item["title"] for item in response.data}
        self.assertIn("Midterm Week", titles)
