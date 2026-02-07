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

export interface InviteCodeResponse {
    code: string;
    created_at: string;
    message?: string;
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

export interface UseInviteCodeResponse {
    message: string;
    child: ChildInfo;
    linked_at: string;
}

export interface ApiError {
    error: string;
}

// --- Service ---

export const parentService = {
    // ============================================
    // Student endpoints - Generate codes and manage parents
    // ============================================

    /**
     * Generate a new invite code for parents
     * Only students/faculty can call this
     */
    generateInviteCode: async (): Promise<InviteCodeResponse> => {
        const response = await api.post('/auth/invite-code/generate/');
        return response.data;
    },

    /**
     * Get current active invite code (if any)
     */
    getActiveInviteCode: async (): Promise<InviteCodeResponse | null> => {
        const response = await api.get('/auth/invite-code/generate/');
        return response.data.code ? response.data : null;
    },

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
     * Use an invite code to link to a student
     * Only parents can call this
     * Now supports linking to multiple children
     */
    useInviteCode: async (code: string): Promise<UseInviteCodeResponse> => {
        const response = await api.post('/auth/invite-code/use/', { code });
        return response.data;
    },

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
     * Validate an invite code (unauthenticated)
     * Used before registration to check if code is valid
     */
    validateInviteCode: async (code: string): Promise<{ valid: boolean; student_name?: string; error?: string }> => {
        try {
            const response = await api.get(`/auth/invite-code/validate/?code=${code}`);
            return response.data;
        } catch (error: any) {
            return {
                valid: false,
                error: error.response?.data?.error || 'Invalid code'
            };
        }
    },
};
