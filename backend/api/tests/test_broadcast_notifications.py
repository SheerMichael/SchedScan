"""
Tests for admin/faculty broadcast notifications.

Covers:
- Admin-created holidays notify all active non-admin users.
- Admin-created calendar events notify users based on visibility.
- Faculty task creation persists notifications for connected students.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from api.models import (
    User,
    Schedule,
    Course,
    ClassEnrollment,
    Notification,
)


class AdminBroadcastNotificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email='admin_notify@test.com',
            password='testpass123',
            first_name='Admin',
            last_name='User',
            user_type='faculty',
            is_staff=True,
        )

        self.student = User.objects.create_user(
            email='student_notify@test.com',
            password='testpass123',
            first_name='Student',
            last_name='User',
            user_type='student',
            student_number='2026-20001',
        )
        self.faculty = User.objects.create_user(
            email='faculty_notify@test.com',
            password='testpass123',
            first_name='Faculty',
            last_name='User',
            user_type='faculty',
        )
        self.parent = User.objects.create_user(
            email='parent_notify@test.com',
            password='testpass123',
            first_name='Parent',
            last_name='User',
            user_type='parent',
        )

        # Staff users are excluded from broadcast fan-out
        self.other_staff = User.objects.create_user(
            email='staff_notify@test.com',
            password='testpass123',
            first_name='Staff',
            last_name='User',
            user_type='faculty',
            is_staff=True,
        )

        self.client.force_authenticate(user=self.admin)

    def test_admin_holiday_create_notifies_all_non_admin_users(self):
        response = self.client.post(
            '/api/admin/holidays/',
            {
                'name': 'Founders Day',
                'date': '2026-08-20',
                'holiday_type': 'one_time',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        notifications = Notification.objects.filter(
            notification_type='general',
            data__type='holiday',
        )
        recipient_ids = set(notifications.values_list('user_id', flat=True))

        self.assertSetEqual(
            recipient_ids,
            {self.student.id, self.faculty.id, self.parent.id},
        )
        self.assertNotIn(self.admin.id, recipient_ids)
        self.assertNotIn(self.other_staff.id, recipient_ids)

    def test_admin_calendar_event_visibility_student_only(self):
        response = self.client.post(
            '/api/admin/calendar-events/',
            {
                'title': 'Student Assembly',
                'description': 'For students only',
                'date': '2026-09-05',
                'event_type': 'one_time',
                'visibility': 'student',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        notifications = Notification.objects.filter(
            notification_type='general',
            data__type='calendar_event',
        )
        recipient_ids = set(notifications.values_list('user_id', flat=True))

        self.assertSetEqual(recipient_ids, {self.student.id})


class FacultyTaskNotificationPersistenceTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.faculty = User.objects.create_user(
            email='faculty_task_notify@test.com',
            password='testpass123',
            first_name='Faculty',
            last_name='Task',
            user_type='faculty',
        )
        self.student_enrolled = User.objects.create_user(
            email='student_enrolled@test.com',
            password='testpass123',
            first_name='Student',
            last_name='Enrolled',
            user_type='student',
            student_number='2026-30001',
        )
        self.student_schedule = User.objects.create_user(
            email='student_schedule@test.com',
            password='testpass123',
            first_name='Student',
            last_name='Schedule',
            user_type='student',
            student_number='2026-30002',
        )

        # Faculty schedule with teachable subject (required by task creation guard)
        faculty_schedule = Schedule.objects.create(
            user=self.faculty,
            title='Faculty Schedule',
            upload_type='faculty',
            is_active=True,
        )
        Course.objects.create(
            user=self.faculty,
            schedule=faculty_schedule,
            subject_code='CS201',
            subject_name='Data Structures',
            start_time='08:00AM',
            end_time='09:00AM',
            day='M',
        )

        # Student connected via enrollment
        ClassEnrollment.objects.create(
            faculty=self.faculty,
            student=self.student_enrolled,
            subject_code='CS201',
            enrollment_type='code',
            status='active',
        )

        # Student connected via active schedule
        student_active_schedule = Schedule.objects.create(
            user=self.student_schedule,
            title='Student Active Schedule',
            upload_type='student',
            is_active=True,
        )
        Course.objects.create(
            user=self.student_schedule,
            schedule=student_active_schedule,
            subject_code='CS201',
            subject_name='Data Structures',
            start_time='10:00AM',
            end_time='11:00AM',
            day='T',
        )

        self.client.force_authenticate(user=self.faculty)

    def test_faculty_task_create_persists_notifications_for_connected_students(self):
        response = self.client.post(
            '/api/faculty/tasks/',
            {
                'subject_code': 'CS201',
                'text': 'Submit machine problem #1',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        notifications = Notification.objects.filter(
            notification_type='faculty_task',
            data__subject_code='CS201',
        )
        recipient_ids = set(notifications.values_list('user_id', flat=True))

        self.assertSetEqual(
            recipient_ids,
            {self.student_enrolled.id, self.student_schedule.id},
        )
        self.assertNotIn(self.faculty.id, recipient_ids)
