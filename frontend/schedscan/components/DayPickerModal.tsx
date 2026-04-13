import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, Dimensions } from 'react-native';
import { Course } from '../services/courseService';
import {
  DAY_PICKER_MULTI_OPTIONS,
  DAY_PICKER_SINGLE_OPTIONS,
  dayCodeToWeekdayNumbers,
  getReadableDayLabel,
} from '../utils/dayCode';
import { validateDayAssignment } from '../utils/dayAssignmentValidation';

const DAY_TOKEN_ORDER = ['M', 'T', 'W', 'TH', 'F', 'S'] as const;
type DayToken = typeof DAY_TOKEN_ORDER[number];

const DAY_NUMBER_TO_TOKEN: Record<number, DayToken> = {
  1: 'M',
  2: 'T',
  3: 'W',
  4: 'TH',
  5: 'F',
  6: 'S',
};

const tokenizeDayCode = (dayCode: string): DayToken[] => {
  if (!dayCode || dayCode.trim() === '') {
    return [];
  }

  const dayNumbers = dayCodeToWeekdayNumbers(dayCode);
  const dayTokens = dayNumbers
    .map((dayNumber) => DAY_NUMBER_TO_TOKEN[dayNumber])
    .filter(Boolean);

  return DAY_TOKEN_ORDER.filter((token) => dayTokens.includes(token));
};

const buildDayCodeFromTokens = (tokens: DayToken[]): string => {
  if (tokens.length === 0) {
    return '';
  }

  const ordered = DAY_TOKEN_ORDER.filter((token) => tokens.includes(token));
  return ordered.join('');
};

interface DayPickerModalProps {
  visible: boolean;
  course: Course | null;
  courseIndex?: number | null;
  coursesContext?: Course[];
  onDismiss: () => void;
  onConfirm: (course: Course, selectedDay: string) => Promise<boolean> | boolean;
  isSubmitting?: boolean;
}

