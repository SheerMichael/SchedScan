from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from django.conf import settings
from django.db import transaction
import stripe
import logging
import re

from ..models import Payment, ParentChildLink

logger = logging.getLogger(__name__)

# Checkout session ID format: cs_test_... or cs_live_...
SESSION_ID_PATTERN = re.compile(r'^cs_(test|live)_[A-Za-z0-9]+$')


class PaymentRateThrottle(UserRateThrottle):
    """Limit checkout session creation to prevent abuse."""
    rate = '10/hour'


class CanAddChildView(APIView):
    """
    GET /api/payment/can-add-child/
    Check whether the parent can add a child for free or needs payment.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.user_type != 'parent':
            return Response({"error": "Only parent accounts can access this"},
                            status=status.HTTP_403_FORBIDDEN)

        active_children = ParentChildLink.objects.filter(
            parent=user, status='active'
        ).count()

        paid_slots = Payment.objects.filter(
            parent=user, status='completed'
        ).count()

        # First child is free (slot 1). Slots 2+ require payment.
        # Total allowed children = 1 (free) + paid_slots
        can_add_free = active_children < 1
        total_allowed = 1 + paid_slots
        needs_payment = active_children >= total_allowed

        return Response({
            "can_add_free": can_add_free,
            "needs_payment": needs_payment,
            "active_children": active_children,
            "paid_slots": paid_slots,
        })


class CreateCheckoutSessionView(APIView):
    """
    POST /api/payment/create-checkout-session/
    Create a Stripe Checkout Session for ₱89 additional child payment.
    Returns the checkout URL for the frontend to redirect to.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [PaymentRateThrottle]

    def post(self, request):
        user = request.user
        if user.user_type != 'parent':
            return Response({"error": "Only parent accounts can make payments"},
                            status=status.HTTP_403_FORBIDDEN)

        if not settings.STRIPE_SECRET_KEY:
            return Response({"error": "Payment system is not configured"},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)

        stripe_client = stripe.StripeClient(settings.STRIPE_SECRET_KEY)

        # Determine slot number
        active_children = ParentChildLink.objects.filter(
            parent=user, status='active'
        ).count()
        paid_slots = Payment.objects.filter(
            parent=user, status='completed'
        ).count()

        next_slot = active_children + 1
        total_allowed = 1 + paid_slots

        if active_children < total_allowed:
            return Response(
                {"error": "You already have a paid slot available. Use your invite code to link a child."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check for an existing pending session for this slot
        existing_pending = Payment.objects.filter(
            parent=user, status='pending', child_slot_number=next_slot
        ).first()
        if existing_pending:
            # Try to retrieve the session to see if it's still valid
            try:
                session = stripe_client.checkout.sessions.retrieve(
                    existing_pending.stripe_checkout_session_id
                )
                if session.status == 'open':
                    return Response({
                        "checkout_url": session.url,
                        "session_id": session.id,
                    })
                else:
                    # Session expired — mark as failed
                    existing_pending.status = 'failed'
                    existing_pending.save(update_fields=['status'])
            except Exception:
                # Session invalid — mark as failed
                existing_pending.status = 'failed'
                existing_pending.save(update_fields=['status'])

        # Create Stripe Checkout Session
        try:
            # Use the API URL from the request to build return URLs
            base_url = request.build_absolute_uri('/').rstrip('/')

            session = stripe_client.checkout.sessions.create(
                params={
                    'payment_method_types': ['card'],
                    'line_items': [{
                        'price_data': {
                            'currency': settings.STRIPE_CURRENCY,
                            'product_data': {
                                'name': f'SchedScan - Add Child (Slot #{next_slot})',
                                'description': 'One-time payment to add an additional child to your parent view.',
                            },
                            'unit_amount': settings.STRIPE_PRICE_AMOUNT,
                        },
                        'quantity': 1,
                    }],
                    'mode': 'payment',
                    'success_url': f'{base_url}/api/payment/success/?session_id={{CHECKOUT_SESSION_ID}}',
                    'cancel_url': f'{base_url}/api/payment/cancelled/',
                    'metadata': {
                        'parent_id': str(user.id),
                        'child_slot_number': str(next_slot),
                    },
                    'expires_after': 1800,  # Session expires after 30 minutes
                },
            )

            # Save pending payment record
            Payment.objects.create(
                parent=user,
                stripe_checkout_session_id=session.id,
                amount=settings.STRIPE_PRICE_AMOUNT,
                currency=settings.STRIPE_CURRENCY,
                status='pending',
                child_slot_number=next_slot,
            )

            logger.info(f"Created Stripe checkout session for parent {user.id} slot {next_slot}")

            return Response({
                "checkout_url": session.url,
                "session_id": session.id,
            }, status=status.HTTP_201_CREATED)

        except stripe.StripeError as e:
            logger.error(f"Stripe error creating checkout session: {e}")
            return Response(
                {"error": "Failed to create payment session. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY
            )


class CheckPaymentStatusView(APIView):
    """
    GET /api/payment/status/?session_id=cs_test_...
    Check the status of a Stripe Checkout Session and update the local record.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        session_id = request.query_params.get('session_id', '').strip()
        if not session_id:
            return Response({"error": "session_id is required"},
                            status=status.HTTP_400_BAD_REQUEST)

        # Validate session_id format to prevent injection
        if len(session_id) > 255 or not SESSION_ID_PATTERN.match(session_id):
            return Response({"error": "Invalid session_id format"},
                            status=status.HTTP_400_BAD_REQUEST)

        payment = Payment.objects.filter(
            stripe_checkout_session_id=session_id,
            parent=request.user,
        ).first()
        if not payment:
            return Response({"error": "Payment not found"},
                            status=status.HTTP_404_NOT_FOUND)

        # If already completed, return immediately
        if payment.status == 'completed':
            return Response({"status": "completed"})

        # Check with Stripe
        if not settings.STRIPE_SECRET_KEY:
            return Response({"error": "Payment system is not configured"},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)

        stripe_client = stripe.StripeClient(settings.STRIPE_SECRET_KEY)

        try:
            session = stripe_client.checkout.sessions.retrieve(session_id)

            if session.payment_status == 'paid':
                # Use select_for_update to prevent race condition on double-completion
                with transaction.atomic():
                    payment = Payment.objects.select_for_update().get(
                        id=payment.id
                    )
                    if payment.status == 'completed':
                        return Response({"status": "completed"})

                    from django.utils import timezone
                    payment.status = 'completed'
                    payment.completed_at = timezone.now()
                    payment.stripe_payment_intent_id = session.payment_intent
                    payment.save(update_fields=['status', 'completed_at', 'stripe_payment_intent_id'])

                logger.info(f"Payment {payment.id} completed for parent {request.user.id}")
                return Response({"status": "completed"})
            elif session.status == 'expired':
                payment.status = 'failed'
                payment.save(update_fields=['status'])
                return Response({"status": "failed"})
            else:
                return Response({"status": "pending"})

        except stripe.StripeError as e:
            logger.error(f"Stripe error checking payment status: {e}")
            return Response(
                {"error": "Failed to check payment status"},
                status=status.HTTP_502_BAD_GATEWAY
            )


class PaymentSuccessView(APIView):
    """
    GET /api/payment/success/?session_id=cs_test_...
    Landing page after successful Stripe Checkout. Returns a simple HTML page
    that tells the user to return to the app.
    """
    permission_classes = []  # No auth needed — this is a redirect from Stripe

    def get(self, request):
        from django.http import HttpResponse
        html = """
        <!DOCTYPE html>
        <html>
        <head><title>Payment Successful</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: -apple-system, sans-serif; display: flex;
                   justify-content: center; align-items: center; height: 100vh;
                   margin: 0; background: #f3f4f6; }
            .card { background: white; padding: 2rem; border-radius: 1rem;
                    text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    max-width: 400px; }
            .check { font-size: 3rem; margin-bottom: 1rem; }
            h1 { color: #059669; margin: 0 0 0.5rem; }
            p { color: #6b7280; }
        </style>
        </head>
        <body>
            <div class="card">
                <div class="check">✅</div>
                <h1>Payment Successful!</h1>
                <p>You can now return to the SchedScan app and add your child.</p>
            </div>
        </body>
        </html>
        """
        return HttpResponse(html)


class PaymentCancelledView(APIView):
    """
    GET /api/payment/cancelled/
    Landing page after cancelled Stripe Checkout.
    """
    permission_classes = []

    def get(self, request):
        from django.http import HttpResponse
        html = """
        <!DOCTYPE html>
        <html>
        <head><title>Payment Cancelled</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: -apple-system, sans-serif; display: flex;
                   justify-content: center; align-items: center; height: 100vh;
                   margin: 0; background: #f3f4f6; }
            .card { background: white; padding: 2rem; border-radius: 1rem;
                    text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    max-width: 400px; }
            .icon { font-size: 3rem; margin-bottom: 1rem; }
            h1 { color: #dc2626; margin: 0 0 0.5rem; }
            p { color: #6b7280; }
        </style>
        </head>
        <body>
            <div class="card">
                <div class="icon">❌</div>
                <h1>Payment Cancelled</h1>
                <p>No charge was made. You can return to the app and try again.</p>
            </div>
        </body>
        </html>
        """
        return HttpResponse(html)
