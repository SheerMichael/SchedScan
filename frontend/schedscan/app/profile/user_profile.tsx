import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal, Alert, TextInput, ActivityIndicator } from 'react-native';
import { router } from "expo-router";
import Svg, { Path } from 'react-native-svg';
import { BellRing, FileText, EyeOff, Trash2, Users, X, Copy, GraduationCap } from "lucide-react-native";
import { useAuth } from '../../context/AuthContext';
import { scheduleStorageService } from '../../services/scheduleStorageService';
import { scheduleClassReminders } from '../../services/classReminderService';
import * as ExpoClipboard from 'expo-clipboard';
import api from '@/services/api';
import { paymentService, CanAddChildResponse } from '@/services/paymentService';

const UserProfile = () => {

    const [modallogout, setModalLogout] = useState(false);
    const [modaldeleteaccount, setModalDeleteAccount] = useState(false);
    // PARENTAL MODAL
    const [modalParentalCode, setModalParentalCode] = useState(false);
    const { user, logout, refreshUser, getActiveSchedule } = useAuth();
    const [modalReminderLeadTime, setModalReminderLeadTime] = useState(false);
    const [modalUrgentPopupSettings, setModalUrgentPopupSettings] = useState(false);
    const [selectedReminderLeadTime, setSelectedReminderLeadTime] = useState<5 | 10 | 15>(15);
    const [isSavingReminderLeadTime, setIsSavingReminderLeadTime] = useState(false);
    const [urgentPopupEnabled, setUrgentPopupEnabled] = useState(true);
    const [urgentQuietEnabled, setUrgentQuietEnabled] = useState(false);
    const [urgentQuietStart, setUrgentQuietStart] = useState(22);
    const [urgentQuietEnd, setUrgentQuietEnd] = useState(7);
    const [urgentDefaultSnooze, setUrgentDefaultSnooze] = useState<5 | 10 | 15 | 30 | 60>(10);
    const [isSavingUrgentSettings, setIsSavingUrgentSettings] = useState(false);
    const [parentPaymentStatus, setParentPaymentStatus] = useState<CanAddChildResponse | null>(null);
    const [isLoadingParentPaymentStatus, setIsLoadingParentPaymentStatus] = useState(false);

    // MOCK PARENTAL CODE
    const parentalCode = "XYZ-123-ABC";

    // Delete account states
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const userPreference = user?.class_reminder_minutes_before;
        if (userPreference === 5 || userPreference === 10 || userPreference === 15) {
            setSelectedReminderLeadTime(userPreference);
        } else {
            setSelectedReminderLeadTime(15);
        }
    }, [user?.class_reminder_minutes_before]);

    useEffect(() => {
        setUrgentPopupEnabled(user?.urgent_popup_enabled !== false);
        setUrgentQuietEnabled(user?.urgent_popup_quiet_hours_enabled === true);
        setUrgentQuietStart(typeof user?.urgent_popup_quiet_hours_start === 'number' ? user.urgent_popup_quiet_hours_start : 22);
        setUrgentQuietEnd(typeof user?.urgent_popup_quiet_hours_end === 'number' ? user.urgent_popup_quiet_hours_end : 7);
        const snooze = user?.urgent_popup_default_snooze_minutes;
        if (snooze === 5 || snooze === 10 || snooze === 15 || snooze === 30 || snooze === 60) {
            setUrgentDefaultSnooze(snooze);
        } else {
            setUrgentDefaultSnooze(10);
        }
    }, [
        user?.urgent_popup_enabled,
        user?.urgent_popup_quiet_hours_enabled,
        user?.urgent_popup_quiet_hours_start,
        user?.urgent_popup_quiet_hours_end,
        user?.urgent_popup_default_snooze_minutes,
    ]);

    useEffect(() => {
        let isMounted = true;

        const loadParentPaymentStatus = async () => {
            if (user?.user_type !== 'parent') {
                setParentPaymentStatus(null);
                return;
            }

            try {
                setIsLoadingParentPaymentStatus(true);
                const status = await paymentService.checkCanAddChild();
                if (isMounted) {
                    setParentPaymentStatus(status);
                }
            } catch (error) {
                if (isMounted) {
                    setParentPaymentStatus(null);
                }
            } finally {
                if (isMounted) {
                    setIsLoadingParentPaymentStatus(false);
                }
            }
        };

        loadParentPaymentStatus();

        return () => {
            isMounted = false;
        };
    }, [user?.id, user?.user_type]);

    const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <Path d="M19 12H6M12 5l-7 7 7 7" />
        </Svg>
    );

    const handleLogout = async () => {
        setModalLogout(false);
        try {
            // Clear user-specific schedules from AsyncStorage
            if (user?.id) {
                await scheduleStorageService.clearAllSchedules(user.id);
            }

            // Logout from backend (clears tokens)
            await logout();

            // Navigate to login
            router.replace('/intro/login');
        } catch (error) {
            console.error('Logout error:', error);
            Alert.alert('Error', 'Failed to logout. Please try again.');
        }
    };

    const resetDeleteModal = () => {
        setDeletePassword('');
        setDeleteConfirmation('');
        setDeleteError('');
        setIsDeleting(false);
    };

    const handleCloseDeleteModal = () => {
        setModalDeleteAccount(false);
        resetDeleteModal();
    };

    const handleDeleteAccount = async () => {
        setDeleteError('');

        // Validate password
        if (!deletePassword.trim()) {
            setDeleteError('Please enter your password');
            return;
        }

        // Validate confirmation text
        if (deleteConfirmation !== 'DELETE') {
            setDeleteError('Please type DELETE to confirm');
            return;
        }

        setIsDeleting(true);

        try {
            await api.post('/auth/delete-account/', {
                password: deletePassword,
                confirmation: 'DELETE',
            });

            // Clear local data
            if (user?.id) {
                await scheduleStorageService.clearAllSchedules(user.id);
            }

            // Close modal
            setModalDeleteAccount(false);
            resetDeleteModal();

            // Show success and navigate to login
            Alert.alert(
                'Account Deleted',
                'Your account has been permanently deleted.',
                [{ text: 'OK', onPress: () => router.replace('/intro/login') }]
            );
        } catch (err: any) {
            const errorMessage = err.response?.data?.error || 'Failed to delete account. Please try again.';
            setDeleteError(errorMessage);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleParentalCodeAccess = () => {
        // TODO: Add premium check back later
        // For now, go directly to ShareParent screen for testing
        router.push('/Home/ShareParent');
    };

    const copyToClipboard = async () => {
        await ExpoClipboard.setStringAsync(parentalCode);
        alert("Code copied to clipboard!");
    };

    const saveReminderLeadTimePreference = async (minutes: 5 | 10 | 15) => {
        if (![5, 10, 15].includes(minutes)) {
            Alert.alert('Invalid selection', 'Please choose 5, 10, or 15 minutes.');
            return;
        }

        try {
            setIsSavingReminderLeadTime(true);

            await api.patch('/auth/user/', {
                class_reminder_minutes_before: minutes,
            });

            setSelectedReminderLeadTime(minutes);
            setModalReminderLeadTime(false);

            await refreshUser();

            try {
                const activeSchedule = await getActiveSchedule(true);
                await scheduleClassReminders(activeSchedule, minutes);
            } catch (scheduleError) {
                console.warn('Reminder preference saved, but local rescheduling failed:', scheduleError);
            }

            Alert.alert('Reminder updated', `Class reminders will now be sent ${minutes} minutes before class.`);
        } catch (error) {
            console.error('Failed to update reminder lead time:', error);
            Alert.alert('Update failed', 'Could not save reminder setting. Please try again.');
        } finally {
            setIsSavingReminderLeadTime(false);
        }
    };

    const hourLabel = (hour: number) => {
        const normalized = ((hour % 24) + 24) % 24;
        if (normalized === 0) return '12 AM';
        if (normalized < 12) return `${normalized} AM`;
        if (normalized === 12) return '12 PM';
        return `${normalized - 12} PM`;
    };

    const saveUrgentPopupSettings = async () => {
        try {
            setIsSavingUrgentSettings(true);

            await api.patch('/auth/user/', {
                urgent_popup_enabled: urgentPopupEnabled,
                urgent_popup_quiet_hours_enabled: urgentQuietEnabled,
                urgent_popup_quiet_hours_start: urgentQuietStart,
                urgent_popup_quiet_hours_end: urgentQuietEnd,
                urgent_popup_default_snooze_minutes: urgentDefaultSnooze,
            });

            setModalUrgentPopupSettings(false);
            await refreshUser();
            Alert.alert('Urgent Alert Settings Updated', 'Your urgent task popup preferences were saved.');
        } catch (error) {
            console.error('Failed to save urgent popup settings:', error);
            Alert.alert('Update failed', 'Could not save urgent popup settings. Please try again.');
        } finally {
            setIsSavingUrgentSettings(false);
        }
    };

    return (
        <>
            <ScrollView>
                <View className="flex-1 px-5">

                    <TouchableOpacity onPress={() => router.back()} className="mb-5 pt-4 w-4">
                        <LeftPointingArrow size={30} color="#000000" />
                    </TouchableOpacity>

                    <Text className="text-3xl font-bold mb-4">Profile</Text>

                    <View className="bg-primary-700 rounded-2xl w-full h-40 items-center justify-start pl-6 flex flex-row mb-6">
                        {/* <Image
                            source={require("../../assets/images/PlaceholderImage.png")}
                            style={{ width: 90, height: 90, borderRadius: 100, marginBottom: 20, margin: 6, marginTop: 6, }}
                        /> */}
                        <View className="flex-1 flex-col ml-2">
                            <Text className="text-white font-bold text-3xl mb-2">
                                {user?.first_name} {user?.last_name}
                            </Text>
                            <Text className="text-white">{user?.email}</Text>
                            <Text className="text-white/90 mt-1">
                                Student Number: {user?.student_number || 'Not set'}
                            </Text>
                        </View>
                    </View>

                    {user?.user_type === 'parent' && (
                        <View className="mb-6">
                            {isLoadingParentPaymentStatus ? (
                                <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                                    <Text className="text-sm font-semibold text-gray-600">Checking parent plan status...</Text>
                                </View>
                            ) : parentPaymentStatus ? (
                                (() => {
                                    const paidSlots = parentPaymentStatus.paid_slots;
                                    const pendingRequests = parentPaymentStatus.pending_requests ?? 0;
                                    const activeChildren = parentPaymentStatus.active_children;
                                    const reservedSlots = activeChildren + pendingRequests;
                                    const totalAllowed = 1 + paidSlots;
                                    const isPremium = paidSlots > 0;

                                    return (
                                        <View className={`rounded-xl border px-4 py-3 ${isPremium ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                                            <Text className={`text-sm font-semibold ${isPremium ? 'text-emerald-700' : 'text-amber-700'}`}>
                                                {isPremium ? 'Premium Parent Active' : 'Free Parent Plan'}
                                            </Text>
                                            <Text className={`mt-1 text-xs ${isPremium ? 'text-emerald-700/90' : 'text-amber-700/90'}`}>
                                                {isPremium
                                                    ? `You have unlocked ${paidSlots} paid child slot${paidSlots > 1 ? 's' : ''}.`
                                                    : 'Your first child link is included. Additional child links require a one-time payment.'}
                                            </Text>
                                            <Text className={`mt-1 text-xs ${isPremium ? 'text-emerald-700/90' : 'text-amber-700/90'}`}>
                                                Usage: {reservedSlots}/{totalAllowed} slot{totalAllowed > 1 ? 's' : ''} reserved ({activeChildren} linked, {pendingRequests} pending)
                                            </Text>
                                        </View>
                                    );
                                })()
                            ) : (
                                <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                                    <Text className="text-sm font-semibold text-gray-600">Parent plan status unavailable</Text>
                                    <Text className="mt-1 text-xs text-gray-500">Try refreshing this page in a moment.</Text>
                                </View>
                            )}
                        </View>
                    )}

                    <Text className="text-xl mb-2">Account</Text>
                    <View className="w-full border border-gray-500/50 rounded-2xl mb-10">
                        <View>
                            {/* <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2" onPress={() => router.push('/profile/my_plans')}>
                                <ScrollText />
                                <Text className="text-base">My plans</Text>
                            </TouchableOpacity>
                            <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2" onPress={() => router.push('/profile/premium_pay')}>
                                <Gem />
                                <Text className="text-base">Upgrade to Premium</Text>
                            </TouchableOpacity> */}
                            <TouchableOpacity
                                className={`p-4 flex-row items-center gap-2 ${user?.user_type === 'faculty' ? 'border-b border-gray-500/50' : ''}`}
                                onPress={handleParentalCodeAccess}>
                                <Users />
                                <Text className="text-base">Share with Parent</Text>
                            </TouchableOpacity>
                            {user?.user_type === 'faculty' && (
                                <View>
                                    <TouchableOpacity
                                        className="p-4 flex-row items-center gap-2"
                                        onPress={() => router.push('/profile/faculty_dashboard')}>
                                        <GraduationCap color="#f97316" />
                                        <Text className="text-base">Faculty Dashboard</Text>
                                        <View className="bg-orange-400 rounded-full p-1 px-2 ml-auto">
                                            <Text className="text-white font-semibold text-xs">FACULTY</Text>
                                        </View>
                                    </TouchableOpacity>

                                    <View className="px-4 pb-4">
                                        <View className={`rounded-lg px-3 py-2 ${user?.is_verified ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                                            <Text className={`text-xs font-semibold ${user?.is_verified ? 'text-emerald-700' : 'text-amber-700'}`}>
                                                {user?.is_verified
                                                    ? 'Faculty Account Verified'
                                                    : 'Faculty Account Pending Verification (admin approval required for faculty dashboard tools)'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            )}
                        </View>
                    </View>

                    <Text className="text-xl mb-2">Settings</Text>
                    <View className="w-full border border-gray-500/50 rounded-2xl mb-4">
                        <View>
                            <TouchableOpacity
                                className="p-4 border-b border-gray-500/50 flex-row items-center justify-between"
                                onPress={() => setModalReminderLeadTime(true)}
                            >
                                <View className="flex-row items-center gap-2">
                                    <BellRing />
                                    <Text className="text-base">Class Reminder Timing</Text>
                                </View>
                                <Text className="text-sm text-gray-500">{selectedReminderLeadTime} mins before</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className="p-4 border-b border-gray-500/50 flex-row items-center justify-between"
                                onPress={() => setModalUrgentPopupSettings(true)}
                            >
                                <View className="flex-row items-center gap-2">
                                    <BellRing />
                                    <Text className="text-base">Urgent Task Alerts</Text>
                                </View>
                                <Text className="text-sm text-gray-500">{urgentPopupEnabled ? 'On' : 'Off'}</Text>
                            </TouchableOpacity>
                            {/* <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2" onPress={is_premiumuser}>
                                <CalendarDays />
                                <Text className="text-base">Calendar Sync</Text>
                                <View className="bg-red-400 rounded-full p-1 px-2 ml-auto">
                                    <Text className="text-white font-semibold">PRO</Text>
                                </View>
                            </TouchableOpacity> */}
                            <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2" onPress={() => router.push('/profile/policy')}>
                                <FileText />
                                <Text className="text-base">Privacy Policy, Terms of Service & Fair Use</Text>
                            </TouchableOpacity>
                            <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2" onPress={() => router.push('/profile/change_password')}>
                                <EyeOff />
                                <Text className="text-base">Change Password</Text>
                            </TouchableOpacity>
                            <TouchableOpacity className="p-4 flex-row items-center gap-2" onPress={() => setModalDeleteAccount(true)}>
                                <Trash2 />
                                <Text className="text-base">Delete Account</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View className="flex-1 justify-start items-start">
                        <TouchableOpacity
                            className="bg-primary-500 px-12 py-3 rounded-2xl"
                            onPress={() => setModalLogout(true)}>
                            <Text className="text-white text-base font-semibold">
                                Log Out
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <Modal
                        animationType="fade"
                        transparent={true}
                        visible={modalParentalCode}
                        onRequestClose={() => setModalParentalCode(false)}>

                        <View className="flex-1 bg-black/50 justify-center items-center">
                            <View className="bg-white rounded-xl p-6 w-4/5 max-w-sm shadow-lg relative">

                                <View className="flex-row justify-between items-center mb-4">
                                    <Text className="text-xl font-bold text-gray-800">Parental Link Code</Text>
                                    <TouchableOpacity onPress={() => setModalParentalCode(false)}>
                                        <X color="#4b5563" size={24} />
                                    </TouchableOpacity>
                                </View>

                                <Text className="text-gray-500 text-center mb-6">
                                    Share this code with a parent account to link profiles.
                                </Text>

                                <View className="bg-gray-100 rounded-lg p-4 mb-6 flex-row justify-between items-center border border-gray-300 border-dashed">
                                    <Text className="text-2xl font-bold text-primary-700 tracking-widest text-center flex-1">
                                        {parentalCode}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    className="bg-primary-500 py-3 rounded-lg flex-row justify-center items-center gap-2"
                                    onPress={copyToClipboard}
                                >
                                    <Copy color="white" size={20} />
                                    <Text className="text-white font-semibold text-base">Copy Code</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Modal>

                    <Modal
                        animationType="fade"
                        transparent={true}
                        visible={modaldeleteaccount}
                        onRequestClose={handleCloseDeleteModal}>

                        <View className="flex-1 bg-black/50 justify-center items-center">
                            <View className="bg-white rounded-xl p-6 w-4/5 max-w-sm shadow-lg">
                                <Text className="text-lg font-bold text-center mb-2 text-red-600">
                                    Delete Account
                                </Text>
                                <Text className="text-sm text-center mb-4 text-gray-600">
                                    This action is permanent and cannot be undone. All your data will be deleted.
                                </Text>

                                {/* Error Message */}
                                {deleteError ? (
                                    <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                                        <Text className="text-red-600 text-sm text-center">{deleteError}</Text>
                                    </View>
                                ) : null}

                                {/* Password Input */}
                                <TextInput
                                    className="border border-gray-300 rounded-lg px-4 py-3 mb-3 text-sm"
                                    placeholder="Enter your password"
                                    placeholderTextColor="#9ca3af"
                                    secureTextEntry
                                    value={deletePassword}
                                    onChangeText={setDeletePassword}
                                    editable={!isDeleting}
                                />

                                {/* Confirmation Input */}
                                <TextInput
                                    className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-sm"
                                    placeholder="Type DELETE to confirm"
                                    placeholderTextColor="#9ca3af"
                                    value={deleteConfirmation}
                                    onChangeText={setDeleteConfirmation}
                                    autoCapitalize="characters"
                                    editable={!isDeleting}
                                />

                                <View className="flex-row gap-3">
                                    <TouchableOpacity
                                        className="flex-1 bg-gray-400 py-3 rounded-lg items-center"
                                        onPress={handleCloseDeleteModal}
                                        disabled={isDeleting}
                                    >
                                        <Text className="text-white text-base font-semibold">
                                            Cancel
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        className="flex-1 bg-red-600 py-3 rounded-lg items-center"
                                        onPress={handleDeleteAccount}
                                        disabled={isDeleting}
                                    >
                                        {isDeleting ? (
                                            <ActivityIndicator color="#ffffff" size="small" />
                                        ) : (
                                            <Text className="text-white text-base font-semibold">
                                                Delete
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>

                    <Modal
                        animationType="fade"
                        transparent={true}
                        visible={modallogout}
                        onRequestClose={() => setModalLogout(false)}>
                        {/* Overlay */}
                        <View className="flex-1 bg-black/50 justify-center items-center">
                            {/* Modal Content */}
                            <View className="bg-white rounded-xl p-6 w-4/5 max-w-sm shadow-lg">
                                <Text className="text-base text-center mb-6 text-gray-800 leading-6">
                                    Are you sure you want to log out?
                                </Text>

                                {/* Button Container */}
                                <View className="flex-row gap-3">
                                    <TouchableOpacity
                                        className="flex-1 bg-gray-400 py-3 rounded-lg items-center"
                                        onPress={() => setModalLogout(false)}
                                    >
                                        <Text className="text-white text-base font-semibold">
                                            No
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        className="flex-1 bg-red-600 py-3 rounded-lg items-center"
                                        onPress={handleLogout}
                                    >
                                        <Text className="text-white text-base font-semibold">
                                            Yes
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>

                    <Modal
                        animationType="fade"
                        transparent={true}
                        visible={modalReminderLeadTime}
                        onRequestClose={() => setModalReminderLeadTime(false)}>
                        <View className="flex-1 bg-black/50 justify-center items-center">
                            <View className="bg-white rounded-xl p-6 w-4/5 max-w-sm shadow-lg">
                                <View className="mb-4 flex-row justify-between items-center">
                                    <Text className="text-lg font-semibold text-gray-900">Class Reminder Timing</Text>
                                    <TouchableOpacity onPress={() => setModalReminderLeadTime(false)} disabled={isSavingReminderLeadTime}>
                                        <X size={24} color="black" strokeWidth={2} />
                                    </TouchableOpacity>
                                </View>

                                <Text className="text-sm text-gray-600 mb-4">
                                    Choose how early you want reminders before each class starts.
                                </Text>

                                {[5, 10, 15].map((minutes) => {
                                    const option = minutes as 5 | 10 | 15;
                                    const isSelected = selectedReminderLeadTime === option;
                                    return (
                                        <TouchableOpacity
                                            key={minutes}
                                            className="flex-row items-center justify-between py-3"
                                            disabled={isSavingReminderLeadTime}
                                            onPress={() => saveReminderLeadTimePreference(option)}
                                        >
                                            <Text className="text-base text-gray-900">{minutes} minutes before</Text>
                                            <View className="w-5 h-5 rounded-full border-2 border-gray-400 items-center justify-center">
                                                {isSelected && <View className="w-3 h-3 rounded-full bg-black" />}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}

                                {isSavingReminderLeadTime && (
                                    <View className="pt-2">
                                        <ActivityIndicator color="#CB2222" />
                                    </View>
                                )}
                            </View>
                        </View>
                    </Modal>

                    <Modal
                        animationType="fade"
                        transparent={true}
                        visible={modalUrgentPopupSettings}
                        onRequestClose={() => setModalUrgentPopupSettings(false)}>
                        <View className="flex-1 bg-black/50 justify-center items-center">
                            <View className="bg-white rounded-xl p-6 w-4/5 max-w-sm shadow-lg">
                                <View className="mb-4 flex-row justify-between items-center">
                                    <Text className="text-lg font-semibold text-gray-900">Urgent Task Alerts</Text>
                                    <TouchableOpacity onPress={() => setModalUrgentPopupSettings(false)} disabled={isSavingUrgentSettings}>
                                        <X size={24} color="black" strokeWidth={2} />
                                    </TouchableOpacity>
                                </View>

                                <View className="mb-4">
                                    <Text className="text-sm text-gray-600 mb-2">Invasive popup alerts</Text>
                                    <View className="flex-row">
                                        {[true, false].map((value) => (
                                            <TouchableOpacity
                                                key={String(value)}
                                                onPress={() => setUrgentPopupEnabled(value)}
                                                disabled={isSavingUrgentSettings}
                                                className={`mr-2 px-3 py-2 rounded-lg border ${urgentPopupEnabled === value ? 'bg-black border-black' : 'bg-white border-gray-300'}`}
                                            >
                                                <Text className={`${urgentPopupEnabled === value ? 'text-white' : 'text-gray-700'} font-semibold text-sm`}>
                                                    {value ? 'Enabled' : 'Disabled'}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                <View className="mb-4">
                                    <Text className="text-sm text-gray-600 mb-2">Quiet hours</Text>
                                    <View className="flex-row mb-2">
                                        {[true, false].map((value) => (
                                            <TouchableOpacity
                                                key={`quiet-${String(value)}`}
                                                onPress={() => setUrgentQuietEnabled(value)}
                                                disabled={isSavingUrgentSettings}
                                                className={`mr-2 px-3 py-2 rounded-lg border ${urgentQuietEnabled === value ? 'bg-black border-black' : 'bg-white border-gray-300'}`}
                                            >
                                                <Text className={`${urgentQuietEnabled === value ? 'text-white' : 'text-gray-700'} font-semibold text-sm`}>
                                                    {value ? 'On' : 'Off'}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {urgentQuietEnabled && (
                                        <>
                                            <Text className="text-xs text-gray-500 mb-1">Start hour</Text>
                                            <View className="flex-row flex-wrap mb-2">
                                                {[20, 21, 22, 23, 0].map((hour) => (
                                                    <TouchableOpacity
                                                        key={`start-${hour}`}
                                                        onPress={() => setUrgentQuietStart(hour)}
                                                        disabled={isSavingUrgentSettings}
                                                        className={`mr-2 mb-2 px-2 py-1.5 rounded-md border ${urgentQuietStart === hour ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-300'}`}
                                                    >
                                                        <Text className={`${urgentQuietStart === hour ? 'text-white' : 'text-gray-700'} text-xs font-semibold`}>
                                                            {hourLabel(hour)}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>

                                            <Text className="text-xs text-gray-500 mb-1">End hour</Text>
                                            <View className="flex-row flex-wrap">
                                                {[5, 6, 7, 8, 9].map((hour) => (
                                                    <TouchableOpacity
                                                        key={`end-${hour}`}
                                                        onPress={() => setUrgentQuietEnd(hour)}
                                                        disabled={isSavingUrgentSettings}
                                                        className={`mr-2 mb-2 px-2 py-1.5 rounded-md border ${urgentQuietEnd === hour ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-300'}`}
                                                    >
                                                        <Text className={`${urgentQuietEnd === hour ? 'text-white' : 'text-gray-700'} text-xs font-semibold`}>
                                                            {hourLabel(hour)}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </>
                                    )}
                                </View>

                                <View className="mb-4">
                                    <Text className="text-sm text-gray-600 mb-2">Default snooze</Text>
                                    <View className="flex-row flex-wrap">
                                        {[5, 10, 15, 30, 60].map((minutes) => {
                                            const option = minutes as 5 | 10 | 15 | 30 | 60;
                                            const selected = urgentDefaultSnooze === option;
                                            return (
                                                <TouchableOpacity
                                                    key={`snooze-${minutes}`}
                                                    onPress={() => setUrgentDefaultSnooze(option)}
                                                    disabled={isSavingUrgentSettings}
                                                    className={`mr-2 mb-2 px-3 py-2 rounded-lg border ${selected ? 'bg-black border-black' : 'bg-white border-gray-300'}`}
                                                >
                                                    <Text className={`${selected ? 'text-white' : 'text-gray-700'} text-sm font-semibold`}>
                                                        {minutes}m
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>

                                <TouchableOpacity
                                    onPress={saveUrgentPopupSettings}
                                    disabled={isSavingUrgentSettings}
                                    className={`py-3 rounded-lg items-center ${isSavingUrgentSettings ? 'bg-gray-300' : 'bg-primary-500'}`}
                                >
                                    {isSavingUrgentSettings ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Text className="text-white font-semibold text-base">Save Settings</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Modal>
                </View>
            </ScrollView>
            <View className="absolute w-56 h-56 rounded-full bg-[#DBE5CF] -z-10"
                style={{
                    bottom: -75,
                    right: -50
                }} />
            <View className="absolute w-24 h-24 top-20 right-[-20] rounded-full bg-[#FDE8C8] -z-10" />
        </>
    );
};

export default UserProfile;