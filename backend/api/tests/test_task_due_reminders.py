"""Tests for due-date task reminder notifications."""

from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from api.models import (
    ClassEnrollment,
    FacultyTask,
    FacultyTaskCompletion,
    Notification,
    Task,
    User,
)
from api.utils.notification_service import send_due_task_reminders


class DueTaskReminderTests(TestCase):
    """Validate due-task reminder fan-out, dedupe, and critical/invasive behavior."""

    def test_reminders_skip_when_feature_disabled(self):
        with override_settings(ENABLE_SERVER_TASK_DUE_REMINDERS=False):
            stats = send_due_task_reminders(dry_run=True)

        self.assertTrue(stats['skipped'])
        self.assertEqual(stats['skip_reason'], 'disabled_by_setting')
        self.assertEqual(stats['notifications_sent'], 0)

    @patch('api.utils.notification_service.NotificationService.send_batch_notifications')
    def test_personal_due_soon_task_sends_invasive_urgent_push(self, mock_send_batch):
        user = User.objects.create_user(
            email='personal.due@test.com',
            password='testpass123',
            first_name='Personal',
            last_name='Due',
            user_type='student',
            student_number='2026-30001',
            expo_push_token='ExponentPushToken[personal-due-123]'
        )

        Task.objects.create(
            user=user,
            subject_code='CS101',
            text='Submit personal assignment',
            urgency='medium',
            due_date=timezone.now() + timedelta(minutes=30),
            is_completed=False,
        )

        mock_send_batch.return_value = [{'status': 'ok'}]

        stats = send_due_task_reminders(dry_run=False)

        self.assertEqual(stats['notifications_stored'], 1)
        self.assertEqual(stats['notifications_sent'], 1)

        reminder = Notification.objects.get(user=user)
        self.assertEqual(reminder.notification_type, 'general')
        self.assertEqual(reminder.data.get('type'), 'task_due_reminder')
        self.assertEqual(reminder.data.get('reminder_stage'), 'due_1h')
        self.assertTrue(reminder.data.get('invasive'))

        mock_send_batch.assert_called_once()
        notifications = mock_send_batch.call_args.args[0]
        self.assertEqual(len(notifications), 1)
        payload = notifications[0]
        self.assertEqual(payload['channel_id'], 'urgent')
        self.assertEqual(payload['priority'], 'high')
        self.assertTrue(payload['data'].get('invasive'))

    @patch('api.utils.notification_service.NotificationService.send_batch_notifications')
    def test_faculty_due_reminder_skips_completed_students(self, mock_send_batch):
        faculty = User.objects.create_user(
            email='faculty.due@test.com',
            password='testpass123',
            first_name='Faculty',
            last_name='Due',
            user_type='faculty',
            expo_push_token='ExponentPushToken[faculty-due-123]'
        )
        completed_student = User.objects.create_user(
            email='completed.student@test.com',
            password='testpass123',
            first_name='Completed',
            last_name='Student',
            user_type='student',
            student_number='2026-30002',
            expo_push_token='ExponentPushToken[completed-student-123]'
        )
        active_student = User.objects.create_user(
            email='active.student@test.com',
            password='testpass123',
            first_name='Active',
            last_name='Student',
            user_type='student',
            student_number='2026-30003',
            expo_push_token='ExponentPushToken[active-student-123]'
        )

        task = FacultyTask.objects.create(
            faculty=faculty,
            subject_code='CS202',
            text='Submit class project draft',
            urgency='high',
            due_date=timezone.now() + timedelta(minutes=45),
        )

        ClassEnrollment.objects.create(
            faculty=faculty,
            student=completed_student,
            subject_code='CS202',
            enrollment_type='code',
            status='active',
        )
        ClassEnrollment.objects.create(
            faculty=faculty,
            student=active_student,
            subject_code='CS202',
            enrollment_type='code',
            status='active',
        )

        FacultyTaskCompletion.objects.create(
            task=task,
            student=completed_student,
            is_completed=True,
            completed_at=timezone.now(),
        )

        mock_send_batch.return_value = [{'status': 'ok'}]

        stats = send_due_task_reminders(dry_run=False)

        self.assertEqual(stats['notifications_stored'], 1)
        self.assertEqual(stats['notifications_sent'], 1)
        self.assertEqual(stats['completed_skipped'], 1)

        reminder = Notification.objects.get(user=active_student)
        self.assertEqual(reminder.notification_type, 'faculty_task')
        self.assertEqual(reminder.data.get('type'), 'faculty_task_due_reminder')
        self.assertEqual(reminder.data.get('task_kind'), 'faculty')

        self.assertFalse(Notification.objects.filter(user=completed_student).exists())

    @patch('api.utils.notification_service.NotificationService.send_batch_notifications')
    def test_due_reminder_dedupes_same_stage(self, mock_send_batch):
        user = User.objects.create_user(
            email='dedupe.student@test.com',
            password='testpass123',
            first_name='Dedupe',
            last_name='Student',
            user_type='student',
            student_number='2026-30004',
            expo_push_token='ExponentPushToken[dedupe-student-123]'
        )

        Task.objects.create(
            user=user,
            subject_code='CS303',
            text='Read final chapter',
            urgency='medium',
            due_date=timezone.now() + timedelta(minutes=30),
            is_completed=False,
        )

        mock_send_batch.return_value = [{'status': 'ok'}]

        first = send_due_task_reminders(dry_run=False)
        second = send_due_task_reminders(dry_run=False)

        self.assertEqual(first['notifications_stored'], 1)
        self.assertEqual(second['notifications_stored'], 0)
        self.assertGreaterEqual(second['duplicates_skipped'], 1)
        self.assertEqual(Notification.objects.filter(user=user).count(), 1)
