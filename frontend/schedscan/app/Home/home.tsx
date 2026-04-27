import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, Modal } from 'react-native';
import Svg, { Path, Circle, G, Rect, Polygon } from "react-native-svg";
import { router } from "expo-router";
import { useAuth } from '../../context/AuthContext';
import { Course, courseService } from '../../services/courseService';
import { SavedSchedule } from '../../services/scheduleStorageService';
import { taskService, Task } from '../../services/taskService';
import { studentEnrollmentService } from '../../services/facultyTaskService';
import { noteService } from '../../services/noteService';
import { useFocusEffect } from '@react-navigation/native';
import FacultyModeModal from '../../components/FacultyModeModal';
import JoinClassModal from '../../components/JoinClassModal';
import { getUnreadCount } from '../../services/notificationService';
import { scheduleClassReminders } from '../../services/classReminderService';
import { resyncTaskDueReminders } from '../../services/taskReminderService';
import { getHolidays, buildHolidayMap, formatHolidayDateRange, Holiday } from '../../services/holidayService';
import { getCalendarEvents, buildCalendarEventMap, formatEventTime, formatCalendarEventDateRange, CalendarEvent } from '../../services/calendarEventService';
import { getSemesterMonths, getSemesterLabel, getInitialMonth } from '../../utils/semesterUtils';

