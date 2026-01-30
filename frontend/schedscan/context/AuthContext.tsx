import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { authService, User, LoginData, RegisterData } from '../services/authService';
import { scheduleStorageService } from '../services/scheduleStorageService';
import { usePushNotification } from '../usePushNotification';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  registerPushNotificationToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const login = async (data: LoginData) => {
    try {
      setIsLoading(true);
      const response = await authService.login(data);
      setUser(response.user);

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

  const register = async (data: RegisterData) => {
    try {
      setIsLoading(true);
      const response = await authService.register(data);
      setUser(response.user);

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
    } catch (error) {
      console.error('Logout failed:', error);
      // Clear user anyway
      setUser(null);
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
