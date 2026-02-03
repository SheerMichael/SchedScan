import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Alert, Modal, ActivityIndicator, Dimensions } from 'react-native';
import { router, useFocusEffect } from "expo-router";
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { FolderClosed, ChevronRight, Merge, X, AlertTriangle, Check, Calendar, Users, GraduationCap, ChevronDown, ChevronUp, Eye, Info } from "lucide-react-native";
import { useAuth } from '../../context/AuthContext';
import { 
  scheduleStorageService, 
  SavedSchedule, 
  MergeConflictsResponse, 
  ScheduleConflict,
  ConflictResolution,
  ConflictChoice
} from '../../services/scheduleStorageService';

// Per-conflict choice type
type PerConflictChoice = 'keep_course1' | 'keep_course2' | 'keep_both' | 'skip_both';

// Conflict resolution step
type MergeStep = 'select' | 'review_conflicts' | 'per_conflict' | 'preview';

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
  
  // New state for improved UX
  const [mergeStep, setMergeStep] = useState<MergeStep>('select');
  const [perConflictChoices, setPerConflictChoices] = useState<Record<string, PerConflictChoice>>({});
  const [expandedConflicts, setExpandedConflicts] = useState<Set<string>>(new Set());
  const [showQuickActions, setShowQuickActions] = useState(false);
  
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
    setMergeStep('select');
    setPerConflictChoices({});
    setExpandedConflicts(new Set());
    setShowQuickActions(false);
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
    // Reset conflicts and step when selection changes
    setConflicts(null);
    setMergeStep('select');
    setPerConflictChoices({});
  };

  const toggleConflictExpanded = (conflictId: string) => {
    setExpandedConflicts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(conflictId)) {
        newSet.delete(conflictId);
      } else {
        newSet.add(conflictId);
      }
      return newSet;
    });
  };

  const setConflictChoice = (conflictId: string, choice: PerConflictChoice) => {
    setPerConflictChoices(prev => ({
      ...prev,
      [conflictId]: choice
    }));
  };

  const applyQuickAction = (action: 'all_faculty' | 'all_student' | 'all_both' | 'all_skip') => {
    if (!conflicts) return;
    
    const newChoices: Record<string, PerConflictChoice> = {};
    conflicts.forEach(conflict => {
      const isCourse1Faculty = conflict.course1.source_type === 'faculty';
      switch (action) {
        case 'all_faculty':
          newChoices[conflict.id] = isCourse1Faculty ? 'keep_course1' : 'keep_course2';
          break;
        case 'all_student':
          newChoices[conflict.id] = isCourse1Faculty ? 'keep_course2' : 'keep_course1';
          break;
        case 'all_both':
          newChoices[conflict.id] = 'keep_both';
          break;
        case 'all_skip':
          newChoices[conflict.id] = 'skip_both';
          break;
      }
    });
    setPerConflictChoices(newChoices);
    setShowQuickActions(false);
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
        // Initialize all choices to 'keep_both' by default
        const initialChoices: Record<string, PerConflictChoice> = {};
        result.conflicts.forEach(conflict => {
          initialChoices[conflict.id] = 'keep_both';
        });
        setPerConflictChoices(initialChoices);
        setMergeStep('review_conflicts');
      } else {
        // No conflicts, proceed with merge
        await performMerge('keep_both');
      }
    } catch (error: any) {
      console.error('Error checking conflicts:', error);
      Alert.alert('Error', 'Failed to check for conflicts. Please try again.');
    } finally {
      setIsMerging(false);
    }
  };

  const performMerge = async (resolution?: ConflictResolution, choices?: ConflictChoice[]) => {
    try {
      setIsMerging(true);
      const result = await scheduleStorageService.mergeSchedules(
        selectedSchedules,
        mergeTitle.trim(),
        resolution,
        choices
      );

      // Check if it's a conflict response
      if ('has_conflicts' in result && result.has_conflicts) {
        setConflicts(result.conflicts);
        setMergeStep('review_conflicts');
        return;
      }

      // Success - it's a SavedSchedule
      setShowMergeModal(false);
      setConflicts(null);
      setPreviewConflicts(null);
      setMergeStep('select');
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

  const handleQuickResolution = (resolution: ConflictResolution) => {
    performMerge(resolution);
  };

  const handlePerConflictMerge = () => {
    if (!conflicts) return;
    
    // Check if all conflicts have a choice
    const unresolved = conflicts.filter(c => !perConflictChoices[c.id]);
    if (unresolved.length > 0) {
      Alert.alert(
        'Incomplete',
        `Please make a choice for all ${unresolved.length} remaining conflict(s).`
      );
      return;
    }

    // Convert choices to API format (using snake_case for conflict_id)
    const choices: ConflictChoice[] = Object.entries(perConflictChoices).map(([conflictId, choice]) => ({
      conflict_id: conflictId,
      choice
    }));

    performMerge('per_conflict', choices);
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

  const formatTimeRange = (start: string, end: string) => {
    return `${start} - ${end}`;
  };

  const getChoiceLabel = (choice: PerConflictChoice, conflict: ScheduleConflict): string => {
    const c1Type = conflict.course1.source_type;
    const c2Type = conflict.course2.source_type;
    
    switch (choice) {
      case 'keep_course1':
        return c1Type === 'faculty' ? 'Keep Faculty' : 'Keep Student';
      case 'keep_course2':
        return c2Type === 'faculty' ? 'Keep Faculty' : 'Keep Student';
      case 'keep_both':
        return 'Keep Both';
      case 'skip_both':
        return 'Skip Both';
      default:
        return 'Choose...';
    }
  };

  const getResolvedCount = (): number => {
    if (!conflicts) return 0;
    return conflicts.filter(c => perConflictChoices[c.id]).length;
  };

  const getMergePreviewStats = () => {
    if (!conflicts) return { kept: 0, skipped: 0, overlapping: 0 };
    
    let kept = 0;
    let skipped = 0;
    let overlapping = 0;
    
    conflicts.forEach(conflict => {
      const choice = perConflictChoices[conflict.id] || 'keep_both';
      switch (choice) {
        case 'keep_both':
          kept += 2;
          overlapping += 2;
          break;
        case 'keep_course1':
        case 'keep_course2':
          kept += 1;
          skipped += 1;
          break;
        case 'skip_both':
          skipped += 2;
          break;
      }
    });
    
    return { kept, skipped, overlapping };
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
              {/* Step: Review Conflicts or Per-Conflict Resolution */}
              {(mergeStep === 'review_conflicts' || mergeStep === 'per_conflict') && conflicts && conflicts.length > 0 ? (
                <View>
                  {/* Header with conflict count and back button */}
                  <View className='flex-row items-center justify-between mb-4'>
                    <TouchableOpacity 
                      className='flex-row items-center'
                      onPress={() => {
                        setMergeStep('select');
                        setConflicts(null);
                      }}
                    >
                      <ChevronRight size={20} color="#666" style={{ transform: [{ rotate: '180deg' }] }} />
                      <Text className='text-gray-600 ml-1'>Back</Text>
                    </TouchableOpacity>
                    <View className='bg-amber-100 px-3 py-1 rounded-full'>
                      <Text className='text-amber-700 font-semibold'>
                        {conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Conflict explanation */}
                  <View className='bg-amber-50 p-4 rounded-xl border border-amber-200 mb-4'>
                    <View className='flex-row items-center mb-2'>
                      <AlertTriangle size={20} color="#f59e0b" />
                      <Text className='text-amber-800 font-semibold ml-2 text-lg'>
                        Time Conflicts Detected
                      </Text>
                    </View>
                    <Text className='text-amber-700 text-sm leading-5'>
                      Some courses in your schedules have overlapping times. Choose how you'd like to handle each conflict below.
                    </Text>
                  </View>

                  {/* Resolution Options Tabs */}
                  <View className='mb-4'>
                    <Text className='text-gray-700 font-semibold mb-3'>Resolution Method:</Text>
                    
                    <View className='flex-row mb-3'>
                      <TouchableOpacity
                        className={`flex-1 py-3 mr-2 rounded-xl border-2 ${
                          mergeStep === 'review_conflicts' 
                            ? 'bg-blue-50 border-blue-500' 
                            : 'bg-white border-gray-200'
                        }`}
                        onPress={() => setMergeStep('review_conflicts')}
                      >
                        <Text className={`text-center font-medium ${
                          mergeStep === 'review_conflicts' ? 'text-blue-700' : 'text-gray-600'
                        }`}>Quick Resolve</Text>
                        <Text className={`text-center text-xs mt-1 ${
                          mergeStep === 'review_conflicts' ? 'text-blue-500' : 'text-gray-400'
                        }`}>Same choice for all</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        className={`flex-1 py-3 ml-2 rounded-xl border-2 ${
                          mergeStep === 'per_conflict' 
                            ? 'bg-purple-50 border-purple-500' 
                            : 'bg-white border-gray-200'
                        }`}
                        onPress={() => setMergeStep('per_conflict')}
                      >
                        <Text className={`text-center font-medium ${
                          mergeStep === 'per_conflict' ? 'text-purple-700' : 'text-gray-600'
                        }`}>Custom Resolve</Text>
                        <Text className={`text-center text-xs mt-1 ${
                          mergeStep === 'per_conflict' ? 'text-purple-500' : 'text-gray-400'
                        }`}>Choose per conflict</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Quick Resolution Options */}
                  {mergeStep === 'review_conflicts' && (
                    <View className='mb-4'>
                      <TouchableOpacity
                        className='bg-blue-500 rounded-xl p-4 mb-3 flex-row items-center'
                        onPress={() => handleQuickResolution('keep_both')}
                        disabled={isMerging}
                      >
                        <View className='bg-blue-400 rounded-full p-2 mr-3'>
                          <Calendar size={20} color="#fff" />
                        </View>
                        <View className='flex-1'>
                          <Text className='text-white font-semibold'>Keep All Courses</Text>
                          <Text className='text-blue-100 text-sm'>Allow overlapping times in your calendar</Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        className='bg-orange-500 rounded-xl p-4 mb-3 flex-row items-center'
                        onPress={() => handleQuickResolution('keep_faculty')}
                        disabled={isMerging}
                      >
                        <View className='bg-orange-400 rounded-full p-2 mr-3'>
                          <Users size={20} color="#fff" />
                        </View>
                        <View className='flex-1'>
                          <Text className='text-white font-semibold'>Prioritize Teaching</Text>
                          <Text className='text-orange-100 text-sm'>Keep faculty courses, skip conflicting student ones</Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        className='bg-red-500 rounded-xl p-4 mb-3 flex-row items-center'
                        onPress={() => handleQuickResolution('keep_student')}
                        disabled={isMerging}
                      >
                        <View className='bg-red-400 rounded-full p-2 mr-3'>
                          <GraduationCap size={20} color="#fff" />
                        </View>
                        <View className='flex-1'>
                          <Text className='text-white font-semibold'>Prioritize Classes</Text>
                          <Text className='text-red-100 text-sm'>Keep student courses, skip conflicting faculty ones</Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        className='bg-gray-500 rounded-xl p-4 mb-3 flex-row items-center'
                        onPress={() => handleQuickResolution('skip_conflicts')}
                        disabled={isMerging}
                      >
                        <View className='bg-gray-400 rounded-full p-2 mr-3'>
                          <X size={20} color="#fff" />
                        </View>
                        <View className='flex-1'>
                          <Text className='text-white font-semibold'>Skip All Conflicting</Text>
                          <Text className='text-gray-200 text-sm'>Only include courses without conflicts</Text>
                        </View>
                      </TouchableOpacity>

                      {isMerging && (
                        <View className='flex-row items-center justify-center py-2'>
                          <ActivityIndicator size="small" color="#990100" />
                          <Text className='text-gray-600 ml-2'>Merging schedules...</Text>
                        </View>
                      )}

                      {/* Conflict Preview List */}
                      <View className='mt-4'>
                        <Text className='text-gray-700 font-medium mb-2'>Conflicts Overview:</Text>
                        {conflicts.slice(0, 3).map((conflict, index) => (
                          <View key={conflict.id} className='bg-gray-50 rounded-lg p-3 mb-2'>
                            <Text className='text-gray-700 text-sm font-medium'>
                              {formatConflictTime(conflict)} • {conflict.overlap_minutes}min overlap
                            </Text>
                            <View className='flex-row mt-2'>
                              <View className='flex-1 flex-row items-center'>
                                <View className={`w-2 h-2 rounded-full mr-2 ${
                                  conflict.course1.source_type === 'faculty' ? 'bg-orange-500' : 'bg-red-500'
                                }`} />
                                <Text className='text-gray-600 text-xs' numberOfLines={1}>
                                  {conflict.course1.subject_code}
                                </Text>
                              </View>
                              <Text className='text-gray-400 mx-2'>↔</Text>
                              <View className='flex-1 flex-row items-center justify-end'>
                                <Text className='text-gray-600 text-xs' numberOfLines={1}>
                                  {conflict.course2.subject_code}
                                </Text>
                                <View className={`w-2 h-2 rounded-full ml-2 ${
                                  conflict.course2.source_type === 'faculty' ? 'bg-orange-500' : 'bg-red-500'
                                }`} />
                              </View>
                            </View>
                          </View>
                        ))}
                        {conflicts.length > 3 && (
                          <Text className='text-gray-500 text-center text-sm'>
                            +{conflicts.length - 3} more...
                          </Text>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Per-Conflict Resolution */}
                  {mergeStep === 'per_conflict' && (
                    <View className='mb-4'>
                      {/* Progress indicator */}
                      <View className='bg-gray-100 rounded-xl p-3 mb-4 flex-row items-center justify-between'>
                        <Text className='text-gray-600'>
                          Resolved: <Text className='font-semibold'>{getResolvedCount()}/{conflicts.length}</Text>
                        </Text>
                        <TouchableOpacity 
                          className='bg-purple-100 px-3 py-1 rounded-lg'
                          onPress={() => setShowQuickActions(!showQuickActions)}
                        >
                          <Text className='text-purple-700 text-sm font-medium'>
                            {showQuickActions ? 'Hide' : 'Quick Actions'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Quick Actions Dropdown */}
                      {showQuickActions && (
                        <View className='bg-purple-50 rounded-xl p-3 mb-4 border border-purple-200'>
                          <Text className='text-purple-800 font-medium mb-2 text-sm'>Apply to all conflicts:</Text>
                          <View className='flex-row flex-wrap gap-2'>
                            <TouchableOpacity 
                              className='bg-orange-100 px-3 py-2 rounded-lg'
                              onPress={() => applyQuickAction('all_faculty')}
                            >
                              <Text className='text-orange-700 text-xs font-medium'>All Faculty</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              className='bg-red-100 px-3 py-2 rounded-lg'
                              onPress={() => applyQuickAction('all_student')}
                            >
                              <Text className='text-red-700 text-xs font-medium'>All Student</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              className='bg-blue-100 px-3 py-2 rounded-lg'
                              onPress={() => applyQuickAction('all_both')}
                            >
                              <Text className='text-blue-700 text-xs font-medium'>All Keep Both</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              className='bg-gray-200 px-3 py-2 rounded-lg'
                              onPress={() => applyQuickAction('all_skip')}
                            >
                              <Text className='text-gray-700 text-xs font-medium'>All Skip</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {/* Individual Conflict Cards */}
                      {conflicts.map((conflict, index) => {
                        const isExpanded = expandedConflicts.has(conflict.id);
                        const currentChoice = perConflictChoices[conflict.id];
                        const c1IsFaculty = conflict.course1.source_type === 'faculty';
                        
                        return (
                          <View key={conflict.id} className='bg-white rounded-xl border border-gray-200 mb-3 overflow-hidden'>
                            {/* Conflict Header - Clickable to expand */}
                            <TouchableOpacity 
                              className='p-4 flex-row items-center justify-between'
                              onPress={() => toggleConflictExpanded(conflict.id)}
                            >
                              <View className='flex-1'>
                                <View className='flex-row items-center mb-1'>
                                  <Text className='text-gray-800 font-semibold'>
                                    Conflict {index + 1}
                                  </Text>
                                  <View className='bg-gray-100 px-2 py-0.5 rounded-full ml-2'>
                                    <Text className='text-gray-500 text-xs'>{formatConflictTime(conflict)}</Text>
                                  </View>
                                  <View className='bg-amber-100 px-2 py-0.5 rounded-full ml-2'>
                                    <Text className='text-amber-600 text-xs'>{conflict.overlap_minutes}m</Text>
                                  </View>
                                </View>
                                <View className='flex-row items-center'>
                                  <View className={`w-2 h-2 rounded-full mr-1.5 ${c1IsFaculty ? 'bg-orange-500' : 'bg-red-500'}`} />
                                  <Text className='text-gray-600 text-sm' numberOfLines={1}>
                                    {conflict.course1.subject_code}
                                  </Text>
                                  <Text className='text-gray-400 mx-2'>vs</Text>
                                  <View className={`w-2 h-2 rounded-full mr-1.5 ${c1IsFaculty ? 'bg-red-500' : 'bg-orange-500'}`} />
                                  <Text className='text-gray-600 text-sm' numberOfLines={1}>
                                    {conflict.course2.subject_code}
                                  </Text>
                                </View>
                              </View>
                              <View className='flex-row items-center'>
                                {currentChoice && (
                                  <View className={`px-2 py-1 rounded-lg mr-2 ${
                                    currentChoice === 'keep_both' ? 'bg-blue-100' :
                                    currentChoice === 'skip_both' ? 'bg-gray-100' :
                                    currentChoice === 'keep_course1' && c1IsFaculty ? 'bg-orange-100' :
                                    currentChoice === 'keep_course2' && !c1IsFaculty ? 'bg-orange-100' :
                                    'bg-red-100'
                                  }`}>
                                    <Text className={`text-xs font-medium ${
                                      currentChoice === 'keep_both' ? 'text-blue-700' :
                                      currentChoice === 'skip_both' ? 'text-gray-600' :
                                      currentChoice === 'keep_course1' && c1IsFaculty ? 'text-orange-700' :
                                      currentChoice === 'keep_course2' && !c1IsFaculty ? 'text-orange-700' :
                                      'text-red-700'
                                    }`}>{getChoiceLabel(currentChoice, conflict)}</Text>
                                  </View>
                                )}
                                {isExpanded ? (
                                  <ChevronUp size={20} color="#9ca3af" />
                                ) : (
                                  <ChevronDown size={20} color="#9ca3af" />
                                )}
                              </View>
                            </TouchableOpacity>

                            {/* Expanded Details */}
                            {isExpanded && (
                              <View className='border-t border-gray-100'>
                                {/* Course Details Side by Side */}
                                <View className='flex-row p-4'>
                                  {/* Course 1 */}
                                  <View className={`flex-1 p-3 rounded-xl mr-2 border-l-4 ${
                                    c1IsFaculty ? 'bg-orange-50 border-orange-500' : 'bg-red-50 border-red-500'
                                  }`}>
                                    <View className='flex-row items-center mb-2'>
                                      {c1IsFaculty ? (
                                        <Users size={14} color="#f97316" />
                                      ) : (
                                        <GraduationCap size={14} color="#dc2626" />
                                      )}
                                      <Text className={`text-xs font-medium ml-1 ${
                                        c1IsFaculty ? 'text-orange-600' : 'text-red-600'
                                      }`}>
                                        {c1IsFaculty ? 'Teaching' : 'Attending'}
                                      </Text>
                                    </View>
                                    <Text className='text-gray-800 font-semibold text-sm'>
                                      {conflict.course1.subject_code}
                                    </Text>
                                    <Text className='text-gray-600 text-xs mt-1' numberOfLines={1}>
                                      {conflict.course1.subject_name}
                                    </Text>
                                    <Text className='text-gray-500 text-xs mt-1'>
                                      {formatTimeRange(conflict.course1.start_time, conflict.course1.end_time)}
                                    </Text>
                                    <Text className='text-gray-400 text-xs mt-0.5'>
                                      {conflict.course1.location}
                                    </Text>
                                  </View>

                                  {/* Course 2 */}
                                  <View className={`flex-1 p-3 rounded-xl ml-2 border-l-4 ${
                                    !c1IsFaculty ? 'bg-orange-50 border-orange-500' : 'bg-red-50 border-red-500'
                                  }`}>
                                    <View className='flex-row items-center mb-2'>
                                      {!c1IsFaculty ? (
                                        <Users size={14} color="#f97316" />
                                      ) : (
                                        <GraduationCap size={14} color="#dc2626" />
                                      )}
                                      <Text className={`text-xs font-medium ml-1 ${
                                        !c1IsFaculty ? 'text-orange-600' : 'text-red-600'
                                      }`}>
                                        {!c1IsFaculty ? 'Teaching' : 'Attending'}
                                      </Text>
                                    </View>
                                    <Text className='text-gray-800 font-semibold text-sm'>
                                      {conflict.course2.subject_code}
                                    </Text>
                                    <Text className='text-gray-600 text-xs mt-1' numberOfLines={1}>
                                      {conflict.course2.subject_name}
                                    </Text>
                                    <Text className='text-gray-500 text-xs mt-1'>
                                      {formatTimeRange(conflict.course2.start_time, conflict.course2.end_time)}
                                    </Text>
                                    <Text className='text-gray-400 text-xs mt-0.5'>
                                      {conflict.course2.location}
                                    </Text>
                                  </View>
                                </View>

                                {/* Choice Buttons */}
                                <View className='px-4 pb-4'>
                                  <Text className='text-gray-600 text-xs mb-2 font-medium'>Choose action:</Text>
                                  <View className='flex-row flex-wrap gap-2'>
                                    <TouchableOpacity
                                      className={`px-3 py-2 rounded-lg border ${
                                        currentChoice === 'keep_course1'
                                          ? c1IsFaculty ? 'bg-orange-500 border-orange-500' : 'bg-red-500 border-red-500'
                                          : 'bg-white border-gray-300'
                                      }`}
                                      onPress={() => setConflictChoice(conflict.id, 'keep_course1')}
                                    >
                                      <Text className={`text-xs font-medium ${
                                        currentChoice === 'keep_course1' ? 'text-white' : 'text-gray-700'
                                      }`}>
                                        Keep {c1IsFaculty ? 'Teaching' : 'Class'}
                                      </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                      className={`px-3 py-2 rounded-lg border ${
                                        currentChoice === 'keep_course2'
                                          ? !c1IsFaculty ? 'bg-orange-500 border-orange-500' : 'bg-red-500 border-red-500'
                                          : 'bg-white border-gray-300'
                                      }`}
                                      onPress={() => setConflictChoice(conflict.id, 'keep_course2')}
                                    >
                                      <Text className={`text-xs font-medium ${
                                        currentChoice === 'keep_course2' ? 'text-white' : 'text-gray-700'
                                      }`}>
                                        Keep {!c1IsFaculty ? 'Teaching' : 'Class'}
                                      </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                      className={`px-3 py-2 rounded-lg border ${
                                        currentChoice === 'keep_both'
                                          ? 'bg-blue-500 border-blue-500'
                                          : 'bg-white border-gray-300'
                                      }`}
                                      onPress={() => setConflictChoice(conflict.id, 'keep_both')}
                                    >
                                      <Text className={`text-xs font-medium ${
                                        currentChoice === 'keep_both' ? 'text-white' : 'text-gray-700'
                                      }`}>
                                        Keep Both
                                      </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                      className={`px-3 py-2 rounded-lg border ${
                                        currentChoice === 'skip_both'
                                          ? 'bg-gray-500 border-gray-500'
                                          : 'bg-white border-gray-300'
                                      }`}
                                      onPress={() => setConflictChoice(conflict.id, 'skip_both')}
                                    >
                                      <Text className={`text-xs font-medium ${
                                        currentChoice === 'skip_both' ? 'text-white' : 'text-gray-700'
                                      }`}>
                                        Skip Both
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}

                      {/* Summary and Merge Button */}
                      <View className='bg-purple-50 rounded-xl p-4 mt-2 border border-purple-200'>
                        <View className='flex-row items-center justify-between mb-3'>
                          <Text className='text-purple-800 font-semibold'>Merge Preview</Text>
                          <View className='flex-row items-center'>
                            {getMergePreviewStats().overlapping > 0 && (
                              <View className='bg-amber-100 px-2 py-0.5 rounded-full mr-2'>
                                <Text className='text-amber-700 text-xs'>
                                  {getMergePreviewStats().overlapping} overlapping
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <View className='flex-row justify-around mb-3'>
                          <View className='items-center'>
                            <Text className='text-2xl font-bold text-green-600'>
                              {getMergePreviewStats().kept}
                            </Text>
                            <Text className='text-gray-500 text-xs'>Courses Kept</Text>
                          </View>
                          <View className='items-center'>
                            <Text className='text-2xl font-bold text-gray-400'>
                              {getMergePreviewStats().skipped}
                            </Text>
                            <Text className='text-gray-500 text-xs'>Courses Skipped</Text>
                          </View>
                        </View>
                      </View>

                      <TouchableOpacity
                        className={`rounded-xl p-4 mt-4 ${
                          getResolvedCount() === conflicts.length
                            ? 'bg-purple-600'
                            : 'bg-gray-300'
                        }`}
                        onPress={handlePerConflictMerge}
                        disabled={getResolvedCount() !== conflicts.length || isMerging}
                      >
                        {isMerging ? (
                          <View className='flex-row items-center justify-center'>
                            <ActivityIndicator color="#ffffff" />
                            <Text className='text-white font-semibold text-lg ml-2'>Merging...</Text>
                          </View>
                        ) : (
                          <View className='flex-row items-center justify-center'>
                            <Merge size={22} color="#ffffff" />
                            <Text className='text-white font-semibold text-lg ml-2'>
                              {getResolvedCount() === conflicts.length
                                ? 'Complete Merge'
                                : `Resolve ${conflicts.length - getResolvedCount()} More`
                              }
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
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