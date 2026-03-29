import api from './api';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Course {
  id: number;
  user: number;
  subject_code: string;
  subject_name: string;
  start_time: string;
  end_time: string;
  day: string;
  location: string;
  source_type?: 'student' | 'faculty' | null;  // For merged schedules: tracks original source
  created_at: string;
  updated_at: string;
}

export interface UploadCORSyncResponse {
  message: string;
  courses: Course[];
  total_courses: number;
  upload_type: string;
  semester?: string;
  school_year?: string;
}

export interface UploadCORAcceptedResponse {
  job_id: string;
  status: 'processing';
  message: string;
}

export type UploadCORResponse = UploadCORSyncResponse | UploadCORAcceptedResponse;

export interface ExtractionJobDoneResponse {
  job_id: string;
  status: 'done';
  upload_type: string;
  courses: Course[];
  total_courses: number;
  confidence?: number;
  extraction_method?: string;
  semester?: string;
  school_year?: string;
  message?: string;
}

export interface ExtractionJobFailedResponse {
  job_id: string;
  status: 'failed';
  failure_category?: string;
  message: string;
  retryable?: boolean;
}

export interface ExtractionJobProcessingResponse {
  job_id: string;
  status: 'processing';
  message?: string;
}

export interface ExtractionJobTimeoutResponse {
  job_id: string;
  status: 'timeout';
  message: string;
}

export interface PollingCancelToken {
  isCancelled: boolean;
}

const isTerminalExtractionResult = (
  result: ExtractionJobResult
): result is ExtractionJobDoneResponse | ExtractionJobFailedResponse => {
  return result.status === 'done' || result.status === 'failed';
};

export type ExtractionJobResult =
  | ExtractionJobDoneResponse
  | ExtractionJobFailedResponse
  | ExtractionJobProcessingResponse
  | ExtractionJobTimeoutResponse;

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
   * Poll async extraction status until terminal state or timeout.
   */
  pollExtractionJob: async (
    jobId: string,
    options?: {
      maxAttempts?: number;
      intervalMs?: number;
      cancelToken?: PollingCancelToken;
    }
  ): Promise<ExtractionJobResult> => {
    const maxAttempts = options?.maxAttempts ?? 10;
    const intervalMs = options?.intervalMs ?? 3000;
    const cancelToken = options?.cancelToken;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (cancelToken?.isCancelled) {
        return {
          job_id: jobId,
          status: 'timeout',
          message: 'Polling was cancelled.',
        };
      }

      await sleep(intervalMs);

      if (cancelToken?.isCancelled) {
        return {
          job_id: jobId,
          status: 'timeout',
          message: 'Polling was cancelled.',
        };
      }

      try {
        const response = await api.get(`/extraction-jobs/${jobId}/`);
        const data = response.data as ExtractionJobResult;

        if (isTerminalExtractionResult(data)) {
          return data;
        }
      } catch (error: any) {
        const isLastAttempt = attempt === maxAttempts - 1;

        if (isLastAttempt) {
          return {
            job_id: jobId,
            status: 'failed',
            message:
              error?.response?.data?.message ||
              'Unable to check extraction status right now. Please try again shortly.',
            failure_category: 'system_error',
            retryable: true,
          };
        }
      }
    }

    return {
      job_id: jobId,
      status: 'timeout',
      message: "We'll notify you when done.",
    };
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
