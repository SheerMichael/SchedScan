import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SendHorizonal, ArrowLeft } from 'lucide-react-native';

export default function ChangePasswordScreen() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleChangePassword = () => {
        // Add your change password logic here
        console.log('Changed Password');
        router.back();
    };

    return (
    <>
        <View className="flex-1 bg-white mx-4 mt-5 rounded-xl p-5">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-8">
            <TouchableOpacity onPress={() => router.back()} className="w-4">
                <ArrowLeft size={25} color="#000000" />
            </TouchableOpacity>
            
            <Text className="text-xl font-semibold text-gray-900">
            Change Password
            </Text>
            
            <TouchableOpacity className="p-2" onPress={() => handleChangePassword()}>
                <SendHorizonal size={25} color="#000000"/>
            </TouchableOpacity>
        </View>

        {/* Input Fields */}
        <View className="gap-4">
            {/* Current Password */}
            <View>
            <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-600"
                placeholder="Add Current Password"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
            />
            </View>

            {/* New Password */}
            <View>
            <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-600"
                placeholder="New Password"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
            />
            </View>

            {/* Confirm New Password */}
            <View>
            <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-600"
                placeholder="Confirm New Password"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
            />
            </View>

            {/* Helper Text */}
            <Text className="text-sm text-gray-400 leading-relaxed">
            Your password must be at least 8 characters long. Avoid common words or patterns.
            </Text>
        </View>

        {/* Decorative Circle */}
        <View className="absolute -bottom-15 -right-15 w-50 h-50 rounded-full bg-green-200 opacity-50" />
        </View>
    </>
    );
}