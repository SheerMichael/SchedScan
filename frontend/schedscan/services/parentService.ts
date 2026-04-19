import api from './api';

// ============================================
// Parent Service - API calls for parental view feature
// ============================================

// --- Types ---

export interface ChildInfo {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
    profile_picture: string | null;
}

export interface LinkedChild {
    link_id: number;
    child: ChildInfo;
    linked_at: string;
}

export interface ChildScheduleResponse {
    child: ChildInfo;
    schedule: any | null;  // Full schedule with courses
    has_active_schedule: boolean;
}

export interface LinkedParent {
    id: number;
    parent_id: number;
    parent_name: string;
    parent_email: string;
    status: 'active' | 'revoked';
    linked_at: string;
}

export interface ChildrenListResponse {
    children: LinkedChild[];
    count: number;
    has_linked_children: boolean;
}

export interface StudentSearchResult {
    id: number;
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    student_number: string | null;
    is_already_linked: boolean;
    has_pending_request: boolean;
}

export interface ParentLinkRequest {
    id: number;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    requested_at: string;
    resolved_at: string | null;
    parent: number;
    child: number;
    parent_name: string;
    parent_email: string;
    child_name: string;
    child_email: string;
}

export interface ApiError {
    error: string;
}

export interface ParentRequestHistoryClearResponse {
    deleted_count: number;
    hidden_count: number;
    remaining_pending: number;
    message: string;
}

// --- Service ---

export const parentService = {
    /**
     * Get list of parents linked to this student
     */
    getLinkedParents: async (): Promise<LinkedParent[]> => {
        const response = await api.get('/student/parents/');
        return response.data.parents;
    },

    /**
     * Revoke a parent's access to this student's schedule
     */
    revokeParentAccess: async (linkId: number): Promise<void> => {
        await api.delete(`/student/parents/${linkId}/revoke/`);
    },

    // ============================================
    // Parent endpoints - Link to children and view schedules
    // ============================================

    /**
     * Get all linked children (supports multiple)
     */
    getLinkedChildren: async (): Promise<ChildrenListResponse> => {
        const response = await api.get('/parent/child/');
        return response.data;
    },

    /**
     * Get specific child's active schedule
     * @param childId - ID of the child to get schedule for (optional, defaults to first child)
     */
    getChildSchedule: async (childId?: number): Promise<ChildScheduleResponse> => {
        const url = childId
            ? `/parent/child/schedule/?child_id=${childId}`
            : '/parent/child/schedule/';
        const response = await api.get(url);
        return response.data;
    },

    /**
     * Unlink from a specific child
     * @param childId - ID of the child to unlink
     */
    unlinkFromChild: async (childId: number): Promise<{ message: string }> => {
        const response = await api.delete(`/parent/child/?child_id=${childId}`);
        return response.data;
    },

    /**
     * Search students by name/email/student number.
     * Parent-only endpoint.
     */
    searchChildren: async (query: string): Promise<StudentSearchResult[]> => {
        const response = await api.get('/parent/children/search/', { params: { q: query } });
        return response.data.results || [];
    },

    /**
     * Parent sends a request to connect with a student.
     */
    requestChildLink: async (childId: number): Promise<{ message: string; request: ParentLinkRequest }> => {
        const response = await api.post('/parent/link-requests/', { child_id: childId });
        return response.data;
    },

    /**
     * Parent lists their own connection requests.
     */
    getMyLinkRequests: async (): Promise<ParentLinkRequest[]> => {
        const response = await api.get('/parent/link-requests/');
        return response.data.requests || [];
    },

    /**
     * Parent cancels a pending connection request.
     */
    cancelMyLinkRequest: async (requestId: number): Promise<{ message: string; request: ParentLinkRequest }> => {
        const response = await api.post(`/parent/link-requests/${requestId}/cancel/`);
        return response.data;
    },

    /**
     * Remove a single resolved/cancelled request from parent history.
     */
    deleteRequestHistoryItem: async (requestId: number): Promise<{ message: string; request_id: number }> => {
        const response = await api.delete(`/parent/link-requests/${requestId}/`);
        return response.data;
    },

    /**
     * Clear all non-pending requests from parent history.
     */
    clearRequestHistory: async (): Promise<ParentRequestHistoryClearResponse> => {
        const response = await api.delete('/parent/link-requests/clear-history/');
        return response.data;
    },

    /**
     * Student lists pending parent connection requests.
     */
    getIncomingParentLinkRequests: async (): Promise<ParentLinkRequest[]> => {
        const response = await api.get('/student/parent-link-requests/');
        return response.data.requests || [];
    },

    /**
     * Student approves a parent connection request.
     */
    approveParentLinkRequest: async (requestId: number): Promise<{ message: string }> => {
        const response = await api.post(`/student/parent-link-requests/${requestId}/approve/`);
        return response.data;
    },

    /**
     * Student rejects a parent connection request.
     */
    rejectParentLinkRequest: async (requestId: number): Promise<{ message: string }> => {
        const response = await api.post(`/student/parent-link-requests/${requestId}/reject/`);
        return response.data;
    },
};
