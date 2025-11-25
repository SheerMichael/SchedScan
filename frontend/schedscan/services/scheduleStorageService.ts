import AsyncStorage from '@react-native-async-storage/async-storage';
import { Course } from './courseService';

export interface SavedSchedule {
  id: string;
  title: string;
  courses: Course[];
  uploadType: 'student' | 'faculty';
  uploadDate: string;
}

const getStorageKey = (uploadType: 'student' | 'faculty', userId: number): string => {
  return `schedules_${uploadType}_${userId}`;
};

export const scheduleStorageService = {
  /**
   * Save a new schedule
   */
  saveSchedule: async (
    title: string,
    courses: Course[],
    uploadType: 'student' | 'faculty',
    userId: number
  ): Promise<SavedSchedule> => {
    try {
      const newSchedule: SavedSchedule = {
        id: Date.now().toString(),
        title,
        courses,
        uploadType,
        uploadDate: new Date().toISOString(),
      };

      const key = getStorageKey(uploadType, userId);
      const existingSchedules = await scheduleStorageService.getSchedules(uploadType, userId);
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
