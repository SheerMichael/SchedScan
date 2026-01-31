import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Alert, Modal, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from "expo-router";
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { FolderClosed, ChevronRight, Merge, X, AlertTriangle, Check } from "lucide-react-native";
import { useAuth } from '../../context/AuthContext';
import { 
  scheduleStorageService, 
  SavedSchedule, 
  MergeConflictsResponse, 
  ScheduleConflict,
  ConflictResolution 
} from '../../services/scheduleStorageService';

const SchedulesScreen = () => {
  const { user } = useAuth();
  const [allSchedules, setAllSchedules] = useState<SavedSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedSchedules, setSelectedSchedules] = useState<number[]>([]);
  const [mergeTitle, setMergeTitle] = useState('');
  const [conflicts, setConflicts] = useState<ScheduleConflict[] | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  const loadAllSchedules = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      setIsLoading(true);
      const schedules = await scheduleStorageService.getAllSchedules(user.id);
      setAllSchedules(schedules);
    } catch (error) {
      console.error('Error loading schedules:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadAllSchedules();
    }, [loadAllSchedules])
  );

  const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
  );

  const openMergeModal = () => {
    if (allSchedules.length < 2) {
      Alert.alert(
        'Cannot Merge',
        'You need at least 2 schedules to merge. Please upload both a student and faculty schedule first.',
        [{ text: 'OK' }]
      );
      return;
    }
    setSelectedSchedules([]);
    setMergeTitle('');
    setConflicts(null);
    setShowMergeModal(true);
  };

  const toggleScheduleSelection = (scheduleId: number) => {
    setSelectedSchedules(prev => {
      if (prev.includes(scheduleId)) {
        return prev.filter(id => id !== scheduleId);
      } else {
        return [...prev, scheduleId];
      }
    });
    // Reset conflicts when selection changes
    setConflicts(null);
  };

  const checkForConflicts = async () => {
    if (selectedSchedules.length < 2) {
      Alert.alert('Select Schedules', 'Please select at least 2 schedules to merge.');
      return;
    }

    if (!mergeTitle.trim()) {
      Alert.alert('Enter Title', 'Please enter a title for the merged schedule.');
      return;
    }

    try {
      setIsMerging(true);
      const result = await scheduleStorageService.checkMergeConflicts(selectedSchedules);
      
      if (result && result.has_conflicts) {
        setConflicts(result.conflicts);
      } else {
        // No conflicts, proceed with merge
        await performMerge();
      }
    } catch (error: any) {
      console.error('Error checking conflicts:', error);
      Alert.alert('Error', 'Failed to check for conflicts. Please try again.');
    } finally {
      setIsMerging(false);
    }
  };

  const performMerge = async (resolution?: ConflictResolution) => {
    try {
      setIsMerging(true);
      const result = await scheduleStorageService.mergeSchedules(
        selectedSchedules,
        mergeTitle.trim(),
        resolution
      );

      // Check if it's a conflict response
      if ('has_conflicts' in result && result.has_conflicts) {
        setConflicts(result.conflicts);
        return;
      }

      // Success - it's a SavedSchedule
      setShowMergeModal(false);
      setConflicts(null);
      await loadAllSchedules();
      
      Alert.alert(
        'Success!',
        `Schedules merged successfully into "${mergeTitle}" and applied to your calendar!`,
        [
          {
            text: 'View Calendar',
            onPress: () => router.push('/Home/home'),
          },
          {
            text: 'View Merged Schedules',
            onPress: () => router.push('/Home/Schedules/merged'),
          },
        ]
      );
    } catch (error: any) {
      console.error('Error merging schedules:', error);
      Alert.alert('Error', 'Failed to merge schedules. Please try again.');
    } finally {
      setIsMerging(false);
    }
  };

  const handleConflictResolution = (resolution: ConflictResolution) => {
    performMerge(resolution);
  };

  const getScheduleTypeLabel = (uploadType: string) => {
    return uploadType === 'faculty' ? '👨‍🏫 Faculty' : '👨‍🎓 Student';
  };

  const formatConflictTime = (conflict: ScheduleConflict) => {
    const dayNames: Record<string, string> = {
      'M': 'Monday', 'T': 'Tuesday', 'W': 'Wednesday',
      'TH': 'Thursday', 'F': 'Friday', 'S': 'Saturday'
    };
    return dayNames[conflict.day] || conflict.day;
  };
 
  return (
    <>
      <View className="w-full h-14 bg-white border-b-2 border-gray-200 justify-between items-center flex-row">
        <View className='pl-8 flex-row justify-center items-center'>
          <TouchableOpacity onPress={() => router.push('/Home/home')}>
            <LeftPointingArrow size={30} color="#000000" />
          </TouchableOpacity>
        </View>
          <View className='flex-row justify-center items-center mr-4'>
            <Text className='font-bold text-2xl'>Schedules</Text>
          </View>
        <View>
        </View>
      </View>

        <ScrollView>
          <View className='flex items-center justify-center mt-8 pt-4'>
            <TouchableOpacity className='flex-row justify-between items-center bg-primary-900 w-11/12 rounded-xl h-20' onPress={() => router.push('/Home/Schedules/faculty')}>
                <View className='flex-row justify-evenly items-center ml-4'>
                    <FolderClosed size={40} color="#ffffff" fill="#ffffff" stroke="#990100"/>
                    <Text className='text-white text-2xl font-semibold'>Faculty</Text>
                </View>
                <View className='flex mr-4'>
                    <ChevronRight size={34} color="#ffffff"/>
                </View>
            </TouchableOpacity>
          </View>

          <View className='flex items-center justify-center pt-4'>
            <TouchableOpacity className='flex-row justify-between items-center bg-primary-900 w-11/12 rounded-xl h-20' onPress={() => router.push('/Home/Schedules/student')}>
                <View className='flex-row justify-evenly items-center ml-4'>
                    <FolderClosed size={40} color="#ffffff" fill="#ffffff" stroke="#990100"/>
                    <Text className='text-white text-2xl font-semibold'>Student</Text>
                </View>
                <View className='flex mr-4'>
                    <ChevronRight size={34} color="#ffffff"/>
                </View>
            </TouchableOpacity>
          </View>

          <View className='flex items-center justify-center pt-4'>
            <TouchableOpacity className='flex-row justify-between items-center bg-purple-700 w-11/12 rounded-xl h-20' onPress={() => router.push('/Home/Schedules/merged')}>
                <View className='flex-row justify-evenly items-center ml-4'>
                    <Merge size={40} color="#ffffff"/>
                    <Text className='text-white text-2xl font-semibold'>Merged</Text>
                </View>
                <View className='flex mr-4'>
                    <ChevronRight size={34} color="#ffffff"/>
                </View>
            </TouchableOpacity>
          </View>

          {/* Merge Schedules Button */}
          <View className='flex items-center justify-center pt-6'>
            <TouchableOpacity 
              className='flex-row justify-center items-center bg-green-600 w-11/12 rounded-xl h-16'
              onPress={openMergeModal}
            >
              <Merge size={28} color="#ffffff" />
              <Text className='text-white text-xl font-semibold ml-3'>Merge Schedules</Text>
            </TouchableOpacity>
          </View>

          <View className='px-6 pt-4'>
            <Text className='text-gray-500 text-center text-sm'>
              Merge your student and faculty schedules to view both in a single calendar
            </Text>
          </View>
        </ScrollView>

      {/* Merge Modal */}
      <Modal
        visible={showMergeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMergeModal(false)}
      >
        <View className='flex-1 bg-black/50 justify-end'>
          <View className='bg-white rounded-t-3xl max-h-[90%]'>
            {/* Modal Header */}
            <View className='flex-row justify-between items-center p-4 border-b border-gray-200'>
              <Text className='text-xl font-bold'>Merge Schedules</Text>
              <TouchableOpacity onPress={() => setShowMergeModal(false)}>
                <X size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView className='p-4'>
              {/* Conflict View */}
              {conflicts && conflicts.length > 0 ? (
                <View>
                  <View className='flex-row items-center mb-4'>
                    <AlertTriangle size={24} color="#f59e0b" />
                    <Text className='text-lg font-semibold ml-2 text-amber-600'>
                      {conflicts.length} Time Conflict{conflicts.length > 1 ? 's' : ''} Found
                    </Text>
                  </View>

                  {/* Conflict List */}
                  <View className='mb-4'>
                    {conflicts.slice(0, 3).map((conflict, index) => (
                      <View key={index} className='bg-amber-50 rounded-lg p-3 mb-2 border border-amber-200'>
                        <Text className='font-semibold text-amber-800 mb-1'>
                          {formatConflictTime(conflict)} - {conflict.overlap_minutes} min overlap
                        </Text>
                        <View className='flex-row justify-between'>
                          <View className='flex-1 mr-2'>
                            <Text className='text-xs text-gray-500'>Course 1:</Text>
                            <Text className='text-sm font-medium'>{conflict.course1.subject_code}</Text>
                            <Text className='text-xs text-gray-600'>
                              {conflict.course1.start_time} - {conflict.course1.end_time}
                            </Text>
                          </View>
                          <View className='flex-1 ml-2'>
                            <Text className='text-xs text-gray-500'>Course 2:</Text>
                            <Text className='text-sm font-medium'>{conflict.course2.subject_code}</Text>
                            <Text className='text-xs text-gray-600'>
                              {conflict.course2.start_time} - {conflict.course2.end_time}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                    {conflicts.length > 3 && (
                      <Text className='text-gray-500 text-center'>
                        +{conflicts.length - 3} more conflicts
                      </Text>
                    )}
                  </View>

                  <Text className='text-gray-700 font-medium mb-3'>How would you like to resolve these conflicts?</Text>

                  {/* Resolution Options */}
                  <TouchableOpacity
                    className='bg-blue-500 rounded-lg p-4 mb-2'
                    onPress={() => handleConflictResolution('keep_both')}
                    disabled={isMerging}
                  >
                    <Text className='text-white font-semibold'>Keep Both (Allow Overlaps)</Text>
                    <Text className='text-blue-100 text-sm'>Include all courses, even if they overlap</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className='bg-green-500 rounded-lg p-4 mb-2'
                    onPress={() => handleConflictResolution('keep_first')}
                    disabled={isMerging}
                  >
                    <Text className='text-white font-semibold'>Prioritize First Schedule</Text>
                    <Text className='text-green-100 text-sm'>Keep first schedule's courses, add non-conflicting from others</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className='bg-purple-500 rounded-lg p-4 mb-2'
                    onPress={() => handleConflictResolution('keep_second')}
                    disabled={isMerging}
                  >
                    <Text className='text-white font-semibold'>Prioritize Second Schedule</Text>
                    <Text className='text-purple-100 text-sm'>Keep second schedule's courses, add non-conflicting from others</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className='bg-red-500 rounded-lg p-4 mb-4'
                    onPress={() => handleConflictResolution('skip_conflicts')}
                    disabled={isMerging}
                  >
                    <Text className='text-white font-semibold'>Skip All Conflicts</Text>
                    <Text className='text-red-100 text-sm'>Only include courses that don't have any conflicts</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className='border border-gray-300 rounded-lg p-3'
                    onPress={() => setConflicts(null)}
                  >
                    <Text className='text-gray-600 text-center'>← Back to Selection</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Schedule Selection View */
                <View>
                  {/* Title Input */}
                  <View className='mb-4'>
                    <Text className='text-gray-700 font-medium mb-2'>Merged Schedule Title</Text>
                    <TextInput
                      className='border border-gray-300 rounded-lg p-3 text-base'
                      placeholder='e.g., Combined 1st Semester'
                      value={mergeTitle}
                      onChangeText={setMergeTitle}
                    />
                  </View>

                  {/* Schedule Selection */}
                  <View className='mb-4'>
                    <Text className='text-gray-700 font-medium mb-2'>Select Schedules to Merge</Text>
                    
                    {isLoading ? (
                      <ActivityIndicator size="large" color="#990100" />
                    ) : allSchedules.length === 0 ? (
                      <Text className='text-gray-500 text-center py-4'>No schedules found. Upload some schedules first.</Text>
                    ) : (
                      allSchedules.map((schedule) => (
                        <TouchableOpacity
                          key={schedule.id}
                          className={`flex-row items-center p-4 rounded-lg mb-2 border-2 ${
                            selectedSchedules.includes(schedule.id)
                              ? 'border-primary-900 bg-red-50'
                              : 'border-gray-200 bg-white'
                          }`}
                          onPress={() => toggleScheduleSelection(schedule.id)}
                        >
                          <View className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                            selectedSchedules.includes(schedule.id)
                              ? 'border-primary-900 bg-primary-900'
                              : 'border-gray-300'
                          }`}>
                            {selectedSchedules.includes(schedule.id) && (
                              <Check size={16} color="#ffffff" />
                            )}
                          </View>
                          <View className='flex-1'>
                            <Text className='font-semibold text-base'>{schedule.title}</Text>
                            <Text className='text-gray-500 text-sm'>
                              {getScheduleTypeLabel(schedule.uploadType)} • {schedule.courses.length} courses
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>

                  {/* Merge Button */}
                  <TouchableOpacity
                    className={`rounded-lg p-4 ${
                      selectedSchedules.length >= 2 && mergeTitle.trim()
                        ? 'bg-primary-900'
                        : 'bg-gray-300'
                    }`}
                    onPress={checkForConflicts}
                    disabled={selectedSchedules.length < 2 || !mergeTitle.trim() || isMerging}
                  >
                    {isMerging ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text className='text-white text-center font-semibold text-lg'>
                        {selectedSchedules.length < 2 
                          ? 'Select at least 2 schedules'
                          : 'Check for Conflicts & Merge'
                        }
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default SchedulesScreen;