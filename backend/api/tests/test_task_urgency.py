"""Tests for personal task urgency and invasive urgent popup workflow."""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from api.models import Task, TaskUrgencyEvent, User


class TaskUrgencyApiTests(TestCase):
    """Validate urgency fields, effective urgency escalation, and urgent-popup actions."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='urgent.student@test.com',
            password='testpass123',
            first_name='Urgent',
            last_name='Student',
            user_type='student',
            student_number='2026-20001',
        )
        self.client.force_authenticate(user=self.user)

    def test_create_task_supports_urgency_and_due_date(self):
        due = (timezone.now() + timedelta(hours=3)).isoformat()
        response = self.client.post(
            '/api/tasks/',
            {
                'subject_code': 'CS101',
                'text': 'Submit lab report',
                'urgency': 'high',
                'due_date': due,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['urgency'], 'high')
        self.assertEqual(response.data['effective_urgency'], 'high')
        self.assertIn('minutes_until_due', response.data)

    def test_due_soon_escalates_effective_urgency_to_critical(self):
        task = Task.objects.create(
            user=self.user,
            subject_code='CS101',
            text='Final submission',
            urgency='medium',
            due_date=timezone.now() + timedelta(minutes=45),
        )

        response = self.client.get(f'/api/tasks/{task.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['urgency'], 'medium')
        self.assertEqual(response.data['effective_urgency'], 'critical')
        self.assertFalse(response.data['is_overdue'])

    @override_settings(TASK_URGENT_POPUP_COOLDOWN_MINUTES=60)
    def test_urgent_popup_returns_critical_task_and_respects_cooldown(self):
        non_critical = Task.objects.create(
            user=self.user,
            subject_code='CS101',
            text='Read chapter 1',
            urgency='medium',
        )
        critical = Task.objects.create(
            user=self.user,
            subject_code='CS101',
            text='Exam in 30 mins',
            urgency='high',
            due_date=timezone.now() + timedelta(minutes=30),
        )

        first = self.client.get('/api/tasks/urgent-popup/')
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertTrue(first.data['show_popup'])
        self.assertEqual(first.data['task']['id'], critical.id)
        self.assertEqual(first.data['task']['effective_urgency'], 'critical')

        # Cooldown should suppress immediate repeat popup.
        second = self.client.get('/api/tasks/urgent-popup/')
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertFalse(second.data['show_popup'])

        non_critical.refresh_from_db()
        self.assertIsNone(non_critical.last_urgent_popup_at)

    def test_urgent_action_snooze_suppresses_popup(self):
        task = Task.objects.create(
            user=self.user,
            subject_code='CS102',
            text='Critical task',
            urgency='critical',
        )

        action_response = self.client.post(
            f'/api/tasks/{task.id}/urgent-action/',
            {'action': 'snooze', 'minutes': 10},
            format='json',
        )
        self.assertEqual(action_response.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertIsNotNone(task.urgent_snoozed_until)

        popup_response = self.client.get('/api/tasks/urgent-popup/')
        self.assertEqual(popup_response.status_code, status.HTTP_200_OK)
        self.assertFalse(popup_response.data['show_popup'])

    def test_urgent_action_acknowledge_updates_popup_timestamp(self):
        task = Task.objects.create(
            user=self.user,
            subject_code='CS103',
            text='Critical task',
            urgency='critical',
        )

        response = self.client.post(
            f'/api/tasks/{task.id}/urgent-action/',
            {'action': 'acknowledge'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertIsNotNone(task.last_urgent_popup_at)

    def test_urgent_popup_respects_user_disabled_preference(self):
        Task.objects.create(
            user=self.user,
            subject_code='CS104',
            text='Critical task',
            urgency='critical',
        )
        self.user.urgent_popup_enabled = False
        self.user.save(update_fields=['urgent_popup_enabled'])

        response = self.client.get('/api/tasks/urgent-popup/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['show_popup'])
        self.assertEqual(response.data['reason'], 'disabled_by_user')

    def test_urgent_popup_respects_quiet_hours_with_local_hour(self):
        Task.objects.create(
            user=self.user,
            subject_code='CS105',
            text='Critical task',
            urgency='critical',
        )
        self.user.urgent_popup_quiet_hours_enabled = True
        self.user.urgent_popup_quiet_hours_start = 22
        self.user.urgent_popup_quiet_hours_end = 7
        self.user.save(
            update_fields=[
                'urgent_popup_quiet_hours_enabled',
                'urgent_popup_quiet_hours_start',
                'urgent_popup_quiet_hours_end',
            ]
        )

        response = self.client.get('/api/tasks/urgent-popup/?local_hour=23')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['show_popup'])
        self.assertEqual(response.data['reason'], 'quiet_hours')

    def test_urgent_analytics_counts_events(self):
        task = Task.objects.create(
            user=self.user,
            subject_code='CS106',
            text='Critical task',
            urgency='critical',
        )

        popup_response = self.client.get('/api/tasks/urgent-popup/')
        self.assertEqual(popup_response.status_code, status.HTTP_200_OK)
        self.assertTrue(popup_response.data['show_popup'])

        open_response = self.client.post(
            f'/api/tasks/{task.id}/urgent-action/',
            {'action': 'open'},
            format='json',
        )
        self.assertEqual(open_response.status_code, status.HTTP_200_OK)

        snooze_response = self.client.post(
            f'/api/tasks/{task.id}/urgent-action/',
            {'action': 'snooze', 'minutes': 5},
            format='json',
        )
        self.assertEqual(snooze_response.status_code, status.HTTP_200_OK)

        analytics_response = self.client.get('/api/tasks/urgent-analytics/?days=7')

        self.assertEqual(analytics_response.status_code, status.HTTP_200_OK)
        self.assertEqual(analytics_response.data['days'], 7)
        self.assertGreaterEqual(analytics_response.data['total_events'], 3)
        self.assertEqual(analytics_response.data['counters']['popup_shown'], 1)
        self.assertEqual(analytics_response.data['counters']['opened'], 1)
        self.assertEqual(analytics_response.data['counters']['snoozed'], 1)
        self.assertEqual(analytics_response.data['counters']['acknowledged'], 0)
        self.assertTrue(
            TaskUrgencyEvent.objects.filter(user=self.user, task=task, event_type='popup_shown').exists()
        )
