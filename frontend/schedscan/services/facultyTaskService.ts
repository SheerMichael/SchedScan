import api from './api';

// ============================================
// Interfaces
// ============================================

export interface FacultyTask {
    id: number;
    subject_code: string;
    text: string;
    due_date: string | null;
    created_at: string;
    updated_at: string;
}

/** Faculty-side task with completion stats */
export interface FacultyTaskWithStats extends FacultyTask {
    completed_count: number;
    total_enrolled: number;
}

/** Student-side view of a faculty task */
export interface StudentFacultyTask extends FacultyTask {
    is_completed: boolean;
    completed_at: string | null;
    faculty_name: string;
}

export interface ClassCode {
    id: number;
    subject_code: string;
    code: string;
    is_active: boolean;
    faculty_name: string;
    created_at: string;
}

export interface ClassEnrollment {
    id: number;
    subject_code: string;
    enrollment_type: 'auto' | 'code';
    status: 'active' | 'removed';
    enrolled_at: string;
    faculty_name: string;
    faculty_email: string;
    student_name: string;
    student_email: string;
}

export interface TaskCompletionStudent {
    student_id: number;
    student_name: string;
    student_email: string;
    is_completed: boolean;
    completed_at: string | null;
}

export interface TaskStats {
    task_id: number;
    text: string;
    subject_code: string;
    completed_count: number;
    total_enrolled: number;
    students: TaskCompletionStudent[];
}

/** Faculty mode check response */
export interface FacultyModeStatus {
    is_faculty: boolean;
    has_faculty_schedule: boolean;
    faculty_schedule_count: number;
    user_type: string;
}

/** Subject detail from class code preview */
export interface ClassCodeSubjectDetail {
    subject_name: string;
    day: string;
    start_time: string;
    end_time: string;
    location: string;
}

/** Class code preview response */
export interface ClassCodePreview {
    code: string;
    subject_code: string;
    faculty_name: string;
    faculty_email: string;
    subject_details: ClassCodeSubjectDetail[];
    already_enrolled: boolean;
}

/** Conflict detail from enroll+sync */
export interface EnrollSyncConflict {
    day: string;
    new_course: {
        subject_code: string;
        subject_name: string;
        start_time: string;
        end_time: string;
        location: string;
    };
    existing_course: {
        subject_code: string;
        subject_name: string;
        start_time: string;
        end_time: string;
        location: string;
    };
    overlap_minutes: number;
}

/** Response from enroll+sync endpoint */
export interface EnrollSyncResponse {
    enrolled: boolean;
    synced: boolean;
    courses_added?: number;
    has_conflicts?: boolean;
    conflicts?: EnrollSyncConflict[];
    message?: string;
    enrollment?: ClassEnrollment;
}

// ============================================
// Faculty-Side Service
// ============================================

