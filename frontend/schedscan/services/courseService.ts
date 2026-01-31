import api from './api';

export interface Course {
  id: number;
  user: number;
  subject_code: string;
  subject_name: string;
  start_time: string;
  end_time: string;
  day: string;
  location: string;
  created_at: string;
  updated_at: string;
}

export interface UploadCORResponse {
  message: string;
  courses: Course[];
  total_courses: number;
  upload_type: string;
}

export const courseService = {
  /**
   * Upload COR file and extract courses
   * @param file - The file object to upload
   * @param uploadType - Either 'student' or 'faculty'
   */
  uploadCOR: async (file: any, uploadType: 'student' | 'faculty' = 'student'): Promise<UploadCORResponse> => {
    try {
      const formData = new FormData();
      
      // Determine file type and name
      const filename = file.name || file.uri.split('/').pop() || 'cor.pdf';
      const match = /\.(\w+)$/.exec(filename);
      const type = file.mimeType || (match ? `application/${match[1]}` : 'application/pdf');

      formData.append('file', {
        uri: file.uri,
        name: filename,
        type: type,
      } as any);

      // Use appropriate endpoint based on upload type
      const endpoint = `/upload-cor/${uploadType}/`;
      
      const response = await api.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000, // 120 seconds for OCR processing (server-side processing can be slow)
      });

      return response.data;
    } catch (error: any) {
      console.error(`Upload ${uploadType.toUpperCase()} COR error:`, error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Get all courses for the authenticated user
   */
  getCourses: async (): Promise<Course[]> => {
    try {
      const response = await api.get('/courses/');
      return response.data;
    } catch (error: any) {
      console.error('Get courses error:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Delete a course
   */
  deleteCourse: async (courseId: number): Promise<void> => {
    try {
      await api.delete(`/courses/${courseId}/`);
    } catch (error: any) {
      console.error('Delete course error:', error.response?.data || error.message);
      throw error;
    }
  },
};
