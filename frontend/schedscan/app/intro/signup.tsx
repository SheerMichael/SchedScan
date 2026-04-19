import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from "expo-router";
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';

type SignUpData = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirmPassword: string;
  user_type?: 'student' | 'faculty' | 'parent';
};

type Step = 'signup1' | 'signup2' | 'signup3';

type SignUp1Props = {
  setScreen: (screen: Step) => void;
  formData: SignUpData;
  setFormData: React.Dispatch<React.SetStateAction<SignUpData>>;
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

// ✅ Screen 1 – Name only
// Student number is NOT collected here anymore. It is prompted before the
// first student COR upload so that faculty-only users can register freely.
const SignUp1Screen = ({
  setScreen,
  formData,
  setFormData,
}: SignUp1Props) => {
  const canProceed =
    formData.first_name.trim().length > 0 &&
    formData.last_name.trim().length > 0;

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

          {/* Name row */}
          <View className="flex-row gap-3 mb-6">
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

          {/* Next button — gated on name only */}
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
        <Text className="text-md font-medium mb-4 text-gray-600">
          Create a password with at least 6 letters or numbers. It should be something others can&apos;t guess..
        </Text>

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
    email: "",
    password: "",
    confirmPassword: "",
    user_type: 'student',
  });

  const handleSignup = async () => {
    if (!formData.first_name || !formData.last_name) {
      Alert.alert('Error', 'Please enter your first and last name');
      return;
    }

    if (!formData.email) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

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
        // student_number intentionally omitted — collected lazily before
        // the first student COR upload so faculty-only users are unblocked.
      });

      Alert.alert('Success!', 'Your account has been created successfully!', [
        {
          text: 'OK',
          onPress: () => {
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
        errorMessage =
          'Cannot connect to server. Please check:\n\n' +
          '1. Backend server is running (python manage.py runserver)\n' +
          '2. You are using the correct network\n' +
          '3. Firewall is not blocking the connection';
      } else if (error.response?.data) {
        const data = error.response.data;
        if (data.email) {
          errorMessage = `Email: ${Array.isArray(data.email) ? data.email[0] : data.email}`;
        } else if (data.password) {
          errorMessage = `Password: ${Array.isArray(data.password) ? data.password[0] : data.password}`;
        } else if (data.first_name) {
          errorMessage = `First Name: ${Array.isArray(data.first_name) ? data.first_name[0] : data.first_name}`;
        } else if (data.last_name) {
          errorMessage = `Last Name: ${Array.isArray(data.last_name) ? data.last_name[0] : data.last_name}`;
        } else if (data.detail) {
          errorMessage = data.detail;
        } else if (data.non_field_errors) {
          errorMessage = Array.isArray(data.non_field_errors)
            ? data.non_field_errors[0]
            : data.non_field_errors;
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
