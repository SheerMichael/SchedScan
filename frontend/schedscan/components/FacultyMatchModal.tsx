/**
 * FacultyMatchModal
 *
 * Post-extraction modal that prompts a student to join classes when the system
 * has auto-detected matching faculty schedules. Displayed after a successful
 * extraction polling result when pending enrollments exist.
 *
 * Flow:
 *  1. Parent calls: const { count } = await pendingEnrollmentService.getPendingEnrollments()
 *  2. If count > 0 → show this modal
 *  3. Student can accept individual matches, skip individual ones, or Join All / Skip All
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import {
  GraduationCap,
  Users,
  CheckCircle,
  X,
  ChevronRight,
  User,
  BookOpen,
} from 'lucide-react-native';
import {
  pendingEnrollmentService,
  PendingEnrollment,
} from '../services/pendingEnrollmentService';

interface FacultyMatchModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called when at least one enrollment was accepted */
  onAccepted?: (acceptedCount: number) => void;
}

export default function FacultyMatchModal({
  visible,
  onClose,
  onAccepted,
}: FacultyMatchModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isBulkActing, setIsBulkActing] = useState(false);
  const [enrollments, setEnrollments] = useState<PendingEnrollment[]>([]);
  const [actingId, setActingId] = useState<number | null>(null);
  const [acceptedCount, setAcceptedCount] = useState(0);

  const loadPending = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await pendingEnrollmentService.getPendingEnrollments();
      setEnrollments(data.results);
    } catch {
      setEnrollments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setAcceptedCount(0);
      loadPending();
    }
  }, [visible, loadPending]);

  // Auto-close if no more pending suggestions after acting
  useEffect(() => {
    if (!isLoading && enrollments.length === 0 && visible) {
      if (acceptedCount > 0) {
        onAccepted?.(acceptedCount);
      }
      onClose();
    }
  }, [enrollments, isLoading, visible, acceptedCount, onAccepted, onClose]);

  const handleAccept = async (enrollment: PendingEnrollment) => {
    setActingId(enrollment.id);
    try {
      await pendingEnrollmentService.acceptEnrollment(enrollment.id);
      setEnrollments((prev) => prev.filter((e) => e.id !== enrollment.id));
      setAcceptedCount((c) => c + 1);
    } catch {
      Alert.alert('Error', 'Could not join this class. Please try again.');
    } finally {
      setActingId(null);
    }
  };

  const handleDecline = async (enrollment: PendingEnrollment) => {
    setActingId(enrollment.id);
    try {
      await pendingEnrollmentService.declineEnrollment(enrollment.id);
      setEnrollments((prev) => prev.filter((e) => e.id !== enrollment.id));
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setActingId(null);
    }
  };

  const handleJoinAll = async () => {
    setIsBulkActing(true);
    try {
      const result = await pendingEnrollmentService.acceptAllEnrollments();
      setAcceptedCount(result.accepted_count);
      setEnrollments([]);
      onAccepted?.(result.accepted_count);
      onClose();
    } catch {
      Alert.alert('Error', 'Could not join all classes. Please try again.');
    } finally {
      setIsBulkActing(false);
    }
  };

  const handleSkipAll = () => {
    // Decline all by just closing — the user can manage from settings later.
    // We don't DELETE the pending rows so the student can revisit them.
    if (acceptedCount > 0) onAccepted?.(acceptedCount);
    onClose();
  };

  const renderEnrollmentCard = (enrollment: PendingEnrollment) => {
    const isActing = actingId === enrollment.id;

    return (
      <View
        key={enrollment.id}
        className="bg-white rounded-2xl mb-3 shadow-sm border border-gray-100 overflow-hidden"
      >
        {/* Header strip */}
        <View className="bg-indigo-50 px-4 py-3 flex-row items-center border-b border-indigo-100">
          <BookOpen size={16} color="#4F46E5" />
          <View className="ml-2 flex-1">
            <Text className="text-indigo-900 font-bold text-sm" numberOfLines={1}>
              {enrollment.subject_code}
            </Text>
            {enrollment.subject_name ? (
              <Text className="text-indigo-600 text-xs mt-0.5" numberOfLines={1}>
                {enrollment.subject_name}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Faculty info */}
        <View className="px-4 py-3 flex-row items-center">
          {enrollment.faculty_profile_picture ? (
            <Image
              source={{ uri: enrollment.faculty_profile_picture }}
              className="w-10 h-10 rounded-full bg-gray-200"
            />
          ) : (
            <View className="w-10 h-10 rounded-full bg-indigo-100 items-center justify-center">
              <User size={18} color="#4F46E5" />
            </View>
          )}
          <View className="ml-3 flex-1">
            <Text className="text-gray-900 font-semibold text-sm">
              {enrollment.faculty_name || 'Faculty Member'}
            </Text>
            <Text className="text-gray-400 text-xs mt-0.5">{enrollment.faculty_email}</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View className="flex-row border-t border-gray-100">
          <TouchableOpacity
            onPress={() => handleDecline(enrollment)}
            disabled={isActing || isBulkActing}
            className="flex-1 py-3 items-center border-r border-gray-100"
          >
            {isActing ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : (
              <Text className="text-gray-400 font-medium text-sm">Skip</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleAccept(enrollment)}
            disabled={isActing || isBulkActing}
            className="flex-1 py-3 items-center bg-indigo-500"
          >
            {isActing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View className="flex-row items-center">
                <CheckCircle size={15} color="#ffffff" />
                <Text className="text-white font-bold text-sm ml-1">Join Class</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleSkipAll}
    >
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-gray-50 rounded-t-3xl overflow-hidden" style={{ maxHeight: '85%' }}>
          {/* Handle bar */}
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 bg-gray-300 rounded-full" />
          </View>

          {/* Header */}
          <View className="px-5 pt-3 pb-4 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              <View className="w-9 h-9 bg-indigo-100 rounded-full items-center justify-center mr-3">
                <GraduationCap size={20} color="#4F46E5" />
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 font-bold text-lg">Faculty Matches Found</Text>
                <Text className="text-gray-500 text-xs mt-0.5">
                  {isLoading
                    ? 'Loading...'
                    : `${enrollments.length} class suggestion${enrollments.length !== 1 ? 's' : ''} detected`}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleSkipAll}
              disabled={isBulkActing}
              className="w-8 h-8 items-center justify-center"
            >
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          {isLoading ? (
            <View className="py-16 items-center">
              <ActivityIndicator size="large" color="#4F46E5" />
              <Text className="text-gray-400 text-sm mt-3">Checking for faculty matches…</Text>
            </View>
          ) : enrollments.length === 0 ? (
            <View className="py-16 items-center px-8">
              <Users size={48} color="#E5E7EB" />
              <Text className="text-gray-400 text-sm mt-4 text-center">
                No pending class suggestions.
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-gray-500 text-xs px-5 mb-3">
                Your uploaded schedule matched the following faculty classes.
                Join to connect with your instructor and see your classmates.
              </Text>

              <ScrollView
                className="px-4"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {enrollments.map(renderEnrollmentCard)}
              </ScrollView>

              {/* Footer bulk actions */}
              <View className="px-4 pb-8 pt-3 border-t border-gray-200 bg-white flex-row gap-3">
                <TouchableOpacity
                  onPress={handleSkipAll}
                  disabled={isBulkActing}
                  className="flex-1 py-3.5 rounded-xl border border-gray-200 items-center"
                >
                  <Text className="text-gray-500 font-medium text-sm">Skip All</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleJoinAll}
                  disabled={isBulkActing}
                  className="flex-1 py-3.5 rounded-xl bg-indigo-500 items-center flex-row justify-center"
                >
                  {isBulkActing ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Users size={16} color="#ffffff" />
                      <Text className="text-white font-bold text-sm ml-2">Join All</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
