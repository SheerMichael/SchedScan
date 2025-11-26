import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, Modal, Alert } from 'react-native';
import { router } from "expo-router";
import Svg, { Path, Circle } from 'react-native-svg';
import { Gem, ScrollText, BellRing, CalendarDays, FileText, EyeOff, Trash2 } from "lucide-react-native";
import { useAuth } from '../../context/AuthContext';
import { scheduleStorageService } from '../../services/scheduleStorageService';

const UserProfile = () => {
    const [modallogout, setModalLogout] = useState(false);
    const [modaldeleteaccount, setModalDeleteAccount] = useState(false);
    const { user, logout } = useAuth();

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

    const handleDeleteAccount = () => {
        setModalDeleteAccount(false);
        // Add your delete account logic here
        console.log('Another page to delete account or another modal for it');
    }

    return (
        <>
            <View className="flex-1 p-5">

                <TouchableOpacity onPress={() => router.back()} className="mb-5 w-4">
                    <LeftPointingArrow size={30} color="#000000" />
                </TouchableOpacity>

                <Text className="text-3xl font-bold mb-4">Profile</Text>

                <View className="bg-primary-700 rounded-2xl w-full h-40 items-center justify-start pl-6 flex flex-row mb-6">
                    <Image
                    source={require("../../assets/images/PlaceholderImage.png")}
                    style={{ width: 90, height: 90, borderRadius: 100, marginBottom: 20, margin: 6, marginTop: 6,}}
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
                        <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2" onPress={() => router.push('./profile/my_plans')}>
                            <ScrollText/>
                            <Text className="text-base">My plans</Text>
                        </TouchableOpacity>
                        <TouchableOpacity className="p-4 flex-row items-center gap-2"  onPress={() => router.push('./profile/premium_pay')}>
                            <Gem/>
                            <Text className="text-base">Upgrade to Premium</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <Text className="text-xl mb-2">Settings</Text>
                <View className="w-full border border-gray-500/50 rounded-2xl mb-4">
                    <View>
                        <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2">
                            <BellRing/>
                            <Text className="text-base">Reminders</Text>
                        </TouchableOpacity>
                        <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2">
                            <CalendarDays/>
                            <Text className="text-base">Calendar Sync</Text>
                        </TouchableOpacity>
                        <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2">
                            <FileText/>
                            <Text className="text-base">Privacy Policy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity className="p-4 border-b border-gray-500/50 flex-row items-center gap-2" onPress={() => router.push('/profile/change_password')}>
                            <EyeOff/>
                            <Text className="text-base">Change Password</Text>
                        </TouchableOpacity>
                        <TouchableOpacity className="p-4 flex-row items-center gap-2" onPress={() => setModalDeleteAccount(true)}>
                            <Trash2/>
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
                        visible={modaldeleteaccount}
                        onRequestClose={() => setModalDeleteAccount(false)}>

                        <View className="flex-1 bg-black/50 justify-center items-center">
                            <View className="bg-white rounded-xl p-6 w-4/5 max-w-sm shadow-lg">
                                <Text className="text-base text-center mb-6 text-gray-800 m-4">
                                    Are you sure you want to delete your account?
                                </Text>

                                <View className="flex-row gap-3">
                                    <TouchableOpacity
                                        className="flex-1 bg-gray-400 py-3 rounded-lg items-center"
                                        onPress={() => setModalDeleteAccount(false)}
                                    >
                                        <Text className="text-white text-base font-semibold">
                                        No
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        className="flex-1 bg-red-600 py-3 rounded-lg items-center"
                                        onPress={handleDeleteAccount}
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
            <View className="absolute w-56 h-56 rounded-full bg-[#DBE5CF] -z-10" 
            style={{ bottom: -75,
                    right: -50
                }}/>
            <View className="absolute w-24 h-24 top-20 right-[-20] rounded-full bg-[#FDE8C8] -z-10"/>
        </>
    );
};

export default UserProfile;