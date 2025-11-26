import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// API Base URL - automatically detects platform
// Android Emulator: 10.0.2.2
// iOS Simulator: 127.0.0.1
// Physical Device: Use your computer's local IP (set in app.json extra.apiUrl)
const getApiUrl = () => {
  // Check if we have a custom API URL from app.json (for physical devices)
  const customApiUrl = Constants.expoConfig?.extra?.apiUrl;
  
  if (customApiUrl) {
    console.log('Using custom API URL from config:', customApiUrl);
    return customApiUrl;
  }
  
  // Fallback to platform-specific defaults (for emulators/simulators)
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api';
  }
  // For iOS simulator or web
  return 'http://127.0.0.1:8000/api';
};

const API_URL = getApiUrl();

// Log the API URL for debugging
console.log('API Configuration:', {
  platform: Platform.OS,
  apiUrl: API_URL,
});

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor to add token to all requests
api.interceptors.request.use(
  async (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    
    // Skip adding Authorization header for public endpoints
    // These endpoints don't require authentication
    const publicEndpoints = ['/auth/login/', '/auth/register/', '/auth/token/refresh/'];
    const isPublicEndpoint = publicEndpoints.some(endpoint => config.url?.includes(endpoint));
    
    if (!isPublicEndpoint) {
      try {
        const token = await SecureStore.getItemAsync('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.error('Error getting token:', error);
      }
    }
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  async (error) => {
    console.error('API Error:', {
      message: error.message,
      status: error.response?.status,
      url: error.config?.url,
      data: error.response?.data,
    });

    const originalRequest = error.config;

    // Skip token refresh for login/register/refresh endpoints
    const skipRefreshUrls = ['/auth/login/', '/auth/register/', '/auth/token/refresh/'];
    const isSkippedUrl = skipRefreshUrls.some(url => originalRequest?.url?.includes(url));

    // If error is 401 and we haven't tried to refresh yet and not a skipped URL
    if (error.response?.status === 401 && !originalRequest._retry && !isSkippedUrl) {
      originalRequest._retry = true;

      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        
        if (!refreshToken) {
          // No refresh token available, clear everything
          await clearAuthData();
          return Promise.reject(new Error('Session expired. Please login again.'));
        }

        console.log('Attempting to refresh token...');
        
        // Try to refresh the token
        const response = await axios.post(`${API_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });

        const { access } = response.data;

        // Save new access token
        await SecureStore.setItemAsync('access_token', access);
        console.log('Token refreshed successfully');

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${access}`;
        return api(originalRequest);
        
      } catch (refreshError: any) {
        // Refresh failed, clear tokens
        console.error('Token refresh failed:', refreshError.response?.data || refreshError.message);
        await clearAuthData();
        return Promise.reject(new Error('Session expired. Please login again.'));
      }
    }

    return Promise.reject(error);
  }
);

// Helper function to clear auth data
async function clearAuthData() {
  try {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('user');
    console.log('Auth data cleared');
  } catch (error) {
    console.error('Error clearing auth data:', error);
  }
}

export default api;
