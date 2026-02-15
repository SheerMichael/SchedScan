import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, Alert, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from "expo-router";
import Svg, { Path } from 'react-native-svg';
import { File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import SchedulePreviewCard from '../../../components/schedulepreviewcard';
import { scheduleStorageService, SavedSchedule } from '../../../services/scheduleStorageService';
import { facultyTaskService, ClassCode } from '../../../services/facultyTaskService';
import { useAuth } from '../../../context/AuthContext';

const FacultySchedule = () => {
  const { user, invalidateScheduleCache, getFacultySchedules, getClassCodes, invalidateFacultyDataCache } = useAuth();
  const [facultySchedules, setFacultySchedules] = useState<SavedSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Class code state — map of subject_code → ClassCode
  const [classCodes, setClassCodes] = useState<Record<string, ClassCode>>({});
  const [generatingCodeFor, setGeneratingCodeFor] = useState<string | null>(null);

  const loadSchedules = useCallback(async (forceRefresh: boolean = false) => {
    if (!user?.id) {
      console.error('No user ID available');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      // Use cached faculty schedules from AuthContext
      const schedules = await getFacultySchedules(forceRefresh);
      setFacultySchedules(schedules);

      // Use cached class codes from AuthContext
      try {
        const allCodes = await getClassCodes(forceRefresh);
        const codeMap: Record<string, ClassCode> = {};
        allCodes.forEach((code) => {
          codeMap[code.subject_code] = code;
        });
        setClassCodes(codeMap);
      } catch (e) {
        console.log('Could not load class codes:', e);
      }
    } catch (error) {
      console.error('Error loading faculty schedules:', error);
      Alert.alert('Error', 'Failed to load schedules');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, getFacultySchedules, getClassCodes]);

  // Load schedules when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      // Use cached data on first load, only force refresh if explicitly needed
      loadSchedules(false);
    }, [loadSchedules])
  );

  // Handle pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSchedules(true); // Force refresh
    setRefreshing(false);
  }, [loadSchedules]);

  // Get all unique subject codes across all faculty schedules
  const uniqueSubjects = React.useMemo(() => {
    const subjectMap = new Map<string, string>();
    facultySchedules.forEach((schedule) => {
      schedule.courses.forEach((course) => {
        if (course.subject_code && !subjectMap.has(course.subject_code)) {
          subjectMap.set(course.subject_code, course.subject_name || '');
        }
      });
    });
    return Array.from(subjectMap.entries()); // [[subject_code, subject_name], ...]
  }, [facultySchedules]);

  const handleGenerateClassCode = async (subjectCode: string) => {
    try {
      setGeneratingCodeFor(subjectCode);
      const newCode = await facultyTaskService.generateClassCode(subjectCode);
      setClassCodes((prev) => ({ ...prev, [subjectCode]: newCode }));
      // Invalidate cache since we generated a new code
      invalidateFacultyDataCache();
      Alert.alert('Class Code Generated', `Your new class code is: ${newCode.code}\n\nShare this with your students so they can join your class.`);
    } catch (error) {
      console.error('Error generating code:', error);
      Alert.alert('Error', 'Failed to generate class code.');
    } finally {
      setGeneratingCodeFor(null);
    }
  };

  const handleCopyClassCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('Copied!', 'Class code copied to clipboard.');
  };

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
      invalidateFacultyDataCache();

      // Reload schedules to update UI
      await loadSchedules(true); // Force refresh

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
              await scheduleStorageService.deleteSchedule(schedule.id, 'faculty', user!.id);

              // Invalidate cache in case the deleted schedule was active
              invalidateScheduleCache();
              invalidateFacultyDataCache();

              // Reload schedules to update UI
              await loadSchedules(true); // Force refresh

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
        try { file.delete(); } catch (e) { }
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
        <ScrollView 
          className="flex-1 pt-4"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {facultySchedules.map((schedule) => (
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

          {/* Class Codes Section */}
          {uniqueSubjects.length > 0 && (
            <View className="mx-2 mb-6">
              <Text className="text-xl font-bold text-orange-800 mb-3 px-2">Class Codes</Text>
              <Text className="text-gray-500 text-sm mb-3 px-2">
                Generate and share class codes so your students can connect to your subjects.
              </Text>

              {uniqueSubjects.map(([subjectCode, subjectName]) => {
                const code = classCodes[subjectCode];
                const isGenerating = generatingCodeFor === subjectCode;

                return (
                  <View
                    key={subjectCode}
                    className="bg-white p-4 rounded-xl mb-2 border border-orange-200 shadow-sm"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 mr-3">
                        <Text className="font-bold text-base text-gray-800">{subjectCode}</Text>
                        {subjectName ? (
                          <Text className="text-gray-500 text-xs mt-0.5">{subjectName}</Text>
                        ) : null}
                      </View>

                      {code ? (
                        <View className="flex-row items-center">
                          <View className="bg-orange-50 px-3 py-2 rounded-lg mr-2">
                            <Text className="text-lg font-bold text-orange-600 tracking-widest">
                              {code.code}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleCopyClassCode(code.code)}
                            className="bg-orange-500 px-3 py-2 rounded-lg mr-1"
                          >
                            <Text className="text-white font-semibold text-xs">Copy</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleGenerateClassCode(subjectCode)}
                            disabled={isGenerating}
                            className="bg-orange-200 px-3 py-2 rounded-lg"
                          >
                            {isGenerating ? (
                              <ActivityIndicator size="small" color="#f97316" />
                            ) : (
                              <Text className="text-orange-700 font-semibold text-xs">New</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleGenerateClassCode(subjectCode)}
                          disabled={isGenerating}
                          className="bg-orange-500 px-4 py-2 rounded-lg"
                        >
                          {isGenerating ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text className="text-white font-bold text-sm">Generate Code</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
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