export default function SchedScanApp() {
  const { user, getActiveSchedule, isOffline, hasPendingFacultyUnlock, activateFacultyMode, setPendingFacultyUnlock } = useAuth();
  const now = new Date();

  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [activeSchedule, setActiveSchedule] = useState<SavedSchedule | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  type ScheduleItem = {
    title: string;
    subjectName: string;
    time: string;
    startTime: string;
    endTime: string;
    location: string;
    day: string;
    priority_level: string;
    source_type?: 'student' | 'faculty' | null;  // For merged schedules
  };

  // Get color based on source type or schedule type
  const getCourseColor = (item: ScheduleItem): string => {
    // For merged schedules, use the source_type
    if (item.source_type === 'faculty') return '#f97316'; // orange
    if (item.source_type === 'student') return '#ef4444'; // red

    // For non-merged schedules, use the active schedule's uploadType
    if (activeSchedule?.uploadType === 'faculty') return '#f97316'; // orange
    if (activeSchedule?.uploadType === 'student') return '#ef4444'; // red

    // Fallback for holidays, calendar events, and unscheduled
    if (item.priority_level === 'Holiday') return '#16a34a'; // green
    if (item.priority_level === 'Event') return '#3b82f6'; // blue
    if (item.priority_level === 'Unscheduled') return '#d97706'; // amber

    return '#ef4444'; // default red
  };
  // const StarBadge = ({ value }: Star) => {
  //   return (
  //     <View className="items-center justify-center">
  //       <Svg width={40} height={40} viewBox="0 0 100 100">
  //         <Path
  //           d="M50 5 L61 35 L94 35 L67 55 L78 85 L50 65 L22 85 L33 55 L6 35 L39 35 Z"
  //           fill="#F7FF63"
  //           stroke="black"
  //           strokeWidth="1"
  //         />
  //       </Svg>

  //       <View className="absolute">
  //         <Text className="font-bold text-black text-lg">{value}</Text>
  //       </View>
  //     </View>
  //   );
  // };

  const Bell = ({ size = 24, color = '#4D4D4D' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="2">
      <Path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0" />
    </Svg>
  );

  const Classes_Today = ({ size = 24 }) => (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="#EB3223"
    >
      <Path
        d="M14.5 2H13V1h-1v1H4V1H3v1H1.5l-.5.5v12l.5.5h13l.5-.5v-12l-.5-.5zM14 14H2V5h12v9zm0-10H2V3h12v1zM4 8H3v1h1V8zm-1 2h1v1H3v-1zm1 2H3v1h1v-1zm2-4h1v1H6V8zm1 2H6v1h1v-1zm-1 2h1v1H6v-1zm1-6H6v1h1V6zm2 2h1v1H9V8zm1 2H9v1h1v-1zm-1 2h1v1H9v-1zm1-6H9v1h1V6zm2 2h1v1h-1V8zm1 2h-1v1h1v-1zm-1-4h1v1h-1V6z"
      />
    </Svg>
  );

  const Teaching = ({ size = 24 }) => (
    <Svg
      id="Capa_1"
      width={size}
      height={size}
      viewBox="0 0 31.314 31.314"
      fill="#EB3223"
    >
      <G>
        <G>
          <Path d="M18.773,7.2c-0.09,0-0.094,0-0.103,0.128c-0.019,0.262-0.036,0.47-0.049,0.638h-0.354c-0.274,0-0.311,0.16-0.318,0.31 s-0.008,0.155-0.008,0.182c0,0.03,0.013,0.049,0.047,0.049h0.59c-0.018,0.195-0.021,0.256-0.021,0.345 c0,0.271,0.09,0.421,0.446,0.421c0.075,0,0.095-0.018,0.099-0.089l0.053-0.677h0.352c0.266,0,0.322-0.12,0.335-0.297l0.015-0.182 c0-0.039-0.035-0.062-0.07-0.062h-0.58c0.018-0.199,0.021-0.279,0.021-0.363C19.227,7.351,19.137,7.2,18.773,7.2z" />
          <Path d="M21.046,9.038c-0.014,0.022-0.03,0.071-0.03,0.103v0.265c0,0.235,0.11,0.323,0.406,0.323h1.452 c0.267,0,0.324-0.12,0.337-0.297l0.018-0.261c0-0.044-0.035-0.062-0.07-0.062h-1.124c0.274-0.218,1.292-0.886,1.292-1.74 c0-0.372-0.207-0.833-1.004-0.833c-0.551,0-1.139,0.234-1.139,0.845c0,0.31,0.158,0.474,0.49,0.474 c0.125,0,0.133-0.022,0.143-0.081c0.027-0.238,0.09-0.584,0.377-0.584c0.227,0,0.318,0.12,0.318,0.266 C22.512,8.006,21.215,8.728,21.046,9.038z" />
          <Path d="M24.634,9.025L24.62,9.264c0,0.031,0.014,0.049,0.049,0.049h1.427c0.266,0,0.321-0.12,0.336-0.297l0.019-0.239 c0-0.044-0.026-0.062-0.071-0.062h-1.426C24.68,8.715,24.643,8.874,24.634,9.025z" />
          <Path d="M26.59,7.865l0.02-0.24c0-0.044-0.027-0.062-0.07-0.062h-1.428c-0.273,0-0.31,0.16-0.316,0.31l-0.016,0.239 c0,0.031,0.015,0.049,0.05,0.049h1.424C26.52,8.161,26.577,8.042,26.59,7.865z" />
          <Rect x={23.695} y={15.25} width={5.053} height={1.878} />
          <Polygon points="2.932,0.463 2.932,3.416 4.222,3.018 4.222,1.753 30.023,1.753 30.023,18.201 9.491,18.201 9.424,19.49  31.314,19.49 31.314,0.463  " />
          <Circle cx={4.984} cy={7.526} r={3.821} />
          <Path d="M8.228,29.104v-6.802V21.66v-0.87h0.243l0.355-6.905l6.59-3.414l-0.358-0.692l0.65-0.449 c0.012,0.271,0.121,0.398,0.455,0.398h0.244c0.053,0,0.065-0.018,0.069-0.066c0.015-0.124,0.184-2.458,0.184-2.706 c0-0.217-0.133-0.373-0.457-0.373h-0.266c-0.01,0-0.15,0.094-0.247,0.151c-0.377,0.23-0.404,0.253-0.404,0.31 c0,0.155,0.12,0.416,0.346,0.416c0.071,0,0.15-0.026,0.214-0.097c-0.049,0.606-0.1,1.195-0.126,1.575l-0.096-0.139l-0.791,0.546 L14.55,8.801l-6.025,3.121h-2.15l-1.456,1.689L3.51,11.922l-3.095,0.495l-0.2,6.948h1.313l0.07,1.426h0.2v0.87v0.642v6.803H1.534 L0,29.438v1.414h1.307l1.523-0.25l0.014,0.25h1.688v-1.576v-0.17v-6.803h0.961v6.803v0.17v1.576h1.688l0.014-0.25l1.524,0.25 h1.306v-1.414L8.49,29.104H8.228z" />
        </G>
      </G>
    </Svg>
  );

  const Attending = ({ size = 24 }) => (
    <Svg
      fill="#EB3223"
      width={size}
      height={size}
      viewBox="0 0 512 512"
    >
      <G id="Graduation">
        <Polygon points="445.055 384.794 445.055 221.864 418.805 234.989 418.805 384.777 401.301 429.785 462.551 429.785 445.055 384.794" />
        <Path d="M229.0648,306.3708l-107.7643-53.88v53.7754c0,36.2433,58.7634,65.625,131.25,65.625,72.4887,0,131.25-29.3817,131.25-65.625V252.49L276.0277,306.3741C257.5813,313.681,247.5133,313.6789,229.0648,306.3708Z" />
        <Path d="M264.2912,282.8969l186.5207-93.26c6.4579-3.2289,6.4579-8.5107,0-11.74l-186.5207-93.26c-6.4556-3.2289-17.0214-3.2289-23.4793,0l-186.5207,93.26c-6.4556,3.2289-6.4556,8.5107,0,11.74l186.5207,93.26C247.27,286.1258,257.8356,286.1258,264.2912,282.8969Z" />
      </G>
    </Svg>
  );

  const [daySchedule, setDaySchedule] = useState<ScheduleItem[]>([]);
  const [taskCounts, setTaskCounts] = useState<Record<string, { total: number; incomplete: number }>>({});
  const [facultyTaskCounts, setFacultyTaskCounts] = useState<Record<string, { total: number; incomplete: number }>>({});
  const [facultyNoteCounts, setFacultyNoteCounts] = useState<Record<string, { total: number }>>({});
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [failedExtractionCount, setFailedExtractionCount] = useState(0);
  const [urgentTask, setUrgentTask] = useState<Task | null>(null);
  const [showUrgentTaskModal, setShowUrgentTaskModal] = useState(false);
  const [isUrgentActionLoading, setIsUrgentActionLoading] = useState(false);

  const isWithinQuietHours = useCallback((): boolean => {
    if (!user?.urgent_popup_quiet_hours_enabled) {
      return false;
    }

    const nowHour = new Date().getHours();
    const start = user?.urgent_popup_quiet_hours_start ?? 22;
    const end = user?.urgent_popup_quiet_hours_end ?? 7;

    if (start === end) {
      return true;
    }
    if (start < end) {
      return nowHour >= start && nowHour < end;
    }
    return nowHour >= start || nowHour < end;
  }, [
    user?.urgent_popup_quiet_hours_enabled,
    user?.urgent_popup_quiet_hours_start,
    user?.urgent_popup_quiet_hours_end,
  ]);

  // Modals
  const [showFacultyModeModal, setShowFacultyModeModal] = useState(false);
  const [showJoinClassModal, setShowJoinClassModal] = useState(false);
  // Fetch courses from active local schedule when component mounts or comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadActiveSchedule();
      loadHolidays();
      loadExtractionAlert();
      loadUrgentPopupCandidate();
      // Fetch unread notification count for badge
      getUnreadCount()
        .then(count => setUnreadNotifCount(count))
        .catch(() => { });
    }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const loadUrgentPopupCandidate = useCallback(async () => {
    if (!user?.id || user.user_type === 'parent') {
      setUrgentTask(null);
      setShowUrgentTaskModal(false);
      return;
    }

    if (user.urgent_popup_enabled === false || isWithinQuietHours()) {
      setUrgentTask(null);
      setShowUrgentTaskModal(false);
      return;
    }

    try {
      const task = await taskService.getUrgentPopupTask();
      if (task) {
        setUrgentTask(task);
        setShowUrgentTaskModal(true);
      }
    } catch (error) {
      console.warn('Failed to load urgent popup candidate:', error);
    }
  }, [
    user?.id,
    user?.user_type,
    user?.urgent_popup_enabled,
    isWithinQuietHours,
  ]);

  useEffect(() => {
    if (!user?.id || user.user_type === 'parent') {
      return;
    }

    const interval = setInterval(() => {
      loadUrgentPopupCandidate();
    }, 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [user?.id, user?.user_type, loadUrgentPopupCandidate]);

  const closeUrgentModal = () => {
    setShowUrgentTaskModal(false);
    setUrgentTask(null);
  };

  const handleUrgentSnooze = async () => {
    if (!urgentTask) return;
    setIsUrgentActionLoading(true);
    try {
      const snoozeMinutes = user?.urgent_popup_default_snooze_minutes ?? 10;
      await taskService.snoozeUrgentTask(urgentTask.id, snoozeMinutes);
      closeUrgentModal();
    } catch (error) {
      console.warn('Failed to snooze urgent task:', error);
    } finally {
      setIsUrgentActionLoading(false);
    }
  };

  const handleUrgentDismiss = async () => {
    if (!urgentTask) return;
    setIsUrgentActionLoading(true);
    try {
      await taskService.acknowledgeUrgentTask(urgentTask.id);
      closeUrgentModal();
    } catch (error) {
      console.warn('Failed to acknowledge urgent task:', error);
    } finally {
      setIsUrgentActionLoading(false);
    }
  };

  const handleUrgentMarkDone = async () => {
    if (!urgentTask) return;
    setIsUrgentActionLoading(true);
    try {
      await taskService.completeUrgentTask(urgentTask.id);
      closeUrgentModal();
      await loadActiveSchedule();
    } catch (error) {
      console.warn('Failed to mark urgent task as done:', error);
    } finally {
      setIsUrgentActionLoading(false);
    }
  };

  const handleUrgentOpenTask = async () => {
    if (!urgentTask) return;
    setIsUrgentActionLoading(true);
    try {
      await taskService.openUrgentTask(urgentTask.id);
    } catch {
      // Non-blocking: still open the task details screen.
    } finally {
      setIsUrgentActionLoading(false);
      setShowUrgentTaskModal(false);
    }

    const matchingCourse = courses.find((course) => course.subject_code === urgentTask.subject_code);
    router.push({
      pathname: '/Home/Subject/subjectdetails',
      params: {
        title: urgentTask.subject_code,
        subjectName: matchingCourse?.subject_name || '',
        time: matchingCourse ? `${matchingCourse.start_time} - ${matchingCourse.end_time}` : 'N/A',
        startTime: matchingCourse?.start_time || '',
        endTime: matchingCourse?.end_time || '',
        location: matchingCourse?.location || '',
        day: matchingCourse?.day || '',
        priorityLevel: 'Class',
        sourceType: matchingCourse?.source_type || activeSchedule?.uploadType || '',
      },
    });
    setUrgentTask(null);
  };

  const loadExtractionAlert = async () => {
    if (!user?.id) {
      setFailedExtractionCount(0);
      return;
    }

    try {
      const jobs = await courseService.getRecentExtractionJobs({ limit: 5 });
      const failedJobs = jobs.filter((job) => job.status === 'failed').length;
      setFailedExtractionCount(failedJobs);
    } catch (e) {
      console.warn('Failed to load extraction alert:', e);
      setFailedExtractionCount(0);
    }
  };

  // Reload holidays and calendar events when the user navigates to a different month/year.
  useEffect(() => {
    loadHolidays();
    loadCalendarEvents();
  }, [selectedYear, selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadHolidays = async () => {
    try {
      // Fetch holidays for the currently viewed month
      const data = await getHolidays(selectedYear, selectedMonth + 1);
      setHolidays(data);
    } catch (e) {
      console.warn('Failed to load holidays:', e);
    }
  };

  const loadCalendarEvents = async () => {
    try {
      const data = await getCalendarEvents(selectedYear, selectedMonth + 1);
      setCalendarEvents(data);
    } catch (e) {
      console.warn('Failed to load calendar events:', e);
    }
  };

  const loadActiveSchedule = async () => {
    if (!user?.id) {
      setIsLoadingCourses(false);
      return;
    }

    try {
      setIsLoadingCourses(true);
      // Use cached active schedule from AuthContext (with 30s TTL)
      // This avoids redundant API calls when switching between screens
      const active = await getActiveSchedule();
      setActiveSchedule(active);

      if (active) {
        setCourses(active.courses);
        console.log('Loaded active schedule:', active.title, 'with', active.courses.length, 'courses');

        // Update today's schedule if a day is selected
        if (selectedDay !== null) {
          updateDaySchedule(selectedDay, active.courses);
        }

        // Schedule local class reminder notifications for the next 7 days
        // This replaces the server-side cron job — zero cost, works offline
        const reminderLeadMinutes = user?.class_reminder_minutes_before ?? 15;
        scheduleClassReminders(active, reminderLeadMinutes).catch(err =>
          console.warn('Failed to schedule class reminders:', err)
        );

        // Load task counts for all subjects (uses batch API endpoint)
        const subjectCodes = active.courses.map((c: Course) => c.subject_code);
        if (subjectCodes.length > 0) {
          const counts = await taskService.getTaskCounts(subjectCodes);
          setTaskCounts(counts);

          resyncTaskDueReminders(subjectCodes).catch(err =>
            console.warn('Failed to sync local task reminders:', err)
          );

          // Load faculty task counts for students
          if (user?.user_type === 'student') {
            const [facultyTaskResult, facultyNoteResult] = await Promise.allSettled([
              studentEnrollmentService.getFacultyTaskCounts(subjectCodes),
              noteService.getFacultyNoteCounts(subjectCodes),
            ]);

            if (facultyTaskResult.status === 'fulfilled') {
              setFacultyTaskCounts(facultyTaskResult.value);
            } else if (facultyTaskResult.reason?.response?.status !== 404) {
              console.log('Faculty task counts not available:', facultyTaskResult.reason);
            }

            if (facultyNoteResult.status === 'fulfilled') {
              setFacultyNoteCounts(facultyNoteResult.value);
            } else if (facultyNoteResult.reason?.response?.status !== 404) {
              console.log('Faculty note counts not available:', facultyNoteResult.reason);
            }
          } else {
            setFacultyTaskCounts({});
            setFacultyNoteCounts({});
          }
        } else {
          setTaskCounts({});
          setFacultyTaskCounts({});
          setFacultyNoteCounts({});
        }
      } else {
        setCourses([]);
        setDaySchedule([]);
        setTaskCounts({});
        setFacultyTaskCounts({});
        setFacultyNoteCounts({});
        resyncTaskDueReminders([]).catch(err =>
          console.warn('Failed to clear local task reminders:', err)
        );
        console.log('No active schedule found');
      }
    } catch (error: any) {
      console.error('Failed to load active schedule:', error);
      setCourses([]);
    } finally {
      setIsLoadingCourses(false);
    }
  };

  // Map backend day codes to JavaScript day numbers
  // OCR extracts codes like: M, T, W, TH, F, S, MTH, TF, MW, TTH, MWF, etc.
  const dayCodeToNumbers = (dayCode: string): number[] => {
    // Return empty array if no day code (course won't show on any day)
    if (!dayCode || dayCode.trim() === '') {
      return [];
    }

    // Single letter/code mappings
    const singleDayMap: { [key: string]: number } = {
      'M': 1,    // Monday
      'T': 2,    // Tuesday
      'W': 3,    // Wednesday
      'TH': 4,   // Thursday
      'F': 5,    // Friday
      'S': 6,    // Saturday
      'SUN': 0,  // Sunday
      'MON': 1,
      'TUE': 2,
      'WED': 3,
      'THU': 4,
      'FRI': 5,
      'SAT': 6,
      // Full day names as fallback
      'MONDAY': 1,
      'TUESDAY': 2,
      'WEDNESDAY': 3,
      'THURSDAY': 4,
      'FRIDAY': 5,
      'SATURDAY': 6,
      'SUNDAY': 0,
    };

    // Multi-day combination mappings
    const multiDayMap: { [key: string]: number[] } = {
      'MTH': [1, 4],      // Monday & Thursday
      'TF': [2, 5],       // Tuesday & Friday
      'MW': [1, 3],       // Monday & Wednesday
      'TTH': [2, 4],      // Tuesday & Thursday
      'MWF': [1, 3, 5],   // Monday, Wednesday & Friday
      'MTWTH': [1, 2, 3, 4], // Mon-Thu
      'MTWTHF': [1, 2, 3, 4, 5], // Mon-Fri
    };

    // Check multi-day codes first (they're more specific)
    const upperCode = dayCode.toUpperCase().trim();
    if (multiDayMap[upperCode]) {
      return multiDayMap[upperCode];
    }

    // Check single day codes
    if (singleDayMap[upperCode] !== undefined) {
      return [singleDayMap[upperCode]];
    }

    return [];
  };

  // Check if a specific date has courses (only within semester range)
  const hasCoursesOnDate = (day: number): boolean => {
    // Don't show courses outside the semester's months
    if (!semesterMonths.includes(selectedMonth)) return false;

    const weekday = new Date(selectedYear, selectedMonth, day).getDay();

    return courses.some(course => {
      const courseDays = dayCodeToNumbers(course.day);
      return courseDays.includes(weekday);
    });
  };

  // Helper function to convert time string to minutes for sorting
  const timeStringToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return 0;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    // Convert to 24-hour format for proper sorting
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }

    return hours * 60 + minutes;
  };

  // Update day schedule based on selected day (only within semester range)
  const updateDaySchedule = (day: number, coursesData: Course[] = courses) => {
    // Don't show courses outside the semester's months
    if (!semesterMonths.includes(selectedMonth)) {
      setDaySchedule([]);
      return;
    }

    const dateCourses = coursesData.filter(course => {
      const weekday = new Date(selectedYear, selectedMonth, day).getDay();
      const courseDays = dayCodeToNumbers(course.day);
      return courseDays.includes(weekday);
    });

    // Sort courses by start time (earliest first)
    const sortedCourses = [...dateCourses].sort((a, b) => {
      return timeStringToMinutes(a.start_time) - timeStringToMinutes(b.start_time);
    });

    // Convert Course[] to ScheduleItem[]
    const scheduleItems: ScheduleItem[] = sortedCourses.map(course => ({
      title: course.subject_code,
      subjectName: course.subject_name || '',
      time: `${course.start_time} - ${course.end_time}`,
      startTime: course.start_time,
      endTime: course.end_time,
      location: course.location || '',
      day: course.day,
      priority_level: 'Class',
      source_type: course.source_type || null,  // Include source_type for color coding
    }));

    setDaySchedule(scheduleItems);
  };

  // ✅ One-time Holidays / Events — populated from backend
  const holidaySchedule: { [key: string]: ScheduleItem[] } = useMemo(() => {
    const map = buildHolidayMap(holidays, selectedYear);
    const result: { [key: string]: ScheduleItem[] } = {};
    for (const [dateKey, hols] of Object.entries(map)) {
      result[dateKey] = hols.map(h => ({
        title: h.name,
        subjectName: '',
        time: `${formatHolidayDateRange(h)} • All Day`,
        startTime: '',
        endTime: '',
        location: '',
        day: '',
        priority_level: 'Holiday',
        source_type: null,
      }));
    }
    return result;
  }, [holidays, selectedYear]);

  // ✅ Admin calendar events — visible to user based on role
  const calendarEventSchedule: { [key: string]: ScheduleItem[] } = useMemo(() => {
    const map = buildCalendarEventMap(calendarEvents, selectedYear);
    const result: { [key: string]: ScheduleItem[] } = {};
    for (const [dateKey, evts] of Object.entries(map)) {
      result[dateKey] = evts.map(e => {
        const eventTime = e.start_time
          ? `${formatEventTime(e.start_time)}${e.end_time ? ` - ${formatEventTime(e.end_time)}` : ''}`
          : 'All Day';
        const dateRange = formatCalendarEventDateRange(e);

        return {
          title: e.title,
          subjectName: e.description || '',
          time: `${dateRange} • ${eventTime}`,
          startTime: e.start_time || '',
          endTime: e.end_time || '',
          location: e.location || '',
          day: '',
          priority_level: 'Event',
          source_type: null,
        };
      });
    }
    return result;
  }, [calendarEvents, selectedYear]);

  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthsFull = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const daysOfWeek = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Semester-scoped month indices and label derived from the active schedule
  const semesterMonths = useMemo(
    () => getSemesterMonths(activeSchedule?.semester),
    [activeSchedule?.semester]
  );
  const semesterLabel = useMemo(
    () => getSemesterLabel(activeSchedule?.semester, activeSchedule?.schoolYear),
    [activeSchedule?.semester, activeSchedule?.schoolYear]
  );

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(selectedMonth, selectedYear);
    const firstDay = getFirstDayOfMonth(selectedMonth, selectedYear);
    const days = [];

    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const currentIdx = semesterMonths.indexOf(selectedMonth);
    if (direction === 'prev') {
      if (currentIdx <= 0) {
        // Wrap to last month in the semester range (previous year if applicable)
        const lastSemMonth = semesterMonths[semesterMonths.length - 1];
        setSelectedMonth(lastSemMonth);
        if (lastSemMonth >= selectedMonth) {
          setSelectedYear(selectedYear - 1);
        }
      } else {
        setSelectedMonth(semesterMonths[currentIdx - 1]);
        // Handle year rollover (e.g., going from Jan to Dec within a cross-year semester)
        if (semesterMonths[currentIdx - 1] > selectedMonth) {
          setSelectedYear(selectedYear - 1);
        }
      }
    } else {
      if (currentIdx >= semesterMonths.length - 1) {
        // Wrap to first month in the semester range (next year if applicable)
        const firstSemMonth = semesterMonths[0];
        setSelectedMonth(firstSemMonth);
        if (firstSemMonth <= selectedMonth) {
          setSelectedYear(selectedYear + 1);
        }
      } else {
        setSelectedMonth(semesterMonths[currentIdx + 1]);
        // Handle year rollover
        if (semesterMonths[currentIdx + 1] < selectedMonth) {
          setSelectedYear(selectedYear + 1);
        }
      }
    }
    setSelectedDay(null);
  };
  // ✅ NEW — Check if date has holiday
  const isHoliday = (day: number) => {
    const key = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return holidaySchedule[key] !== undefined;
  };

  // Check if date has an admin calendar event
  const hasCalendarEvent = (day: number) => {
    const key = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return calendarEventSchedule[key] !== undefined;
  };

  // ✅ UPDATED — Only show real courses from backend
  const selectDay = (day: number) => {
    setSelectedDay(day);

    const dateKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const holiday = holidaySchedule[dateKey] ?? [];
    const calEvent = calendarEventSchedule[dateKey] ?? [];

    // Calculate the weekday (0=Sun, 1=Mon, 2=Tue, etc.)
    const weekday = new Date(selectedYear, selectedMonth, day).getDay();

    // Get real courses for this specific day (only within semester range)
    const realCourses = !semesterMonths.includes(selectedMonth) ? [] : courses
      .filter(course => {
        const courseDays = dayCodeToNumbers(course.day);
        return courseDays.includes(weekday);
      })
      .sort((a, b) => {
        // Sort by start time (chronological order)
        // Convert time strings like "11:30AM" to comparable values
        const parseTime = (timeStr: string): number => {
          const match = timeStr.match(/(\d{1,2}):(\d{2})(AM|PM)/i);
          if (!match) return 0;
          let hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const period = match[3].toUpperCase();

          if (period === 'PM' && hours !== 12) hours += 12;
          if (period === 'AM' && hours === 12) hours = 0;

          return hours * 60 + minutes;
        };
        return parseTime(a.start_time) - parseTime(b.start_time);
      })
      .map(course => ({
        title: course.subject_code,
        subjectName: course.subject_name || '',
        time: `${course.start_time} - ${course.end_time}`,
        startTime: course.start_time,
        endTime: course.end_time,
        location: course.location || '',
        day: course.day,
        priority_level: 'Class',
        source_type: course.source_type || null,  // Include source_type for color coding
      }));

    // Include courses with no day assigned (common in handwritten schedules)
    const unscheduledCourses = !semesterMonths.includes(selectedMonth) ? [] : courses
      .filter(course => !course.day || course.day.trim() === '')
      .sort((a, b) => {
        const parseTime = (timeStr: string): number => {
          const match = timeStr.match(/(\d{1,2}):(\d{2})(AM|PM)/i);
          if (!match) return 0;
          let hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const period = match[3].toUpperCase();
          if (period === 'PM' && hours !== 12) hours += 12;
          if (period === 'AM' && hours === 12) hours = 0;
          return hours * 60 + minutes;
        };
        return parseTime(a.start_time) - parseTime(b.start_time);
      })
      .map(course => ({
        title: course.subject_code,
        subjectName: course.subject_name || '',
        time: `${course.start_time} - ${course.end_time}`,
        startTime: course.start_time,
        endTime: course.end_time,
        location: course.location || '',
        day: '',
        priority_level: 'Unscheduled',
        source_type: course.source_type || null,
      }));

    const schedule = [...holiday, ...calEvent, ...realCourses, ...unscheduledCourses];
    setDaySchedule(schedule);
  };

  // Re-calculate day schedule when data or selected date context changes.
  useEffect(() => {
    if (selectedDay !== null) {
      selectDay(selectedDay);
    }
  }, [courses, holidaySchedule, calendarEventSchedule, selectedMonth, selectedYear, selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the active schedule changes, auto-select the correct initial month for its semester.
  useEffect(() => {
    if (activeSchedule) {
      const initialMonth = getInitialMonth(activeSchedule.semester);
      setSelectedMonth(initialMonth);
    }
  }, [activeSchedule?.id, activeSchedule?.semester]); // eslint-disable-line react-hooks/exhaustive-deps

  // Select today on initial load.
  useEffect(() => {
    selectDay(new Date().getDate());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const classItemsToday = daySchedule.filter(item => item.priority_level === 'Class' || item.priority_level === 'Unscheduled');
  const classesTodayCount = classItemsToday.length;
  const teachingTodayCount =
    activeSchedule?.uploadType === 'faculty'
      ? classesTodayCount
      : activeSchedule?.uploadType === 'merged'
        ? classItemsToday.filter(item => item.source_type === 'faculty').length
        : 0;
  const attendingTodayCount =
    activeSchedule?.uploadType === 'student'
      ? classesTodayCount
      : activeSchedule?.uploadType === 'merged'
        ? classItemsToday.filter(item => item.source_type === 'student').length
        : 0;

  return (
    <>
      <View className="w-full h-14 bg-white border-b-2 border-gray-200 justify-between items-center flex-row">
        <View className='ml-8 flex-row justify-center items-center'>
          <Image source={require('../../assets/images/logo.png')} className='w-12 h-12' />
          <View className='flex-col justify-center items-left'>
            <Text className="text-xl font-bold text-primary-900/50 leading-none">Sched</Text>
            <Text className="text-xl font-bold text-primary-900 leading-none">Scan</Text>
          </View>
        </View>
        <View className='flex-row justify-center items-center mr-4'>
          <TouchableOpacity onPress={() => router.push("../Parent/home")}>
            {/* <StarBadge value={5} /> */}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/Home/notification')}>
            <Bell size={24} color="#4D4D4D" />
            {unreadNotifCount > 0 && (
              <View style={{
                position: 'absolute',
                top: -5,
                right: -8,
                backgroundColor: '#DC2626',
                borderRadius: 10,
                minWidth: 18,
                height: 18,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 4,
              }}>
                <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                  {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Offline Banner */}
      {isOffline && (
        <View className="bg-amber-500 px-4 py-2 flex-row items-center justify-center">
          <Text className="text-white text-sm font-semibold">⚡ You&apos;re offline — changes will sync when reconnected</Text>
        </View>
      )}

      {/* Faculty Mode Unlock Banner */}
      {hasPendingFacultyUnlock && user?.user_type !== 'faculty' && (
        <TouchableOpacity
          onPress={() => setShowFacultyModeModal(true)}
          className="bg-orange-500 mx-4 mt-3 px-4 py-3 rounded-xl flex-row items-center justify-between"
          activeOpacity={0.8}
        >
          <View className="flex-row items-center flex-1">
            <Text className="text-lg mr-2">🎓</Text>
            <View className="flex-1">
              <Text className="text-white font-bold text-sm">Faculty features available</Text>
              <Text className="text-white/80 text-xs">Tap to switch to Faculty Mode</Text>
            </View>
          </View>
          <Text className="text-white font-bold text-lg">→</Text>
        </TouchableOpacity>
      )}

      {/* Banner */}
      <ScrollView className="flex-1">
        <View className="bg-primary-600 m-4 p-6 rounded-2xl">
          <Text className="text-3xl font-bold text-white mb-1">
            Hi, {user?.first_name} {user?.last_name}!
          </Text>
          <Text className="text-base text-red-200">Ready to organize?</Text>
        </View>

        <View className="flex-row justify-between px-4 mt-2">
          {/* Classes Today */}
          <View className="flex-1 bg-white rounded-xl p-4 items-center border border-red-200 mx-1">
            <Classes_Today size={24} />
            <Text className="text-3xl font-bold text-primary-600">{classesTodayCount}</Text>
            <Text className="text-sm text-gray-500">Classes Today</Text>
          </View>

          {/* Teaching - shows count for faculty schedules or faculty courses in merged */}
          <View className="flex-1 bg-white rounded-xl p-4 items-center border border-orange-200 mx-1">
            <Teaching size={24} />
            <Text className="text-3xl font-bold text-orange-500">{teachingTodayCount}</Text>
            <Text className="text-sm text-gray-500">Teaching</Text>
          </View>

          {/* Attending - shows count for student schedules or student courses in merged */}
          <View className="flex-1 bg-white rounded-xl p-4 items-center border border-red-200 mx-1">
            <Attending size={24} />
            <Text className="text-3xl font-bold text-red-600">{attendingTodayCount}</Text>
            <Text className="text-sm text-gray-500">Attending</Text>
          </View>
        </View>

        {/* Color Legend for merged schedules */}
        {activeSchedule?.uploadType === 'merged' && (
          <View className='flex-row justify-center items-center gap-6 mt-3 py-2'>
            <View className='flex-row items-center'>
              <View className='w-3 h-3 rounded-full bg-orange-500 mr-2' />
              <Text className='text-gray-600 text-sm'>Faculty</Text>
            </View>
            <View className='flex-row items-center'>
              <View className='w-3 h-3 rounded-full bg-red-600 mr-2' />
              <Text className='text-gray-600 text-sm'>Student</Text>
            </View>
          </View>
        )}

        {/* Failed extraction alert (details are handled in Scanner) */}
        {failedExtractionCount > 0 && (
          <TouchableOpacity
            onPress={() => router.push('/Home/scanner')}
            className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex-row items-center justify-between"
            activeOpacity={0.75}
          >
            <View className="flex-1 pr-2">
              <Text className="text-xs font-bold text-red-700">Extraction needs attention</Text>
              <Text className="text-[11px] text-red-600">
                {failedExtractionCount} recent {failedExtractionCount === 1 ? 'job has' : 'jobs have'} failed. Manage in Scanner.
              </Text>
            </View>
            <Text className="text-xs font-semibold text-red-700">Open Scanner</Text>
          </TouchableOpacity>
        )}

        {/*
        Filter Buttons
        <View className="flex-row justify-evenly mt-3 px-4">

          <TouchableOpacity onPress={() => setSelectedFilter('all')} className={`px-4 py-2 rounded-full border w-1/3 items-center
              ${selectedFilter === 'all' ? 'bg-primary-500 border-primary-400' : 'bg-white border-primary-400'}`}>
            <Text className={`text-xs font-semibold ${selectedFilter === 'all' ? 'text-white' : 'text-red-600'}`}>
              All Schedules
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setSelectedFilter('teaching')} className={`px-4 py-2 rounded-full border w-1/3 items-center mx-1
              ${selectedFilter === 'teaching' ? 'bg-primary-500 border-primary-400' : 'bg-white border-primary-400'}`}>
            <Text className={`text-xs font-semibold
              ${selectedFilter === 'teaching' ? 'text-white' : 'text-red-600'}`}>
              Teaching Only
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setSelectedFilter('attending')} className={`px-4 py-2 rounded-full border w-1/3 items-center
              ${selectedFilter === 'attending' ? 'bg-primary-500 border-primary-400' : 'bg-white border-primary-400'}`}>
            <Text className={`text-xs font-semibold
              ${selectedFilter === 'attending' ? 'text-white' : 'text-red-600'}`}>
              Attending Class
            </Text>
          </TouchableOpacity>
        </View>
        */}

        {/* Semester Label */}
        {activeSchedule?.semester ? (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280' }}>
              📅 {semesterLabel}
            </Text>
          </View>
        ) : null}

        {/* Month Selector (scoped to semester) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 mt-3" contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {semesterMonths.map((monthIdx) => (
            <TouchableOpacity key={monthIdx} onPress={() => setSelectedMonth(monthIdx)}
              className={`px-3 py-2 rounded-full ${selectedMonth === monthIdx ? 'bg-red-600' : 'bg-gray-100'}`}>
              <Text className={`text-xs font-semibold ${selectedMonth === monthIdx ? 'text-white' : 'text-gray-600'}`}>
                {months[monthIdx]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Calendar */}
        <View className="px-2 pb-2">
          <View className="bg-pink-50 rounded-3xl p-6">

            {/* Month Navigation */}
            <View className="flex-row justify-between items-center mb-4">
              <TouchableOpacity onPress={() => navigateMonth('prev')}>
                <Text className="text-2xl text-gray-600 font-semibold">‹</Text>
              </TouchableOpacity>

              <Text className="text-base font-bold text-black">
                {monthsFull[selectedMonth]}, {selectedYear}
              </Text>

              <TouchableOpacity onPress={() => navigateMonth('next')}>
                <Text className="text-2xl text-gray-600 font-semibold">›</Text>
              </TouchableOpacity>
            </View>

            {/* Weekdays */}
            <View className="flex-row mb-2">
              {daysOfWeek.map((day, index) => (
                <View key={index} className="flex-1 items-center py-2">
                  <Text className="text-xs font-bold text-gray-700">{day}</Text>
                </View>
              ))}
            </View>

            {/* Days */}
            <View className="flex-row flex-wrap">
              {generateCalendarDays().map((day, idx) => {
                if (!day) return <View key={idx} className="w-[14.28%] aspect-square" />;

                const hasCourses = hasCoursesOnDate(day);
                const selected = selectedDay === day;
                const holiday = isHoliday(day);
                const hasEvent = hasCalendarEvent(day);

                return (
                  <View key={idx} className="w-[14.28%] aspect-square justify-center items-center">
                    <TouchableOpacity
                      onPress={() => selectDay(day)}
                      className={`w-9 h-9 rounded-full justify-center items-center
                        ${selected ? 'bg-primary-600' : ''}
                        ${holiday && !selected ? 'bg-green-300' : ''}
                        ${hasEvent && !holiday && !selected ? 'bg-blue-300' : ''}
                        ${hasCourses && !selected && !holiday && !hasEvent ? 'bg-yellow-300' : ''}
                      `}
                      activeOpacity={0.7}
                    >
                      <Text className={`${selected ? 'text-white' : 'text-black'} text-sm font-medium`}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Daily Schedule */}
        <View className="px-4 mt-4 mb-4">
          <Text className="text-lg font-bold mb-2">Today&apos;s Schedule</Text>

          {isLoadingCourses ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color="#DC2626" />
              <Text className="text-gray-500 mt-2">Loading courses...</Text>
            </View>
          ) : daySchedule.length === 0 ? (
            <Text className="text-gray-500">No classes / events today</Text>
          ) : (
            <>
              {daySchedule.filter(item => item.priority_level !== 'Unscheduled').map((item, index) => {
                const courseColor = getCourseColor(item);
                const facultyNoteTotal = facultyNoteCounts[item.title]?.total ?? 0;
                const shouldShowFacultyNoteBanner =
                  user?.user_type === 'student' && item.priority_level === 'Class' && facultyNoteTotal > 0;
                const showTaskBanner = taskCounts[item.title]?.total > 0;
                const showFacultyTaskBanner = facultyTaskCounts[item.title]?.total > 0;
                return (
                <TouchableOpacity
                  key={`${item.title}-${index}`}
                  onPress={() => {
                    router.push({
                      pathname: "/Home/Subject/subjectdetails",
                      params: {
                        title: item.title,
                        subjectName: item.subjectName,
                        time: item.time,
                        startTime: item.startTime,
                        endTime: item.endTime,
                        location: item.location,
                        day: item.day,
                        priorityLevel: item.priority_level,
                        sourceType:
                          item.priority_level === 'Class'
                            ? (item.source_type || activeSchedule?.uploadType || '')
                            : '',
                      }
                    });
                  }}
                  className="bg-white p-4 mb-3 rounded-xl shadow"
                  style={{ borderLeftWidth: 4, borderLeftColor: courseColor }}
                >
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-2">
                      <View className="flex-row items-center">
                        <Text className="font-bold text-base text-black">{item.title}</Text>
                        {/* Show badge for merged schedules (source_type) or non-merged schedules (uploadType) — only for Class items */}
                        {item.priority_level === 'Class' && (item.source_type || activeSchedule?.uploadType === 'faculty' || activeSchedule?.uploadType === 'student') && (
                          <View
                            className="ml-2 px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: courseColor + '20' }}
                          >
                            <Text
                              className="text-xs font-medium"
                              style={{ color: courseColor }}
                            >
                              {item.source_type === 'faculty' || (!item.source_type && activeSchedule?.uploadType === 'faculty')
                                ? 'Faculty'
                                : 'Student'}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-sm text-gray-600">{item.time}</Text>
                      <Text className="text-sm text-gray-600">{item.location}</Text>
                    </View>
                    <View className="items-end">
                      {shouldShowFacultyNoteBanner && (
                        <View className="flex-row items-center bg-sky-50 border border-sky-200 rounded-full px-2.5 py-1">
                          <Text className="text-[11px] font-semibold text-sky-800">📋</Text>
                          <View className="ml-1.5 bg-white border border-sky-200 rounded-full px-1.5">
                            <Text className="text-[10px] font-bold text-sky-700">{facultyNoteTotal}</Text>
                          </View>
                        </View>
                      )}
                      {showTaskBanner && (
                        <View className={`flex-row items-center bg-amber-100 px-2 py-1 rounded-full ${shouldShowFacultyNoteBanner ? 'mt-2' : ''}`}>
                          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
                            <Path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            <Path d="M9 12l2 2 4-4" />
                          </Svg>
                          <Text className="text-xs font-semibold text-amber-700 ml-1">
                            {taskCounts[item.title]?.incomplete > 0
                              ? `${taskCounts[item.title].incomplete}`
                              : '✓'}
                          </Text>
                        </View>
                      )}
                      {/* Faculty Mode Active for students */}
                      {showFacultyTaskBanner && (
                        <View className={`flex-row items-center bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1 ${shouldShowFacultyNoteBanner || showTaskBanner ? 'mt-2' : ''}`}>
                          <Text className="text-[11px] font-semibold text-orange-800">📋</Text>
                          <View className="ml-1.5 bg-white border border-orange-200 rounded-full px-1.5">
                            <Text className="text-[10px] font-bold text-orange-700">
                              {facultyTaskCounts[item.title]?.incomplete > 0
                                ? `${facultyTaskCounts[item.title].incomplete}`
                                : '✓'}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                );
              })}

              {/* Unscheduled courses (no day assigned — common in handwritten schedules) */}
              {daySchedule.filter(item => item.priority_level === 'Unscheduled').length > 0 && (
                <View className="mt-2">
                  <View className="flex-row items-center mb-2">
                    <Text className="text-sm font-semibold text-amber-700">📋 No day assigned</Text>
                    <View className="flex-1 h-px bg-amber-200 ml-2" />
                  </View>
                  {daySchedule.filter(item => item.priority_level === 'Unscheduled').map((item, index) => {
                    const courseColor = getCourseColor(item);
                    const facultyNoteTotal = facultyNoteCounts[item.title]?.total ?? 0;
                    const shouldShowFacultyNoteBanner =
                      user?.user_type === 'student' && facultyNoteTotal > 0;
                    return (
                      <TouchableOpacity
                        key={`unsched-${item.title}-${index}`}
                        onPress={() => {
                          router.push({
                            pathname: "/Home/Subject/subjectdetails",
                            params: {
                              title: item.title,
                              subjectName: item.subjectName,
                              time: item.time,
                              startTime: item.startTime,
                              endTime: item.endTime,
                              location: item.location,
                              day: '',
                              priorityLevel: 'Class',
                              sourceType: item.source_type || activeSchedule?.uploadType || '',
                            }
                          });
                        }}
                        className="bg-amber-50 p-3 mb-2 rounded-xl border border-amber-200"
                        style={{ borderLeftWidth: 4, borderLeftColor: courseColor }}
                      >
                        <View className="flex-row justify-between items-start">
                          <View className="flex-1 pr-2">
                            <Text className="font-bold text-sm text-amber-900">{item.title}</Text>
                            <Text className="text-xs text-amber-700">{item.time}</Text>
                            {item.location ? <Text className="text-xs text-amber-600">{item.location}</Text> : null}
                          </View>
                          <View className="items-end">
                            {shouldShowFacultyNoteBanner && (
                              <View className="flex-row items-center bg-sky-50 border border-sky-200 rounded-full px-2.5 py-1">
                                <Text className="text-[11px] font-semibold text-sky-800">📋</Text>
                                <View className="ml-1.5 bg-white border border-sky-200 rounded-full px-1.5">
                                  <Text className="text-[10px] font-bold text-sky-700">{facultyNoteTotal}</Text>
                                </View>
                              </View>
                            )}
                            <View className={`bg-amber-200 px-2 py-0.5 rounded-full ${shouldShowFacultyNoteBanner ? 'mt-2' : ''}`}>
                              <Text className="text-xs font-medium text-amber-800">No day</Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>

        {/* Join a Class Button (Students & Faculty) */}
        {(user?.user_type === 'student' || user?.user_type === 'faculty') && (
          <TouchableOpacity
            onPress={() => setShowJoinClassModal(true)}
            className="mx-4 mt-1 mb-24 bg-orange-50 border border-orange-200 px-4 py-3 rounded-xl flex-row items-center justify-center"
            activeOpacity={0.7}
          >
            <Text className="text-orange-600 font-semibold text-sm">Join a Class with Code</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* Faculty Mode Unlock Modal */}
      <FacultyModeModal
        visible={showFacultyModeModal}
        onConfirm={async () => {
          const success = await activateFacultyMode();
          setShowFacultyModeModal(false);
          if (success) {
            setPendingFacultyUnlock(false);
          }
        }}
        onDismiss={() => setShowFacultyModeModal(false)}
      />

      {/* Join Class Modal (Students) */}
      <JoinClassModal
        visible={showJoinClassModal}
        onClose={() => setShowJoinClassModal(false)}
        onEnrolled={() => {
          // Refresh schedule data after enrollment
          loadActiveSchedule();
        }}
      />

      <Modal
        visible={showUrgentTaskModal && !!urgentTask}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View className="flex-1 bg-black/60 justify-center px-6">
          <View className="bg-white rounded-2xl p-5 border-2 border-red-500">
            <Text className="text-red-600 font-black text-lg mb-1">URGENT TASK</Text>
            <Text className="text-black text-base font-semibold mb-1">{urgentTask?.subject_code}</Text>
            <Text className="text-gray-800 mb-2">{urgentTask?.text}</Text>
            <View className="flex-row items-center mb-4">
              <View className="bg-red-100 px-2 py-1 rounded-full">
                <Text className="text-red-700 text-xs font-bold uppercase">{urgentTask?.effective_urgency || urgentTask?.urgency}</Text>
              </View>
              {urgentTask?.is_overdue && (
                <Text className="text-red-600 text-xs font-semibold ml-2">Overdue</Text>
              )}
            </View>
            {urgentTask?.due_date && (
              <Text className="text-gray-600 text-xs mb-4">Due {new Date(urgentTask.due_date).toLocaleString()}</Text>
            )}

            <TouchableOpacity
              onPress={handleUrgentOpenTask}
              disabled={isUrgentActionLoading}
              className={`py-3 rounded-xl items-center mb-2 ${isUrgentActionLoading ? 'bg-gray-400' : 'bg-red-600'}`}
            >
              <Text className="text-white font-bold">Open Task</Text>
            </TouchableOpacity>

            <View className="flex-row">
              <TouchableOpacity
                onPress={handleUrgentMarkDone}
                disabled={isUrgentActionLoading}
                className={`flex-1 py-2 rounded-lg items-center mr-2 ${isUrgentActionLoading ? 'bg-gray-300' : 'bg-green-600'}`}
              >
                <Text className="text-white font-semibold text-sm">Mark Done</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleUrgentSnooze}
                disabled={isUrgentActionLoading}
                className={`flex-1 py-2 rounded-lg items-center ml-2 ${isUrgentActionLoading ? 'bg-gray-300' : 'bg-amber-500'}`}
              >
                <Text className="text-white font-semibold text-sm">Snooze {user?.urgent_popup_default_snooze_minutes ?? 10}m</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleUrgentDismiss}
              disabled={isUrgentActionLoading}
              className="py-2 rounded-lg items-center mt-3"
            >
              <Text className="text-gray-500 text-sm">Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </>
  );
}
