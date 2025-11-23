import { View, Text, TouchableOpacity, Image, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import React, { useState } from "react";
import Svg, { Path } from 'react-native-svg';
import { Images, Files } from "lucide-react-native";
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { courseService } from '../../services/courseService';

export default function Scanner() {
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState<'faculty' | 'student' | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Handle role selection
  const handleRoleSelection = (role: 'faculty' | 'student') => {
    setSelectedRole(role);
  };

  // Handle PDF/Document upload
  const handleDocumentUpload = async () => {
    if (!selectedRole) {
      Alert.alert('Error', 'Please select a role first');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'], // Allow PDFs and images
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('Selected file:', file);
        
        setSelectedFile({
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          uploadType: selectedRole
        });
        
        // Upload to backend
        await uploadFile(file, selectedRole);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  // Handle Image picker from gallery
  const handleImageGallery = async () => {
    if (!selectedRole) {
      Alert.alert('Error', 'Please select a role first');
      return;
    }

    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const image = result.assets[0];
        setSelectedFile({
          uri: image.uri,
          name: 'image.jpg',
          mimeType: 'image/jpeg',
          uploadType: selectedRole
        });
        
        // Upload to backend
        await uploadFile(image, selectedRole);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  // Handle Camera capture
  const handleCameraCapture = async () => {
    if (!selectedRole) {
      Alert.alert('Error', 'Please select a role first');
      return;
    }

    try {
      // Request permission
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your camera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const image = result.assets[0];
        setSelectedFile({
          uri: image.uri,
          name: 'camera-capture.jpg',
          mimeType: 'image/jpeg',
          uploadType: selectedRole
        });
        
        // Upload to backend
        await uploadFile(image, selectedRole);
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      Alert.alert('Error', 'Failed to capture image');
    }
  };

  // Upload function to backend
  const uploadFile = async (file: any, uploadType: string) => {
    setIsUploading(true);
    try {
      const response = await courseService.uploadCOR(file);
      
      console.log('Upload successful:', response);
      Alert.alert(
        'Success', 
        `COR processed successfully!\n${response.total_courses} courses extracted.`,
        [
          {
            text: 'OK',
            onPress: () => {
              resetScanner();
              router.back(); // Go back to home to see the updated calendar
            }
          }
        ]
      );
    } catch (error: any) {
      console.error('Upload error:', error);
      const errorMessage = error.response?.data?.error || 'Failed to upload file. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const resetScanner = () => {
    setSelectedFile(null);
    setSelectedRole(null);
  };

  const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
  );

  return (
    <View className="flex-1 bg-[#B88080]">
      {/* Back button */}
      <TouchableOpacity 
        onPress={() => router.back()}
        className="absolute top-12 left-4 z-20"
      >
        <LeftPointingArrow size={30} color="#000000" />
      </TouchableOpacity>

      {/* Title */}
      <View className="absolute top-12 w-full items-center z-10">
        <Text className="text-white text-xl font-semibold">
          {!selectedRole ? "Scan as" : selectedFile ? "Preview" : "Scanner"}
        </Text>
      </View>

      {/* Loading overlay */}
      {isUploading && (
        <View className="absolute inset-0 bg-black/50 justify-center items-center z-30">
          <View className="bg-white rounded-lg p-6 items-center">
            <ActivityIndicator size="large" color="#DC2626" />
            <Text className="mt-4 text-lg font-semibold">Processing COR...</Text>
            <Text className="text-sm text-gray-600 mt-2">Extracting course data</Text>
          </View>
        </View>
      )}

      {/* Scanner frame */}
      <View className="flex-1 justify-center items-center p-8">
        <View className="w-full aspect-[3/4] relative">
          {/* Corner brackets */}
          <View className="absolute top-0 left-0 w-12 h-12 border-l-4 border-t-4 border-white" />
          <View className="absolute top-0 right-0 w-12 h-12 border-r-4 border-t-4 border-white" />
          <View className="absolute bottom-0 left-0 w-12 h-12 border-l-4 border-b-4 border-white" />
          <View className="absolute bottom-0 right-0 w-12 h-12 border-r-4 border-b-4 border-white" />

          {/* Role selection popup or preview */}
          {!selectedRole ? (
            // Show role selection first
            <View className="flex-1 justify-center items-center">
              <View className="bg-white rounded-lg p-6">
                <Text className="text-center mb-4 font-semibold">
                  Upload schedule as
                </Text>
                <View className="flex-row gap-4">
                  <TouchableOpacity 
                    className="bg-primary-500 px-6 py-2 rounded"
                    onPress={() => handleRoleSelection('faculty')}
                  >
                    <Text className="text-white font-semibold">Faculty</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="bg-primary-900 px-6 py-2 rounded"
                    onPress={() => handleRoleSelection('student')}
                  >
                    <Text className="text-white font-semibold">Student</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : selectedFile ? (
            // Show file preview after upload
            <View className="flex-1 justify-center items-center bg-white/20 rounded-lg">
              {selectedFile.mimeType?.startsWith('image/') ? (
                <Image 
                  source={{ uri: selectedFile.uri }} 
                  className="w-full h-full rounded-lg"
                  resizeMode="contain"
                />
              ) : (
                <View className="items-center">
                  <Text className="text-white text-4xl mb-4">📄</Text>
                  <Text className="text-white font-semibold">{selectedFile.name}</Text>
                  <Text className="text-white/80 text-sm mt-2">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </Text>
                </View>
              )}
            </View>
          ) : (
            // Show empty scanner frame with role badge
            <View className="flex-1 justify-center items-center">
              <View className="bg-white/20 rounded-lg px-4 py-2">
                <Text className="text-white font-semibold">
                  Scanning as: {selectedRole === 'faculty' ? 'Faculty' : 'Student'}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Bottom action buttons - only show after role is selected */}
      {selectedRole && (
        <View className="flex-row justify-around items-center py-2 px-4 pt-4 bg-white">
          <TouchableOpacity 
            className="w-12 h-12 bg-white rounded-full justify-center items-center"
            onPress={handleImageGallery}
          >
            <Images size={28} color="#444"/>
          </TouchableOpacity>
          
          <TouchableOpacity 
            className="w-16 h-16 bg-white rounded-full justify-center items-center border-accent-maroon border"
            onPress={selectedFile ? resetScanner : handleCameraCapture}
          >
            <View className="bg-accent-maroon rounded-full h-4/5 w-4/5"></View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            className="w-12 h-12 bg-white rounded-full justify-center items-center"
            onPress={handleDocumentUpload}
          >
            <Files size={28} color="#444"/>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}