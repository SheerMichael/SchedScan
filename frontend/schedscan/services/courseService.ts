import api from './api';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const inferExtensionFromMime = (mimeType: string): string => {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('pdf')) return 'pdf';
  return '';
};

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

export interface RecentExtractionJob {
  job_id: string;
  status: 'processing' | 'done' | 'failed' | string;
  upload_type: 'student' | 'faculty';
  file_name?: string;
  confidence?: number;
  extraction_method?: string;
  failure_category?: string;
  created_at: string;
  updated_at: string;
  courses?: Course[];
  total_courses?: number;
  semester?: string;
  school_year?: string;
  message?: string;
  retryable?: boolean;
}

const isRecoverableUploadError = (error: any): boolean => {
  if (error?.response) {
    return false;
  }
  const code = String(error?.code || '').toUpperCase();
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === 'ECONNABORTED' ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('timed out')
  );
};

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
      const uriCandidate = String(file?.uri || '').split('/').pop() || '';
      const nameCandidate = String(file?.name || uriCandidate || '').trim();
      const incomingMime = String(file?.mimeType || file?.type || '').toLowerCase();

      const hasExtension = /\.[A-Za-z0-9]+$/.test(nameCandidate);
      const inferredExt = hasExtension
        ? nameCandidate.split('.').pop()?.toLowerCase() || ''
        : inferExtensionFromMime(incomingMime);

      const safeFilename = nameCandidate
        ? (hasExtension ? nameCandidate : `${nameCandidate}.${inferredExt || 'jpg'}`)
        : `upload.${inferredExt || 'jpg'}`;

      const type = incomingMime || (
        inferredExt === 'pdf'
          ? 'application/pdf'
          : inferredExt === 'png'
            ? 'image/png'
            : 'image/jpeg'
      );

      formData.append('file', {
        uri: file.uri,
        name: safeFilename,
        type: type,
      } as any);

      // Use appropriate endpoint based on upload type
      const endpoint = `/upload-cor/${uploadType}/`;

      const requestConfig = {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        // Student uploads can include synchronous ownership checks and may exceed 2 minutes.
        timeout: 300000,
      };

      try {
        const response = await api.post(endpoint, formData, requestConfig);
        return response.data;
      } catch (firstError: any) {
        if (!isRecoverableUploadError(firstError)) {
          throw firstError;
        }

        // One controlled retry for transient network/timeout failures.
        await sleep(1500);
        const response = await api.post(endpoint, formData, requestConfig);
        return response.data;
      }
    } catch (error: any) {
      console.error(`Upload ${uploadType.toUpperCase()} COR error:`, error.response?.data || error.message);
      throw error;
    }
  },

  getRecentExtractionJobs: async (
    options?: { uploadType?: 'student' | 'faculty'; limit?: number }
  ): Promise<RecentExtractionJob[]> => {
    const params = new URLSearchParams();
    if (options?.uploadType) {
      params.append('upload_type', options.uploadType);
    }
    params.append('limit', String(options?.limit ?? 5));

    const response = await api.get(`/extraction-jobs/recent/?${params.toString()}`);
    return Array.isArray(response.data?.jobs) ? response.data.jobs : [];
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
