import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, Alert } from 'react-native';
import { router, useFocusEffect } from "expo-router";
import Svg, { Path } from 'react-native-svg';
import { File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import SchedulePreviewCard from '../../../components/schedulepreviewcard';
import DayPickerModal from '../../../components/DayPickerModal';
import { scheduleStorageService, SavedSchedule } from '../../../services/scheduleStorageService';
import { useAuth } from '../../../context/AuthContext';
import { Course } from '../../../services/courseService';
import { getReadableDayLabel } from '../../../utils/dayCode';
import { formatDayAssignmentConflictMessage, validateDayAssignment } from '../../../utils/dayAssignmentValidation';

const MergedSchedule = () => {
  const { user, invalidateScheduleCache } = useAuth();
  const [mergedSchedules, setMergedSchedules] = useState<SavedSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Day picker modal state
  const [dayPickerVisible, setDayPickerVisible] = useState(false);
  const [dayPickerCourse, setDayPickerCourse] = useState<Course | null>(null);
  const [dayPickerScheduleId, setDayPickerScheduleId] = useState<number | null>(null);
  const [dayPickerCourseIndex, setDayPickerCourseIndex] = useState<number | null>(null);
  const [isAssigningDay, setIsAssigningDay] = useState(false);

  const isExtractedSchedule = (schedule: SavedSchedule) =>
    schedule.courses.some(
      (course) => course.source_type === 'student' || course.source_type === 'faculty'
    );

  const loadSchedules = useCallback(async () => {
    if (!user?.id) {
      console.error('No user ID available');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const schedules = await scheduleStorageService.getSchedules('merged', user.id);
      setMergedSchedules(schedules);
    } catch (error) {
      console.error('Error loading merged schedules:', error);
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

      // Invalidate cache so home screen fetches fresh active schedule
      invalidateScheduleCache();

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
              await scheduleStorageService.deleteSchedule(schedule.id, 'merged', user!.id);

              // Invalidate cache in case the deleted schedule was active
              invalidateScheduleCache();

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
        try { file.delete(); } catch { }
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (error: any) {
      console.error('Error downloading timetable:', error);
      Alert.alert('Error', `Failed to download timetable: ${error.message}`);
    }
  };

  const resetDayPicker = () => {
    setDayPickerVisible(false);
    setDayPickerCourse(null);
    setDayPickerScheduleId(null);
    setDayPickerCourseIndex(null);
    setIsAssigningDay(false);
  };

  const handleOpenDayPicker = (scheduleId: number, course: Course, courseIndex: number) => {
    setDayPickerScheduleId(scheduleId);
    setDayPickerCourse(course);
    setDayPickerCourseIndex(courseIndex);
    setDayPickerVisible(true);
  };

  const handleAssignDay = async (course: Course, selectedDay: string): Promise<boolean> => {
    if (!user?.id || dayPickerScheduleId === null) {
      Alert.alert('Error', 'Unable to identify the selected schedule. Please try again.');
      return false;
    }

    const schedule = mergedSchedules.find((s) => s.id === dayPickerScheduleId);
    if (!schedule) {
      Alert.alert('Error', 'Selected schedule was not found. Please refresh and try again.');
      return false;
    }

    try {
      setIsAssigningDay(true);

      const updatedCourses = [...schedule.courses];

      const isSameCourse = (candidate: Course) => (
        candidate.subject_code === course.subject_code
        && candidate.start_time === course.start_time
        && candidate.end_time === course.end_time
        && (candidate.location || '') === (course.location || '')
      );

      let targetIndex = -1;

      if (
        dayPickerCourseIndex !== null
        && updatedCourses[dayPickerCourseIndex]
        && (!updatedCourses[dayPickerCourseIndex].day || updatedCourses[dayPickerCourseIndex].day.trim() === '')
        && isSameCourse(updatedCourses[dayPickerCourseIndex])
      ) {
        targetIndex = dayPickerCourseIndex;
      } else {
        targetIndex = updatedCourses.findIndex((candidate) => (
          (!candidate.day || candidate.day.trim() === '') && isSameCourse(candidate)
        ));
      }

      if (targetIndex < 0) {
        Alert.alert('Not Found', 'That course may have already been updated. Please refresh and try again.');
        return false;
      }

      const validation = validateDayAssignment(updatedCourses, targetIndex, selectedDay);

      if (!validation.isValid) {
        Alert.alert('Cannot Assign Day', validation.validationError || 'Please review course details and try again.');
        return false;
      }

      if (validation.conflicts.length > 0) {
        Alert.alert('Schedule Conflict', formatDayAssignmentConflictMessage(validation.conflicts));
        return false;
      }

      updatedCourses[targetIndex] = {
        ...updatedCourses[targetIndex],
        day: selectedDay,
      };

      await scheduleStorageService.updateSchedule(
        dayPickerScheduleId,
        'merged',
        user.id,
        { courses: updatedCourses }
      );

      if (schedule.isActive) {
        invalidateScheduleCache();
      }

      resetDayPicker();
      await loadSchedules();

      Alert.alert(
        'Day Assigned!',
        `${course.subject_code} is now scheduled on ${getReadableDayLabel(selectedDay)}.`,
      );
      return true;
    } catch (error: any) {
      console.error('Error assigning day:', error);
      Alert.alert('Error', 'Failed to assign day. Please try again.');
      return false;
    } finally {
      setIsAssigningDay(false);
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
          <Text className='font-bold text-2xl'>Merged Schedules</Text>
        </View>
        <View>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <Text className="text-gray-500">Loading schedules...</Text>
        </View>
      ) : mergedSchedules.length > 0 ? (
        <ScrollView className="flex-1 pt-4">
          {mergedSchedules.map((schedule) => (
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
              onAssignDay={
                isExtractedSchedule(schedule)
                  ? undefined
                  : (course, courseIndex) => handleOpenDayPicker(schedule.id, course, courseIndex)
              }
            />
          ))}
        </ScrollView>
      ) : (
        <View className='flex-1 justify-center items-center'>
          <Image source={require('../../../assets/images/Reminders.png')}
            style={{ width: 268, height: 168 }}
          />
          <Text className="text-lg font-semibold text-gray-700 mt-4">No merged schedules yet!</Text>
          <Text className="text-gray-500 text-center px-8">Use the &quot;Merge Schedules&quot; button to combine your student and faculty schedules</Text>
        </View>
      )}

      {/* Day Picker Modal */}
      <DayPickerModal
        visible={dayPickerVisible}
        course={dayPickerCourse}
        courseIndex={dayPickerCourseIndex}
        coursesContext={mergedSchedules.find((s) => s.id === dayPickerScheduleId)?.courses || []}
        onDismiss={resetDayPicker}
        onConfirm={handleAssignDay}
        isSubmitting={isAssigningDay}
      />

    </>
  );
};

export default MergedSchedule;
