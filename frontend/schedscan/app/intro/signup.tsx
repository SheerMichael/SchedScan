import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StatusBar, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

type SignUpData = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type Step = 'signup1' | 'signup2' | 'signup3';

type SignUp1Props = {
  setScreen: (screen: Step) => void;
  formData: SignUpData;
  setFormData: React.Dispatch<React.SetStateAction<SignUpData>>;
  image: string | null;
  pickImageOption: () => void;
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
};

const AuthFlow = () => {
  const [image, setImage] = useState<string | null>(null);
  const [screen, setScreen] = useState<Step>('signup1');

  const [formData, setFormData] = useState<SignUpData>({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const pickImageOption = () => {
    Alert.alert("Select Image Source", "Choose an option", [
      { text: "Camera", onPress: () => openCamera() },
      { text: "Gallery", onPress: () => openGallery() },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // 📸 OPEN CAMERA
  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return alert("Camera permission is required!");

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 4],
      quality: 1,
    });

    if (!result.canceled) setImage(result.assets[0].uri);
  };

  // 🖼️ OPEN GALLERY
  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return alert("Gallery permission is required!");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 4],
      quality: 1,
    });

    if (!result.canceled) setImage(result.assets[0].uri);
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

  // ✅ Screen 1 – Photo + First Name
  const SignUp1Screen = ({
    setScreen,
    formData,
    setFormData,
    image,
    pickImageOption
  }: SignUp1Props) => (
    <SafeAreaView className="flex-2 bg-white px-4 m-2">
      <TouchableOpacity onPress={() => router.push('/intro/getstarted')} className="mb-5 w-4">
        <ChevronRightIcon size={30} color="#000000" />
      </TouchableOpacity>
      
      <ProgressBar step={1} />

      <View className="mt-20 ml-8 mr-8">

        <Text className="text-3xl font-bold mb-2 text-primary-900">What's your name?</Text>
        <Text className="text-base font-medium mb-4 text-gray-600">Enter your name.</Text>

        <View className='flex h-90 w-full items-center justify-center rounded-md border border-zinc-300 mb-8 bg-primary-200'>
          <Image
            source={image ? { uri: image } : require("../../assets/images/PlaceholderImage.png")}
            style={{ width: 90, height: 90, borderRadius: 100, marginBottom: 20, margin: 6, marginTop: 6 }}
          />

          <TouchableOpacity onPress={pickImageOption} className="p-4 bg-blue-500 rounded-xl mb-6 w-80">
            <Text className="text-white font-bold text-center">Upload Photo</Text>
          </TouchableOpacity>

          <View className='flex flex-row gap-6'>
            <TextInput
              className="bg-white rounded-xl p-4 mb-5 w-36"
              placeholder="First Name"
              value={formData.first_name}
              onChangeText={(text) =>
                setFormData((prev: SignUpData) => ({ ...prev, first_name: text }))
              }
            />
              <TextInput
              className="bg-white rounded-xl p-4 mb-5 w-36"
              placeholder="Last Name"
              value={formData.last_name}
              onChangeText={(text) =>
                setFormData((prev: SignUpData) => ({ ...prev, last_name: text }))
              }
            />
          </View>
        </View>

        <TouchableOpacity
          className="bg-primary-900 rounded-2xl py-4 px-8 w-full flex items-center"
          onPress={() => setScreen('signup2')}
        >
          <Text className="text-white font-bold">Next</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

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
    setFormData
  }: SignUp3Props) => (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1 p-5">
        <TouchableOpacity onPress={() => setScreen('signup2')} className="mb-5 w-4">
          <ChevronRightIcon size={30} color="#000000" />
        </TouchableOpacity>

        <ProgressBar step={3} />
        
        <View className="mt-20 ml-8 mr-8">
          <Text className="text-3xl font-bold mb-2 text-primary-900">Create a password.</Text>
          <Text className="text-md font-medium mb-4 text-gray-600">Create a password with at least 6 letters or numbers. It should be something others can’t guess..</Text>

          <TextInput
            className="bg-gray-100 rounded-xl p-4 mb-4"
            placeholder="Password"
            secureTextEntry
            value={formData.password}
            onChangeText={(text) =>
              setFormData((prev: SignUpData) => ({ ...prev, password: text }))
            }
          />

          <TextInput
            className="bg-gray-100 rounded-xl p-4 mb-6"
            placeholder="Confirm Password"
            secureTextEntry
            value={formData.confirmPassword}
            onChangeText={(text) =>
              setFormData((prev: SignUpData) => ({ ...prev, confirmPassword: text }))
            }
          />

          <TouchableOpacity
            className="bg-primary-900 rounded-xl py-5 items-center"
            onPress={() => {
              Alert.alert("✅ Success", "Account Created!");
              router.push('../test');}}
          >
            <Text className="text-white font-bold">Finish</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );

  return (
    <>
      {screen === 'signup1' && (
        <SignUp1Screen
          setScreen={setScreen}
          formData={formData}
          setFormData={setFormData}
          image={image}
          pickImageOption={pickImageOption}
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
        />
      )}
    </>
  );
};

export default AuthFlow;
