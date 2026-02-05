import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { authService, User, LoginData, RegisterData, AuthResponse } from '../services/authService';
import { scheduleStorageService, SavedSchedule } from '../services/scheduleStorageService';
import { usePushNotification } from '../usePushNotification';

// Cache TTL for active schedule (30 seconds)
const SCHEDULE_CACHE_TTL_MS = 30 * 1000;

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginData) => Promise<AuthResponse>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  registerPushNotificationToken: () => Promise<boolean>;
  // Active schedule caching
  cachedActiveSchedule: SavedSchedule | null;
  getActiveSchedule: (forceRefresh?: boolean) => Promise<SavedSchedule | null>;
  invalidateScheduleCache: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Active schedule cache state
  const [cachedActiveSchedule, setCachedActiveSchedule] = useState<SavedSchedule | null>(null);
  const scheduleCacheTimestamp = useRef<number | null>(null);

  // Get push notification hook
  const { expoPushToken, registerTokenWithBackend } = usePushNotification();

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
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
    } catch (error) {
      console.error('Logout failed:', error);
      // Clear user and cache anyway
      setUser(null);
      invalidateScheduleCache();
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
      return schedule;
    } catch (error) {
      console.error('Error fetching active schedule:', error);
      return cachedActiveSchedule; // Return stale cache on error
    }
  }, [user?.id, cachedActiveSchedule]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
        registerPushNotificationToken,
        // Active schedule caching
        cachedActiveSchedule,
        getActiveSchedule,
        invalidateScheduleCache,
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
