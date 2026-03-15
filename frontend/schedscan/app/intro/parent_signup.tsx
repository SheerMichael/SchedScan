import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from "expo-router";
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from "expo-image-picker";
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

type Step = 'code' | 'register';

const ChevronRightIcon = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
);

const ParentSignupScreen = () => {
    const [step, setStep] = useState<Step>('code');
    const [inviteCode, setInviteCode] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [childName, setChildName] = useState('');

    // Registration form
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [isRegistering, setIsRegistering] = useState(false);

    const { register, login } = useAuth();

    const validateCode = async () => {
        if (!inviteCode.trim() || inviteCode.length < 10) {
            Alert.alert('Error', 'Please enter a valid 10-character invite code');
            return;
        }

        try {
            setIsValidating(true);
            // Validate the code without using it
            const response = await api.get(`/auth/invite-code/validate/?code=${inviteCode.trim()}`);

            if (response.data.valid) {
                setChildName(response.data.student_name || 'your child');
                setStep('register');
            } else {
                Alert.alert('Invalid Code', 'This invite code is not valid or has already been used.');
            }
        } catch (error: any) {
            const message = error.response?.data?.error || 'Invalid invite code. Please check and try again.';
            Alert.alert('Invalid Code', message);
        } finally {
            setIsValidating(false);
        }
    };

    const handleRegister = async () => {
        // Validation
        if (!firstName.trim() || !lastName.trim()) {
            Alert.alert('Error', 'Please enter your name');
            return;
        }
        if (!email.trim()) {
            Alert.alert('Error', 'Please enter your email');
            return;
        }
        if (!password || password.length < 8) {
            Alert.alert('Error', 'Password must be at least 8 characters');
            return;
        }
        if (password !== confirmPassword) {
            Alert.alert('Error', 'Passwords do not match');
            return;
        }

        try {
            setIsRegistering(true);

            // Register as parent
            await register({
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                email: email.trim().toLowerCase(),
                password,
                user_type: 'parent',
                profile_picture: image ? {
                    uri: image,
                    type: 'image/jpeg',
                    name: 'profile.jpg'
                } : undefined
            });

            // Use the invite code to link accounts
            await api.post('/auth/invite-code/use/', { code: inviteCode.trim() });

            Alert.alert(
                'Welcome!',
                `You're now linked to ${childName}'s schedule!`,
                [{ text: 'OK', onPress: () => router.replace('/Parent/home') }]
            );
        } catch (error: any) {
            let errorMessage = 'Registration failed. Please try again.';
            if (error.response?.data) {
                const data = error.response.data;
                errorMessage = data.email?.[0] || data.password?.[0] || data.error || errorMessage;
            }
            Alert.alert('Registration Failed', errorMessage);
        } finally {
            setIsRegistering(false);
        }
    };

    const pickImage = async () => {
        Alert.alert("Select Image Source", "Choose an option", [
            {
                text: "Camera",
                onPress: async () => {
                    const { status } = await ImagePicker.requestCameraPermissionsAsync();
                    if (status !== "granted") return alert("Camera permission required!");
                    const result = await ImagePicker.launchCameraAsync({
                        mediaTypes: ['images'],
                        allowsEditing: true,
                        aspect: [1, 1],
                        quality: 0.8,
                    });
                    if (!result.canceled) setImage(result.assets[0].uri);
                }
            },
            {
                text: "Gallery",
                onPress: async () => {
                    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (status !== "granted") return alert("Gallery permission required!");
                    const result = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ['images'],
                        allowsEditing: true,
                        aspect: [1, 1],
                        quality: 0.8,
                    });
                    if (!result.canceled) setImage(result.assets[0].uri);
                }
            },
            { text: "Cancel", style: "cancel" }
        ]);
    };

    // Step 1: Enter Invite Code
    if (step === 'code') {
        return (
            <SafeAreaView className="flex-1 bg-white px-6">
                <TouchableOpacity onPress={() => router.back()} className="mb-5 mt-4 w-8">
                    <ChevronRightIcon size={30} color="#000000" />
                </TouchableOpacity>

                <View className="flex-1 justify-center -mt-20">
                    <Text className="text-4xl mb-2">👪</Text>
                    <Text className="text-3xl font-bold text-primary-900 mb-2">Parent Access</Text>
                    <Text className="text-gray-600 mb-8">
                        Enter the invite code your child shared with you to view their schedule.
                    </Text>

                    <Text className="text-sm font-semibold text-gray-700 mb-2">Invite Code</Text>
                    <TextInput
                        className="border border-gray-300 rounded-xl px-4 py-4 mb-6 text-xl font-bold text-center tracking-widest"
                        placeholder="ABC123XYZ0"
                        placeholderTextColor="#9CA3AF"
                        value={inviteCode}
                        onChangeText={(text) => setInviteCode(text.toUpperCase())}
                        autoCapitalize="characters"
                        maxLength={10}
                    />

                    <TouchableOpacity
                        className={`bg-primary-600 rounded-xl py-4 ${isValidating ? 'opacity-50' : ''}`}
                        onPress={validateCode}
                        disabled={isValidating}
                    >
                        {isValidating ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text className="text-white font-bold text-center text-lg">Continue</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        className="mt-6"
                        onPress={() => router.push('/intro/login')}
                    >
                        <Text className="text-center text-gray-500">
                            Already have an account? <Text className="text-primary-600 font-semibold">Log in</Text>
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // Step 2: Register
    return (
        <SafeAreaView className="flex-1 bg-white">
            <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
                <TouchableOpacity onPress={() => setStep('code')} className="mb-5 mt-4 w-8">
                    <ChevronRightIcon size={30} color="#000000" />
                </TouchableOpacity>

                <View className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
                    <Text className="text-green-800 font-medium">
                        ✓ Valid code! You'll be linked to <Text className="font-bold">{childName}</Text>
                    </Text>
                </View>

                <Text className="text-2xl font-bold text-primary-900 mb-2">Create Your Account</Text>
                <Text className="text-gray-600 mb-6">Complete registration to view your child's schedule.</Text>

                {/* Profile Photo */}
                <View className="items-center mb-6">
                    <TouchableOpacity onPress={pickImage}>
                        <Image
                            source={image ? { uri: image } : require("../../assets/images/PlaceholderImage.png")}
                            style={{ width: 100, height: 100, borderRadius: 50 }}
                        />
                        <View className="absolute bottom-0 right-0 bg-primary-600 rounded-full p-2">
                            <Text className="text-white text-xs">📷</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Name Row */}
                <View className="flex-row gap-3 mb-4">
                    <View className="flex-1">
                        <Text className="text-sm font-semibold text-gray-700 mb-1">First Name</Text>
                        <TextInput
                            className="border border-gray-300 rounded-lg px-4 py-3"
                            placeholder="First name"
                            placeholderTextColor="#9CA3AF"
                            value={firstName}
                            onChangeText={setFirstName}
                        />
                    </View>
                    <View className="flex-1">
                        <Text className="text-sm font-semibold text-gray-700 mb-1">Last Name</Text>
                        <TextInput
                            className="border border-gray-300 rounded-lg px-4 py-3"
                            placeholder="Last name"
                            placeholderTextColor="#9CA3AF"
                            value={lastName}
                            onChangeText={setLastName}
                        />
                    </View>
                </View>

                {/* Email */}
                <Text className="text-sm font-semibold text-gray-700 mb-1">Email</Text>
                <TextInput
                    className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
                    placeholder="your.email@example.com"
                    placeholderTextColor="#9CA3AF"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />

                {/* Password */}
                <Text className="text-sm font-semibold text-gray-700 mb-1">Password</Text>
                <TextInput
                    className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
                    placeholder="Min. 8 characters"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                {/* Confirm Password */}
                <Text className="text-sm font-semibold text-gray-700 mb-1">Confirm Password</Text>
                <TextInput
                    className="border border-gray-300 rounded-lg px-4 py-3 mb-6"
                    placeholder="Confirm password"
                    placeholderTextColor="#9CA3AF"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                />

                {/* Register Button */}
                <TouchableOpacity
                    className={`bg-primary-600 rounded-xl py-4 mb-10 ${isRegistering ? 'opacity-50' : ''}`}
                    onPress={handleRegister}
                    disabled={isRegistering}
                >
                    {isRegistering ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text className="text-white font-bold text-center text-lg">Create Account & Link</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
};

export default ParentSignupScreen;
