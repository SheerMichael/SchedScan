"""
Tests for admin analytics summary, including payment visibility metrics.
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from api.models import User, Payment


class AdminAnalyticsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email='admin@test.com',
            password='testpass123',
            first_name='Admin',
            last_name='User',
            user_type='faculty',
            is_staff=True,
        )
        self.parent = User.objects.create_user(
            email='parent_analytics@test.com',
            password='testpass123',
            first_name='Parent',
            last_name='Analytics',
            user_type='parent',
        )

    def test_admin_analytics_includes_payment_status_metrics(self):
        Payment.objects.create(
            parent=self.parent,
            stripe_checkout_session_id='cs_test_admin_completed',
            amount=8900,
            status='completed',
            child_slot_number=2,
        )
        Payment.objects.create(
            parent=self.parent,
            stripe_checkout_session_id='cs_test_admin_pending',
            amount=8900,
            status='pending',
            child_slot_number=3,
        )
        Payment.objects.create(
            parent=self.parent,
            stripe_checkout_session_id='cs_test_admin_failed',
            amount=8900,
            status='failed',
            child_slot_number=4,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/admin/analytics/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_revenue_centavos'], 8900)
        self.assertEqual(response.data['completed_payments'], 1)
        self.assertEqual(response.data['pending_payments'], 1)
        self.assertEqual(response.data['failed_payments'], 1)

    def test_non_admin_cannot_access_admin_analytics(self):
        self.client.force_authenticate(user=self.parent)
        response = self.client.get('/api/admin/analytics/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
