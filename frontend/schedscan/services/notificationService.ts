/**
 * Notification Service
 * 
 * Handles fetching, reading, and managing notifications from the backend API.
 */

import api from './api';

export interface NotificationItem {
    id: number;
    notification_type: 'class_reminder' | 'faculty_task' | 'general';
    title: string;
    message: string;
    data: Record<string, any> | null;
    is_read: boolean;
    created_at: string;
    time_ago: string;
}

export interface NotificationListResponse {
    notifications: NotificationItem[];
    total: number;
    unread_count: number;
    page: number;
    page_size: number;
}

/**
 * Fetch the user's notifications from the backend.
 * @param page - Page number (default 1)
 * @param pageSize - Items per page (default 50)
 * @param isRead - Optional filter: true/false/undefined
 * @param type - Optional filter by notification type
 */
export const getNotifications = async (
    page: number = 1,
    pageSize: number = 50,
    isRead?: boolean,
    type?: string,
): Promise<NotificationListResponse> => {
    const params: Record<string, string> = {
        page: String(page),
        page_size: String(pageSize),
    };
    if (isRead !== undefined) params.is_read = String(isRead);
    if (type) params.type = type;

    const response = await api.get('/notifications/', { params });
    return response.data;
};

/**
 * Get unread notification count (lightweight — for badge display).
 */
export const getUnreadCount = async (): Promise<number> => {
    const response = await api.get('/notifications/unread-count/');
    return response.data.unread_count;
};

/**
 * Mark a single notification as read.
 */
export const markNotificationRead = async (id: number): Promise<void> => {
    await api.patch(`/notifications/${id}/read/`);
};

/**
 * Mark all notifications as read.
 */
export const markAllNotificationsRead = async (): Promise<number> => {
    const response = await api.post('/notifications/read-all/');
    return response.data.updated;
};

export const notificationService = {
    getNotifications,
    getUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
};

export default notificationService;
