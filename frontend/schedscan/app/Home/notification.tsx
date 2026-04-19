import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { router } from "expo-router";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import NotificationItem from "../../components/notifitem";
import FacultyMatchModal from '../../components/FacultyMatchModal';
import { usePushNotification } from "../../usePushNotification";
import { useFocusEffect } from '@react-navigation/native';
import notificationService, { NotificationItem as NotifType } from '../../services/notificationService';
import { pendingEnrollmentService } from '../../services/pendingEnrollmentService';

type FilterMode = 'all' | 'unread';

const getCategoryLabel = (notificationType: NotifType['notification_type']): string => {
    if (notificationType === 'class_reminder') return 'Class Reminder';
    if (notificationType === 'faculty_task') return 'Faculty Task';
    if (notificationType === 'faculty_match') return 'Class Match';
    if (notificationType === 'faculty_remark') return 'Faculty Remark';
    if (notificationType === 'faculty_verification') return 'Account Verification';
    return 'Notification';
};

const NotificationScreen = () => {
    const [notifications, setNotifications] = useState<(NotifType & { isDismissed?: boolean })[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isClearingAll, setIsClearingAll] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterMode>('all');
    const [showClassMatchModal, setShowClassMatchModal] = useState(false);

    const { notification } = usePushNotification();

    // Fetch notifications from backend
    const fetchNotifications = async (showLoader = true) => {
        try {
            if (showLoader) setIsLoading(true);
            const data = await notificationService.getNotifications(1, 50, false);
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

    const handleNotificationPress = async (item: NotifType & { isDismissed?: boolean }) => {
        if (!item.is_read) {
            setNotifications(prev =>
                prev.map(notif =>
                    notif.id === item.id
                        ? { ...notif, is_read: true }
                        : notif
                )
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
            try {
                await notificationService.markNotificationRead(item.id);
            } catch (error) {
                console.error('Failed to mark notification as read from tap:', error);
            }
        }

        const payloadType = String(item?.data?.type || '').toLowerCase();
        const isClassMatchNotification = (
            item.notification_type === 'faculty_match'
            || payloadType === 'faculty_match'
            || payloadType === 'class_match'
        );

        if (!isClassMatchNotification) {
            return;
        }

        try {
            const pending = await pendingEnrollmentService.getPendingEnrollments();
            if ((pending?.count || 0) > 0) {
                setShowClassMatchModal(true);
                return;
            }

            Alert.alert(
                'Class Match',
                'No pending class matches right now. You may have already accepted or dismissed them.'
            );
        } catch (error) {
            console.error('Failed to load pending class matches from notification tap:', error);
            Alert.alert('Unable to open class matches', 'Please try again in a moment.');
        }
    };

    const handleClearAll = async () => {
        const hasUnread = notifications.some(item => !item.isDismissed && !item.is_read);
        if (isClearingAll || !hasUnread) return;

        const previousNotifications = notifications;
        const previousUnreadCount = unreadCount;

        setIsClearingAll(true);
        setNotifications(prev =>
            prev.map(notif => ({ ...notif, isDismissed: true, is_read: true }))
        );
        setUnreadCount(0);

        try {
            await notificationService.markAllNotificationsRead();
        } catch (error) {
            console.error('Failed to mark all as read:', error);
            setNotifications(previousNotifications);
            setUnreadCount(previousUnreadCount);
        } finally {
            setIsClearingAll(false);
        }
    };

    const onRefresh = () => {
        setIsRefreshing(true);
        fetchNotifications(false);
    };

    const visibleNotifications = useMemo(() => {
        return notifications.filter(item => {
            if (item.isDismissed) return false;
            if (activeFilter === 'unread') return !item.is_read;
            return true;
        });
    }, [notifications, activeFilter]);

    const hasUnread = notifications.some(item => !item.isDismissed && !item.is_read);

    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
            <View className="w-full bg-white border-b border-slate-200 px-5 pb-3 pt-2">
                <View className="flex-row items-center justify-between">
                    <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                        <LeftPointingArrow size={30} color="#000000" />
                    </TouchableOpacity>

                    <View className='flex-row items-center'>
                        <Text className='text-2xl font-bold text-slate-900'>Notifications</Text>
                    </View>

                    <TouchableOpacity
                        className={`rounded-full px-4 py-2 ${isClearingAll || !hasUnread ? 'bg-orange-200' : 'bg-orange-600'}`}
                        onPress={handleClearAll}
                        disabled={isClearingAll || !hasUnread}
                    >
                        <Text className="font-semibold text-white">{isClearingAll ? 'Clearing...' : 'Read all'}</Text>
                    </TouchableOpacity>
                </View>

                <View className="mt-3 flex-row items-center">
                    <Text className="text-sm text-slate-600">Inbox</Text>
                    {unreadCount > 0 && (
                        <View className="ml-2 h-6 min-w-6 rounded-full bg-red-500 px-2 items-center justify-center">
                            <Text className="text-white text-xs font-bold">{unreadCount > 99 ? '99+' : unreadCount}</Text>
                        </View>
                    )}
                </View>

                <View className="mt-3 flex-row rounded-full bg-slate-100 p-1">
                    <TouchableOpacity 
                        className={`flex-1 rounded-full py-2 ${activeFilter === 'all' ? 'bg-white' : ''}`}
                        onPress={() => setActiveFilter('all')}
                    >
                        <Text className={`text-center font-semibold ${activeFilter === 'all' ? 'text-slate-900' : 'text-slate-600'}`}>All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        className={`flex-1 rounded-full py-2 ${activeFilter === 'unread' ? 'bg-white' : ''}`}
                        onPress={() => setActiveFilter('unread')}
                    >
                        <Text className={`text-center font-semibold ${activeFilter === 'unread' ? 'text-slate-900' : 'text-slate-600'}`}>Unread</Text>
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
                    className="flex-1 px-4 pt-3"
                    refreshControl={
                        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={['#DC2626']} />
                    }
                >
                    {visibleNotifications.map((item) => (
                        <NotificationItem
                            key={item.id}
                            title={item.title}
                            category={getCategoryLabel(item.notification_type)}
                            message={item.message}
                            date={item.time_ago}
                            isRead={item.is_read}
                            notificationType={item.notification_type}
                            onDelete={() => handleDismissNotification(item.id)}
                            onPress={() => handleNotificationPress(item)}
                        />
                    ))}
                    <View className="h-6" />
                </ScrollView>
            ) : 
                <View className='flex-1 justify-center items-center'>
                    <Text className="text-lg font-semibold text-slate-900">
                        {activeFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                    </Text>
                    <Text className="mt-1 text-slate-500">
                        {activeFilter === 'unread' ? 'Everything is up to date.' : 'You are all caught up.'}
                    </Text>
                </View>
            }

            <FacultyMatchModal
                visible={showClassMatchModal}
                onClose={() => {
                    setShowClassMatchModal(false);
                    fetchNotifications(false);
                }}
                onAccepted={(count) => {
                    setShowClassMatchModal(false);
                    fetchNotifications(false);
                    Alert.alert(
                        'Class Match Accepted',
                        `You joined ${count} class${count !== 1 ? 'es' : ''}.`
                    );
                }}
            />
        </GestureHandlerRootView>
    );
};

export default NotificationScreen;