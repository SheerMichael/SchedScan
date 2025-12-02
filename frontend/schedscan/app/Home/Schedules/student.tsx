import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, Alert, Platform } from 'react-native';
import { router, useFocusEffect } from "expo-router";
import Svg, { Path } from 'react-native-svg';
import { File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import SchedulePreviewCard from '../../../components/schedulepreviewcard';
import { scheduleStorageService, SavedSchedule } from '../../../services/scheduleStorageService';
import { useAuth } from '../../../context/AuthContext';

const StudentSchedule = () => {
  const { user } = useAuth();
  const [studentSchedules, setStudentSchedules] = useState<SavedSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSchedules = useCallback(async () => {
    if (!user?.id) {
      console.error('No user ID available');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const schedules = await scheduleStorageService.getSchedules('student', user.id);
      setStudentSchedules(schedules);
    } catch (error) {
      console.error('Error loading student schedules:', error);
      Alert.alert('Error', 'Failed to load schedules');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Load schedules when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadSchedules();
    }, [loadSchedules])
  );

  const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
  );

  const handleApplyReminders = async (scheduleId: string | number) => {
    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      await scheduleStorageService.setActiveSchedule(scheduleId, user.id);
      
      // Reload schedules to update UI
      await loadSchedules();
      
      Alert.alert(
        'Success!',
        'Schedule is now active. Your calendar and reminders will show courses from this schedule.',
        [
          {
            text: 'View Calendar',
            onPress: () => router.replace('/Home/home'),
          },
          {
            text: 'OK',
            style: 'cancel',
          },
        ]
      );
    } catch (error) {
      console.error('Error setting active schedule:', error);
      Alert.alert('Error', 'Failed to apply schedule. Please try again.');
    }
  };

  const handleDeleteSchedule = async (schedule: SavedSchedule) => {
    Alert.alert(
      'Delete Schedule',
      `Are you sure you want to delete "${schedule.title}"?${schedule.isActive ? '\n\nThis is your currently active schedule. Deleting it will remove it from your calendar.' : ''}`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await scheduleStorageService.deleteSchedule(schedule.id, 'student', user!.id);
              
              // Reload schedules to update UI
              await loadSchedules();
              
              Alert.alert('Success', 'Schedule deleted successfully');
            } catch (error) {
              console.error('Error deleting schedule:', error);
              Alert.alert('Error', 'Failed to delete schedule. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDownload = async (scheduleId: string | number, scheduleTitle: string = 'schedule') => {
    console.log(`Downloading timetable for schedule ${scheduleId}`);
    
    try {
      // Get the download URL
      const downloadUrl = scheduleStorageService.getTimetableDownloadUrl(scheduleId);
      console.log('Download URL:', downloadUrl);
      
      // Create a safe filename
      const safeTitle = scheduleTitle.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `timetable_${safeTitle}_${Date.now()}.png`;

      // Get the access token for authenticated request
      const token = await SecureStore.getItemAsync('access_token');
      if (!token) {
        Alert.alert('Error', 'Authentication token not found. Please log in again.');
        return;
      }
      
      // Download using expo/fetch with auth headers
      console.log('Downloading file...');
      const response = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      // Create file and write the downloaded bytes
      const file = new File(Paths.cache, filename);
      const bytes = await response.bytes();
      file.write(bytes);
      
      console.log('File saved to cache:', file.uri);

      // Open share sheet - user can save to gallery from there
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'image/png',
          dialogTitle: 'Save Timetable',
          UTI: 'public.png',
        });
        
        // Clean up after sharing dialog closes
        try { file.delete(); } catch (e) {}
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (error: any) {
      console.error('Error downloading timetable:', error);
      Alert.alert('Error', `Failed to download timetable: ${error.message}`);
    }
  };

  return (
    <>
      <View className="w-full h-14 bg-white border-b-2 border-b-gray-200 justify-between items-center flex-row">
        <View className='pl-8 flex-row justify-center items-center'>
          <TouchableOpacity onPress={() => router.push('/Home/schedules')}>
            <LeftPointingArrow size={30} color="#000000" />
          </TouchableOpacity>
        </View>
        <View className='flex-row justify-center items-center mr-4'>
          <Text className='font-bold text-2xl'>Student Schedules</Text>
        </View>
        <View />
      </View>

      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <Text className="text-gray-500">Loading schedules...</Text>
        </View>
      ) : studentSchedules.length > 0 ? (
        <ScrollView className="flex-1 pt-4">
          {studentSchedules.map((schedule) => (
            <SchedulePreviewCard
              key={schedule.id}
              title={schedule.title}
              courses={schedule.courses}
              uploadType={schedule.uploadType}
              uploadDate={schedule.uploadDate}
              isActive={schedule.isActive}
              onApplyReminders={() => handleApplyReminders(schedule.id)}
              onDownload={() => handleDownload(schedule.id, schedule.title)}
              onDelete={() => handleDeleteSchedule(schedule)}
            />
          ))} 
        </ScrollView>
      ) : (
        <View className='flex-1 justify-center items-center'>
          <Image 
            source={require('../../../assets/images/Reminders.png')}
            style={{ width: 268, height: 168 }}
          />
          <Text className="text-lg font-semibold text-gray-700 mt-4">No schedules yet!</Text>
          <Text className="text-gray-500">Scan your schedule now</Text>
        </View>
      )}
    </>
  );
};

export default StudentSchedule;