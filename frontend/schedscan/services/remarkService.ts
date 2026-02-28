import api from './api';

// ============================================
// Interfaces
// ============================================

export interface FacultyRemark {
    id: number;
    faculty: number;
    student: number;
    subject_code: string;
    text: string;
    faculty_name: string;
    student_name: string;
    student_email: string;
    time_ago: string;
    created_at: string;
    updated_at: string;
}

// ============================================
// Faculty-Side Remark Service
// ============================================

export const facultyRemarkService = {
    /**
     * List remarks left by the authenticated faculty.
     * Optional filters: subjectCode, studentId
     */
    getRemarks: async (subjectCode?: string, studentId?: number): Promise<FacultyRemark[]> => {
        const params: Record<string, string> = {};
        if (subjectCode) params.subject_code = subjectCode;
        if (studentId) params.student_id = String(studentId);
        const response = await api.get('/faculty/remarks/', { params });
        return response.data;
    },

    /**
     * Create a new remark for a student in a subject.
     */
    createRemark: async (data: {
        student_id: number;
        subject_code: string;
        text: string;
    }): Promise<FacultyRemark> => {
        const response = await api.post('/faculty/remarks/', data);
        return response.data;
    },

    /**
     * Edit an existing remark's text.
     */
    updateRemark: async (remarkId: number, text: string): Promise<FacultyRemark> => {
        const response = await api.patch(`/faculty/remarks/${remarkId}/`, { text });
        return response.data;
    },

    /**
     * Delete a remark.
     */
    deleteRemark: async (remarkId: number): Promise<void> => {
        await api.delete(`/faculty/remarks/${remarkId}/`);
    },
};

// ============================================
// Student-Side Remark Service
// ============================================

export const studentRemarkService = {
    /**
     * List all remarks about the authenticated student.
     * Optional filter: subjectCode
     */
    getRemarks: async (subjectCode?: string): Promise<FacultyRemark[]> => {
        const params: Record<string, string> = {};
        if (subjectCode) params.subject_code = subjectCode;
        const response = await api.get('/student/remarks/', { params });
        return response.data;
    },
};

// ============================================
// Parent-Side Remark Service
// ============================================

export const parentRemarkService = {
    /**
     * List all remarks about a linked child.
     * Required: childId. Optional: subjectCode
     */
    getRemarks: async (childId: number, subjectCode?: string): Promise<FacultyRemark[]> => {
        const params: Record<string, string> = { child_id: String(childId) };
        if (subjectCode) params.subject_code = subjectCode;
        const response = await api.get('/parent/child/remarks/', { params });
        return response.data;
    },
};
