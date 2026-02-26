import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, Modal, Alert, TextInput, ActivityIndicator } from 'react-native';
import { router } from "expo-router";
import Svg, { Path, Circle } from 'react-native-svg';
import { Gem, ScrollText, BellRing, CalendarDays, FileText, EyeOff, Trash2, Users, X, Copy, GraduationCap } from "lucide-react-native";
import { useAuth } from '../../context/AuthContext';
import { scheduleStorageService } from '../../services/scheduleStorageService';
import * as ExpoClipboard from 'expo-clipboard';
import api from '@/services/api';

const UserProfile = () => {

    const [modallogout, setModalLogout] = useState(false);
    const [modaldeleteaccount, setModalDeleteAccount] = useState(false);
    // PARENTAL MODAL
    const [modalParentalCode, setModalParentalCode] = useState(false);
    const { user, logout } = useAuth();
    const [premiumuser, setPremiumUser] = useState(false);

    // MOCK PARENTAL CODE
    const parentalCode = "XYZ-123-ABC";

    // Delete account states
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

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

    const is_premiumuser = () => {
        if (!premiumuser) {
            router.push('/profile/premium_pay');
        } else {
            console.log("Open Calendar Sync settings...");
        }
    }

    const handleParentalCodeAccess = () => {
        // TODO: Add premium check back later
        // For now, go directly to ShareParent screen for testing
        router.push('/Home/ShareParent');
    };

    const copyToClipboard = async () => {
        await ExpoClipboard.setStringAsync(parentalCode);
        alert("Code copied to clipboard!");
    };

    return (
        <>
            <ScrollView>
                <View className="flex-1 px-5">

                    <TouchableOpacity onPress={() => router.back()} className="mb-5 w-4">
                        <LeftPointingArrow size={30} color="#000000" />
                    </TouchableOpacity>

                    <Text className="text-3xl font-bold mb-4">Profile</Text>

                    <View className="bg-primary-700 rounded-2xl w-full h-40 items-center justify-start pl-6 flex flex-row mb-6">
                        <Image
                            source={require("../../assets/images/PlaceholderImage.png")}
                            style={{ width: 90, height: 90, borderRadius: 100, marginBottom: 20, margin: 6, marginTop: 6, }}
                        />
                        <View className="flex-1 flex-col ml-2">
                            <Text className="text-white font-bold text-3xl mb-2">
                                {user?.first_name} {user?.last_name}
                            </Text>
                            <Text className="text-white">{user?.email}</Text>
                        </View>
                    </View>

                    <Text className="text-xl mb-2">Account</Text>
                    <View className="w-full border border-gray-500/50 rounded-2xl mb-10">
                        <View>
                            <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2" onPress={() => router.push('/profile/my_plans')}>
                                <ScrollText />
                                <Text className="text-base">My plans</Text>
                            </TouchableOpacity>
                            <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2" onPress={() => router.push('/profile/premium_pay')}>
                                <Gem />
                                <Text className="text-base">Upgrade to Premium</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className={`p-4 flex-row items-center gap-2 ${user?.user_type === 'faculty' ? 'border-b border-gray-500/50' : ''}`}
                                onPress={handleParentalCodeAccess}>
                                <Users />
                                <Text className="text-base">Share with Parent</Text>
                            </TouchableOpacity>
                            {user?.user_type === 'faculty' && (
                                <TouchableOpacity
                                    className="p-4 flex-row items-center gap-2"
                                    onPress={() => router.push('/profile/faculty_dashboard')}>
                                    <GraduationCap color="#f97316" />
                                    <Text className="text-base">Faculty Dashboard</Text>
                                    <View className="bg-orange-400 rounded-full p-1 px-2 ml-auto">
                                        <Text className="text-white font-semibold text-xs">FACULTY</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                            {premiumuser && (
                                <TouchableOpacity
                                    className="p-4 flex-row items-center gap-2"
                                    onPress={() =>
                                        router.push({
                                            pathname: '../intro/signup',
                                            params: { isParent: 'true' }
                                        })}>
                                    <Users />
                                    <Text className="text-base">Create Parent Account</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    <Text className="text-xl mb-2">Settings</Text>
                    <View className="w-full border border-gray-500/50 rounded-2xl mb-4">
                        <View>
                            <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2" onPress={() => router.push('/profile/reminder_sys')}>
                                <BellRing />
                                <Text className="text-base">Reminders</Text>
                            </TouchableOpacity>
                            {/* <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2" onPress={is_premiumuser}>
                                <CalendarDays />
                                <Text className="text-base">Calendar Sync</Text>
                                <View className="bg-red-400 rounded-full p-1 px-2 ml-auto">
                                    <Text className="text-white font-semibold">PRO</Text>
                                </View>
                            </TouchableOpacity> */}
                            <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2">
                                <FileText />
                                <Text className="text-base">Privacy Policy</Text>
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