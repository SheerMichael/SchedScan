import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { UserPlus, Clock, MapPin, BookOpen, User, X, Calendar, AlertTriangle } from 'lucide-react-native';
import {
  studentEnrollmentService,
  ClassCodePreview,
  ClassCodeSubjectDetail,
  EnrollSyncConflict,
} from '../services/facultyTaskService';

type JoinStep = 'input' | 'preview' | 'sync';

interface JoinClassModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called after successful enrollment with the enrolled subject_code */
  onEnrolled?: (subjectCode: string) => void;
  /** Optional pre-filled class code (e.g. from subject details screen) */
  initialCode?: string;
}

/**
 * Three-step join class flow:
 * 1. Enter class code
 * 2. Preview subject info → confirm enrollment
 * 3. Sync to calendar (with conflict detection)
 *
 * The preview step fetches full subject metadata (name, time, location,
 * faculty name) so the student knows exactly what they're joining.
 */
export default function JoinClassModal({
  visible,
  onClose,
  onEnrolled,
  initialCode = '',
}: JoinClassModalProps) {
  const [step, setStep] = useState<JoinStep>('input');
  const [code, setCode] = useState(initialCode);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [preview, setPreview] = useState<ClassCodePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<EnrollSyncConflict[]>([]);

  // Reset state when modal opens / closes
  useEffect(() => {
    if (visible) {
      setStep('input');
      setCode(initialCode);
      setPreview(null);
      setError(null);
      setConflicts([]);
    }
  }, [visible, initialCode]);

  // ── Step 1: Preview ──────────────────────────────────
  const handlePreview = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await studentEnrollmentService.previewClassCode(trimmed);
      if (data.already_enrolled) {
        setError('You are already enrolled in this class.');
        return;
      }
      setPreview(data);
      setStep('preview');
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || 'Invalid or expired class code.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 2: Confirm enrollment ───────────────────────
  const handleConfirmEnroll = async () => {
    if (!preview) return;

    setIsEnrolling(true);
    try {
      await studentEnrollmentService.enrollWithCode(preview.code);
      // Move to sync step instead of closing
      setStep('sync');
      setConflicts([]);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || 'Failed to enroll. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setIsEnrolling(false);
    }
  };

  // ── Step 3: Sync to calendar ─────────────────────────
  const handleSyncToCalendar = async (force: boolean = false) => {
    if (!preview) return;

    setIsSyncing(true);
    try {
      const result = await studentEnrollmentService.enrollAndSync(preview.code, force);

      if (result.has_conflicts && !result.synced && result.conflicts) {
        // Show conflicts
        setConflicts(result.conflicts);
        return;
      }

      // Success
      const coursesMsg = result.courses_added
        ? ` ${result.courses_added} course(s) added to your calendar.`
        : '';
      Alert.alert(
        'Synced! ',
        `You've joined ${preview.subject_code} with ${preview.faculty_name}.${coursesMsg}`,
        [{ text: 'OK' }],
      );
      onEnrolled?.(preview.subject_code);
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || 'Failed to sync. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Skip sync (enroll only) ──────────────────────────
  const handleSkipSync = () => {
    Alert.alert(
      'Enrolled! ',
      `You've joined ${preview?.subject_code} with ${preview?.faculty_name}.`,
      [{ text: 'OK' }],
    );
    onEnrolled?.(preview?.subject_code || '');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-6">
          <View className="bg-white rounded-2xl w-full shadow-lg overflow-hidden">
            {/* Header */}
            <View className="bg-orange-500 px-5 py-4 flex-row items-center justify-between">
              <View className="flex-row items-center">
                {step === 'sync' ? (
                  <Calendar size={20} color="#ffffff" />
                ) : (
                  <UserPlus size={20} color="#ffffff" />
                )}
                <Text className="text-white font-bold text-lg ml-2">
                  {step === 'input'
                    ? 'Join a Class'
                    : step === 'preview'
                      ? 'Confirm Enrollment'
                      : 'Sync to Calendar'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} disabled={isEnrolling || isSyncing}>
                <X size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <View className="p-5">
              {step === 'input' ? (
                /* ─── CODE INPUT STEP ─── */
                <>
                  <Text className="text-gray-500 text-sm mb-4">
                    Enter the class code shared by your instructor.
                  </Text>

                  <TextInput
                    value={code}
                    onChangeText={(t) => {
                      setCode(t.toUpperCase());
                      setError(null);
                    }}
                    placeholder="e.g. ABCD1234"
                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold text-center tracking-[6px]"
                    autoCapitalize="characters"
                    maxLength={8}
                    autoFocus
                    onSubmitEditing={handlePreview}
                    returnKeyType="go"
                  />

                  {error && (
                    <Text className="text-red-500 text-sm mt-2 text-center">
                      {error}
                    </Text>
                  )}

                  <TouchableOpacity
                    onPress={handlePreview}
                    disabled={isLoading || !code.trim()}
                    className={`mt-4 py-3.5 rounded-xl items-center ${isLoading || !code.trim()
                        ? 'bg-gray-300'
                        : 'bg-orange-500'
                      }`}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text className="text-white font-bold text-base">
                        Look Up Code
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : step === 'preview' && preview ? (
                /* ─── PREVIEW / CONFIRM STEP ─── */
                <>
                  {/* Subject header */}
                  <View className="bg-orange-50 rounded-xl p-4 mb-4 border border-orange-200">
                    <Text className="text-orange-800 font-bold text-lg">
                      {preview.subject_code}
                    </Text>
                    {preview.subject_details[0]?.subject_name ? (
                      <Text className="text-orange-600 text-sm mt-0.5">
                        {preview.subject_details[0].subject_name}
                      </Text>
                    ) : null}
                  </View>

                  {/* Faculty */}
                  <DetailRow
                    icon={<User size={16} color="#6B7280" />}
                    label="Instructor"
                    value={preview.faculty_name}
                  />

                  {/* Schedule details */}
                  {preview.subject_details.length > 0 ? (
                    <ScrollView
                      style={{ maxHeight: 180 }}
                      className="mt-2 mb-3"
                    >
                      {preview.subject_details.map((d, idx) => (
                        <View
                          key={idx}
                          className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-100"
                        >
                          <DetailRow
                            icon={<BookOpen size={14} color="#6B7280" />}
                            label="Day"
                            value={formatDay(d.day)}
                          />
                          <DetailRow
                            icon={<Clock size={14} color="#6B7280" />}
                            label="Time"
                            value={`${d.start_time} – ${d.end_time}`}
                          />
                          <DetailRow
                            icon={<MapPin size={14} color="#6B7280" />}
                            label="Location"
                            value={d.location || 'TBA'}
                          />
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text className="text-gray-400 text-sm my-3">
                      No schedule details available from the instructor.
                    </Text>
                  )}

                  {/* Actions */}
                  <View className="gap-3 mt-2">
                    <TouchableOpacity
                      onPress={handleConfirmEnroll}
                      disabled={isEnrolling}
                      className="bg-orange-500 py-3.5 rounded-xl items-center"
                    >
                      {isEnrolling ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text className="text-white font-bold text-base">
                          Confirm & Join
                        </Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setStep('input');
                        setPreview(null);
                      }}
                      disabled={isEnrolling}
                      className="py-2 items-center"
                    >
                      <Text className="text-gray-400 font-medium text-sm">
                        ← Enter a different code
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : step === 'sync' && preview ? (
                /* ─── SYNC TO CALENDAR STEP ─── */
                <>
                  <View className="bg-green-50 rounded-xl p-4 mb-4 border border-green-200">
                    <Text className="text-green-800 font-bold text-base">
                       Enrolled in {preview.subject_code}
                    </Text>
                    <Text className="text-green-600 text-sm mt-1">
                      Would you like to add this subject's schedule to your calendar?
                    </Text>
                  </View>

                  {/* Conflict display */}
                  {conflicts.length > 0 && (
                    <View className="mb-4">
                      <View className="flex-row items-center mb-2">
                        <AlertTriangle size={16} color="#D97706" />
                        <Text className="text-amber-700 font-bold text-sm ml-1.5">
                          Schedule Conflicts Detected
                        </Text>
                      </View>

                      <ScrollView style={{ maxHeight: 150 }}>
                        {conflicts.map((conflict, idx) => (
                          <View
                            key={idx}
                            className="bg-amber-50 rounded-lg p-3 mb-2 border border-amber-200"
                          >
                            <Text className="text-amber-800 font-semibold text-xs mb-1">
                              {formatDay(conflict.day)} — {conflict.overlap_minutes} min overlap
                            </Text>
                            <Text className="text-gray-700 text-xs">
                              🆕 {conflict.new_course.subject_code}: {conflict.new_course.start_time} – {conflict.new_course.end_time}
                            </Text>
                            <Text className="text-gray-700 text-xs">
                              📅 {conflict.existing_course.subject_code}: {conflict.existing_course.start_time} – {conflict.existing_course.end_time}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Actions */}
                  <View className="gap-3">
                    {conflicts.length > 0 ? (
                      /* Show force-add option when conflicts exist */
                      <>
                        <TouchableOpacity
                          onPress={() => handleSyncToCalendar(true)}
                          disabled={isSyncing}
                          className="bg-amber-500 py-3.5 rounded-xl items-center"
                        >
                          {isSyncing ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text className="text-white font-bold text-base">
                              Add Anyway
                            </Text>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={handleSkipSync}
                          disabled={isSyncing}
                          className="py-2 items-center"
                        >
                          <Text className="text-gray-400 font-medium text-sm">
                            Skip — Don't sync to calendar
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      /* Normal sync options */
                      <>
                        <TouchableOpacity
                          onPress={() => handleSyncToCalendar(false)}
                          disabled={isSyncing}
                          className="bg-orange-500 py-3.5 rounded-xl items-center flex-row justify-center"
                        >
                          {isSyncing ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <>
                              <Calendar size={18} color="#ffffff" />
                              <Text className="text-white font-bold text-base ml-2">
                                Sync to Calendar
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={handleSkipSync}
                          disabled={isSyncing}
                          className="py-2 items-center"
                        >
                          <Text className="text-gray-400 font-medium text-sm">
                            Skip — I'll add it later
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Small detail row with icon + label + value */
function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center mb-1.5">
      {icon}
      <Text className="text-gray-400 text-xs ml-2 w-16">{label}</Text>
      <Text className="text-gray-800 text-sm font-medium flex-1">{value}</Text>
    </View>
  );
}

/** Map day codes to readable names */
function formatDay(day: string): string {
  const map: Record<string, string> = {
    M: 'Monday',
    T: 'Tuesday',
    W: 'Wednesday',
    TH: 'Thursday',
    F: 'Friday',
    S: 'Saturday',
    SUN: 'Sunday',
  };
  return map[day?.toUpperCase()] || day || 'N/A';
}
