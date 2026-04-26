/**
 * ExtractionPreviewModal
 *
 * Shown immediately after a successful extraction so the user can verify
 * accuracy before the schedule is saved. Actions:
 *   • "Looks Good — Save"  → onConfirm()
 *   • "Retry Scan"         → onRetry()
 *   • backdrop / drag-down → onDiscard()
 */

import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  PanResponder,
  StyleSheet,
} from 'react-native';
import {
  CheckCircle,
  RotateCcw,
  GraduationCap,
  Briefcase,
  Clock,
  MapPin,
  AlertTriangle,
} from 'lucide-react-native';
import { Course } from '../services/courseService';

// ─── Day code → readable labels ────────────────────────────────────────────
const DAY_LABELS: Record<string, string> = {
  M: 'Mon',
  T: 'Tue',
  W: 'Wed',
  TH: 'Thu',
  F: 'Fri',
  S: 'Sat',
  Su: 'Sun',
  // multi-char combinations come after single chars
};

function parseDayChips(day: string): string[] {
  if (!day || day.trim() === '') return [];
  const upper = day.trim();
  const chips: string[] = [];

  // Match TH before T so it isn't double-consumed
  const order = ['TH', 'Su', 'M', 'T', 'W', 'F', 'S'];
  let remaining = upper;
  while (remaining.length > 0) {
    const match = order.find((d) => remaining.startsWith(d));
    if (match) {
      chips.push(DAY_LABELS[match] ?? match);
      remaining = remaining.slice(match.length);
    } else {
      // Unknown single char — just consume it
      chips.push(remaining[0]);
      remaining = remaining.slice(1);
    }
  }
  return chips;
}

