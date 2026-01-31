import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Alert, Modal, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from "expo-router";
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { FolderClosed, ChevronRight, Merge, X, AlertTriangle, Check, Calendar, Users, GraduationCap } from "lucide-react-native";
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
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [previewConflicts, setPreviewConflicts] = useState<ScheduleConflict[] | null>(null);
  
  // Debounce timer for conflict checking
  const conflictCheckTimer = useRef<NodeJS.Timeout | null>(null);

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

  // Auto-check conflicts when 2+ schedules selected
  useEffect(() => {
    if (selectedSchedules.length >= 2) {
      // Clear previous timer
      if (conflictCheckTimer.current) {
        clearTimeout(conflictCheckTimer.current);
      }
      
      // Debounce conflict check
      conflictCheckTimer.current = setTimeout(async () => {
        setIsCheckingConflicts(true);
        try {
          const result = await scheduleStorageService.checkMergeConflicts(selectedSchedules);
          if (result && result.has_conflicts) {
            setPreviewConflicts(result.conflicts);
          } else {
            setPreviewConflicts(null);
          }
        } catch (error) {
          console.error('Error checking conflicts:', error);
          setPreviewConflicts(null);
        } finally {
          setIsCheckingConflicts(false);
        }
      }, 500);
    } else {
      setPreviewConflicts(null);
    }
    
    return () => {
      if (conflictCheckTimer.current) {
        clearTimeout(conflictCheckTimer.current);
      }
    };
  }, [selectedSchedules]);

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
    setPreviewConflicts(null);
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
    // Reset main conflicts when selection changes
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
      setPreviewConflicts(null);
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
    if (uploadType === 'faculty') return 'Faculty';
    if (uploadType === 'merged') return 'Merged';
    return 'Student';
  };

  const getScheduleTypeIcon = (uploadType: string) => {
    if (uploadType === 'faculty') {
      return <Users size={20} color="#f97316" />;
    }
    return <GraduationCap size={20} color="#dc2626" />;
  };

  const getScheduleTypeColor = (uploadType: string) => {
    return uploadType === 'faculty' ? '#f97316' : '#dc2626'; // orange for faculty, red for student
  };

  const formatConflictTime = (conflict: ScheduleConflict) => {
    const dayNames: Record<string, string> = {
      'M': 'Monday', 'T': 'Tuesday', 'W': 'Wednesday',
      'TH': 'Thursday', 'F': 'Friday', 'S': 'Saturday'
    };
    return dayNames[conflict.day] || conflict.day;
  };

  // Get counts for selected schedules
  const getSelectedScheduleStats = () => {
    const selected = allSchedules.filter(s => selectedSchedules.includes(s.id));
    const facultyCount = selected.filter(s => s.uploadType === 'faculty').reduce((sum, s) => sum + s.courses.length, 0);
    const studentCount = selected.filter(s => s.uploadType === 'student').reduce((sum, s) => sum + s.courses.length, 0);
    return { facultyCount, studentCount, total: facultyCount + studentCount };
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
            <TouchableOpacity className='flex-row justify-between items-center bg-orange-500 w-11/12 rounded-xl h-20' onPress={() => router.push('/Home/Schedules/faculty')}>
                <View className='flex-row justify-evenly items-center ml-4'>
                    <FolderClosed size={40} color="#ffffff" fill="#ffffff" stroke="#c2410c"/>
                    <Text className='text-white text-2xl font-semibold ml-2'>Faculty</Text>
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
                    <Text className='text-white text-2xl font-semibold ml-2'>Student</Text>
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
                    <Text className='text-white text-2xl font-semibold ml-2'>Merged</Text>
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

          {/* Color Legend */}
          <View className='px-6 pt-4'>
            <View className='flex-row justify-center items-center gap-6 mb-2'>
              <View className='flex-row items-center'>
                <View className='w-4 h-4 rounded-full bg-orange-500 mr-2' />
                <Text className='text-gray-600 text-sm'>Faculty</Text>
              </View>
              <View className='flex-row items-center'>
                <View className='w-4 h-4 rounded-full bg-red-600 mr-2' />
                <Text className='text-gray-600 text-sm'>Student</Text>
              </View>
            </View>
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
                  <View className='flex-row items-center mb-4 bg-amber-50 p-3 rounded-lg'>
                    <AlertTriangle size={24} color="#f59e0b" />
                    <Text className='text-lg font-semibold ml-2 text-amber-700'>
                      {conflicts.length} Time Conflict{conflicts.length > 1 ? 's' : ''} Found
                    </Text>
                  </View>

                  {/* Conflict List */}
                  <View className='mb-4'>
                    {conflicts.slice(0, 3).map((conflict, index) => (
                      <View key={index} className='bg-amber-50 rounded-lg p-3 mb-2 border border-amber-200'>
                        <Text className='font-semibold text-amber-800 mb-2'>
                          {formatConflictTime(conflict)} • {conflict.overlap_minutes} min overlap
                        </Text>
                        <View className='flex-row justify-between'>
                          <View className='flex-1 mr-2 bg-white p-2 rounded-lg border-l-4 border-orange-500'>
                            <Text className='text-xs text-orange-600 font-medium mb-1'>Faculty Course</Text>
                            <Text className='text-sm font-semibold'>{conflict.course1.subject_code}</Text>
                            <Text className='text-xs text-gray-600'>
                              {conflict.course1.start_time} - {conflict.course1.end_time}
                            </Text>
                          </View>
                          <View className='flex-1 ml-2 bg-white p-2 rounded-lg border-l-4 border-red-500'>
                            <Text className='text-xs text-red-600 font-medium mb-1'>Student Course</Text>
                            <Text className='text-sm font-semibold'>{conflict.course2.subject_code}</Text>
                            <Text className='text-xs text-gray-600'>
                              {conflict.course2.start_time} - {conflict.course2.end_time}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                    {conflicts.length > 3 && (
                      <Text className='text-gray-500 text-center py-2'>
                        +{conflicts.length - 3} more conflict{conflicts.length - 3 > 1 ? 's' : ''}
                      </Text>
                    )}
                  </View>

                  <Text className='text-gray-700 font-medium mb-3'>How would you like to resolve these conflicts?</Text>

                  {/* Resolution Options */}
                  <TouchableOpacity
                    className='bg-blue-500 rounded-xl p-4 mb-3 flex-row items-center'
                    onPress={() => handleConflictResolution('keep_both')}
                    disabled={isMerging}
                  >
                    <View className='bg-blue-400 rounded-full p-2 mr-3'>
                      <Calendar size={20} color="#fff" />
                    </View>
                    <View className='flex-1'>
                      <Text className='text-white font-semibold'>Keep Both (Allow Overlaps)</Text>
                      <Text className='text-blue-100 text-sm'>Include all courses, even if they overlap</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className='bg-orange-500 rounded-xl p-4 mb-3 flex-row items-center'
                    onPress={() => handleConflictResolution('keep_first')}
                    disabled={isMerging}
                  >
                    <View className='bg-orange-400 rounded-full p-2 mr-3'>
                      <Users size={20} color="#fff" />
                    </View>
                    <View className='flex-1'>
                      <Text className='text-white font-semibold'>Prioritize Faculty Schedule</Text>
                      <Text className='text-orange-100 text-sm'>Keep faculty courses, add non-conflicting student courses</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className='bg-red-500 rounded-xl p-4 mb-3 flex-row items-center'
                    onPress={() => handleConflictResolution('keep_second')}
                    disabled={isMerging}
                  >
                    <View className='bg-red-400 rounded-full p-2 mr-3'>
                      <GraduationCap size={20} color="#fff" />
                    </View>
                    <View className='flex-1'>
                      <Text className='text-white font-semibold'>Prioritize Student Schedule</Text>
                      <Text className='text-red-100 text-sm'>Keep student courses, add non-conflicting faculty courses</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className='bg-gray-500 rounded-xl p-4 mb-4 flex-row items-center'
                    onPress={() => handleConflictResolution('skip_conflicts')}
                    disabled={isMerging}
                  >
                    <View className='bg-gray-400 rounded-full p-2 mr-3'>
                      <X size={20} color="#fff" />
                    </View>
                    <View className='flex-1'>
                      <Text className='text-white font-semibold'>Skip All Conflicts</Text>
                      <Text className='text-gray-200 text-sm'>Only include courses that don't have any conflicts</Text>
                    </View>
                  </TouchableOpacity>

                  {isMerging && (
                    <View className='flex-row items-center justify-center py-2'>
                      <ActivityIndicator size="small" color="#990100" />
                      <Text className='text-gray-600 ml-2'>Merging schedules...</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    className='border border-gray-300 rounded-xl p-3 mt-2'
                    onPress={() => setConflicts(null)}
                  >
                    <Text className='text-gray-600 text-center font-medium'>← Back to Selection</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Schedule Selection View */
                <View>
                  {/* Title Input */}
                  <View className='mb-4'>
                    <Text className='text-gray-700 font-medium mb-2'>Merged Schedule Title</Text>
                    <TextInput
                      className='border border-gray-300 rounded-xl p-4 text-base bg-gray-50'
                      placeholder='e.g., Combined 1st Semester'
                      value={mergeTitle}
                      onChangeText={setMergeTitle}
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  {/* Color Legend in Modal */}
                  <View className='flex-row justify-center items-center gap-6 mb-4 py-2 bg-gray-50 rounded-lg'>
                    <View className='flex-row items-center'>
                      <View className='w-3 h-3 rounded-full bg-orange-500 mr-2' />
                      <Text className='text-gray-600 text-sm'>Faculty</Text>
                    </View>
                    <View className='flex-row items-center'>
                      <View className='w-3 h-3 rounded-full bg-red-600 mr-2' />
                      <Text className='text-gray-600 text-sm'>Student</Text>
                    </View>
                  </View>

                  {/* Schedule Selection */}
                  <View className='mb-4'>
                    <Text className='text-gray-700 font-medium mb-2'>Select Schedules to Merge</Text>
                    
                    {isLoading ? (
                      <ActivityIndicator size="large" color="#990100" />
                    ) : allSchedules.filter(s => s.uploadType !== 'merged').length === 0 ? (
                      <Text className='text-gray-500 text-center py-4'>No schedules found. Upload some schedules first.</Text>
                    ) : (
                      allSchedules.filter(s => s.uploadType !== 'merged').map((schedule) => {
                        const isSelected = selectedSchedules.includes(schedule.id);
                        const typeColor = getScheduleTypeColor(schedule.uploadType);
                        
                        return (
                          <TouchableOpacity
                            key={schedule.id}
                            className={`flex-row items-center p-4 rounded-xl mb-3 border-2 ${
                              isSelected
                                ? 'bg-gray-50'
                                : 'border-gray-200 bg-white'
                            }`}
                            style={isSelected ? { borderColor: typeColor } : {}}
                            onPress={() => toggleScheduleSelection(schedule.id)}
                          >
                            <View 
                              className={`w-7 h-7 rounded-full border-2 mr-3 items-center justify-center`}
                              style={{ 
                                borderColor: isSelected ? typeColor : '#d1d5db',
                                backgroundColor: isSelected ? typeColor : 'transparent'
                              }}
                            >
                              {isSelected && (
                                <Check size={18} color="#ffffff" />
                              )}
                            </View>
                            <View 
                              className='w-1 h-12 rounded-full mr-3'
                              style={{ backgroundColor: typeColor }}
                            />
                            <View className='flex-1'>
                              <View className='flex-row items-center'>
                                {getScheduleTypeIcon(schedule.uploadType)}
                                <Text className='font-semibold text-base ml-2'>{schedule.title}</Text>
                              </View>
                              <Text className='text-gray-500 text-sm mt-1'>
                                {getScheduleTypeLabel(schedule.uploadType)} • {schedule.courses.length} courses
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>

                  {/* Selection Stats */}
                  {selectedSchedules.length >= 2 && (
                    <View className='bg-gray-50 rounded-xl p-4 mb-4'>
                      <Text className='font-medium text-gray-700 mb-2'>Selection Summary</Text>
                      <View className='flex-row justify-around'>
                        <View className='items-center'>
                          <View className='flex-row items-center'>
                            <View className='w-3 h-3 rounded-full bg-orange-500 mr-2' />
                            <Text className='text-2xl font-bold text-orange-500'>
                              {getSelectedScheduleStats().facultyCount}
                            </Text>
                          </View>
                          <Text className='text-gray-500 text-xs'>Faculty Courses</Text>
                        </View>
                        <View className='items-center'>
                          <View className='flex-row items-center'>
                            <View className='w-3 h-3 rounded-full bg-red-600 mr-2' />
                            <Text className='text-2xl font-bold text-red-600'>
                              {getSelectedScheduleStats().studentCount}
                            </Text>
                          </View>
                          <Text className='text-gray-500 text-xs'>Student Courses</Text>
                        </View>
                        <View className='items-center'>
                          <Text className='text-2xl font-bold text-gray-700'>
                            {getSelectedScheduleStats().total}
                          </Text>
                          <Text className='text-gray-500 text-xs'>Total Courses</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Conflict Preview */}
                  {selectedSchedules.length >= 2 && (
                    <View className='mb-4'>
                      {isCheckingConflicts ? (
                        <View className='flex-row items-center justify-center py-3 bg-gray-50 rounded-xl'>
                          <ActivityIndicator size="small" color="#6b7280" />
                          <Text className='text-gray-500 ml-2'>Checking for conflicts...</Text>
                        </View>
                      ) : previewConflicts && previewConflicts.length > 0 ? (
                        <View className='bg-amber-50 rounded-xl p-4 border border-amber-200'>
                          <View className='flex-row items-center mb-2'>
                            <AlertTriangle size={20} color="#f59e0b" />
                            <Text className='text-amber-700 font-semibold ml-2'>
                              {previewConflicts.length} Conflict{previewConflicts.length > 1 ? 's' : ''} Detected
                            </Text>
                          </View>
                          <Text className='text-amber-600 text-sm'>
                            You'll be asked how to resolve these when merging.
                          </Text>
                          <View className='mt-2'>
                            {previewConflicts.slice(0, 2).map((conflict, idx) => (
                              <Text key={idx} className='text-amber-700 text-xs'>
                                • {conflict.course1.subject_code} ↔ {conflict.course2.subject_code} on {formatConflictTime(conflict)}
                              </Text>
                            ))}
                            {previewConflicts.length > 2 && (
                              <Text className='text-amber-600 text-xs mt-1'>
                                +{previewConflicts.length - 2} more...
                              </Text>
                            )}
                          </View>
                        </View>
                      ) : (
                        <View className='bg-green-50 rounded-xl p-4 border border-green-200'>
                          <View className='flex-row items-center'>
                            <Check size={20} color="#22c55e" />
                            <Text className='text-green-700 font-semibold ml-2'>
                              No Conflicts Detected
                            </Text>
                          </View>
                          <Text className='text-green-600 text-sm mt-1'>
                            These schedules can be merged without any time overlaps!
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Merge Button */}
                  <TouchableOpacity
                    className={`rounded-xl p-4 ${
                      selectedSchedules.length >= 2 && mergeTitle.trim()
                        ? 'bg-green-600'
                        : 'bg-gray-300'
                    }`}
                    onPress={checkForConflicts}
                    disabled={selectedSchedules.length < 2 || !mergeTitle.trim() || isMerging}
                  >
                    {isMerging ? (
                      <View className='flex-row items-center justify-center'>
                        <ActivityIndicator color="#ffffff" />
                        <Text className='text-white font-semibold text-lg ml-2'>Processing...</Text>
                      </View>
                    ) : (
                      <View className='flex-row items-center justify-center'>
                        <Merge size={22} color="#ffffff" />
                        <Text className='text-white text-center font-semibold text-lg ml-2'>
                          {selectedSchedules.length < 2 
                            ? 'Select at least 2 schedules'
                            : !mergeTitle.trim()
                            ? 'Enter a title first'
                            : 'Merge Schedules'
                          }
                        </Text>
                      </View>
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