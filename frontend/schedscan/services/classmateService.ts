import api from './api';

export interface Classmate {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  profile_picture: string | null;
  enrollment_type: 'auto' | 'code' | null;
}

export interface ClassmateListResponse {
  subject_code: string;
  subject_name: string;
  faculty_name: string;
  total_classmates: number;
  classmates: Classmate[];
}

export interface RosterStudent {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  student_number: string | null;
  profile_picture: string | null;
  enrollment_type: 'auto' | 'code' | null;
  enrollment_status: 'active' | 'pending' | 'removed' | 'declined' | null;
  enrolled_at: string | null;
}

export interface FacultyClassRosterResponse {
  subject_code: string;
  subject_name: string;
  total_active: number;
  total_pending: number;
  active_students: RosterStudent[];
  pending_students: RosterStudent[];
}

export const classmateService = {
  /**
   * Get classmates for a specific subject (student-facing).
   * Returns other students enrolled in the same class under the same faculty.
   */
  getClassmates: async (subjectCode: string): Promise<ClassmateListResponse> => {
    const response = await api.get('/student/classmates/', {
      params: { subject_code: subjectCode },
      timeout: 15000,
    });
    return response.data;
  },

  /**
   * Get the full class roster for a subject (faculty-facing).
   * Returns separate lists for active and pending students.
   */
  getClassRoster: async (subjectCode: string): Promise<FacultyClassRosterResponse> => {
    const response = await api.get('/faculty/class-roster/', {
      params: { subject_code: subjectCode },
      timeout: 15000,
    });
    return response.data;
  },
};
