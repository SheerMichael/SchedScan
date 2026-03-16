"""
Tests for the Stripe payment feature.
Covers: can-add-child check, payment gate in invite code usage,
checkout session creation (mocked), and payment status polling (mocked).
"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from api.models import User, ParentChildLink, InviteCode, Payment


class PaymentTestBase(TestCase):
    """Base class with common test setup."""

    def setUp(self):
        self.client = APIClient()

        # Create parent user
        self.parent = User.objects.create_user(
            email='parent@test.com',
            password='testpass123',
            first_name='Parent',
            last_name='User',
            user_type='parent',
        )

        # Create student users
        self.student1 = User.objects.create_user(
            email='student1@test.com',
            password='testpass123',
            first_name='Student',
            last_name='One',
            user_type='student',
        )
        self.student2 = User.objects.create_user(
            email='student2@test.com',
            password='testpass123',
            first_name='Student',
            last_name='Two',
            user_type='student',
        )

        self.client.force_authenticate(user=self.parent)


class CanAddChildTests(PaymentTestBase):
    """Test the /api/payment/can-add-child/ endpoint."""

    def test_first_child_is_free(self):
        """Parent with no children should be able to add one for free."""
        response = self.client.get('/api/payment/can-add-child/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['can_add_free'])
        self.assertFalse(response.data['needs_payment'])
        self.assertEqual(response.data['active_children'], 0)

    def test_second_child_needs_payment(self):
        """Parent with 1 child should need payment for the second."""
        ParentChildLink.objects.create(parent=self.parent, child=self.student1, status='active')

        response = self.client.get('/api/payment/can-add-child/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['can_add_free'])
        self.assertTrue(response.data['needs_payment'])
        self.assertEqual(response.data['active_children'], 1)

    def test_paid_slot_available(self):
        """Parent with 1 child and 1 completed payment should not need payment."""
        ParentChildLink.objects.create(parent=self.parent, child=self.student1, status='active')
        Payment.objects.create(
            parent=self.parent,
            stripe_checkout_session_id='cs_test_completed',
            amount=8900,
            status='completed',
            child_slot_number=2,
        )

        response = self.client.get('/api/payment/can-add-child/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['needs_payment'])

    def test_non_parent_forbidden(self):
        """Non-parent users should get 403."""
        self.client.force_authenticate(user=self.student1)
        response = self.client.get('/api/payment/can-add-child/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class InviteCodePaymentGateTests(PaymentTestBase):
    """Test that UseInviteCodeView enforces payment for additional children."""

    def _create_invite(self, student):
        """Helper to create an active invite code for a student."""
        code = InviteCode.generate_code()
        return InviteCode.objects.create(student=student, code=code, is_active=True)

    def test_first_child_links_free(self):
        """First child should link without any payment."""
        invite = self._create_invite(self.student1)

        response = self.client.post('/api/auth/invite-code/use/', {'code': invite.code})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ParentChildLink.objects.filter(
            parent=self.parent, child=self.student1, status='active'
        ).exists())

    def test_second_child_requires_payment(self):
        """Second child should return 402 without payment."""
        ParentChildLink.objects.create(parent=self.parent, child=self.student1, status='active')
        invite = self._create_invite(self.student2)

        response = self.client.post('/api/auth/invite-code/use/', {'code': invite.code})
        self.assertEqual(response.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertTrue(response.data['needs_payment'])

    def test_second_child_links_after_payment(self):
        """Second child should link after payment is completed."""
        ParentChildLink.objects.create(parent=self.parent, child=self.student1, status='active')
        Payment.objects.create(
            parent=self.parent,
            stripe_checkout_session_id='cs_test_paid',
            amount=8900,
            status='completed',
            child_slot_number=2,
        )
        invite = self._create_invite(self.student2)

        response = self.client.post('/api/auth/invite-code/use/', {'code': invite.code})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class CheckoutSessionTests(PaymentTestBase):
    """Test the /api/payment/create-checkout-session/ endpoint (mocked Stripe)."""

    @patch('api.views.payment_views.stripe.StripeClient')
    def test_create_checkout_session(self, MockStripeClient):
        """Should create a Stripe session and return the URL."""
        ParentChildLink.objects.create(parent=self.parent, child=self.student1, status='active')

        mock_session = MagicMock()
        mock_session.id = 'cs_test_new123'
        mock_session.url = 'https://checkout.stripe.com/test/session123'
        mock_client_instance = MockStripeClient.return_value
        mock_client_instance.checkout.sessions.create.return_value = mock_session

        with self.settings(STRIPE_SECRET_KEY='sk_test_fake'):
            response = self.client.post('/api/payment/create-checkout-session/')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('checkout_url', response.data)
        self.assertIn('session_id', response.data)
        self.assertTrue(Payment.objects.filter(
            stripe_checkout_session_id='cs_test_new123', status='pending'
        ).exists())

    def test_no_payment_needed(self):
        """Should return 400 if no payment is needed (first child)."""
        with self.settings(STRIPE_SECRET_KEY='sk_test_fake'):
            response = self.client.post('/api/payment/create-checkout-session/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PaymentStatusTests(PaymentTestBase):
    """Test the /api/payment/status/ endpoint (mocked Stripe)."""

    @patch('api.views.payment_views.stripe.StripeClient')
    def test_completed_payment(self, MockStripeClient):
        """Should mark payment as completed when Stripe says paid."""
        payment = Payment.objects.create(
            parent=self.parent,
            stripe_checkout_session_id='cs_test_check',
            amount=8900,
            status='pending',
            child_slot_number=2,
        )

        mock_session = MagicMock()
        mock_session.payment_status = 'paid'
        mock_session.payment_intent = 'pi_test_123'
        mock_client_instance = MockStripeClient.return_value
        mock_client_instance.checkout.sessions.retrieve.return_value = mock_session

        with self.settings(STRIPE_SECRET_KEY='sk_test_fake'):
            response = self.client.get('/api/payment/status/?session_id=cs_test_check')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'completed')

        payment.refresh_from_db()
        self.assertEqual(payment.status, 'completed')
        self.assertIsNotNone(payment.completed_at)

    @patch('api.views.payment_views.stripe.StripeClient')
    def test_pending_payment(self, MockStripeClient):
        """Should return pending when payment not yet completed."""
        Payment.objects.create(
            parent=self.parent,
            stripe_checkout_session_id='cs_test_pending',
            amount=8900,
            status='pending',
            child_slot_number=2,
        )

        mock_session = MagicMock()
        mock_session.payment_status = 'unpaid'
        mock_session.status = 'open'
        mock_client_instance = MockStripeClient.return_value
        mock_client_instance.checkout.sessions.retrieve.return_value = mock_session

        with self.settings(STRIPE_SECRET_KEY='sk_test_fake'):
            response = self.client.get('/api/payment/status/?session_id=cs_test_pending')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'pending')


class PaymentSuccessRedirectTests(PaymentTestBase):
    """Test the /api/payment/success/ endpoint finalizes payment server-side."""

    @patch('api.views.payment_views.stripe.StripeClient')
    def test_success_redirect_marks_payment_completed(self, MockStripeClient):
        payment = Payment.objects.create(
            parent=self.parent,
            stripe_checkout_session_id='cs_test_success123',
            amount=8900,
            status='pending',
            child_slot_number=2,
        )

        mock_session = MagicMock()
        mock_session.payment_status = 'paid'
        mock_session.payment_intent = 'pi_success_123'
        mock_client_instance = MockStripeClient.return_value
        mock_client_instance.checkout.sessions.retrieve.return_value = mock_session

        with self.settings(STRIPE_SECRET_KEY='sk_test_fake'):
            response = self.client.get('/api/payment/success/?session_id=cs_test_success123')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payment.refresh_from_db()
        self.assertEqual(payment.status, 'completed')
        self.assertIsNotNone(payment.completed_at)
        self.assertEqual(payment.stripe_payment_intent_id, 'pi_success_123')

    @patch('api.views.payment_views.stripe.StripeClient')
    def test_success_redirect_without_session_id_keeps_payment_pending(self, MockStripeClient):
        payment = Payment.objects.create(
            parent=self.parent,
            stripe_checkout_session_id='cs_test_no_change',
            amount=8900,
            status='pending',
            child_slot_number=2,
        )

        with self.settings(STRIPE_SECRET_KEY='sk_test_fake'):
            response = self.client.get('/api/payment/success/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        MockStripeClient.assert_not_called()

        payment.refresh_from_db()
        self.assertEqual(payment.status, 'pending')


class PaymentWebhookTests(PaymentTestBase):
    """Test the /api/payment/webhook/ endpoint with Stripe signature validation."""

    @patch('api.views.payment_views.stripe.Webhook.construct_event')
    def test_webhook_marks_payment_completed(self, mock_construct_event):
        payment = Payment.objects.create(
            parent=self.parent,
            stripe_checkout_session_id='cs_test_webhook_paid',
            amount=8900,
            status='pending',
            child_slot_number=2,
        )

        mock_construct_event.return_value = {
            'type': 'checkout.session.completed',
            'data': {
                'object': {
                    'id': 'cs_test_webhook_paid',
                    'payment_status': 'paid',
                    'status': 'complete',
                    'payment_intent': 'pi_webhook_123',
                }
            }
        }

        with self.settings(STRIPE_WEBHOOK_SECRET='whsec_test_secret'):
            response = self.client.post(
                '/api/payment/webhook/',
                data='{}',
                content_type='application/json',
                HTTP_STRIPE_SIGNATURE='t=test,v1=sig',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'completed')
        self.assertEqual(payment.stripe_payment_intent_id, 'pi_webhook_123')

    @patch('api.views.payment_views.stripe.Webhook.construct_event')
    def test_webhook_rejects_invalid_signature(self, mock_construct_event):
        mock_construct_event.side_effect = ValueError('Invalid payload')

        with self.settings(STRIPE_WEBHOOK_SECRET='whsec_test_secret'):
            response = self.client.post(
                '/api/payment/webhook/',
                data='{}',
                content_type='application/json',
                HTTP_STRIPE_SIGNATURE='bad_signature',
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_webhook_not_configured(self):
        with self.settings(STRIPE_WEBHOOK_SECRET=''):
            response = self.client.post(
                '/api/payment/webhook/',
                data='{}',
                content_type='application/json',
                HTTP_STRIPE_SIGNATURE='t=test,v1=sig',
            )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
