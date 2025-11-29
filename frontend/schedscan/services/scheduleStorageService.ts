import AsyncStorage from '@react-native-async-storage/async-storage';
import { Course } from './courseService';

export interface SavedSchedule {
  id: string;
  title: string;
  courses: Course[];
  uploadType: 'student' | 'faculty';
  uploadDate: string;
  isActive: boolean; // Only one schedule can be active at a time
}

// Rate limiting constants
const UPLOAD_COOLDOWN_MS = 5 * 1000; // 5 seconds cooldown (anti-spam)
const LAST_UPLOAD_KEY = 'last_upload_timestamp';

const getStorageKey = (uploadType: 'student' | 'faculty', userId: number): string => {
  return `schedules_${uploadType}_${userId}`;
};

const getActiveScheduleKey = (userId: number): string => {
  return `active_schedule_${userId}`;
};

export const scheduleStorageService = {
  /**
   * Check if user can upload (rate limiting - 1 upload per minute)
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
      return { allowed: true, remainingSeconds: 0 }; // Allow on error
    }
  },

  /**
   * Record an upload timestamp for rate limiting
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
   * Save a new schedule (inactive by default)
   */
  saveSchedule: async (
    title: string,
    courses: Course[],
    uploadType: 'student' | 'faculty',
    userId: number,
    setAsActive: boolean = false
  ): Promise<SavedSchedule> => {
    try {
      const newSchedule: SavedSchedule = {
        id: Date.now().toString(),
        title,
        courses,
        uploadType,
        uploadDate: new Date().toISOString(),
        isActive: setAsActive,
      };

      const key = getStorageKey(uploadType, userId);
      let existingSchedules = await scheduleStorageService.getSchedules(uploadType, userId);
      
      // If setting as active, deactivate all other schedules
      if (setAsActive) {
        existingSchedules = existingSchedules.map(s => ({ ...s, isActive: false }));
        // Also save as the active schedule reference
        await scheduleStorageService.setActiveSchedule(newSchedule.id, userId);
      }
      
      const updatedSchedules = [...existingSchedules, newSchedule];

      await AsyncStorage.setItem(key, JSON.stringify(updatedSchedules));
      return newSchedule;
    } catch (error) {
      console.error('Error saving schedule:', error);
      throw error;
    }
  },

  /**
   * Get all schedules for a specific type
   */
  getSchedules: async (uploadType: 'student' | 'faculty', userId: number): Promise<SavedSchedule[]> => {
    try {
      const key = getStorageKey(uploadType, userId);
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting schedules:', error);
      return [];
    }
  },

  /**
   * Delete a schedule by ID
   */
  deleteSchedule: async (id: string, uploadType: 'student' | 'faculty', userId: number): Promise<void> => {
    try {
      const key = getStorageKey(uploadType, userId);
      const existingSchedules = await scheduleStorageService.getSchedules(uploadType, userId);
      const updatedSchedules = existingSchedules.filter(schedule => schedule.id !== id);
      await AsyncStorage.setItem(key, JSON.stringify(updatedSchedules));
    } catch (error) {
      console.error('Error deleting schedule:', error);
      throw error;
    }
  },

  /**
   * Update a schedule
   */
  updateSchedule: async (
    id: string,
    uploadType: 'student' | 'faculty',
    userId: number,
    updates: Partial<SavedSchedule>
  ): Promise<void> => {
    try {
      const key = getStorageKey(uploadType, userId);
      const existingSchedules = await scheduleStorageService.getSchedules(uploadType, userId);
      const updatedSchedules = existingSchedules.map(schedule =>
        schedule.id === id ? { ...schedule, ...updates } : schedule
      );
      await AsyncStorage.setItem(key, JSON.stringify(updatedSchedules));
    } catch (error) {
      console.error('Error updating schedule:', error);
      throw error;
    }
  },

  /**
   * Get a single schedule by ID
   */
  getScheduleById: async (
    id: string,
    uploadType: 'student' | 'faculty',
    userId: number
  ): Promise<SavedSchedule | null> => {
    try {
      const schedules = await scheduleStorageService.getSchedules(uploadType, userId);
      return schedules.find(schedule => schedule.id === id) || null;
    } catch (error) {
      console.error('Error getting schedule by ID:', error);
      return null;
    }
  },

  /**
   * Set a schedule as active (deactivates all others)
   */
  setActiveSchedule: async (scheduleId: string, userId: number): Promise<void> => {
    try {
      // Store active schedule ID reference
      const activeKey = getActiveScheduleKey(userId);
      await AsyncStorage.setItem(activeKey, scheduleId);
      
      // Update all schedules to reflect active status
      for (const uploadType of ['student', 'faculty'] as const) {
        const key = getStorageKey(uploadType, userId);
        const schedules = await scheduleStorageService.getSchedules(uploadType, userId);
        const updatedSchedules = schedules.map(s => ({
          ...s,
          isActive: s.id === scheduleId,
        }));
        await AsyncStorage.setItem(key, JSON.stringify(updatedSchedules));
      }
    } catch (error) {
      console.error('Error setting active schedule:', error);
      throw error;
    }
  },

  /**
   * Get the currently active schedule
   */
  getActiveSchedule: async (userId: number): Promise<SavedSchedule | null> => {
    try {
      // Check both student and faculty schedules for active one
      const studentSchedules = await scheduleStorageService.getSchedules('student', userId);
      const facultySchedules = await scheduleStorageService.getSchedules('faculty', userId);
      
      const allSchedules = [...studentSchedules, ...facultySchedules];
      return allSchedules.find(s => s.isActive) || null;
    } catch (error) {
      console.error('Error getting active schedule:', error);
      return null;
    }
  },

  /**
   * Clear active schedule (deactivate current)
   */
  clearActiveSchedule: async (userId: number): Promise<void> => {
    try {
      const activeKey = getActiveScheduleKey(userId);
      await AsyncStorage.removeItem(activeKey);
      
      // Deactivate all schedules
      for (const uploadType of ['student', 'faculty'] as const) {
        const key = getStorageKey(uploadType, userId);
        const schedules = await scheduleStorageService.getSchedules(uploadType, userId);
        const updatedSchedules = schedules.map(s => ({ ...s, isActive: false }));
        await AsyncStorage.setItem(key, JSON.stringify(updatedSchedules));
      }
    } catch (error) {
      console.error('Error clearing active schedule:', error);
      throw error;
    }
  },

  /**
   * Clear all schedules for a specific user (useful for logout)
   */
  clearAllSchedules: async (userId: number): Promise<void> => {
    try {
      const studentKey = getStorageKey('student', userId);
      const facultyKey = getStorageKey('faculty', userId);
      
      // Also clear old legacy keys (without user ID) for backward compatibility
      const legacyStudentKey = 'schedules_student';
      const legacyFacultyKey = 'schedules_faculty';
      
      await AsyncStorage.multiRemove([
        studentKey, 
        facultyKey,
        legacyStudentKey,
        legacyFacultyKey
      ]);
    } catch (error) {
      console.error('Error clearing schedules:', error);
      throw error;
    }
  },

  /**
   * Migrate old schedules to user-specific storage
   * Called on app startup/login to move legacy data
   */
  migrateLegacySchedules: async (userId: number): Promise<void> => {
    try {
      // Check for old legacy keys
      const legacyStudentData = await AsyncStorage.getItem('schedules_student');
      const legacyFacultyData = await AsyncStorage.getItem('schedules_faculty');

      // If legacy data exists, we'll clear it (don't migrate to avoid data leakage)
      const keysToRemove: string[] = [];
      
      if (legacyStudentData) {
        keysToRemove.push('schedules_student');
      }
      
      if (legacyFacultyData) {
        keysToRemove.push('schedules_faculty');
      }

      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
        console.log('Cleared legacy schedule data');
      }
    } catch (error) {
      console.error('Error migrating legacy schedules:', error);
    }
  },
};
