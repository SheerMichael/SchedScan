import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { Course } from './courseService';

/**
 * Interface for schedule data as returned by the backend API
 */
export interface SavedSchedule {
  id: number;
  title: string;
  courses: Course[];
  uploadType: 'student' | 'faculty' | 'merged';
  uploadDate: string;
  isActive: boolean;
  semester?: string;      // e.g. '1ST', '2ND', 'SUMMER'
  schoolYear?: string;    // e.g. '2025-2026'
}

/**
 * Interface for course in conflict
 */
export interface ConflictCourse {
  subject_code: string;
  subject_name: string;
  start_time: string;
  end_time: string;
  location: string;
  source_type: 'student' | 'faculty';
}

/**
 * Interface for merge conflict information
 */
export interface ScheduleConflict {
  id: string;  // Unique identifier for this conflict
  day: string;
  course1: ConflictCourse;
  course2: ConflictCourse;
  overlap_minutes: number;
}

/**
 * Per-conflict resolution choice
 */
export interface ConflictChoice {
  conflict_id: string;  // Use snake_case for API compatibility
  choice: 'keep_course1' | 'keep_course2' | 'keep_both' | 'skip_both';
}

/**
 * Interface for merge response when conflicts are detected
 */
export interface MergeConflictsResponse {
  has_conflicts: true;
  conflicts: ScheduleConflict[];
  conflict_count: number;
  message: string;
  available_strategies: {
    value: string;
    description: string;
  }[];
}

/**
 * Interface for successful merge response
 */
export interface MergeSuccessResponse {
  message: string;
  schedule: APISchedule;
  total_courses: number;
  conflicts_found: number;
  conflicts_resolved: string;
}

export type ConflictResolution = 'keep_both' | 'keep_faculty' | 'keep_student' | 'skip_conflicts' | 'per_conflict';

/**
 * Request body for merge with per-conflict resolution
 */
export interface MergeRequest {
  schedule_ids: number[];
  title: string;
  conflict_resolution?: ConflictResolution;
  conflict_choices?: ConflictChoice[];  // For per-conflict resolution
}

/**
 * Interface matching backend API response format
 */
interface APISchedule {
  id: number;
  title: string;
  upload_type: 'student' | 'faculty' | 'merged';
  is_active: boolean;
  courses: APICourse[];
  semester?: string;
  school_year?: string;
  created_at: string;
  updated_at: string;
}

interface APICourse {
  id: number;
  subject_code: string;
  subject_name: string;
  start_time: string;
  end_time: string;
  day: string;
  location: string;
  source_type?: 'student' | 'faculty' | null;
  created_at?: string;
  updated_at?: string;
}

interface APIScheduleListItem {
  id: number;
  title: string;
  upload_type: 'student' | 'faculty' | 'merged';
  is_active: boolean;
  course_count: number;
  created_at: string;
  updated_at: string;
}

// Rate limiting constants (kept local for anti-spam)
const UPLOAD_COOLDOWN_MS = 5 * 1000; // 5 seconds cooldown
const LAST_UPLOAD_KEY = 'last_upload_timestamp';

/**
 * Transform API response to frontend format
 */
const transformAPISchedule = (apiSchedule: APISchedule): SavedSchedule => ({
  id: apiSchedule.id,
  title: apiSchedule.title,
  uploadType: apiSchedule.upload_type,
  isActive: apiSchedule.is_active,
  uploadDate: apiSchedule.created_at,
  semester: apiSchedule.semester || '',
  schoolYear: apiSchedule.school_year || '',
  courses: apiSchedule.courses.map(course => ({
    id: course.id,
    user: 0, // Not needed on frontend
    subject_code: course.subject_code,
    subject_name: course.subject_name,
    start_time: course.start_time,
    end_time: course.end_time,
    day: course.day,
    location: course.location,
    source_type: course.source_type || null,
    created_at: course.created_at || '',
    updated_at: course.updated_at || '',
  })),
});

