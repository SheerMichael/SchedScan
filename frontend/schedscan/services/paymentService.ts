import api from './api';

// ============================================
// Payment Service - API calls for Stripe payment feature
// ============================================

// --- Types ---

export interface CanAddChildResponse {
    can_add_free: boolean;
    needs_payment: boolean;
    active_children: number;
    pending_requests?: number;
    paid_slots: number;
}

export interface CheckoutSessionResponse {
    checkout_url: string;
    session_id: string;
}

export interface PaymentStatusResponse {
    status: 'completed' | 'pending' | 'failed';
}

// --- Service ---

export const paymentService = {
    /**
     * Check if the parent can add a child for free or needs to pay
     */
    checkCanAddChild: async (): Promise<CanAddChildResponse> => {
        const response = await api.get('/payment/can-add-child/');
        return response.data;
    },

    /**
     * Create a Stripe Checkout Session for additional child payment
     */
    createCheckoutSession: async (): Promise<CheckoutSessionResponse> => {
        const response = await api.post('/payment/create-checkout-session/');
        return response.data;
    },

    /**
     * Check the payment status of a checkout session
     */
    checkPaymentStatus: async (sessionId: string): Promise<PaymentStatusResponse> => {
        const response = await api.get(`/payment/status/?session_id=${sessionId}`);
        return response.data;
    },
};
