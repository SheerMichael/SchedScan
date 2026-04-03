import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';

const ChevronRightIcon = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
);

const ParentSignupScreen = () => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [isRegistering, setIsRegistering] = useState(false);

    const { register } = useAuth();

    const handleRegister = async () => {
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

            await register({
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                email: email.trim().toLowerCase(),
                password,
                user_type: 'parent',
                profile_picture: image
                    ? {
                        uri: image,
                        type: 'image/jpeg',
                        name: 'profile.jpg',
                    }
                    : undefined,
            });

            Alert.alert(
                'Account Created',
                'Your parent account is ready. Search for your child in the app and send a connection request for approval.',
                [{ text: 'Continue', onPress: () => router.replace('/Parent/home') }]
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
        Alert.alert('Select Image Source', 'Choose an option', [
            {
                text: 'Camera',
                onPress: async () => {
                    const { status } = await ImagePicker.requestCameraPermissionsAsync();
                    if (status !== 'granted') {
                        alert('Camera permission required');
                        return;
                    }
                    const result = await ImagePicker.launchCameraAsync({
                        mediaTypes: ['images'],
                        allowsEditing: true,
                        aspect: [1, 1],
                        quality: 0.8,
                    });
                    if (!result.canceled) {
                        setImage(result.assets[0].uri);
                    }
                },
            },
            {
                text: 'Gallery',
                onPress: async () => {
                    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (status !== 'granted') {
                        alert('Gallery permission required');
                        return;
                    }
                    const result = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ['images'],
                        allowsEditing: true,
                        aspect: [1, 1],
                        quality: 0.8,
                    });
                    if (!result.canceled) {
                        setImage(result.assets[0].uri);
                    }
                },
            },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    return (
        <SafeAreaView className="flex-1 bg-white">
            <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
                <TouchableOpacity onPress={() => router.back()} className="mb-5 mt-4 w-8">
                    <ChevronRightIcon size={30} color="#000000" />
                </TouchableOpacity>

                <Text className="text-2xl font-bold text-primary-900 mb-2">Create Parent Account</Text>
                <Text className="text-gray-600 mb-6">
                    After registration, search for your child and send a connection request. Your child must approve before access is granted.
                </Text>

                <View className="items-center mb-6">
                    <TouchableOpacity onPress={pickImage}>
                        <Image
                            source={image ? { uri: image } : require('../../assets/images/PlaceholderImage.png')}
                            style={{ width: 100, height: 100, borderRadius: 50 }}
                        />
                        <View className="absolute bottom-0 right-0 bg-primary-600 rounded-full p-2">
                            <Text className="text-white text-[10px] font-semibold">Edit</Text>
                        </View>
                    </TouchableOpacity>
                </View>

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

                <Text className="text-sm font-semibold text-gray-700 mb-1">Password</Text>
                <TextInput
                    className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
                    placeholder="Min. 8 characters"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <Text className="text-sm font-semibold text-gray-700 mb-1">Confirm Password</Text>
                <TextInput
                    className="border border-gray-300 rounded-lg px-4 py-3 mb-6"
                    placeholder="Confirm password"
                    placeholderTextColor="#9CA3AF"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                />

                <TouchableOpacity
                    className={`bg-primary-600 rounded-xl py-4 mb-10 ${isRegistering ? 'opacity-50' : ''}`}
                    onPress={handleRegister}
                    disabled={isRegistering}
                >
                    {isRegistering ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text className="text-white font-bold text-center text-lg">Create Account</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
};

export default ParentSignupScreen;
