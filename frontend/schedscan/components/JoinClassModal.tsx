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
import { UserPlus, Clock, MapPin, BookOpen, User, X } from 'lucide-react-native';
import {
  studentEnrollmentService,
  ClassCodePreview,
  ClassCodeSubjectDetail,
} from '../services/facultyTaskService';

type JoinStep = 'input' | 'preview';

interface JoinClassModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called after successful enrollment with the enrolled subject_code */
  onEnrolled?: (subjectCode: string) => void;
  /** Optional pre-filled class code (e.g. from subject details screen) */
  initialCode?: string;
}

/**
 * Two-step join class flow:
 * 1. Enter class code
 * 2. Preview subject info → confirm enrollment
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
  const [preview, setPreview] = useState<ClassCodePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens / closes
  useEffect(() => {
    if (visible) {
      setStep('input');
      setCode(initialCode);
      setPreview(null);
      setError(null);
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
      Alert.alert(
        'Enrolled! 🎉',
        `You've joined ${preview.subject_code} with ${preview.faculty_name}.`,
        [{ text: 'OK' }],
      );
      onEnrolled?.(preview.subject_code);
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || 'Failed to enroll. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setIsEnrolling(false);
    }
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
                <UserPlus size={20} color="#ffffff" />
                <Text className="text-white font-bold text-lg ml-2">
                  {step === 'input' ? 'Join a Class' : 'Confirm Enrollment'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} disabled={isEnrolling}>
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
                    className={`mt-4 py-3.5 rounded-xl items-center ${
                      isLoading || !code.trim()
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
              ) : preview ? (
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
