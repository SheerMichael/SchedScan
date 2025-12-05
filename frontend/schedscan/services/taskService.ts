import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

/**
 * Interface for Task data
 */
export interface Task {
  id: number;
  subject_code: string;
  text: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Interface for creating a new task
 */
export interface CreateTaskData {
  subject_code: string;
  text: string;
}

/**
 * Interface for updating a task
 */
export interface UpdateTaskData {
  text?: string;
  is_completed?: boolean;
}

// Local storage key prefix for tasks cache
const TASKS_CACHE_KEY = 'tasks_cache_';

/**
 * Get the cache key for a specific subject code
 */
const getCacheKey = (subjectCode: string): string => {
  return `${TASKS_CACHE_KEY}${subjectCode}`;
};

export const taskService = {
  /**
   * Get tasks for a specific subject code.
   * Tries to fetch from backend first, falls back to local cache if offline.
   */
  getTasks: async (subjectCode: string): Promise<Task[]> => {
    try {
      // Try to fetch from backend
      const response = await api.get('/tasks/', {
        params: { subject_code: subjectCode }
      });
      const tasks: Task[] = response.data;
      
      // Update local cache
      await AsyncStorage.setItem(getCacheKey(subjectCode), JSON.stringify(tasks));
      
      return tasks;
    } catch (error: any) {
      console.error('Error fetching tasks from API:', error.message);
      
      // Fall back to local cache
      try {
        const cached = await AsyncStorage.getItem(getCacheKey(subjectCode));
        if (cached) {
          console.log('Using cached tasks for', subjectCode);
          return JSON.parse(cached);
        }
      } catch (cacheError) {
        console.error('Error reading tasks cache:', cacheError);
      }
      
      return [];
    }
  },

  /**
   * Create a new task.
   * Saves to backend and updates local cache.
   */
  createTask: async (data: CreateTaskData): Promise<Task> => {
    try {
      // Create on backend
      const response = await api.post('/tasks/', data);
      const newTask: Task = response.data;
      
      // Update local cache
      await taskService.addToCache(data.subject_code, newTask);
      
      return newTask;
    } catch (error: any) {
      console.error('Error creating task:', error.response?.data || error.message);
      
      // Create local-only task if offline
      const localTask: Task = {
        id: Date.now(), // Temporary ID
        subject_code: data.subject_code,
        text: data.text,
        is_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      await taskService.addToCache(data.subject_code, localTask);
      
      throw error; // Re-throw to let UI know it failed
    }
  },

  /**
   * Update a task (e.g., mark as completed).
   * Updates backend and local cache.
   */
  updateTask: async (taskId: number, subjectCode: string, data: UpdateTaskData): Promise<Task> => {
    try {
      // Update on backend
      const response = await api.patch(`/tasks/${taskId}/`, data);
      const updatedTask: Task = response.data;
      
      // Update local cache
      await taskService.updateInCache(subjectCode, updatedTask);
      
      return updatedTask;
    } catch (error: any) {
      console.error('Error updating task:', error.response?.data || error.message);
      
      // Update in cache even if backend fails (optimistic update)
      const cachedTasks = await taskService.getFromCache(subjectCode);
      const taskIndex = cachedTasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        cachedTasks[taskIndex] = { ...cachedTasks[taskIndex], ...data, updated_at: new Date().toISOString() };
        await AsyncStorage.setItem(getCacheKey(subjectCode), JSON.stringify(cachedTasks));
      }
      
      throw error;
    }
  },

  /**
   * Delete a task.
   * Removes from backend and local cache.
   */
  deleteTask: async (taskId: number, subjectCode: string): Promise<void> => {
    try {
      // Delete from backend
      await api.delete(`/tasks/${taskId}/`);
      
      // Remove from local cache
      await taskService.removeFromCache(subjectCode, taskId);
    } catch (error: any) {
      console.error('Error deleting task:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Toggle task completion status.
   */
  toggleTaskCompletion: async (task: Task): Promise<Task> => {
    return taskService.updateTask(task.id, task.subject_code, {
      is_completed: !task.is_completed
    });
  },

  // ============= Local Cache Helpers =============

  /**
   * Get tasks from local cache
   */
  getFromCache: async (subjectCode: string): Promise<Task[]> => {
    try {
      const cached = await AsyncStorage.getItem(getCacheKey(subjectCode));
      return cached ? JSON.parse(cached) : [];
    } catch (error) {
      console.error('Error reading from cache:', error);
      return [];
    }
  },

  /**
   * Add a task to local cache
   */
  addToCache: async (subjectCode: string, task: Task): Promise<void> => {
    try {
      const tasks = await taskService.getFromCache(subjectCode);
      tasks.unshift(task); // Add to beginning (newest first)
      await AsyncStorage.setItem(getCacheKey(subjectCode), JSON.stringify(tasks));
    } catch (error) {
      console.error('Error adding to cache:', error);
    }
  },

  /**
   * Update a task in local cache
   */
  updateInCache: async (subjectCode: string, updatedTask: Task): Promise<void> => {
    try {
      const tasks = await taskService.getFromCache(subjectCode);
      const index = tasks.findIndex(t => t.id === updatedTask.id);
      if (index !== -1) {
        tasks[index] = updatedTask;
        await AsyncStorage.setItem(getCacheKey(subjectCode), JSON.stringify(tasks));
      }
    } catch (error) {
      console.error('Error updating cache:', error);
    }
  },

  /**
   * Remove a task from local cache
   */
  removeFromCache: async (subjectCode: string, taskId: number): Promise<void> => {
    try {
      const tasks = await taskService.getFromCache(subjectCode);
      const filtered = tasks.filter(t => t.id !== taskId);
      await AsyncStorage.setItem(getCacheKey(subjectCode), JSON.stringify(filtered));
    } catch (error) {
      console.error('Error removing from cache:', error);
    }
  },

  /**
   * Clear all task caches (useful for logout)
   */
  clearAllCaches: async (): Promise<void> => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const taskKeys = keys.filter(key => key.startsWith(TASKS_CACHE_KEY));
      await AsyncStorage.multiRemove(taskKeys);
    } catch (error) {
      console.error('Error clearing task caches:', error);
    }
  },

  /**
   * Get task counts for multiple subject codes.
   * Returns a map of subject_code -> { total: number, incomplete: number }
   */
  getTaskCounts: async (subjectCodes: string[]): Promise<Record<string, { total: number; incomplete: number }>> => {
    const counts: Record<string, { total: number; incomplete: number }> = {};
    
    await Promise.all(
      subjectCodes.map(async (subjectCode) => {
        try {
          const tasks = await taskService.getTasks(subjectCode);
          counts[subjectCode] = {
            total: tasks.length,
            incomplete: tasks.filter(t => !t.is_completed).length,
          };
        } catch (error) {
          console.error(`Error getting task count for ${subjectCode}:`, error);
          counts[subjectCode] = { total: 0, incomplete: 0 };
        }
      })
    );
    
    return counts;
  },
};
