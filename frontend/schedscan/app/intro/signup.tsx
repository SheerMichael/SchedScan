import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from "expo-router";
import Svg, { Path } from 'react-native-svg';
import { Info, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';

const STUDENT_NUMBER_REGEX = /^\d{4}-\d{4,6}$/;

type SignUpData = {
  first_name: string;
  last_name: string;
  student_number: string;
  email: string;
  password: string;
  confirmPassword: string;
  user_type?: 'student' | 'faculty' | 'parent';  // Optional, defaults to student
};

type Step = 'signup1' | 'signup2' | 'signup3';

type SignUp1Props = {
  setScreen: (screen: Step) => void;
  formData: SignUpData;
  setFormData: React.Dispatch<React.SetStateAction<SignUpData>>;
  studentNumberError: string;
  studentNumberValid: boolean;
  onStudentNumberBlur: () => void;
};

type SignUp2Props = {
  setScreen: (screen: Step) => void;
  formData: SignUpData;
  setFormData: React.Dispatch<React.SetStateAction<SignUpData>>;
};

type SignUp3Props = {
  setScreen: (screen: Step) => void;
  formData: SignUpData;
  setFormData: React.Dispatch<React.SetStateAction<SignUpData>>;
  handleSignup: () => Promise<void>;
  isLoading: boolean;
};

const ChevronRightIcon = ({ size = 24, color = '#ffffff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <Path d="M19 12H6M12 5l-7 7 7 7" />
  </Svg>
);

const ProgressBar = ({ step }: { step: number }) => {
  const widthClass =
    step === 1 ? "w-1/3" :
      step === 2 ? "w-2/3" :
        "w-full";

  return (
    <View className="w-full h-1 bg-gray-300 rounded-full mb-4">
      <View className={`h-1 bg-red-700 rounded-full ${widthClass}`} />
    </View>
  );
};

// ✅ Screen 1 – Photo + Name + Student Number
const SignUp1Screen = ({
  setScreen,
  formData,
  setFormData,
  studentNumberError,
  studentNumberValid,
  onStudentNumberBlur,
}: SignUp1Props) => {
  const canProceed =
    formData.first_name.trim().length > 0 &&
    formData.last_name.trim().length > 0 &&
    studentNumberValid;

  return (
    <SafeAreaView className="flex-1 bg-white px-4 m-2">
      <TouchableOpacity onPress={() => router.back()} className="mb-5 w-4">
        <ChevronRightIcon size={30} color="#000000" />
      </TouchableOpacity>

      <ProgressBar step={1} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="mt-10 ml-4 mr-4">
          <Text className="text-3xl font-bold mb-1 text-primary-900">What&apos;s your name?</Text>
          <Text className="text-base font-medium mb-5 text-gray-600">Enter your details below.</Text>

          {/* Profile photo upload temporarily disabled */}
          {/*
          <View className="w-full items-center justify-center rounded-2xl border border-zinc-300 mb-6 bg-primary-200 py-5">
            <Image
              source={image ? { uri: image } : require("../../assets/images/PlaceholderImage.png")}
              style={{ width: 90, height: 90, borderRadius: 100, marginBottom: 16 }}
            />
            <TouchableOpacity onPress={pickImageOption} className="py-3 px-8 bg-blue-500 rounded-xl">
              <Text className="text-white font-bold text-center">Upload Photo</Text>
            </TouchableOpacity>
          </View>
          */}

          {/* Name row */}
          <View className="flex-row gap-3 mb-4">
            <TextInput
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-4"
              placeholder="First Name"
              placeholderTextColor="#9CA3AF"
              value={formData.first_name}
              onChangeText={(text) =>
                setFormData((prev: SignUpData) => ({ ...prev, first_name: text }))
              }
              autoCapitalize="words"
            />
            <TextInput
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-4"
              placeholder="Last Name"
              placeholderTextColor="#9CA3AF"
              value={formData.last_name}
              onChangeText={(text) =>
                setFormData((prev: SignUpData) => ({ ...prev, last_name: text }))
              }
              autoCapitalize="words"
            />
          </View>

          {/* COR Info Banner */}
          <View className="flex-row items-start bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3 gap-3">
            <Info size={18} color="#2563EB" style={{ marginTop: 1, flexShrink: 0 }} />
            <View className="flex-1">
              <Text className="text-sm font-bold text-blue-800 mb-0.5">Important — COR Verification</Text>
              <Text className="text-xs text-blue-700 leading-4">
                The student number you enter here must exactly match the number on your Certificate of Registration (COR). SchedScan uses it to verify your schedule uploads.
              </Text>
            </View>
          </View>

          {/* Student Number field */}
          <TextInput
            className={`bg-gray-50 border rounded-xl p-4 mb-1 ${
              studentNumberError
                ? 'border-red-400 bg-red-50'
                : studentNumberValid
                ? 'border-green-400 bg-green-50'
                : 'border-gray-200'
            }`}
            placeholder="Student Number (e.g., 2022-01191)"
            placeholderTextColor="#9CA3AF"
            value={formData.student_number}
            onChangeText={(text) =>
              setFormData((prev: SignUpData) => ({ ...prev, student_number: text }))
            }
            onBlur={onStudentNumberBlur}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
          />

          {/* Inline feedback */}
          {studentNumberError ? (
            <View className="flex-row items-center gap-1 mb-4">
              <AlertCircle size={13} color="#DC2626" />
              <Text className="text-xs text-red-600">{studentNumberError}</Text>
            </View>
          ) : studentNumberValid ? (
            <View className="flex-row items-center gap-1 mb-4">
              <CheckCircle2 size={13} color="#16A34A" />
              <Text className="text-xs text-green-600">Looks good!</Text>
            </View>
          ) : (
            <Text className="text-[10px] text-gray-400 mb-4">Format: YYYY-NNNNN (e.g., 2022-01191)</Text>
          )}

          {/* Next button — gated */}
          <TouchableOpacity
            className={`rounded-2xl py-4 px-8 w-full items-center ${
              canProceed ? 'bg-primary-900' : 'bg-gray-300'
            }`}
            onPress={() => canProceed && setScreen('signup2')}
            disabled={!canProceed}
            activeOpacity={canProceed ? 0.8 : 1}
          >
            <Text className={`font-bold ${canProceed ? 'text-white' : 'text-gray-400'}`}>Next</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ✅ Screen 2 – Email
const SignUp2Screen = ({
  setScreen,
  formData,
  setFormData
}: SignUp2Props) => (
  <SafeAreaView className="flex-1 bg-white">
    <ScrollView className="flex-1 p-5">
      <TouchableOpacity onPress={() => setScreen('signup1')} className="mb-5 w-4">
        <ChevronRightIcon size={30} color="#000000" />
      </TouchableOpacity>

      <ProgressBar step={2} />

      <View className="mt-20 ml-8 mr-8">

        <Text className="text-3xl font-bold mb-2 text-primary-900">Whats your email?</Text>
        <Text className="text-base font-medium mb-4 text-gray-600">Enter your email account.</Text>

        <TextInput
          className="bg-gray-100 rounded-xl p-4 mb-5"
          placeholder="Email"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          value={formData.email}
          onChangeText={(text) =>
            setFormData((prev: SignUpData) => ({ ...prev, email: text }))
          }
        />

        <TouchableOpacity
          className="bg-primary-900 rounded-xl py-5 items-center"
          onPress={() => setScreen('signup3')}
        >
          <Text className="text-white font-bold text-base">Next</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  </SafeAreaView>
);


// ✅ Screen 3 – Passwords
const SignUp3Screen = ({
  setScreen,
  formData,
  setFormData,
  handleSignup,
  isLoading
}: SignUp3Props) => (
  <SafeAreaView className="flex-1 bg-white">
    <ScrollView className="flex-1 p-5">
      <TouchableOpacity onPress={() => setScreen('signup2')} className="mb-5 w-4" disabled={isLoading}>
        <ChevronRightIcon size={30} color="#000000" />
      </TouchableOpacity>

      <ProgressBar step={3} />

      <View className="mt-20 ml-8 mr-8">
        <Text className="text-3xl font-bold mb-2 text-primary-900">Create a password.</Text>
        <Text className="text-md font-medium mb-4 text-gray-600">Create a password with at least 6 letters or numbers. It should be something others can&apos;t guess..</Text>

        <TextInput
          className="bg-gray-100 rounded-xl p-4 mb-4"
          placeholder="Password"
          placeholderTextColor="#9CA3AF"
          secureTextEntry
          value={formData.password}
          onChangeText={(text) =>
            setFormData((prev: SignUpData) => ({ ...prev, password: text }))
          }
          editable={!isLoading}
        />

        <TextInput
          className="bg-gray-100 rounded-xl p-4 mb-6"
          placeholder="Confirm Password"
          placeholderTextColor="#9CA3AF"
          secureTextEntry
          value={formData.confirmPassword}
          onChangeText={(text) =>
            setFormData((prev: SignUpData) => ({ ...prev, confirmPassword: text }))
          }
          editable={!isLoading}
        />

        <TouchableOpacity
          className="bg-primary-900 rounded-xl py-5 items-center"
          onPress={handleSignup}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold">Finish</Text>
          )}
        </TouchableOpacity>

      </View>
    </ScrollView>
  </SafeAreaView>
);

const AuthFlow = () => {
  const [screen, setScreen] = useState<Step>('signup1');
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();

  const [formData, setFormData] = useState<SignUpData>({
    first_name: "",
    last_name: "",
    student_number: "",
    email: "",
    password: "",
    confirmPassword: "",
    user_type: 'student'
  });

  // Inline student number validation state
  const [studentNumberTouched, setStudentNumberTouched] = useState(false);
  const studentNumberValid = STUDENT_NUMBER_REGEX.test(formData.student_number);
  const studentNumberError =
    studentNumberTouched && formData.student_number && !studentNumberValid
      ? 'Use format YYYY-NNNNN (e.g., 2022-01191)'
      : studentNumberTouched && !formData.student_number
      ? 'Student number is required'
      : '';

  const handleSignup = async () => {
    // Validation — student number is already gated at step 1, but double-check as a safety net
    if (!formData.first_name || !formData.last_name) {
      Alert.alert('Error', 'Please enter your first and last name');
      return;
    }

    if (formData.user_type === 'student' && !STUDENT_NUMBER_REGEX.test(formData.student_number)) {
      Alert.alert('Error', 'Please go back and enter a valid student number (e.g., 2022-01191)');
      return;
    }

    if (!formData.email) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (!formData.password) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    try {
      setIsLoading(true);

      await register({
        email: formData.email,
        password: formData.password,
        first_name: formData.first_name,
        last_name: formData.last_name,
        user_type: formData.user_type,
        student_number: formData.user_type === 'student' ? formData.student_number : undefined,
      });

      Alert.alert('Success!', 'Your account has been created successfully!', [
        {
          text: 'OK',
          onPress: () => {
            // Navigate based on user type
            if (formData.user_type === 'parent') {
              router.replace('/Parent/home');
            } else {
              router.replace('/Home/home');
            }
          },
        },
      ]);
    } catch (error: any) {
      let errorMessage = 'Registration failed. Please try again.';

      if (error.message === 'Network Error' || !error.response) {
        errorMessage = 'Cannot connect to server. Please check:\n\n' +
          '1. Backend server is running (python manage.py runserver)\n' +
          '2. You are using the correct network\n' +
          '3. Firewall is not blocking the connection';
      } else if (error.response?.data) {
        // Handle specific API errors
        const data = error.response.data;
        if (data.email) {
          errorMessage = `Email: ${Array.isArray(data.email) ? data.email[0] : data.email}`;
        } else if (data.password) {
          errorMessage = `Password: ${Array.isArray(data.password) ? data.password[0] : data.password}`;
        } else if (data.first_name) {
          errorMessage = `First Name: ${Array.isArray(data.first_name) ? data.first_name[0] : data.first_name}`;
        } else if (data.last_name) {
          errorMessage = `Last Name: ${Array.isArray(data.last_name) ? data.last_name[0] : data.last_name}`;
        } else if (data.student_number) {
          errorMessage = `Student Number: ${Array.isArray(data.student_number) ? data.student_number[0] : data.student_number}`;
        } else if (data.detail) {
          errorMessage = data.detail;
        } else if (data.non_field_errors) {
          errorMessage = Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : data.non_field_errors;
        }
      }

      Alert.alert('Registration Failed', errorMessage);
      console.error('Registration error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {screen === 'signup1' && (
        <SignUp1Screen
          setScreen={setScreen}
          formData={formData}
          setFormData={setFormData}
          studentNumberError={studentNumberError}
          studentNumberValid={studentNumberValid}
          onStudentNumberBlur={() => setStudentNumberTouched(true)}
        />
      )}

      {screen === 'signup2' && (
        <SignUp2Screen
          setScreen={setScreen}
          formData={formData}
          setFormData={setFormData}
        />
      )}

      {screen === 'signup3' && (
        <SignUp3Screen
          setScreen={setScreen}
          formData={formData}
          setFormData={setFormData}
          handleSignup={handleSignup}
          isLoading={isLoading}
        />
      )}
    </>
  );
};

export default AuthFlow;
