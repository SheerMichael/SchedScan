import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { router } from "expo-router";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import NotificationItem from "../../components/notifitem";
import { usePushNotification } from "../../usePushNotification";
import { useFocusEffect } from '@react-navigation/native';
import notificationService, { NotificationItem as NotifType } from '../../services/notificationService';

const notificationscreen = () => {
    const [notifications, setNotifications] = useState<(NotifType & { isDismissed?: boolean })[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    const { notification, expoPushToken } = usePushNotification();

    // Fetch notifications from backend
    const fetchNotifications = async (showLoader = true) => {
        try {
            if (showLoader) setIsLoading(true);
            const data = await notificationService.getNotifications(1, 50);
            setNotifications(data.notifications.map(n => ({ ...n, isDismissed: false })));
            setUnreadCount(data.unread_count);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    // Reload when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            fetchNotifications();
        }, [])
    );

    // When a live push notification arrives, prepend it to the list
    useEffect(() => {
        if (notification) {
            const newNotif: NotifType & { isDismissed?: boolean } = {
                id: Date.now(), // temporary local id
                notification_type: (notification.request.content.data as any)?.type || 'general',
                title: notification.request.content.title || "SchedScan Alert",
                message: notification.request.content.body || "",
                data: notification.request.content.data as Record<string, any> || null,
                is_read: false,
                created_at: new Date().toISOString(),
                time_ago: "Just now",
                isDismissed: false,
            };
            setNotifications(prev => [newNotif, ...prev]);
            setUnreadCount(prev => prev + 1);
        }
    }, [notification]);

    const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <Path d="M19 12H6M12 5l-7 7 7 7" />
        </Svg>
    );

    const handleDismissNotification = async (id: number) => {
        // Optimistically mark as read in UI
        const target = notifications.find(n => n.id === id);
        setNotifications(prev =>
            prev.map(notif =>
                notif.id === id
                    ? { ...notif, isDismissed: true, is_read: true }
                    : notif
            )
        );
        // Only decrement if the notification was actually unread
        if (target && !target.is_read) {
            setUnreadCount(prev => Math.max(0, prev - 1));
        }

        // Persist to backend
        try {
            await notificationService.markNotificationRead(id);
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    const handleClearAll = async () => {
        setNotifications(prev =>
            prev.map(notif => ({ ...notif, isDismissed: true, is_read: true }))
        );
        setUnreadCount(0);

        try {
            await notificationService.markAllNotificationsRead();
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const onRefresh = () => {
        setIsRefreshing(true);
        fetchNotifications(false);
    };

    // Filter out dismissed notifications for display
    const visibleNotifications = notifications.filter(n => !n.isDismissed);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View className="w-full h-14 bg-white border-b-2 border-gray-200 justify-between items-center flex-row">
                <View className='pl-8 flex-row justify-center items-center'>
                    <TouchableOpacity onPress={() => router.push('/Home/home')}>
                        <LeftPointingArrow size={30} color="#000000" />
                    </TouchableOpacity>
                </View>

                <View className='flex-row justify-center items-center'>
                    <Text className='font-bold text-2xl'>Notifications</Text>
                    {unreadCount > 0 && (
                        <View className="ml-2 bg-red-500 rounded-full w-6 h-6 items-center justify-center">
                            <Text className="text-white text-xs font-bold">{unreadCount > 99 ? '99+' : unreadCount}</Text>
                        </View>
                    )}
                </View>

                <View className="pr-4 flex items-center justify-center">
                    <TouchableOpacity 
                        className="bg-orange-600 p-2 pr-4 pl-4 rounded-full"
                        onPress={handleClearAll}
                    >
                        <Text className="text-white">Clear</Text>
                    </TouchableOpacity>
                </View>
            </View>
            
            {isLoading ? (
                <View className='flex-1 justify-center items-center'>
                    <ActivityIndicator size="large" color="#DC2626" />
                    <Text className="text-gray-500 mt-2">Loading notifications...</Text>
                </View>
            ) : visibleNotifications.length > 0 ? (
                <ScrollView 
                    className="flex-1 px-6"
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={['#DC2626']} />
                    }
                >
                    {visibleNotifications.map((item) => (
                        <NotificationItem
                            key={item.id}
                            title={item.title}
                            time={item.notification_type === 'class_reminder' ? 'Class Reminder' : item.notification_type === 'faculty_task' ? 'Faculty Task' : 'Notification'}
                            message={item.message}
                            date={item.time_ago}
                            onDelete={() => handleDismissNotification(item.id)}
                        />
                    ))}
                </ScrollView>
            ) : 
                <View className='flex-1 justify-center items-center'>
                    <Text>No notifications!</Text>
                    <Text>You're all caught up</Text>
                </View>
            }
        </GestureHandlerRootView>
    );
};

export default notificationscreen;