export const facultyTaskService = {
    // --- Class Codes ---

    /** Generate a new class code for a subject */
    generateClassCode: async (subjectCode: string): Promise<ClassCode> => {
        const response = await api.post('/faculty/class-code/', {
            subject_code: subjectCode,
        });
        return response.data;
    },

    /** Get active class codes (optionally for a specific subject) */
    getClassCodes: async (subjectCode?: string): Promise<ClassCode[]> => {
        const params = subjectCode ? { subject_code: subjectCode } : {};
        const response = await api.get('/faculty/class-code/', { params });
        return response.data;
    },

    // --- Faculty Tasks ---

    /** Get faculty tasks (optionally for a specific subject) */
    getFacultyTasks: async (subjectCode?: string): Promise<FacultyTaskWithStats[]> => {
        const params = subjectCode ? { subject_code: subjectCode } : {};
        const response = await api.get('/faculty/tasks/', { params });
        return response.data.results ?? response.data;
    },

    /** Create a new faculty task */
    createFacultyTask: async (data: {
        subject_code: string;
        text: string;
        due_date?: string | null;
    }): Promise<FacultyTaskWithStats> => {
        const response = await api.post('/faculty/tasks/', data);
        return response.data;
    },

    /** Update a faculty task */
    updateFacultyTask: async (
        taskId: number,
        data: { text?: string; due_date?: string | null }
    ): Promise<FacultyTaskWithStats> => {
        const response = await api.patch(`/faculty/tasks/${taskId}/`, data);
        return response.data;
    },

    /** Delete a faculty task */
    deleteFacultyTask: async (taskId: number): Promise<void> => {
        await api.delete(`/faculty/tasks/${taskId}/`);
    },

    /** Get detailed completion stats for a task */
    getTaskStats: async (taskId: number): Promise<TaskStats> => {
        const response = await api.get(`/faculty/tasks/${taskId}/stats/`);
        return response.data;
    },

    /** Get enrolled students for a subject */
    getEnrolledStudents: async (subjectCode: string) => {
        const response = await api.get('/faculty/enrolled-students/', {
            params: { subject_code: subjectCode },
        });
        return response.data;
    },

    /** Remove a student from a class */
    removeStudent: async (data: {
        enrollment_id?: number;
        student_email?: string;
        subject_code?: string;
    }): Promise<{ message: string; enrollment_id: number }> => {
        const response = await api.post('/faculty/remove-student/', data);
        return response.data;
    },

    // --- Faculty Mode ---

    /** Check whether the current user is eligible for faculty mode */
    checkFacultyMode: async (): Promise<FacultyModeStatus> => {
        const response = await api.get('/faculty/check/');
        return response.data;
    },

    /** Activate faculty mode for the current user */
    activateFacultyMode: async (): Promise<{ message: string; user: any }> => {
        const response = await api.post('/faculty/activate/');
        return response.data;
    },
};

// ============================================
// Student-Side Service
// ============================================

export const studentEnrollmentService = {
    /** Preview a class code before enrolling (returns subject info for confirmation) */
    previewClassCode: async (code: string): Promise<ClassCodePreview> => {
        const response = await api.post('/student/enroll/preview/', { code });
        return response.data;
    },

    /** Enroll using a class code */
    enrollWithCode: async (code: string): Promise<ClassEnrollment> => {
        const response = await api.post('/student/enroll/', { code });
        return response.data;
    },

    /** Get student's active enrollments */
    getEnrollments: async (): Promise<ClassEnrollment[]> => {
        const response = await api.get('/student/enrollments/');
        return response.data;
    },

    /** Get faculty tasks for a subject */
    getFacultyTasks: async (subjectCode: string): Promise<StudentFacultyTask[]> => {
        const response = await api.get('/student/faculty-tasks/', {
            params: { subject_code: subjectCode },
        });
        return response.data.results ?? response.data;
    },

    /** Toggle completion of a faculty task */
    toggleFacultyTaskCompletion: async (
        taskId: number,
        isCompleted: boolean
    ): Promise<{ task_id: number; is_completed: boolean; completed_at: string | null }> => {
        const response = await api.post(`/student/faculty-tasks/${taskId}/complete/`, {
            is_completed: isCompleted,
        });
        return response.data;
    },

    /** Get faculty task counts for multiple subjects */
    getFacultyTaskCounts: async (
        subjectCodes: string[]
    ): Promise<Record<string, { total: number; incomplete: number }>> => {
        if (subjectCodes.length === 0) return {};
        const response = await api.post('/student/faculty-tasks/counts/', {
            subject_codes: subjectCodes,
        });
        return response.data;
    },

    /** Unenroll from a faculty's class */
    unenroll: async (data: {
        enrollment_id?: number;
        faculty_email?: string;
        subject_code?: string;
    }): Promise<{ message: string; enrollment_id: number }> => {
        const response = await api.post('/student/unenroll/', data);
        return response.data;
    },

    /** Enroll using a class code AND sync courses to active schedule */
    enrollAndSync: async (code: string, force: boolean = false): Promise<EnrollSyncResponse> => {
        const response = await api.post('/student/enroll/sync/', { code, force });
        return response.data;
    },
};
