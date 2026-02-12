import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from "expo-router";
import Svg, { Path } from 'react-native-svg';
import { Eye, EyeOff } from "lucide-react-native";
import { authService } from '../../services/authService';

type Step = 'email' | 'code' | 'password' | 'success';

const ForgotPasswordScreen = () => {
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [resetToken, setResetToken] = useState('');
    const [resendCountdown, setResendCountdown] = useState(0);

    // Refs for code inputs
    const codeInputRefs = useRef<(TextInput | null)[]>([]);

    // Countdown timer for resend
    useEffect(() => {
        if (resendCountdown > 0) {
            const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCountdown]);

    const ChevronLeftIcon = ({ size = 24, color = '#000000' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <Path d="M19 12H6M12 5l-7 7 7 7" />
        </Svg>
    );

    const handleRequestCode = async () => {
        if (!email) {
            Alert.alert('Error', 'Please enter your email address');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            Alert.alert('Error', 'Please enter a valid email address');
            return;
        }

        try {
            setIsLoading(true);
            await authService.requestPasswordReset(email);
            setStep('code');
            setResendCountdown(60);
        } catch (error: any) {
            Alert.alert('Error', 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCodeChange = (text: string, index: number) => {
        const newCode = [...code];
        // Handle paste of full code
        if (text.length > 1) {
            const digits = text.replace(/\D/g, '').slice(0, 6);
            for (let i = 0; i < 6; i++) {
                newCode[i] = digits[i] || '';
            }
            setCode(newCode);
            if (digits.length === 6) {
                codeInputRefs.current[5]?.blur();
            }
            return;
        }

        newCode[index] = text;
        setCode(newCode);

        // Auto-focus next input
        if (text && index < 5) {
            codeInputRefs.current[index + 1]?.focus();
        }
    };

    const handleCodeKeyPress = (key: string, index: number) => {
        // Handle backspace to go to previous input
        if (key === 'Backspace' && !code[index] && index > 0) {
            codeInputRefs.current[index - 1]?.focus();
        }
    };

    const handleVerifyCode = async () => {
        const fullCode = code.join('');
        if (fullCode.length !== 6) {
            Alert.alert('Error', 'Please enter the complete 6-digit code');
            return;
        }

        try {
            setIsLoading(true);
            const result = await authService.verifyResetCode(email, fullCode);
            if (result.valid) {
                setResetToken(result.reset_token);
                setStep('password');
            } else {
                Alert.alert('Invalid Code', 'The code you entered is invalid or expired. Please try again.');
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || 'Invalid or expired code. Please try again.';
            Alert.alert('Verification Failed', errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!newPassword) {
            Alert.alert('Error', 'Please enter a new password');
            return;
        }

        if (newPassword.length < 8) {
            Alert.alert('Error', 'Password must be at least 8 characters long');
            return;
        }

        if (newPassword !== confirmPassword) {
            Alert.alert('Error', 'Passwords do not match');
            return;
        }

        try {
            setIsLoading(true);
            await authService.confirmPasswordReset(resetToken, newPassword);
            setStep('success');
        } catch (error: any) {
            let errorMsg = 'Failed to reset password. Please try again.';
            if (error.response?.data) {
                const data = error.response.data;
                errorMsg = data.error
                    || data.new_password?.[0]
                    || errorMsg;
            }
            Alert.alert('Reset Failed', errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendCode = async () => {
        if (resendCountdown > 0) return;

        try {
            setIsLoading(true);
            await authService.requestPasswordReset(email);
            setResendCountdown(60);
            setCode(['', '', '', '', '', '']);
            Alert.alert('Code Sent', 'A new code has been sent to your email.');
        } catch (error) {
            Alert.alert('Error', 'Failed to resend code. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const renderStepIndicator = () => {
        const steps: Step[] = ['email', 'code', 'password'];
        const currentIndex = steps.indexOf(step === 'success' ? 'password' : step);

        return (
            <View className="flex-row items-center justify-center mb-8">
                {steps.map((s, i) => (
                    <React.Fragment key={s}>
                        <View
                            className={`w-8 h-8 rounded-full items-center justify-center ${i <= currentIndex ? 'bg-primary-900' : 'bg-gray-200'
                                }`}
                        >
                            <Text className={`text-sm font-bold ${i <= currentIndex ? 'text-white' : 'text-gray-500'}`}>
                                {i + 1}
                            </Text>
                        </View>
                        {i < steps.length - 1 && (
                            <View
                                className={`w-12 h-[2px] ${i < currentIndex ? 'bg-primary-900' : 'bg-gray-200'}`}
                            />
                        )}
                    </React.Fragment>
                ))}
            </View>
        );
    };

    const renderEmailStep = () => (
        <>
            <Text className="text-2xl font-bold text-center">Forgot Password?</Text>
            <Text className="text-gray-500 text-center mt-2 mb-8 px-4">
                Enter your email address and we'll send you a code to reset your password.
            </Text>

            <Text className="text-sm font-semibold text-gray-700 mb-1">Email</Text>
            <TextInput
                placeholder="your.email@example.com"
                placeholderTextColor="#9CA3AF"
                className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-gray-800 w-full"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isLoading}
                autoFocus
            />

            <TouchableOpacity
                className={`bg-primary-900 rounded-lg py-4 mb-4 shadow-sm ${isLoading ? 'opacity-50' : ''}`}
                onPress={handleRequestCode}
                disabled={isLoading}
            >
                {isLoading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text className="text-white text-center font-semibold">Send Reset Code</Text>
                )}
            </TouchableOpacity>
        </>
    );

    const renderCodeStep = () => (
        <>
            <Text className="text-2xl font-bold text-center">Enter Code</Text>
            <Text className="text-gray-500 text-center mt-2 mb-2 px-4">
                We sent a 6-digit code to
            </Text>
            <Text className="text-primary-900 font-semibold text-center mb-8">
                {email}
            </Text>

            {/* 6-digit code inputs */}
            <View className="flex-row justify-center mb-6" style={{ gap: 8 }}>
                {code.map((digit, index) => (
                    <TextInput
                        key={index}
                        ref={(ref) => { codeInputRefs.current[index] = ref; }}
                        className="w-12 h-14 border-2 border-gray-300 rounded-lg text-center text-xl font-bold text-gray-800"
                        style={{ fontSize: 22 }}
                        maxLength={index === 0 ? 6 : 1}
                        keyboardType="number-pad"
                        value={digit}
                        onChangeText={(text) => handleCodeChange(text, index)}
                        onKeyPress={({ nativeEvent }) => handleCodeKeyPress(nativeEvent.key, index)}
                        editable={!isLoading}
                        selectTextOnFocus
                    />
                ))}
            </View>

            <TouchableOpacity
                className={`bg-primary-900 rounded-lg py-4 mb-4 shadow-sm ${isLoading ? 'opacity-50' : ''}`}
                onPress={handleVerifyCode}
                disabled={isLoading}
            >
                {isLoading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text className="text-white text-center font-semibold">Verify Code</Text>
                )}
            </TouchableOpacity>

            {/* Resend code */}
            <View className="flex-row justify-center mt-2">
                <Text className="text-gray-500">Didn't receive the code? </Text>
                {resendCountdown > 0 ? (
                    <Text className="text-gray-400">Resend in {resendCountdown}s</Text>
                ) : (
                    <TouchableOpacity onPress={handleResendCode} disabled={isLoading}>
                        <Text className="text-primary-600 font-semibold">Resend</Text>
                    </TouchableOpacity>
                )}
            </View>
        </>
    );

    const renderPasswordStep = () => (
        <>
            <Text className="text-2xl font-bold text-center">New Password</Text>
            <Text className="text-gray-500 text-center mt-2 mb-8 px-4">
                Create a new password for your account. It must be at least 8 characters.
            </Text>

            <Text className="text-sm font-semibold text-gray-700 mb-1">New Password</Text>
            <View className="relative mb-4 w-full">
                <TextInput
                    placeholder="Enter new password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPassword}
                    className="border border-gray-300 rounded-lg px-4 py-3 pr-10 text-gray-800 w-full"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    editable={!isLoading}
                />
                <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3"
                >
                    {showPassword ? <Eye size={20} color="#444" /> : <EyeOff size={20} color="#444" />}
                </TouchableOpacity>
            </View>

            <Text className="text-sm font-semibold text-gray-700 mb-1">Confirm Password</Text>
            <View className="relative mb-6 w-full">
                <TextInput
                    placeholder="Confirm new password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showConfirmPassword}
                    className="border border-gray-300 rounded-lg px-4 py-3 pr-10 text-gray-800 w-full"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    editable={!isLoading}
                />
                <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3"
                >
                    {showConfirmPassword ? <Eye size={20} color="#444" /> : <EyeOff size={20} color="#444" />}
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                className={`bg-primary-900 rounded-lg py-4 mb-4 shadow-sm ${isLoading ? 'opacity-50' : ''}`}
                onPress={handleResetPassword}
                disabled={isLoading}
            >
                {isLoading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text className="text-white text-center font-semibold">Reset Password</Text>
                )}
            </TouchableOpacity>
        </>
    );

    const renderSuccessStep = () => (
        <View className="items-center mt-10">
            {/* Checkmark circle */}
            <View className="w-20 h-20 rounded-full bg-green-100 items-center justify-center mb-6">
                <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3">
                    <Path d="M20 6L9 17l-5-5" />
                </Svg>
            </View>

            <Text className="text-2xl font-bold text-center mb-2">Password Reset!</Text>
            <Text className="text-gray-500 text-center mb-8 px-4">
                Your password has been successfully changed. You can now log in with your new password.
            </Text>

            <TouchableOpacity
                className="bg-primary-900 rounded-lg py-4 w-full shadow-sm"
                onPress={() => router.replace('/intro/login')}
            >
                <Text className="text-white text-center font-semibold">Back to Login</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView className="flex-1 bg-white">
            <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>

                {/* Top Background Circles */}
                <View className="absolute top-0 left-0 right-0 h-48 mb-44">
                    <View className="absolute w-72 h-72 bg-primary-600 rounded-full -top-14 -left-14 opacity-20" />
                    <View className="absolute w-72 h-72 bg-primary-600 rounded-full -top-14 -right-14 opacity-20" />
                    <View className="absolute w-60 h-60 bg-primary-600 rounded-full top-12 -left-28 opacity-20" />
                    <View className="absolute w-60 h-60 bg-primary-600 rounded-full top-12 -right-28 opacity-20" />
                </View>

                {/* Back Button */}
                <View className='mb-60'>
                    <TouchableOpacity
                        onPress={() => {
                            if (step === 'email' || step === 'success') {
                                router.back();
                            } else if (step === 'code') {
                                setStep('email');
                            } else if (step === 'password') {
                                // Don't allow going back from password step to code
                                // as the code is already consumed
                                router.back();
                            }
                        }}
                        className="mb-5 w-4 absolute top-12 left-2"
                    >
                        <ChevronLeftIcon size={30} />
                    </TouchableOpacity>
                </View>

                {/* Step Indicator (hidden on success) */}
                {step !== 'success' && renderStepIndicator()}

                {/* Step Content */}
                {step === 'email' && renderEmailStep()}
                {step === 'code' && renderCodeStep()}
                {step === 'password' && renderPasswordStep()}
                {step === 'success' && renderSuccessStep()}

                {/* Bottom spacing */}
                <View className="h-10" />

            </ScrollView>
        </SafeAreaView>
    );
};

export default ForgotPasswordScreen;
