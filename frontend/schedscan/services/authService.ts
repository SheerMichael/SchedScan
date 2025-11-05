import api from './api';
import * as SecureStore from 'expo-secure-store';

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  profile_picture?: any;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  profile_picture: string | null;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  tokens: {
    access: string;
    refresh: string;
  };
  message: string;
}

export const authService = {
  /**
   * Register a new user
   */
  register: async (data: RegisterData): Promise<AuthResponse> => {
    try {
      // Create FormData for multipart/form-data
      const formData = new FormData();
      formData.append('email', data.email);
      formData.append('password', data.password);
      formData.append('first_name', data.first_name);
      formData.append('last_name', data.last_name);

      // Add profile picture if provided
      if (data.profile_picture) {
        const filename = data.profile_picture.split('/').pop() || 'profile.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';

        formData.append('profile_picture', {
          uri: data.profile_picture,
          name: filename,
          type,
        } as any);
      }

      const response = await api.post('/auth/register/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Save tokens
      await SecureStore.setItemAsync('access_token', response.data.tokens.access);
      await SecureStore.setItemAsync('refresh_token', response.data.tokens.refresh);
      await SecureStore.setItemAsync('user', JSON.stringify(response.data.user));

      return response.data;
    } catch (error: any) {
      console.error('Registration error:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Login user
   */
  login: async (data: LoginData): Promise<AuthResponse> => {
    try {
      const response = await api.post('/auth/login/', data);

      // Save tokens
      await SecureStore.setItemAsync('access_token', response.data.tokens.access);
      await SecureStore.setItemAsync('refresh_token', response.data.tokens.refresh);
      await SecureStore.setItemAsync('user', JSON.stringify(response.data.user));

      return response.data;
    } catch (error: any) {
      console.error('Login error:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Logout user
   */
  logout: async (): Promise<void> => {
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      
      if (refreshToken) {
        // Call logout endpoint to blacklist token
        await api.post('/auth/logout/', {
          refresh: refreshToken,
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear all stored data
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
      await SecureStore.deleteItemAsync('user');
    }
  },

  /**
   * Get current user profile
   */
  getCurrentUser: async (): Promise<User> => {
    try {
      const response = await api.get('/auth/user/');
      await SecureStore.setItemAsync('user', JSON.stringify(response.data));
      return response.data;
    } catch (error: any) {
      console.error('Get user error:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: async (): Promise<boolean> => {
    try {
      const token = await SecureStore.getItemAsync('access_token');
      return !!token;
    } catch (error) {
      return false;
    }
  },

  /**
   * Get stored user data
   */
  getStoredUser: async (): Promise<User | null> => {
    try {
      const userString = await SecureStore.getItemAsync('user');
      return userString ? JSON.parse(userString) : null;
    } catch (error) {
      return null;
    }
  },
};
