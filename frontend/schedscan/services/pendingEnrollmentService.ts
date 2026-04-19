import api from './api';

export interface PendingEnrollment {
  id: number;
  subject_code: string;
  subject_name: string;
  enrollment_type: 'auto' | 'code';
  status: 'pending' | 'active' | 'declined' | 'removed';
  enrolled_at: string;
  faculty_name: string;
  faculty_email: string;
  faculty_profile_picture: string | null;
}

export interface PendingEnrollmentListResponse {
  count: number;
  results: PendingEnrollment[];
}

export const pendingEnrollmentService = {
  /**
   * List all pending (auto-detected) faculty match suggestions for the student.
   */
  getPendingEnrollments: async (): Promise<PendingEnrollmentListResponse> => {
    const response = await api.get('/student/pending-enrollments/', { timeout: 15000 });
    return response.data;
  },

  /**
   * Accept a single pending enrollment (transitions to active).
   */
  acceptEnrollment: async (id: number): Promise<{ message: string }> => {
    const response = await api.post(
      `/student/pending-enrollments/${id}/accept/`,
      {},
      { timeout: 10000 }
    );
    return response.data;
  },

  /**
   * Decline a single pending enrollment (transitions to declined — won't resurface).
   */
  declineEnrollment: async (id: number): Promise<{ message: string }> => {
    const response = await api.post(
      `/student/pending-enrollments/${id}/decline/`,
      {},
      { timeout: 10000 }
    );
    return response.data;
  },

  /**
   * Accept ALL pending enrollment suggestions at once (bulk action).
   */
  acceptAllEnrollments: async (): Promise<{ accepted_count: number; message: string }> => {
    const response = await api.post(
      '/student/pending-enrollments/accept-all/',
      {},
      { timeout: 15000 }
    );
    return response.data;
  },
};
