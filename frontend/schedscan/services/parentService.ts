import api from './api';

// ============================================
// Parent Service - API calls for parental view feature
// ============================================

export interface ChildInfo {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
    profile_picture: string | null;
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

export interface ChildLinkResponse {
    child: ChildInfo | null;
    linked_at?: string;
    has_linked_child: boolean;
}

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
    // Parent endpoints - Link to child and view schedule
    // ============================================

    /**
     * Use an invite code to link to a student
     * Only parents can call this
     */
    useInviteCode: async (code: string): Promise<{ message: string; child: ChildInfo; linked_at: string }> => {
        const response = await api.post('/auth/invite-code/use/', { code });
        return response.data;
    },

    /**
     * Get linked child info
     */
    getLinkedChild: async (): Promise<ChildLinkResponse> => {
        const response = await api.get('/parent/child/');
        return response.data;
    },

    /**
     * Get linked child's active schedule
     */
    getChildSchedule: async (): Promise<ChildScheduleResponse> => {
        const response = await api.get('/parent/child/schedule/');
        return response.data;
    },

    /**
     * Unlink from child
     */
    unlinkFromChild: async (): Promise<void> => {
        await api.delete('/parent/child/');
    },
};
