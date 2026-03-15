"""
Tests for class reminder notification preferences and command behavior.

Covers:
- User profile preference GET/PATCH behavior
- Validation and read-only field protection on /api/auth/user/
- send_class_reminders command argument handling
- Feature-flag guard for server-side class reminders
"""

from io import StringIO
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from api.models import User
from api.utils.notification_service import send_upcoming_class_reminders


class UserReminderPreferenceApiTests(TestCase):
    """Tests for class reminder preference on the authenticated user profile endpoint."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='student_pref@test.com',
            password='testpass123',
            first_name='Student',
            last_name='Pref',
            user_type='student',
            student_number='2026-10001',
        )
        self.client.force_authenticate(user=self.user)

    def test_get_profile_includes_default_preference(self):
        response = self.client.get('/api/auth/user/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['class_reminder_minutes_before'], 15)

    def test_patch_valid_preference_updates_user(self):
        response = self.client.patch(
            '/api/auth/user/',
            {'class_reminder_minutes_before': 10},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertEqual(self.user.class_reminder_minutes_before, 10)
        self.assertEqual(response.data['class_reminder_minutes_before'], 10)

    def test_patch_invalid_preference_rejected(self):
        response = self.client.patch(
            '/api/auth/user/',
            {'class_reminder_minutes_before': 7},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('class_reminder_minutes_before', response.data)

        self.user.refresh_from_db()
        self.assertEqual(self.user.class_reminder_minutes_before, 15)

    def test_patch_read_only_identity_fields_ignored(self):
        original_email = self.user.email
        original_user_type = self.user.user_type
        original_student_number = self.user.student_number

        response = self.client.patch(
            '/api/auth/user/',
            {
                'email': 'hijack@test.com',
                'user_type': 'faculty',
                'student_number': '1999-99999',
                'class_reminder_minutes_before': 5,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertEqual(self.user.email, original_email)
        self.assertEqual(self.user.user_type, original_user_type)
        self.assertEqual(self.user.student_number, original_student_number)
        self.assertEqual(self.user.class_reminder_minutes_before, 5)


class SendClassRemindersCommandTests(TestCase):
    """Tests for management command argument behavior and service wiring."""

    def test_command_rejects_invalid_minutes_choice(self):
        with self.assertRaises(CommandError):
            call_command('send_class_reminders', '--minutes', '30')

    @patch('api.management.commands.send_class_reminders.send_upcoming_class_reminders')
    def test_command_uses_user_preferences_when_minutes_omitted(self, mock_send):
        mock_send.return_value = {
            'checked_users': 0,
            'notifications_sent': 0,
            'notifications_stored': 0,
            'errors': 0,
            'dry_run': False,
            'skipped': False,
            'skip_reason': None,
        }

        out = StringIO()
        call_command('send_class_reminders', stdout=out)

        mock_send.assert_called_once_with(minutes_before=None, dry_run=False)


class ServerClassReminderFlagTests(TestCase):
    """Tests for server-side class reminder feature flag behavior."""

    @override_settings(ENABLE_SERVER_CLASS_REMINDERS=False)
    def test_send_upcoming_class_reminders_skips_when_disabled(self):
        stats = send_upcoming_class_reminders(minutes_before=10, dry_run=True)

        self.assertTrue(stats['skipped'])
        self.assertEqual(stats['skip_reason'], 'disabled_by_setting')
        self.assertEqual(stats['checked_users'], 0)
        self.assertEqual(stats['notifications_sent'], 0)

    @override_settings(ENABLE_SERVER_CLASS_REMINDERS=True)
    def test_send_upcoming_class_reminders_runs_when_enabled(self):
        stats = send_upcoming_class_reminders(minutes_before=10, dry_run=True)

        self.assertFalse(stats['skipped'])
        self.assertIsNone(stats['skip_reason'])
        self.assertIn('checked_users', stats)
        self.assertIn('notifications_sent', stats)