function formatTime(t: string): string {
  if (!t) return '';
  // Already formatted (e.g. "01:00 PM") — return as-is
  if (t.toUpperCase().includes('AM') || t.toUpperCase().includes('PM')) return t;
  // HH:MM 24-hour
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${period}`;
}

// ─── Props ──────────────────────────────────────────────────────────────────
export interface ExtractionPreviewModalProps {
  visible: boolean;
  courses: Course[];
  semester: string;
  schoolYear: string;
  uploadType: 'student' | 'faculty';
  onConfirm: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function ExtractionPreviewModal({
  visible,
  courses,
  semester,
  schoolYear,
  uploadType,
  onConfirm,
  onRetry,
  onDiscard,
}: ExtractionPreviewModalProps) {
  const scheduledCourses = courses.filter(
    (c) => c.day && c.day.trim() !== ''
  );
  const unscheduledCourses = courses.filter(
    (c) => !c.day || c.day.trim() === ''
  );

  const isFaculty = uploadType === 'faculty';
  const accentColor = isFaculty ? '#ea580c' : '#B88080';
  const accentBg = isFaculty ? 'bg-orange-600' : 'bg-[#B88080]';
  const accentBgLight = isFaculty ? 'bg-orange-50' : 'bg-rose-50';
  const accentText = isFaculty ? 'text-orange-700' : 'text-rose-700';
  const accentBorder = isFaculty ? 'border-orange-200' : 'border-rose-200';

  // Keep a stable ref to onDiscard so the PanResponder created once in useRef
  // always calls the latest version of the prop without needing recreation.
  const onDiscardRef = useRef(onDiscard);
  onDiscardRef.current = onDiscard;

  // Swipe-down to discard — created once, reads via ref to avoid stale closure.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 60) onDiscardRef.current();
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDiscard}
    >
      {/* Backdrop — fills the screen behind the sheet; press to dismiss */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={onDiscard}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
      />

      {/* Sheet */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
        style={{ maxHeight: '88%' }}
      >
        {/* Drag handle */}
        <View className="items-center pt-3 pb-1" {...panResponder.panHandlers}>
          <View className="w-10 h-1 bg-gray-200 rounded-full" />
        </View>

        {/* Header */}
        <View className="px-5 pt-2 pb-4 border-b border-gray-100">
          <View className="flex-row items-center">
            <View
              className="w-9 h-9 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: isFaculty ? '#FFF7ED' : '#FFF1F2' }}
            >
              {isFaculty
                ? <Briefcase size={18} color={accentColor} />
                : <GraduationCap size={18} color={accentColor} />}
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-gray-900">
                Extraction Preview
              </Text>
              <Text className="text-xs text-gray-400 mt-0.5">
                {isFaculty ? 'Faculty' : 'Student'} schedule
                {semester || schoolYear
                  ? ` · ${[semester, schoolYear].filter(Boolean).join(' ')}`
                  : ''}
              </Text>
            </View>
            <View className={`px-2.5 py-1 rounded-full ${accentBgLight} border ${accentBorder}`}>
              <Text className={`text-xs font-bold ${accentText}`}>
                {courses.length} {courses.length === 1 ? 'course' : 'courses'}
              </Text>
            </View>
          </View>

          {unscheduledCourses.length > 0 && (
            <View className="flex-row items-center mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle size={13} color="#B45309" />
              <Text className="text-xs text-amber-700 ml-1.5">
                {unscheduledCourses.length}{' '}
                {unscheduledCourses.length === 1 ? 'course has' : 'courses have'} no day assigned
              </Text>
            </View>
          )}
        </View>

        {/* Course list */}
        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {courses.length === 0 ? (
            <View className="py-10 items-center">
              <Text className="text-gray-400 text-sm">No courses were extracted.</Text>
            </View>
          ) : (
            <>
              {scheduledCourses.map((course, idx) => (
                <CourseRow
                  key={`sched-${course.id ?? idx}`}
                  course={course}
                  accentBg={accentBg}
                  accentText={accentText}
                />
              ))}

              {unscheduledCourses.length > 0 && (
                <>
                  <View className="flex-row items-center my-3">
                    <View className="flex-1 h-px bg-amber-100" />
                    <Text className="text-[10px] font-semibold text-amber-600 mx-2 uppercase tracking-wide">
                      No day assigned
                    </Text>
                    <View className="flex-1 h-px bg-amber-100" />
                  </View>
                  {unscheduledCourses.map((course, idx) => (
                    <CourseRow
                      key={`unsched-${course.id ?? idx}`}
                      course={course}
                      accentBg={accentBg}
                      accentText={accentText}
                      isUnscheduled
                    />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>

        {/* Footer */}
        <View className="px-5 pt-3 pb-8 border-t border-gray-100 bg-white flex-row gap-3">
          <TouchableOpacity
            onPress={onRetry}
            className="flex-1 py-3.5 rounded-2xl border border-gray-200 items-center flex-row justify-center"
            activeOpacity={0.75}
          >
            <RotateCcw size={15} color="#6B7280" />
            <Text className="text-gray-600 font-semibold text-sm ml-1.5">Retry Scan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onConfirm}
            className={`flex-[2] py-3.5 rounded-2xl items-center flex-row justify-center ${accentBg}`}
            activeOpacity={0.85}
          >
            <CheckCircle size={16} color="#ffffff" />
            <Text className="text-white font-bold text-sm ml-1.5">Looks Good — Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Course row sub-component ────────────────────────────────────────────────
interface CourseRowProps {
  course: Course;
  accentBg: string;
  accentText: string;
  isUnscheduled?: boolean;
}

function CourseRow({ course, accentBg, accentText, isUnscheduled }: CourseRowProps) {
  const dayChips = parseDayChips(course.day || '');
  const timeLabel =
    course.start_time || course.end_time
      ? [formatTime(course.start_time), formatTime(course.end_time)]
          .filter(Boolean)
          .join(' – ')
      : null;

  return (
    <View className="bg-gray-50 rounded-2xl mb-2.5 px-4 py-3">
      {/* Code + name */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text className="font-bold text-gray-900 text-sm leading-tight">
            {course.subject_code || '—'}
          </Text>
          {course.subject_name ? (
            <Text className="text-xs text-gray-500 mt-0.5 leading-snug" numberOfLines={2}>
              {course.subject_name}
            </Text>
          ) : null}
        </View>

        {/* Day chips or unscheduled badge */}
        {isUnscheduled ? (
          <View className="bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
            <Text className="text-[10px] font-semibold text-amber-700">No day</Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap justify-end" style={{ maxWidth: 120 }}>
            {dayChips.map((chip, i) => (
              <View
                key={i}
                className={`${accentBg} rounded-full px-2 py-0.5 ml-1 mb-1`}
              >
                <Text className="text-white text-[10px] font-bold">{chip}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Time + location */}
      <View className="flex-row items-center flex-wrap gap-x-3">
        {timeLabel ? (
          <View className="flex-row items-center">
            <Clock size={11} color="#9CA3AF" />
            <Text className="text-xs text-gray-500 ml-1">{timeLabel}</Text>
          </View>
        ) : null}
        {course.location ? (
          <View className="flex-row items-center">
            <MapPin size={11} color="#9CA3AF" />
            <Text className="text-xs text-gray-500 ml-1">{course.location}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
