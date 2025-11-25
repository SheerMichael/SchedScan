import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, Alert } from 'react-native';
import { router, useFocusEffect } from "expo-router";
import Svg, { Path } from 'react-native-svg';
import SchedulePreviewCard from '../../../components/schedulepreviewcard';
import { scheduleStorageService, SavedSchedule } from '../../../services/scheduleStorageService';
import { useAuth } from '../../../context/AuthContext';

const FacultySchedule = () => {
  const { user } = useAuth();
  const [facultySchedules, setFacultySchedules] = useState<SavedSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSchedules = useCallback(async () => {
    if (!user?.id) {
      console.error('No user ID available');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const schedules = await scheduleStorageService.getSchedules('faculty', user.id);
      setFacultySchedules(schedules);
    } catch (error) {
      console.error('Error loading faculty schedules:', error);
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

  const handleApplyReminders = (scheduleId: string) => {
    console.log(`Applying reminders for schedule ${scheduleId}`);
    router.push({
      pathname: '/Home/reminders',
    });
  };

  const handleDownload = (scheduleId: string) => {
    console.log(`Downloading schedule ${scheduleId}`);
    Alert.alert('Download', 'Download functionality coming soon!');
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
          <Text className='font-bold text-2xl'>Faculty Schedules</Text>
        </View>
        <View>
        </View>
      </View>

        {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <Text className="text-gray-500">Loading schedules...</Text>
        </View>
      ) : facultySchedules.length > 0 ? (
        <ScrollView className="flex-1 pt-4">
          {facultySchedules.map((schedule) => (
            <SchedulePreviewCard
              key={schedule.id}
              title={schedule.title}
              courses={schedule.courses}
              uploadType={schedule.uploadType}
              uploadDate={schedule.uploadDate}
              onApplyReminders={() => handleApplyReminders(schedule.id)}
              onDownload={() => handleDownload(schedule.id)}
            />
          ))} 
        </ScrollView>
      ) : (
        <View className='flex-1 justify-center items-center'>
          <Image source={require('../../../assets/images/Reminders.png')}
            style={{ width: 268, height: 168 }}
          />
          <Text className="text-lg font-semibold text-gray-700 mt-4">No schedules yet!</Text>
          <Text className="text-gray-500">Scan your schedule now</Text>
        </View>
      )}

    </>
  );
};

export default FacultySchedule;