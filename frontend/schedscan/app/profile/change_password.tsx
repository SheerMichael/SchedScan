import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SendHorizonal, ArrowLeft } from 'lucide-react-native';
import api from '@/services/api';

export default function ChangePasswordScreen() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const validateInputs = (): boolean => {
        setError('');

        if (!currentPassword.trim()) {
            setError('Current password is required');
            return false;
        }

        if (!newPassword.trim()) {
            setError('New password is required');
            return false;
        }

        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters long');
            return false;
        }

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match');
            return false;
        }

        if (currentPassword === newPassword) {
            setError('New password must be different from current password');
            return false;
        }

        return true;
    };

    const handleChangePassword = async () => {
        if (!validateInputs()) return;

        setIsLoading(true);
        setError('');

        try {
            await api.post('/auth/change-password/', {
                current_password: currentPassword,
                new_password: newPassword,
            });

            Alert.alert(
                'Success',
                'Your password has been changed successfully.',
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } catch (err: any) {
            const errorMessage = err.response?.data?.error || 'Failed to change password. Please try again.';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
    <>
        <View className="flex-1 bg-white mx-4 mt-5 rounded-xl p-5">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-8">
            <TouchableOpacity onPress={() => router.back()} className="w-4" disabled={isLoading}>
                <ArrowLeft size={25} color="#000000" />
            </TouchableOpacity>
            
            <Text className="text-xl font-semibold text-gray-900">
            Change Password
            </Text>
            
            <TouchableOpacity 
                className="p-2" 
                onPress={() => handleChangePassword()}
                disabled={isLoading}
            >
                {isLoading ? (
                    <ActivityIndicator size="small" color="#000000" />
                ) : (
                    <SendHorizonal size={25} color="#000000"/>
                )}
            </TouchableOpacity>
        </View>

        {/* Error Message */}
        {error ? (
            <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                <Text className="text-red-600 text-sm">{error}</Text>
            </View>
        ) : null}

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
                editable={!isLoading}
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
                editable={!isLoading}
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
                editable={!isLoading}
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