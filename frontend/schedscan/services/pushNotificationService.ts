/**
 * Push Notification Service
 * 
 * Handles registration of Expo push tokens with the backend API.
 */

import api from './api';

/**
 * Register the Expo push token with the backend.
 * This should be called after the user logs in or when the app starts.
 * 
 * @param token - The Expo push token string (e.g., "ExponentPushToken[xxxxx]")
 * @returns Promise with the API response
 */
export const registerPushToken = async (token: string): Promise<{ message: string; expo_push_token: string }> => {
    try {
        const response = await api.post('/push-token/', {
            expo_push_token: token,
        });
        console.log('Push token registered successfully:', token.substring(0, 30) + '...');
        return response.data;
    } catch (error: any) {
        console.error('Failed to register push token:', error.response?.data || error.message);
        throw error;
    }
};

/**
 * Get the current user's stored push token from the backend.
 * Useful for debugging or checking if token is already registered.
 */
export const getCurrentPushToken = async (): Promise<string | null> => {
    try {
        const response = await api.get('/auth/user/');
        return response.data.expo_push_token || null;
    } catch (error) {
        console.error('Failed to get current push token:', error);
        return null;
    }
};

export const pushNotificationService = {
    registerPushToken,
    getCurrentPushToken,
};

export default pushNotificationService;
