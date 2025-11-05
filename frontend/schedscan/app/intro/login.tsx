import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'react-native';
import { router } from "expo-router";
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { Eye, EyeOff} from "lucide-react-native";

const LoginScreen = () => {
  const [showPassword, setShowPassword] = useState(false);

    const ChevronRightIcon = ({ size = 24, color = '#ffffff' }) => (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <Path d="M19 12H6M12 5l-7 7 7 7" />
      </Svg>
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
        <TouchableOpacity onPress={() => router.push('/intro/getstarted')} className="mb-5 w-4 absolute top-12 left-2">
          <ChevronRightIcon size={30} color="#000000" />
        </TouchableOpacity>
        </View>

        <View className='flex items-center justify-center'>
          <Text className="text-2xl font-bold text-center">Log in</Text>
          <Text className="text-gray-500 text-center mt-2 mb-10 w-60">
            Scan once, get reminders forever. Start free today!
          </Text>
        </View>

          {/* Email Label */}
          <Text className="text-sm font-semibold text-gray-700 mb-1 items-start">Email</Text>
          <TextInput
            placeholder="ex. Joe"
            placeholderTextColor="#9CA3AF"
            className="border border-gray-300 rounded-lg px-4 py-3 mb-5 text-gray-800 w-full"
          />

          {/* Password Label */}
          <Text className="text-sm font-semibold text-gray-700 mb-1">Password</Text>
          
          {/* Password Field */}
          <View className="relative mb-2 w-full">
            <TextInput
              placeholder="ex. Joe"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!showPassword}
              className="border border-gray-300 rounded-lg px-4 py-3 pr-10 text-gray-800 w-full"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3"
            >
              {showPassword ? <Eye size={20} color="#444" /> : <EyeOff size={20} color="#444" />}
            </TouchableOpacity>
          </View>

          {/* Forgot Password */}
          <TouchableOpacity className="self-end mb-6">
            <Text className="text-red-800 text-sm font-medium">Forgot password?</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity className="bg-primary-900 rounded-lg py-4 mb-8 shadow-sm"
          onPress={() => {
            Alert.alert("✅ Success", "Account Created!");
            router.push('../test');}}>
            <Text className="text-white text-center font-semibold">Log in</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View className="flex-row items-center mb-6">
            <View className="flex-1 h-[1px] bg-gray-300" />
            <Text className="mx-3 text-gray-500">Or</Text>
            <View className="flex-1 h-[1px] bg-gray-300" />
          </View>

          {/* Google Button */}
          <TouchableOpacity className="border border-gray-300 py-3 rounded-lg flex-row items-center justify-center mb-6">
            <Image
              source={{ uri: "https://upload.wikimedia.org/wikipedia/commons/0/09/IOS_Google_icon.png" }}
              style={{ width: 20, height: 20, marginRight: 8 }}
            />
            <Text className="text-gray-700 font-medium">Sign up with Google</Text>
          </TouchableOpacity>

          {/* Bottom Sign Up */}
          <View className="flex-row justify-center mt-2 mb-10">
            <Text className="text-gray-600">Don't have an account? </Text>
            <TouchableOpacity>
              <Text className="text-yellow-600 font-semibold">Sign up</Text>
            </TouchableOpacity>
          </View>


      </ScrollView>
    </SafeAreaView>
  );
};

export default LoginScreen;