/**
 * Transform frontend courses to API format (for creating schedules)
 */
const transformCoursesForAPI = (courses: Course[]): Omit<APICourse, 'id' | 'created_at' | 'updated_at'>[] =>
  courses.map(course => ({
    subject_code: course.subject_code,
    subject_name: course.subject_name,
    start_time: course.start_time,
    end_time: course.end_time,
    day: course.day,
    location: course.location,
  }));

export const scheduleStorageService = {
  /**
   * Check if user can upload (rate limiting - local only for anti-spam)
   */
  canUpload: async (userId: number): Promise<{ allowed: boolean; remainingSeconds: number }> => {
    try {
      const key = `${LAST_UPLOAD_KEY}_${userId}`;
      const lastUpload = await AsyncStorage.getItem(key);

      if (!lastUpload) {
        return { allowed: true, remainingSeconds: 0 };
      }

      const lastUploadTime = parseInt(lastUpload, 10);
      const now = Date.now();
      const elapsed = now - lastUploadTime;

      if (elapsed >= UPLOAD_COOLDOWN_MS) {
        return { allowed: true, remainingSeconds: 0 };
      }

      const remainingMs = UPLOAD_COOLDOWN_MS - elapsed;
      return { allowed: false, remainingSeconds: Math.ceil(remainingMs / 1000) };
    } catch (error) {
      console.error('Error checking upload rate limit:', error);
      return { allowed: true, remainingSeconds: 0 };
    }
  },

  /**
   * Record an upload timestamp for rate limiting (local only)
   */
  recordUpload: async (userId: number): Promise<void> => {
    try {
      const key = `${LAST_UPLOAD_KEY}_${userId}`;
      await AsyncStorage.setItem(key, Date.now().toString());
    } catch (error) {
      console.error('Error recording upload timestamp:', error);
    }
  },

  /**
   * Save a new schedule to the backend API
   */
  saveSchedule: async (
    title: string,
    courses: Course[],
    uploadType: 'student' | 'faculty',
    userId: number,
    setAsActive: boolean = false,
    semester: string = '',
    schoolYear: string = '',
  ): Promise<SavedSchedule> => {
    try {
      const response = await api.post('/schedules/', {
        title,
        upload_type: uploadType,
        is_active: setAsActive,
        semester,
        school_year: schoolYear,
        courses: transformCoursesForAPI(courses),
      });

      console.log('Schedule saved to backend:', response.data);
      return transformAPISchedule(response.data);
    } catch (error: any) {
      console.error('Error saving schedule to backend:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Get all schedules for a specific type from the backend API
   * Uses include_courses=true to get full schedule data in a single API call
   * (Optimized to avoid N+1 queries)
   */
  getSchedules: async (uploadType: 'student' | 'faculty' | 'merged', userId: number): Promise<SavedSchedule[]> => {
    try {
      // Use include_courses=true to get full schedule details in a single request
      // This avoids N+1 queries where we would otherwise need to fetch each schedule's courses separately
      const response = await api.get(`/schedules/?upload_type=${uploadType}&include_courses=true`);
      const schedules: APISchedule[] = response.data;

      return schedules.map(transformAPISchedule);
    } catch (error: any) {
      console.error('Error getting schedules from backend:', error.response?.data || error.message);
      return [];
    }
  },

  /**
   * Delete a schedule by ID from the backend API
   */
  deleteSchedule: async (id: string | number, uploadType: 'student' | 'faculty' | 'merged', userId: number): Promise<void> => {
    try {
      await api.delete(`/schedules/${id}/`);
      console.log('Schedule deleted from backend:', id);
    } catch (error: any) {
      console.error('Error deleting schedule from backend:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Update a schedule on the backend API
   */
  updateSchedule: async (
    id: string | number,
    uploadType: 'student' | 'faculty' | 'merged',
    userId: number,
    updates: Partial<SavedSchedule>
  ): Promise<void> => {
    try {
      const apiUpdates: any = {};
      if (updates.title !== undefined) apiUpdates.title = updates.title;
      if (updates.uploadType !== undefined) apiUpdates.upload_type = updates.uploadType;
      if (updates.isActive !== undefined) apiUpdates.is_active = updates.isActive;
      if (updates.courses !== undefined) {
        apiUpdates.courses = transformCoursesForAPI(updates.courses);
        console.log('updateSchedule: Sending', apiUpdates.courses.length, 'courses');
        console.log('updateSchedule: First course:', JSON.stringify(apiUpdates.courses[0]));
      }

      console.log('updateSchedule: PATCH /schedules/' + id + '/ with:', JSON.stringify(apiUpdates).substring(0, 500));
      await api.patch(`/schedules/${id}/`, apiUpdates);
      console.log('Schedule updated on backend:', id);
    } catch (error: any) {
      console.error('Error updating schedule on backend:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Get a single schedule by ID from the backend API
   */
  getScheduleById: async (
    id: string | number,
    uploadType: 'student' | 'faculty' | 'merged',
    userId: number
  ): Promise<SavedSchedule | null> => {
    try {
      const response = await api.get(`/schedules/${id}/`);
      return transformAPISchedule(response.data);
    } catch (error: any) {
      console.error('Error getting schedule by ID from backend:', error.response?.data || error.message);
      return null;
    }
  },

  /**
   * Set a schedule as active (deactivates all others) via backend API
   */
  setActiveSchedule: async (scheduleId: string | number, userId: number): Promise<void> => {
    try {
      await api.post(`/schedules/${scheduleId}/set-active/`);
      console.log('Schedule set as active:', scheduleId);
    } catch (error: any) {
      console.error('Error setting active schedule:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Get the currently active schedule from the backend API
   */
  getActiveSchedule: async (userId: number): Promise<SavedSchedule | null> => {
    try {
      const response = await api.get('/schedules/active/');
      if (response.data) {
        return transformAPISchedule(response.data);
      }
      return null;
    } catch (error: any) {
      console.error('Error getting active schedule from backend:', error.response?.data || error.message);
      return null;
    }
  },

  /**
   * Clear active schedule (deactivate current) via backend API
   */
  clearActiveSchedule: async (userId: number): Promise<void> => {
    try {
      await api.post('/schedules/clear-active/');
      console.log('Active schedule cleared');
    } catch (error: any) {
      console.error('Error clearing active schedule:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Download timetable image for a schedule
   * Returns the URL to download the timetable image
   */
  getTimetableDownloadUrl: (scheduleId: number | string): string => {
    // Get the base URL from api instance
    const baseUrl = api.defaults.baseURL || '';
    return `${baseUrl}/schedules/${scheduleId}/timetable/`;
  },

  /**
   * Download timetable as blob (for saving to device)
   */
  downloadTimetable: async (scheduleId: number | string): Promise<Blob> => {
    try {
      const response = await api.get(`/schedules/${scheduleId}/timetable/`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error: any) {
      console.error('Error downloading timetable:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Clear all local schedule data (for logout - local rate limit data only)
   */
  clearAllSchedules: async (userId: number): Promise<void> => {
    try {
      // Only clear local rate limiting data
      const key = `${LAST_UPLOAD_KEY}_${userId}`;
      await AsyncStorage.removeItem(key);

      // Clear legacy keys if they exist
      await AsyncStorage.multiRemove([
        'schedules_student',
        'schedules_faculty',
        `schedules_student_${userId}`,
        `schedules_faculty_${userId}`,
        `active_schedule_${userId}`,
      ]);

      console.log('Local schedule data cleared');
    } catch (error) {
      console.error('Error clearing local schedule data:', error);
      throw error;
    }
  },

  /**
   * Migrate legacy local schedules to backend
   * Called on login to sync any local-only data to the server
   * 
   * Optimized: Uses a flag to skip migration check after first successful run
   */
  migrateLegacySchedules: async (userId: number): Promise<void> => {
    try {
      // Check if migration has already been completed for this user
      const migrationKey = `migration_complete_v1_${userId}`;
      const migrationComplete = await AsyncStorage.getItem(migrationKey);

      if (migrationComplete === 'true') {
        // Migration already done, skip the legacy key checks
        return;
      }

      // Check for old legacy keys and clear them
      const legacyKeys = [
        'schedules_student',
        'schedules_faculty',
        `schedules_student_${userId}`,
        `schedules_faculty_${userId}`,
      ];

      let foundLegacyData = false;
      for (const key of legacyKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          console.log(`Found legacy data at ${key}, clearing...`);
          await AsyncStorage.removeItem(key);
          foundLegacyData = true;
        }
      }

      // Mark migration as complete for this user
      await AsyncStorage.setItem(migrationKey, 'true');

      if (foundLegacyData) {
        console.log('Legacy schedule migration complete - cleared old data');
      } else {
        console.log('Legacy schedule migration complete - no legacy data found');
      }
    } catch (error) {
      console.error('Error migrating legacy schedules:', error);
    }
  },

  /**
   * Check for conflicts between two schedules without merging
   * Returns conflicts if any, or null if no conflicts
   */
  checkMergeConflicts: async (
    scheduleIds: number[]
  ): Promise<MergeConflictsResponse | null> => {
    try {
      const response = await api.post('/schedules/merge/', {
        schedule_ids: scheduleIds,
        title: 'Conflict Check', // Won't be used since we're just checking
      });

      // If response has has_conflicts, return the conflicts
      if (response.data.has_conflicts) {
        return response.data as MergeConflictsResponse;
      }

      // No conflicts - this means merge would succeed with no issues
      return null;
    } catch (error: any) {
      console.error('Error checking merge conflicts:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Merge multiple schedules into a new combined schedule
   * 
   * @param scheduleIds - Array of schedule IDs to merge
   * @param title - Title for the new merged schedule
   * @param conflictResolution - How to handle time conflicts (optional, required if conflicts exist)
   * @param conflictChoices - Individual choices for each conflict (when using per_conflict resolution)
   * @returns The merged schedule or conflict information
   */
  mergeSchedules: async (
    scheduleIds: number[],
    title: string,
    conflictResolution?: ConflictResolution,
    conflictChoices?: ConflictChoice[]
  ): Promise<SavedSchedule | MergeConflictsResponse> => {
    try {
      const requestBody: MergeRequest = {
        schedule_ids: scheduleIds,
        title,
      };

      if (conflictResolution) {
        requestBody.conflict_resolution = conflictResolution;
      }

      if (conflictChoices && conflictChoices.length > 0) {
        requestBody.conflict_choices = conflictChoices;
      }

      const response = await api.post('/schedules/merge/', requestBody);

      // Check if response indicates conflicts that need resolution
      if (response.data.has_conflicts) {
        return response.data as MergeConflictsResponse;
      }

      // Successful merge - transform and return the schedule
      console.log('Schedules merged successfully:', response.data);
      return transformAPISchedule(response.data.schedule);
    } catch (error: any) {
      console.error('Error merging schedules:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Get all schedules (both student and faculty) for the user
   * Uses include_courses=true to get full schedule data in a single API call
   * (Optimized to avoid N+1 queries)
   */
  getAllSchedules: async (userId: number): Promise<SavedSchedule[]> => {
    try {
      // Use include_courses=true to get full schedule details in a single request
      // This avoids N+1 queries where we would otherwise need to fetch each schedule's courses separately
      const response = await api.get('/schedules/?include_courses=true');
      const schedules: APISchedule[] = response.data;

      return schedules.map(transformAPISchedule);
    } catch (error: any) {
      console.error('Error getting all schedules:', error.response?.data || error.message);
      return [];
    }
  },
};
