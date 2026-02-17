import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { authService, User, LoginData, RegisterData, AuthResponse } from '../services/authService';
import { scheduleStorageService, SavedSchedule } from '../services/scheduleStorageService';
import { facultyTaskService, ClassCode, FacultyModeStatus } from '../services/facultyTaskService';
import { usePushNotification } from '../usePushNotification';
import { offlineService } from '../services/offlineService';
import { taskService } from '../services/taskService';

// Cache TTL for active schedule (30 seconds)
const SCHEDULE_CACHE_TTL_MS = 30 * 1000;
// Cache TTL for faculty schedules and class codes (60 seconds)
const FACULTY_DATA_CACHE_TTL_MS = 60 * 1000;

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOffline: boolean;
  login: (data: LoginData) => Promise<AuthResponse>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  registerPushNotificationToken: () => Promise<boolean>;
  // Active schedule caching
  cachedActiveSchedule: SavedSchedule | null;
  getActiveSchedule: (forceRefresh?: boolean) => Promise<SavedSchedule | null>;
  invalidateScheduleCache: () => void;
  // Faculty data caching
  getFacultySchedules: (forceRefresh?: boolean) => Promise<SavedSchedule[]>;
  getClassCodes: (forceRefresh?: boolean) => Promise<ClassCode[]>;
  invalidateFacultyDataCache: () => void;
  // Faculty mode
  activateFacultyMode: () => Promise<boolean>;
  checkFacultyMode: () => Promise<FacultyModeStatus | null>;
  hasPendingFacultyUnlock: boolean;
  setPendingFacultyUnlock: (pending: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // Active schedule cache state
  const [cachedActiveSchedule, setCachedActiveSchedule] = useState<SavedSchedule | null>(null);
  const scheduleCacheTimestamp = useRef<number | null>(null);

  // Faculty data cache state
  const [cachedFacultySchedules, setCachedFacultySchedules] = useState<SavedSchedule[] | null>(null);
  const [cachedClassCodes, setCachedClassCodes] = useState<ClassCode[] | null>(null);
  const facultyDataCacheTimestamp = useRef<number | null>(null);

  // Faculty mode unlock state
  const [hasPendingFacultyUnlock, setHasPendingFacultyUnlock] = useState(false);

  // Get push notification hook
  const { expoPushToken, registerTokenWithBackend } = usePushNotification();

  // Initialize offline service & check auth on mount
  useEffect(() => {
    offlineService.init();
    const unsubscribe = offlineService.onConnectivityChange((connected) => {
      setIsOffline(!connected);
    });
    checkAuth();
    return () => {
      unsubscribe();
      offlineService.destroy();
    };
  }, []);

  // Register push token when user becomes authenticated and token is available
  useEffect(() => {
    if (user && expoPushToken?.data) {
      registerTokenWithBackend();
    }
  }, [user, expoPushToken, registerTokenWithBackend]);

  const checkAuth = async () => {
    try {
      const isAuth = await authService.isAuthenticated();
      if (isAuth) {
        const storedUser = await authService.getStoredUser();
        setUser(storedUser);

        // Migrate/clear legacy schedules for this user
        if (storedUser?.id) {
          await scheduleStorageService.migrateLegacySchedules(storedUser.id);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (data: LoginData): Promise<AuthResponse> => {
    try {
      setIsLoading(true);
      const response = await authService.login(data);
      setUser(response.user);

      // Clear any stale schedule cache from previous session
      invalidateScheduleCache();
      invalidateFacultyDataCache();

      // Migrate/clear legacy schedules for this user
      if (response.user?.id) {
        await scheduleStorageService.migrateLegacySchedules(response.user.id);
      }

      // Push token registration happens automatically via useEffect
      return response;
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData) => {
    try {
      setIsLoading(true);
      const response = await authService.register(data);
      setUser(response.user);

      // Clear any stale schedule cache
      invalidateScheduleCache();
      invalidateFacultyDataCache();

      // Migrate/clear legacy schedules for this user
      if (response.user?.id) {
        await scheduleStorageService.migrateLegacySchedules(response.user.id);
      }

      // Push token registration happens automatically via useEffect
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await authService.logout();
      setUser(null);
      // Clear schedule cache on logout
      invalidateScheduleCache();
      invalidateFacultyDataCache();
      // Clear all offline data (cache + sync queue) and task caches
      await offlineService.clearAll();
      await taskService.clearAllCaches();
    } catch (error) {
      console.error('Logout failed:', error);
      // Clear user and cache anyway
      setUser(null);
      invalidateScheduleCache();
      invalidateFacultyDataCache();
      await offlineService.clearAll();
      await taskService.clearAllCaches();
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  /**
   * Manually trigger push notification token registration.
   * Useful if the automatic registration failed or token changed.
   */
  const registerPushNotificationToken = useCallback(async (): Promise<boolean> => {
    if (!user) {
      console.log('Cannot register push token: user not authenticated');
      return false;
    }
    return registerTokenWithBackend();
  }, [user, registerTokenWithBackend]);

  /**
   * Invalidate the active schedule cache.
   * Call this after modifying schedules (create, update, delete, set active, etc.)
   */
  const invalidateScheduleCache = useCallback(() => {
    setCachedActiveSchedule(null);
    scheduleCacheTimestamp.current = null;
  }, []);

  /**
   * Invalidate the faculty data cache (schedules and class codes).
   * Call this after modifying faculty schedules or generating class codes.
   */
  const invalidateFacultyDataCache = useCallback(() => {
    setCachedFacultySchedules(null);
    setCachedClassCodes(null);
    facultyDataCacheTimestamp.current = null;
  }, []);

  /**
   * Get the active schedule with caching.
   * Uses cached data if available and not expired, otherwise fetches fresh data.
   * 
   * @param forceRefresh - If true, bypasses cache and fetches fresh data
   * @returns The active schedule or null if none is active
   */
  const getActiveSchedule = useCallback(async (forceRefresh: boolean = false): Promise<SavedSchedule | null> => {
    if (!user?.id) {
      return null;
    }

    const now = Date.now();
    const cacheIsValid = scheduleCacheTimestamp.current &&
      (now - scheduleCacheTimestamp.current) < SCHEDULE_CACHE_TTL_MS;

    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && cacheIsValid && cachedActiveSchedule !== undefined) {
      console.log('Using cached active schedule');
      return cachedActiveSchedule;
    }

    // Fetch fresh data from API
    try {
      console.log('Fetching fresh active schedule from API');
      const schedule = await scheduleStorageService.getActiveSchedule(user.id);
      setCachedActiveSchedule(schedule);
      scheduleCacheTimestamp.current = now;
      // Persist to disk for offline access
      if (schedule) {
        await offlineService.cacheActiveSchedule(schedule);
      }
      return schedule;
    } catch (error) {
      console.error('Error fetching active schedule:', error);
      // Try in-memory stale cache first, then disk cache
      if (cachedActiveSchedule) return cachedActiveSchedule;
      const diskCache = await offlineService.getCachedActiveSchedule();
      if (diskCache) {
        setCachedActiveSchedule(diskCache);
        console.log('Using disk-cached active schedule');
      }
      return diskCache;
    }
  }, [user?.id, cachedActiveSchedule]);

  /**
   * Get faculty schedules with caching.
   * Uses cached data if available and not expired, otherwise fetches fresh data.
   * 
   * @param forceRefresh - If true, bypasses cache and fetches fresh data
   * @returns Array of faculty schedules
   */
  const getFacultySchedules = useCallback(async (forceRefresh: boolean = false): Promise<SavedSchedule[]> => {
    if (!user?.id) {
      return [];
    }

    const now = Date.now();
    const cacheIsValid = facultyDataCacheTimestamp.current &&
      (now - facultyDataCacheTimestamp.current) < FACULTY_DATA_CACHE_TTL_MS;

    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && cacheIsValid && cachedFacultySchedules !== null) {
      console.log('Using cached faculty schedules');
      return cachedFacultySchedules;
    }

    // Fetch fresh data from API
    try {
      console.log('Fetching fresh faculty schedules from API');
      const schedules = await scheduleStorageService.getSchedules('faculty', user.id);
      setCachedFacultySchedules(schedules);
      facultyDataCacheTimestamp.current = now;
      return schedules;
    } catch (error) {
      console.error('Error fetching faculty schedules:', error);
      // Return stale cache if available
      return cachedFacultySchedules || [];
    }
  }, [user?.id, cachedFacultySchedules]);

  /**
   * Get class codes with caching.
   * Uses cached data if available and not expired, otherwise fetches fresh data.
   * 
   * @param forceRefresh - If true, bypasses cache and fetches fresh data
   * @returns Array of class codes
   */
  const getClassCodes = useCallback(async (forceRefresh: boolean = false): Promise<ClassCode[]> => {
    if (!user?.id) {
      return [];
    }

    const now = Date.now();
    const cacheIsValid = facultyDataCacheTimestamp.current &&
      (now - facultyDataCacheTimestamp.current) < FACULTY_DATA_CACHE_TTL_MS;

    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && cacheIsValid && cachedClassCodes !== null) {
      console.log('Using cached class codes');
      return cachedClassCodes;
    }

    // Fetch fresh data from API
    try {
      console.log('Fetching fresh class codes from API');
      const codes = await facultyTaskService.getClassCodes();
      setCachedClassCodes(codes);
      facultyDataCacheTimestamp.current = now;
      return codes;
    } catch (error) {
      console.error('Error fetching class codes:', error);
      // Return stale cache if available
      return cachedClassCodes || [];
    }
  }, [user?.id, cachedClassCodes]);

  /**
   * Check whether the current user is eligible for faculty mode.
   */
  const checkFacultyMode = useCallback(async (): Promise<FacultyModeStatus | null> => {
    if (!user?.id) return null;
    try {
      return await facultyTaskService.checkFacultyMode();
    } catch (error) {
      console.error('Error checking faculty mode:', error);
      return null;
    }
  }, [user?.id]);

  /**
   * Activate faculty mode for the current user.
   * Updates the local user state and stored user data.
   * Returns true on success.
   */
  const activateFacultyMode = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;
    try {
      const result = await facultyTaskService.activateFacultyMode();
      // Update local user state with the new user_type
      const updatedUser = { ...user, user_type: 'faculty' as const };
      setUser(updatedUser);
      // Persist to SecureStore
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync('user', JSON.stringify(updatedUser));
      // Clear faculty mode pending flag
      setHasPendingFacultyUnlock(false);
      // Invalidate caches so faculty-specific data loads fresh
      invalidateFacultyDataCache();
      console.log('Faculty mode activated successfully');
      return true;
    } catch (error) {
      console.error('Error activating faculty mode:', error);
      return false;
    }
  }, [user, invalidateFacultyDataCache]);

  /**
   * Set/clear the pending faculty unlock flag.
   * Used by scanner screen after detecting a faculty schedule upload.
   */
  const setPendingFacultyUnlock = useCallback((pending: boolean) => {
    setHasPendingFacultyUnlock(pending);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isOffline,
        login,
        register,
        logout,
        refreshUser,
        registerPushNotificationToken,
        // Active schedule caching
        cachedActiveSchedule,
        getActiveSchedule,
        invalidateScheduleCache,
        // Faculty data caching
        getFacultySchedules,
        getClassCodes,
        invalidateFacultyDataCache,
        // Faculty mode
        activateFacultyMode,
        checkFacultyMode,
        hasPendingFacultyUnlock,
        setPendingFacultyUnlock,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