const DayPickerModal: React.FC<DayPickerModalProps> = ({
  visible,
  course,
  courseIndex = null,
  coursesContext = [],
  onDismiss,
  onConfirm,
  isSubmitting = false,
}) => {
  const [selectedDayTokens, setSelectedDayTokens] = useState<DayToken[]>([]);
  const sheetMaxHeight = Dimensions.get('window').height * 0.82;
  const selectedDayCode = useMemo(
    () => buildDayCodeFromTokens(selectedDayTokens),
    [selectedDayTokens],
  );

  useEffect(() => {
    if (visible) {
      setSelectedDayTokens(tokenizeDayCode(course?.day?.trim() || ''));
    }
  }, [visible, course]);

  const toggleDayToken = (token: DayToken) => {
    setSelectedDayTokens((previous) => {
      if (previous.includes(token)) {
        return previous.filter((value) => value !== token);
      }
      return DAY_TOKEN_ORDER.filter((value) => [...previous, token].includes(value));
    });
  };

  const applyPreset = (dayCode: string) => {
    setSelectedDayTokens(tokenizeDayCode(dayCode));
  };

  const clearSelection = () => {
    setSelectedDayTokens([]);
  };

  const assignmentValidation = useMemo(() => {
    if (!selectedDayCode || !course || courseIndex === null || !Array.isArray(coursesContext) || coursesContext.length === 0) {
      return null;
    }

    return validateDayAssignment(coursesContext, courseIndex, selectedDayCode);
  }, [selectedDayCode, course, courseIndex, coursesContext]);

  const hasValidationError = Boolean(assignmentValidation && !assignmentValidation.isValid);
  const hasConflicts = Boolean(assignmentValidation && assignmentValidation.conflicts.length > 0);
  const disableAssign = !selectedDayCode || isSubmitting || hasValidationError || hasConflicts;

  const handleConfirm = async () => {
    if (!course || !selectedDayCode || isSubmitting) {
      return;
    }

    await onConfirm(course, selectedDayCode);
  };

  const handleDismiss = () => {
    if (isSubmitting) {
      return;
    }
    setSelectedDayTokens([]);
    onDismiss();
  };

  if (!course) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable
        className="flex-1 bg-black/50 justify-end"
        onPress={handleDismiss}
      >
        <Pressable
          className="bg-white rounded-t-3xl"
          onPress={() => {}}
          style={{ maxHeight: sheetMaxHeight }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }}
          >
          {/* Header */}
          <View className="items-center mb-4">
            <View className="w-10 h-1 bg-gray-300 rounded-full mb-4" />
            <Text className="text-2xl font-bold text-gray-900">Assign Days</Text>
            <Text className="text-sm text-gray-500 mt-1 text-center">
              Choose when{' '}
              <Text className="font-semibold text-gray-800">{course.subject_code}</Text>
              {' '}({course.start_time} – {course.end_time}) occurs
            </Text>
            {selectedDayCode ? (
              <View className="mt-3 px-3 py-1 rounded-full bg-red-100">
                <Text className="text-xs font-semibold text-red-700">
                  Selected: {getReadableDayLabel(selectedDayCode)}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
            <Text className="text-xs text-gray-700">
              Tap one or more days to build a custom schedule pattern.
            </Text>
          </View>

          {selectedDayCode && assignmentValidation ? (
            <View
              className={`mb-4 rounded-xl px-3 py-3 border ${
                hasValidationError
                  ? 'bg-red-50 border-red-200'
                  : hasConflicts
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              {hasValidationError ? (
                <Text className="text-xs font-semibold text-red-700">
                  {assignmentValidation.validationError}
                </Text>
              ) : hasConflicts ? (
                <>
                  <Text className="text-xs font-semibold text-amber-800 mb-1">
                    Schedule conflict detected
                  </Text>
                  {assignmentValidation.conflicts.slice(0, 2).map((conflict, index) => (
                    <Text key={`${conflict.conflictingCourse.subject_code}-${index}`} className="text-[11px] text-amber-700">
                      {conflict.conflictingCourse.subject_code} ({conflict.conflictingCourse.start_time} - {conflict.conflictingCourse.end_time}) on {conflict.overlappingDayNames.join(' & ')}
                    </Text>
                  ))}
                  {assignmentValidation.conflicts.length > 2 ? (
                    <Text className="text-[11px] text-amber-700 mt-1">
                      +{assignmentValidation.conflicts.length - 2} more conflict(s)
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text className="text-xs font-semibold text-emerald-700">
                  No conflicts found for {getReadableDayLabel(selectedDayCode)}.
                </Text>
              )}
            </View>
          ) : null}

          {/* Custom Day Selection */}
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Select Days
            </Text>
            <TouchableOpacity
              onPress={clearSelection}
              disabled={isSubmitting || selectedDayTokens.length === 0}
              className={`px-2 py-1 rounded-full ${selectedDayTokens.length > 0 ? 'bg-gray-200' : 'bg-gray-100'}`}
            >
              <Text className={`text-[11px] font-semibold ${selectedDayTokens.length > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
                Clear
              </Text>
            </TouchableOpacity>
          </View>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {DAY_PICKER_SINGLE_OPTIONS.map(({ code, label }) => {
              const isSelected = selectedDayTokens.includes(code as DayToken);
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => toggleDayToken(code as DayToken)}
                  disabled={isSubmitting}
                  className={`flex-1 min-w-[30%] px-3 py-3 rounded-xl border-2 ${
                    isSelected
                      ? 'bg-red-600 border-red-600'
                      : 'bg-white border-gray-200'
                  }`}
                  activeOpacity={0.7}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      isSelected ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Quick Presets */}
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Quick Presets
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {DAY_PICKER_MULTI_OPTIONS.map(({ code, label }) => {
              const isSelected = selectedDayCode === code;
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => applyPreset(code)}
                  disabled={isSubmitting}
                  className={`px-4 py-3 rounded-xl border-2 ${
                    isSelected
                      ? 'bg-orange-500 border-orange-500'
                      : 'bg-white border-gray-200'
                  }`}
                  activeOpacity={0.7}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      isSelected ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Action Buttons */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={handleDismiss}
              disabled={isSubmitting}
              className={`flex-1 py-3 rounded-xl border-2 items-center ${
                isSubmitting ? 'border-gray-100 bg-gray-50' : 'border-gray-200'
              }`}
              activeOpacity={0.7}
            >
              <Text className="text-sm font-semibold text-gray-600">
                {isSubmitting ? 'Saving...' : 'Cancel'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={disableAssign}
              className={`flex-1 py-3 rounded-xl items-center ${
                !disableAssign ? 'bg-red-600' : 'bg-gray-200'
              }`}
              activeOpacity={0.7}
            >
              <Text
                className={`text-sm font-bold ${
                  !disableAssign ? 'text-white' : 'text-gray-400'
                }`}
              >
                {isSubmitting
                  ? 'Saving...'
                  : hasConflicts
                    ? 'Resolve Conflicts'
                    : selectedDayTokens.length > 1
                      ? `Assign ${selectedDayTokens.length} Days`
                      : 'Assign Day'}
              </Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default DayPickerModal;
