import React, { useState } from "react";
import { View, Text, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from "expo-router";
import { Image } from 'react-native';

const AuthFlow = () => {
  const [screen, setScreen] = useState("getStarted");

  const GetStartedScreen = () => (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 p-5">
        <Text className="text-3xl font-bold text-primary-900/50 text-center">
          Sched<Text className="text-primary-900">Scan</Text>
        </Text>

        <View className="flex-1 justify-center items-center">
          <Image source={require('../../assets/images/GetStarted.png')}/>
        </View>

        <View className="bg-gray-50 rounded-3xl p-8 mb-5">
          <Text className="text-2xl font-bold text-primary-900 text-center mb-2.5">
            Let's get started
          </Text>

          <Text className="text-sm text-gray-600 text-center mb-8 leading-5">
            Begin by scanning your COR to instantly create and view your class schedule!
          </Text>

          <TouchableOpacity
            className="bg-primary-900 rounded-xl py-5 items-center mb-4"
            onPress={() => router.push("/intro/login")}
          >
            <Text className="text-white text-base font-bold">Log in</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-transparent border-2 border-primary-900 rounded-xl py-5 items-center"
            onPress={() => router.push("/intro/signup")}
          >
            <Text className="text-primary-900 text-base font-bold">Register</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      {screen === "getStarted" && <GetStartedScreen />}
    </>
  );
};

export default AuthFlow;
