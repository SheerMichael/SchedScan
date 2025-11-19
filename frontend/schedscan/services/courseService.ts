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
}

export const courseService = {
  /**
   * Upload COR file and extract courses
   */
  uploadCOR: async (file: any): Promise<UploadCORResponse> => {
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

      const response = await api.post('/upload-cor/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // 30 seconds for OCR processing
      });

      return response.data;
    } catch (error: any) {
      console.error('Upload COR error:', error.response?.data || error.message);
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
