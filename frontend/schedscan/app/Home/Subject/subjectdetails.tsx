import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform, Animated, Easing, PanResponder } from "react-native";
import * as Clipboard from 'expo-clipboard';
import ExpoCheckbox from "expo-checkbox";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { taskService, Task, TaskUrgency } from "../../../services/taskService";
import { noteService, Note, FacultyPublishedNote } from "../../../services/noteService";
import { useAuth } from "../../../context/AuthContext";
import {
  facultyTaskService,
  studentEnrollmentService,
  FacultyTaskWithStats,
  StudentFacultyTask,
  ClassCode,
} from "../../../services/facultyTaskService";
import {
  studentRemarkService,
  FacultyRemark,
} from "../../../services/remarkService";
import {
  classmateService,
  Classmate,
} from "../../../services/classmateService";
import JoinClassModal from "../../../components/JoinClassModal";
import { useFileDownload } from "../../../hooks/useFileDownload";
import { cancelTaskDueReminders, scheduleTaskDueRemindersForTask } from "../../../services/taskReminderService";
import {
  formatDueDatePreview,
  getDueDatePresets,
  getSuggestedDueDateForUrgency,
  getUrgencyHint,
  requiresDueDate,
  toDueDateISOString,
} from "../../../utils/taskDueDate";
import type { DueDatePresetKey } from "../../../utils/taskDueDate";

export default function SubjectDetails() {
  const { user, refreshUser } = useAuth();
  const isFaculty = user?.user_type === 'faculty';
  const isFacultyVerified = user?.is_verified !== false;
  const isStudent = user?.user_type === 'student';

  // Receive all course data from navigation params
  const {
    title,           // subject_code (e.g., "CS101")
    time,            // formatted time
    location,        // location
    day,             // day code
    priorityLevel,   // 'Class' | 'Holiday' | 'Event'
    sourceType,      // 'student' | 'faculty' | 'merged' — schedule source type
  } = useLocalSearchParams();

  const rawTitle = Array.isArray(title) ? title[0] : title || '';
  const subjectCode = String(rawTitle || '').trim();
  const normalizedPriorityLevel = (Array.isArray(priorityLevel) ? priorityLevel[0] : priorityLevel || '').toLowerCase();
  const normalizedSourceType = (Array.isArray(sourceType) ? sourceType[0] : sourceType || '').toLowerCase();
  const isClassItem = normalizedPriorityLevel !== 'holiday' && normalizedPriorityLevel !== 'event';
  const isNonClassItem = normalizedPriorityLevel === 'holiday' || normalizedPriorityLevel === 'event';
  const isFacultyCourse = isClassItem && normalizedSourceType === 'faculty';
  const shouldUseFacultyTaskFlow = isFaculty && isFacultyCourse;
  const taskLabelPlural = isNonClassItem ? 'Tasks' : 'Class Tasks';
  const addTaskLabel = isNonClassItem ? 'Add Task' : 'Add Class Task';
  const noTasksLabel = isNonClassItem
    ? 'No tasks yet. Tap + to add one.'
    : 'No class tasks yet. Tap + to add one.';

  // ============================================
  // Personal Task State
  // ============================================
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState<string>("");
  const [newTaskUrgency, setNewTaskUrgency] = useState<TaskUrgency>('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState<string | null>(null);
  const [newTaskDuePreset, setNewTaskDuePreset] = useState<DueDatePresetKey | null>(null);
  const [showTaskComposer, setShowTaskComposer] = useState(false);
  const [showTaskDuePicker, setShowTaskDuePicker] = useState(false);
  const [taskDuePickerMode, setTaskDuePickerMode] = useState<'date' | 'time'>('date');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingTask, setIsAddingTask] = useState(false);

  // ============================================
  // Quick Note State
  // ============================================
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteText, setNewNoteText] = useState<string>("");
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [inlineEditingNoteId, setInlineEditingNoteId] = useState<number | null>(null);
  const [inlineNoteText, setInlineNoteText] = useState<string>('');
  const [isSavingInlineNote, setIsSavingInlineNote] = useState(false);
  const skipInlineBlurSaveRef = useRef(false);

  // ============================================
  // Faculty Task State
  // ============================================
  const [facultyTasks, setFacultyTasks] = useState<FacultyTaskWithStats[]>([]);
  const [studentFacultyTasks, setStudentFacultyTasks] = useState<StudentFacultyTask[]>([]);
  const [isFacultyLoading, setIsFacultyLoading] = useState(false);
  const [newFacultyTaskText, setNewFacultyTaskText] = useState<string>("");
  const [newFacultyTaskUrgency, setNewFacultyTaskUrgency] = useState<TaskUrgency>('medium');
  const [newFacultyTaskDueDate, setNewFacultyTaskDueDate] = useState<string | null>(null);
  const [newFacultyTaskDuePreset, setNewFacultyTaskDuePreset] = useState<DueDatePresetKey | null>(null);
  const [showFacultyTaskComposer, setShowFacultyTaskComposer] = useState(false);
  const [showFacultyTaskDuePicker, setShowFacultyTaskDuePicker] = useState(false);
  const [facultyTaskDuePickerMode, setFacultyTaskDuePickerMode] = useState<'date' | 'time'>('date');
  const [isAddingFacultyTask, setIsAddingFacultyTask] = useState(false);
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);

  const taskComposerAnimation = useRef(new Animated.Value(0)).current;
  const noteComposerAnimation = useRef(new Animated.Value(0)).current;
  const facultyComposerAnimation = useRef(new Animated.Value(0)).current;

  // Refs used by PanResponders so they always read the latest value without
  // needing to be recreated on every render.
  const closeTaskComposerRef = useRef<() => void>(() => {});
  const closeNoteComposerRef = useRef<() => void>(() => {});
  const closeFacultyTaskComposerRef = useRef<() => void>(() => {});
  const isAddingTaskRef = useRef(false);
  const isAddingNoteRef = useRef(false);
  const isAddingFacultyTaskRef = useRef(false);

  // PanResponders for swipe-to-dismiss — created once, read latest values via refs.
  const taskSheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 60 && !isAddingTaskRef.current) closeTaskComposerRef.current();
      },
    })
  ).current;

  const noteSheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 60 && !isAddingNoteRef.current) closeNoteComposerRef.current();
      },
    })
  ).current;

  const facultySheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 60 && !isAddingFacultyTaskRef.current) closeFacultyTaskComposerRef.current();
      },
    })
  ).current;

  // ============================================
  // Class Code State (Faculty only)
  // ============================================
  const [classCode, setClassCode] = useState<ClassCode | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  // ============================================
  // Enrollment State (Student only)
  // ============================================
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [showJoinClassModal, setShowJoinClassModal] = useState(false);
  const canShowJoinClassCode = isStudent && isClassItem && !isEnrolled && !isFacultyCourse;
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [classmateFacultyName, setClassmateFacultyName] = useState('');
  const [isClassmatesLoading, setIsClassmatesLoading] = useState(false);

  // ============================================
  // Student Remarks State (Student only)
  // ============================================
  const [studentRemarks, setStudentRemarks] = useState<FacultyRemark[]>([]);
  const [viewingStudentRemark, setViewingStudentRemark] = useState<FacultyRemark | null>(null);
  const [facultyPublishedNotes, setFacultyPublishedNotes] = useState<FacultyPublishedNote[]>([]);

  // ============================================
  // File Download
  // ============================================
  const { downloadingTaskId, downloadProgress, downloadStatus, downloadFile: handleDownloadFile } = useFileDownload();

  const fetchClassmatesSafely = useCallback(async (code: string) => {
    try {
      return await classmateService.getClassmates(code);
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        console.error('Error loading classmates:', error);
      }
      return null;
    }
  }, []);

  const loadAllData = useCallback(async () => {
    if (!subjectCode) return;
    setIsLoading(true);
    setIsFacultyLoading(true);
    setIsClassmatesLoading(isStudent && isClassItem);

    try {
      const notesPromise = noteService.getNotes(subjectCode, user?.id).catch((error) => {
        console.error('Error loading notes:', error);
        return [] as Note[];
      });

      if (shouldUseFacultyTaskFlow) {
        // Faculty + faculty-sourced class: load class code and faculty tasks
        const [tasksData, codes, notesData] = await Promise.all([
          facultyTaskService.getFacultyTasks(subjectCode),
          facultyTaskService.getClassCodes(subjectCode),
          notesPromise,
        ]);
        setFacultyTasks(tasksData);
        setNotes(notesData);
        setFacultyPublishedNotes([]);
        setClassmates([]);
        setClassmateFacultyName('');
        if (codes.length > 0) setClassCode(codes[0]);
      } else if (isStudent) {
        const classmatesPromise = isClassItem
          ? fetchClassmatesSafely(subjectCode)
          : Promise.resolve(null);

        // Student: load personal tasks + faculty tasks + enrollment status + remarks
        const [personalTasks, fTasks, enrollments, remarksData, notesData, publishedFacultyNotes, classmatesData] = await Promise.all([
          taskService.getTasks(subjectCode),
          studentEnrollmentService.getFacultyTasks(subjectCode).catch(() => []),
          studentEnrollmentService.getEnrollments().catch(() => []),
          studentRemarkService.getRemarks(subjectCode).catch(() => []),
          notesPromise,
          noteService.getFacultyNotes(subjectCode).catch((error) => {
            console.error('Error loading faculty notes:', error);
            return [] as FacultyPublishedNote[];
          }),
          classmatesPromise,
        ]);
        setTasks(personalTasks);
        setStudentFacultyTasks(fTasks);
        setStudentRemarks(remarksData);
        setNotes(notesData);
        setFacultyPublishedNotes(publishedFacultyNotes);
        setClassmates(classmatesData?.classmates ?? []);
        setClassmateFacultyName(classmatesData?.faculty_name ?? '');
        // Check enrollment using actual enrollments, not task count
        const enrolled = enrollments.some(
          (e) => e.subject_code === subjectCode && e.status === 'active'
        );
        setIsEnrolled(enrolled);
      } else {
        // Personal-task flow: faculty on student-sourced classes + other user types
        const [personalTasks, notesData] = await Promise.all([
          taskService.getTasks(subjectCode),
          notesPromise,
        ]);
        setTasks(personalTasks);
        setNotes(notesData);
        setFacultyPublishedNotes([]);
        setClassmates([]);
        setClassmateFacultyName('');
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
      setIsFacultyLoading(false);
      setIsClassmatesLoading(false);
    }
  }, [subjectCode, shouldUseFacultyTaskFlow, isStudent, isClassItem, user?.id, fetchClassmatesSafely]);

  // ============================================
  // Load Data
  // ============================================
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useFocusEffect(
    useCallback(() => {
      refreshUser().catch((error) => {
        console.warn('Failed to refresh user on subject details focus:', error);
      });
    }, [refreshUser])
  );

  useEffect(() => {
    Animated.timing(taskComposerAnimation, {
      toValue: showTaskComposer ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showTaskComposer, taskComposerAnimation]);

  useEffect(() => {
    Animated.timing(noteComposerAnimation, {
      toValue: showNoteComposer ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showNoteComposer, noteComposerAnimation]);

  useEffect(() => {
    Animated.timing(facultyComposerAnimation, {
      toValue: showFacultyTaskComposer ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showFacultyTaskComposer, facultyComposerAnimation]);

  // ============================================
  // Personal Task Handlers
  // ============================================
  const handleToggleComplete = async (task: Task) => {
    try {
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, is_completed: !t.is_completed } : t
      ));
      const updatedTask = await taskService.toggleTaskCompletion(task);

      if (updatedTask.is_completed) {
        await cancelTaskDueReminders(updatedTask.id).catch((error) => {
          console.warn('Failed to cancel local task reminders:', error);
        });
      } else {
        await scheduleTaskDueRemindersForTask(updatedTask).catch((error) => {
          console.warn('Failed to schedule local task reminders:', error);
        });
      }
    } catch (error) {
      console.error('Error toggling task:', error);
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, is_completed: task.is_completed } : t
      ));
      Alert.alert('Error', 'Failed to update task. Please try again.');
    }
  };

  const handleAddTask = async () => {
    if (!newTaskText.trim() || !subjectCode) return;

    if (requiresDueDate(newTaskUrgency) && !newTaskDueDate) {
      Alert.alert(
        'Due Date Required',
        'High and critical tasks must include a due date.'
      );
      return;
    }

    try {
      setIsAddingTask(true);
      const newTask = await taskService.createTask({
        subject_code: subjectCode,
        text: newTaskText.trim(),
        urgency: newTaskUrgency,
        due_date: newTaskDueDate,
      });

      await scheduleTaskDueRemindersForTask(newTask).catch((error) => {
        console.warn('Failed to schedule local task reminders:', error);
      });

      setTasks(prev => [newTask, ...prev]);
      setNewTaskText("");
      setNewTaskUrgency('medium');
      setNewTaskDueDate(null);
      setNewTaskDuePreset(null);
      setShowTaskDuePicker(false);
      setShowTaskComposer(false);
    } catch (error) {
      console.error('Error adding task:', error);
      Alert.alert('Error', 'Failed to add task. Please try again.');
    } finally {
      setIsAddingTask(false);
    }
  };

  const handleDeleteTask = async (task: Task) => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.text}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setTasks(prev => prev.filter(t => t.id !== task.id));
              await taskService.deleteTask(task.id, subjectCode);
              await cancelTaskDueReminders(task.id).catch((error) => {
                console.warn('Failed to cancel local task reminders:', error);
              });
            } catch (error) {
              console.error('Error deleting task:', error);
              loadAllData();
              Alert.alert('Error', 'Failed to delete task. Please try again.');
            }
          }
        }
      ]
    );
  };

  // ============================================
  // Quick Note Handlers
  // ============================================
  const handleSaveNote = async () => {
    if (!newNoteText.trim() || !subjectCode) return;

    try {
      setIsAddingNote(true);
      const createdNote = await noteService.createNote({
        subject_code: subjectCode,
        text: newNoteText.trim(),
      }, user?.id);
      setNotes((prev) => [createdNote, ...prev]);
      setNewNoteText('');
      setShowNoteComposer(false);
    } catch (error) {
      console.error('Error saving note:', error);
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleStartInlineEdit = (note: Note) => {
    setInlineEditingNoteId(note.id);
    setInlineNoteText(note.text);
  };

  const handleCancelInlineEdit = () => {
    if (isSavingInlineNote) return;
    setInlineEditingNoteId(null);
    setInlineNoteText('');
  };

  const handleSaveInlineEdit = async (note: Note) => {
    if (!subjectCode) return;

    const nextText = inlineNoteText.trim();
    if (!nextText) {
      handleCancelInlineEdit();
      return;
    }

    if (nextText === note.text.trim()) {
      handleCancelInlineEdit();
      return;
    }

    try {
      setIsSavingInlineNote(true);
      const updatedNote = await noteService.updateNote(note.id, subjectCode, {
        text: nextText,
      }, user?.id);
      setNotes((prev) => prev.map((n) => (n.id === note.id ? updatedNote : n)));
      setInlineEditingNoteId(null);
      setInlineNoteText('');
    } catch (error) {
      console.error('Error updating note:', error);
      Alert.alert('Error', 'Failed to update note. Please try again.');
    } finally {
      setIsSavingInlineNote(false);
    }
  };

  const handleInlineNoteBlur = async (note: Note) => {
    if (skipInlineBlurSaveRef.current) {
      skipInlineBlurSaveRef.current = false;
      return;
    }

    if (isSavingInlineNote || inlineEditingNoteId !== note.id) {
      return;
    }

    await handleSaveInlineEdit(note);
  };

  const handleTogglePinNote = async (note: Note) => {
    if (!subjectCode) return;

    const nextPinned = !note.is_pinned;
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, is_pinned: nextPinned } : n)));

    try {
      const updatedNote = await noteService.updateNote(note.id, subjectCode, { is_pinned: nextPinned }, user?.id);
      setNotes((prev) => prev.map((n) => (n.id === note.id ? updatedNote : n)));
    } catch (error) {
      console.error('Error updating note pin:', error);
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, is_pinned: note.is_pinned } : n)));
      Alert.alert('Error', 'Failed to update favorite note. Please try again.');
    }
  };

  const handleDeleteNote = async (note: Note) => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setNotes((prev) => prev.filter((n) => n.id !== note.id));
              if (inlineEditingNoteId === note.id) {
                setInlineEditingNoteId(null);
                setInlineNoteText('');
              }
              await noteService.deleteNote(note.id, subjectCode, user?.id);
            } catch (error) {
              console.error('Error deleting note:', error);
              loadAllData();
              Alert.alert('Error', 'Failed to delete note. Please try again.');
            }
          },
        },
      ]
    );
  };

  // ============================================
  // Faculty Task Handlers (Faculty side)
  // ============================================
  const handleAddFacultyTask = async () => {
    if (!newFacultyTaskText.trim() || !subjectCode) return;

    if (requiresDueDate(newFacultyTaskUrgency) && !newFacultyTaskDueDate) {
      Alert.alert(
        'Due Date Required',
        'High and critical class tasks must include a due date.'
      );
      return;
    }

    try {
      setIsAddingFacultyTask(true);
      const newTask = await facultyTaskService.createFacultyTask({
        subject_code: subjectCode,
        text: newFacultyTaskText.trim(),
        urgency: newFacultyTaskUrgency,
        due_date: newFacultyTaskDueDate,
      });
      setFacultyTasks(prev => [newTask, ...prev]);
      setNewFacultyTaskText("");
      setNewFacultyTaskUrgency('medium');
      setNewFacultyTaskDueDate(null);
      setNewFacultyTaskDuePreset(null);
      setShowFacultyTaskDuePicker(false);
      setShowFacultyTaskComposer(false);
    } catch (error) {
      console.error('Error adding faculty task:', error);
      Alert.alert('Error', 'Failed to add task. Please try again.');
    } finally {
      setIsAddingFacultyTask(false);
    }
  };

  const handleDeleteFacultyTask = async (task: FacultyTaskWithStats) => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.text}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setFacultyTasks(prev => prev.filter(t => t.id !== task.id));
              await facultyTaskService.deleteFacultyTask(task.id);
            } catch (error) {
              console.error('Error deleting faculty task:', error);
              loadAllData();
              Alert.alert('Error', 'Failed to delete task. Please try again.');
            }
          }
        }
      ]
    );
  };

  // ============================================
  // Class Code Handlers (Faculty side)
  // ============================================
  const handleGenerateClassCode = async () => {
    if (!isFacultyVerified) {
      Alert.alert(
        'Verification Required',
        'Your faculty account is pending admin verification. Class code generation is disabled until verification is approved.'
      );
      return;
    }

    try {
      setIsGeneratingCode(true);
      const newCode = await facultyTaskService.generateClassCode(subjectCode);
      setClassCode(newCode);
      Alert.alert('Class Code Generated', `Your new class code is: ${newCode.code}`);
    } catch (error: any) {
      console.error('Error generating code:', error);
      const message = error?.response?.data?.error || 'Failed to generate class code.';
      Alert.alert('Error', message);
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCopyClassCode = async () => {
    if (classCode) {
      await Clipboard.setStringAsync(classCode.code);
      Alert.alert('Copied!', 'Class code copied to clipboard.');
    }
  };

  // ============================================
  // Student Enrollment Handlers
  // ============================================
  const handleJoinClassEnrolled = async (enrolledSubjectCode: string) => {
    setIsEnrolled(true);
    // Reload faculty tasks after enrollment
    try {
      setIsClassmatesLoading(true);
      const [fTasks, classmatesData] = await Promise.all([
        studentEnrollmentService.getFacultyTasks(enrolledSubjectCode),
        fetchClassmatesSafely(enrolledSubjectCode),
      ]);
      setStudentFacultyTasks(fTasks);
      setClassmates(classmatesData?.classmates ?? []);
      setClassmateFacultyName(classmatesData?.faculty_name ?? '');
    } catch (e) {
      console.error('Error reloading faculty tasks after enrollment:', e);
    } finally {
      setIsClassmatesLoading(false);
    }
  };

  // ============================================
  // Student Faculty Task Completion Handler
  // ============================================
  const handleToggleFacultyTaskComplete = async (task: StudentFacultyTask) => {
    const newStatus = !task.is_completed;
    try {
      // Optimistic update
      setStudentFacultyTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, is_completed: newStatus } : t
      ));
      await studentEnrollmentService.toggleFacultyTaskCompletion(task.id, newStatus);
    } catch (error) {
      console.error('Error toggling faculty task:', error);
      // Revert
      setStudentFacultyTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, is_completed: task.is_completed } : t
      ));
      Alert.alert('Error', 'Failed to update task. Please try again.');
    }
  };

  // ============================================
  // View task stats (Faculty side)
  // ============================================
  const handleViewStats = async (task: FacultyTaskWithStats) => {
    try {
      const stats = await facultyTaskService.getTaskStats(task.id);
      const studentList = stats.students.map(s =>
        `${s.is_completed ? '✓' : '○'} ${s.student_name}`
      ).join('\n');

      Alert.alert(
        `Completion Stats`,
        `${stats.completed_count}/${stats.total_enrolled} completed\n\n${studentList || 'No students enrolled yet.'}`,
      );
    } catch (error) {
      console.error('Error loading stats:', error);
      Alert.alert('Error', 'Failed to load completion stats.');
    }
  };

  // ============================================
  // Navigation
  // ============================================
  const handleBack = () => {
    router.back();
  };

  // ============================================
  // Icons
  // ============================================
  const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
  );

  const TrashIcon = ({ size = 20, color = '#9CA3AF' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
    </Svg>
  );

  const FavoriteIcon = ({ size = 18, color = '#0284C7', active = false }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={active ? color : 'none'} stroke={color} strokeWidth="2">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.77 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );

  const urgencyBadgeStyles: Record<TaskUrgency, { bg: string; text: string }> = {
    low: { bg: 'bg-gray-100', text: 'text-gray-700' },
    medium: { bg: 'bg-blue-100', text: 'text-blue-700' },
    high: { bg: 'bg-amber-100', text: 'text-amber-700' },
    critical: { bg: 'bg-red-100', text: 'text-red-700' },
  };

  const urgencyChoices: TaskUrgency[] = ['low', 'medium', 'high', 'critical'];

  const facultyUrgencyStyles: Record<TaskUrgency, { bg: string; text: string }> = {
    low: { bg: 'bg-gray-100', text: 'text-gray-700' },
    medium: { bg: 'bg-blue-100', text: 'text-blue-700' },
    high: { bg: 'bg-amber-100', text: 'text-amber-700' },
    critical: { bg: 'bg-red-100', text: 'text-red-700' },
  };

  const facultyUrgencyChoices: TaskUrgency[] = ['low', 'medium', 'high', 'critical'];
  const dueDatePresets = getDueDatePresets();
  const urgencyPalette: Record<TaskUrgency, string> = {
    low: '#6B7280',
    medium: '#2563EB',
    high: '#D97706',
    critical: '#DC2626',
  };

  const urgencyChipPalette: Record<TaskUrgency, { border: string; bg: string; text: string }> = {
    low: { border: '#9CA3AF', bg: '#F3F4F6', text: '#374151' },
    medium: { border: '#2563EB', bg: '#DBEAFE', text: '#1D4ED8' },
    high: { border: '#D97706', bg: '#FEF3C7', text: '#92400E' },
    critical: { border: '#DC2626', bg: '#FEE2E2', text: '#B91C1C' },
  };

  const getUrgencyChipContainerStyle = (urgency: TaskUrgency, selected: boolean) => ({
    borderColor: selected ? urgencyChipPalette[urgency].border : '#D1D5DB',
    backgroundColor: selected ? urgencyChipPalette[urgency].bg : '#FFFFFF',
  });

  const getUrgencyChipTextColor = (urgency: TaskUrgency, selected: boolean) => (
    selected ? urgencyChipPalette[urgency].text : '#374151'
  );

  const applyTaskDuePreset = (preset: { key: DueDatePresetKey; date: Date }) => {
    setNewTaskDueDate(toDueDateISOString(preset.date));
    setNewTaskDuePreset(preset.key);
  };

  const clearTaskDueDate = () => {
    setNewTaskDueDate(null);
    setNewTaskDuePreset(null);
  };

  const applyFacultyDuePreset = (preset: { key: DueDatePresetKey; date: Date }) => {
    setNewFacultyTaskDueDate(toDueDateISOString(preset.date));
    setNewFacultyTaskDuePreset(preset.key);
  };

  const clearFacultyDueDate = () => {
    setNewFacultyTaskDueDate(null);
    setNewFacultyTaskDuePreset(null);
  };

  const handleTaskUrgencyChange = (urgency: TaskUrgency) => {
    setNewTaskUrgency(urgency);
    if (!newTaskDueDate) {
      const suggestedDue = getSuggestedDueDateForUrgency(urgency);
      if (suggestedDue) {
        setNewTaskDueDate(suggestedDue);
        setNewTaskDuePreset('tomorrow_9');
      }
    }
  };

  const closeTaskComposer = () => {
    if (isAddingTask) return;
    setShowTaskDuePicker(false);
    setShowTaskComposer(false);
  };

  const closeNoteComposer = () => {
    if (isAddingNote) return;
    setNewNoteText('');
    setShowNoteComposer(false);
  };

  const openCreateNoteComposer = () => {
    setNewNoteText('');
    setShowNoteComposer(true);
  };

  const openTaskComposerFromFab = () => {
    setIsFabMenuOpen(false);
    if (shouldUseFacultyTaskFlow) {
      setShowFacultyTaskComposer(true);
      return;
    }
    setShowTaskComposer(true);
  };

  const openNoteComposerFromFab = () => {
    setIsFabMenuOpen(false);
    openCreateNoteComposer();
  };

  const openTaskDuePicker = (mode: 'date' | 'time') => {
    if (Platform.OS === 'android') {
      const baseDate = newTaskDueDate ? new Date(newTaskDueDate) : new Date();
      DateTimePickerAndroid.open({
        value: baseDate,
        mode,
        is24Hour: false,
        display: 'default',
        onChange: (event, selectedDate) => {
          if (!selectedDate || event.type !== 'set') return;
          const nextDate = newTaskDueDate ? new Date(newTaskDueDate) : new Date();
          if (mode === 'date') {
            nextDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
          } else {
            nextDate.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
          }
          setNewTaskDueDate(toDueDateISOString(nextDate));
          setNewTaskDuePreset(null);
        },
      });
      return;
    }

    setTaskDuePickerMode(mode);
    setShowTaskDuePicker(true);
  };

  const handleTaskDuePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || event.type === 'dismissed') {
      return;
    }

    const baseDate = newTaskDueDate ? new Date(newTaskDueDate) : new Date();

    if (taskDuePickerMode === 'date') {
      baseDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    } else {
      baseDate.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
    }

    setNewTaskDueDate(toDueDateISOString(baseDate));
    setNewTaskDuePreset(null);
  };

  const closeFacultyTaskComposer = () => {
    if (isAddingFacultyTask) return;
    setShowFacultyTaskDuePicker(false);
    setShowFacultyTaskComposer(false);
  };

  // Sync close-handler refs so the stable PanResponders always invoke the
  // latest version of each close function (functions are redefined each render).
  closeTaskComposerRef.current = closeTaskComposer;
  closeNoteComposerRef.current = closeNoteComposer;
  closeFacultyTaskComposerRef.current = closeFacultyTaskComposer;

  const openFacultyTaskDuePicker = (mode: 'date' | 'time') => {
    if (Platform.OS === 'android') {
      const baseDate = newFacultyTaskDueDate ? new Date(newFacultyTaskDueDate) : new Date();
      DateTimePickerAndroid.open({
        value: baseDate,
        mode,
        is24Hour: false,
        display: 'default',
        onChange: (event, selectedDate) => {
          if (!selectedDate || event.type !== 'set') return;
          const nextDate = newFacultyTaskDueDate ? new Date(newFacultyTaskDueDate) : new Date();
          if (mode === 'date') {
            nextDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
          } else {
            nextDate.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
          }
          setNewFacultyTaskDueDate(toDueDateISOString(nextDate));
          setNewFacultyTaskDuePreset(null);
        },
      });
      return;
    }

    setFacultyTaskDuePickerMode(mode);
    setShowFacultyTaskDuePicker(true);
  };

  const handleFacultyTaskDuePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate || event.type === 'dismissed') {
      return;
    }

    const baseDate = newFacultyTaskDueDate ? new Date(newFacultyTaskDueDate) : new Date();

    if (facultyTaskDuePickerMode === 'date') {
      baseDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    } else {
      baseDate.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
    }

    setNewFacultyTaskDueDate(toDueDateISOString(baseDate));
    setNewFacultyTaskDuePreset(null);
  };

  const handleFacultyUrgencyChange = (urgency: TaskUrgency) => {
    setNewFacultyTaskUrgency(urgency);
    if (!newFacultyTaskDueDate) {
      const suggestedDue = getSuggestedDueDateForUrgency(urgency);
      if (suggestedDue) {
        setNewFacultyTaskDueDate(suggestedDue);
        setNewFacultyTaskDuePreset('tomorrow_9');
      }
    }
  };

  const taskComposerPanelStyle = {
    opacity: taskComposerAnimation,
    transform: [
      {
        translateY: taskComposerAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [28, 0],
        }),
      },
    ],
  };

  const noteComposerPanelStyle = {
    opacity: noteComposerAnimation,
    transform: [
      {
        translateY: noteComposerAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [28, 0],
        }),
      },
    ],
  };

  const sortedNotes = useMemo(
    () =>
      [...notes].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) {
          return a.is_pinned ? -1 : 1;
        }
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }),
    [notes]
  );

  const sortedFacultyPublishedNotes = useMemo(
    () =>
      [...facultyPublishedNotes].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) {
          return a.is_pinned ? -1 : 1;
        }
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }),
    [facultyPublishedNotes]
  );

  const getClassmateDisplayName = (classmate: Classmate) => {
    const fallback = `${classmate.first_name || ''} ${classmate.last_name || ''}`.trim();
    return (classmate.full_name || fallback || 'Unknown classmate').trim();
  };

  const getClassmateInitials = (classmate: Classmate) => {
    const name = getClassmateDisplayName(classmate);
    const parts = name.split(' ').filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  const sortedClassmates = useMemo(
    () => [...classmates].sort((a, b) => getClassmateDisplayName(a).localeCompare(getClassmateDisplayName(b))),
    [classmates]
  );

  const facultyComposerPanelStyle = {
    opacity: facultyComposerAnimation,
    transform: [
      {
        translateY: facultyComposerAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [28, 0],
        }),
      },
    ],
  };

  // Sync mutable refs so PanResponders always see the latest values.
  isAddingTaskRef.current = isAddingTask;
  isAddingNoteRef.current = isAddingNote;
  isAddingFacultyTaskRef.current = isAddingFacultyTask;

  // ============================================
  // Render
  // ============================================
  const fabTaskLabel = shouldUseFacultyTaskFlow ? addTaskLabel : 'Add Task';
  const fabButtonColor = '#111827';
  const shouldShowFab = !shouldUseFacultyTaskFlow && !showTaskComposer && !showFacultyTaskComposer && !showNoteComposer;
  const displayTitle = rawTitle || 'Untitled Subject';

  return (
    <>
      <View className='px-5 pt-3 pb-2 bg-gray-50'>
        <TouchableOpacity
          onPress={handleBack}
          className="w-10 h-10 rounded-full bg-white border border-gray-200 items-center justify-center"
        >
          <LeftPointingArrow size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 bg-gray-50" onScrollBeginDrag={() => setIsFabMenuOpen(false)}>
        <View className="px-5 pb-24">
          {/* Subject Overview */}
          <View className="w-full bg-white p-4 rounded-2xl mb-4 border border-gray-200">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Subject</Text>
                <Text className="text-[22px] font-semibold text-gray-900">{displayTitle}</Text>
              </View>
              {isClassItem && (
                <View className="bg-gray-100 px-3 py-1.5 rounded-full">
                  <Text className="text-xs font-semibold text-gray-700">{day || 'N/A'}</Text>
                </View>
              )}
            </View>

            <View className="border-t border-gray-100 mt-4 pt-3">
              <Text className="text-sm font-semibold text-gray-800 mb-2">Schedule</Text>

              <View className="flex-row items-center mb-2.5">
                <Text className="text-gray-500 w-20">Time</Text>
                <Text className="text-gray-800 font-medium">{time || 'N/A'}</Text>
              </View>

              <View className="flex-row items-center mb-2.5">
                <Text className="text-gray-500 w-20">Day</Text>
                <Text className="text-gray-800 font-medium">{day || 'N/A'}</Text>
              </View>

              <View className="flex-row items-center">
                <Text className="text-gray-500 w-20">Location</Text>
                <Text className="text-gray-800 font-medium">{location || 'N/A'}</Text>
              </View>
            </View>
          </View>

        {/* ============================================ */}
        {/* FACULTY VIEW: Class Code + Faculty Tasks     */}
        {/* ============================================ */}
        {shouldUseFacultyTaskFlow && (
          <>
            {/* Class Code Section — only for faculty-extracted subjects */}
            {isFacultyCourse && <View className="bg-white p-4 rounded-2xl mb-5 border border-orange-100">
              <Text className="text-lg font-bold text-orange-800 mb-2">Class Code</Text>
              {!isFacultyVerified && (
                <View className="bg-red-100 border border-red-200 rounded-lg p-3 mb-3">
                  <Text className="text-red-700 text-xs font-semibold">
                    Pending Verification: class code generation is disabled until an admin verifies your faculty account.
                  </Text>
                </View>
              )}
              {classCode ? (
                <View className="flex-row items-center justify-between">
                  <View className="bg-white px-4 py-3 rounded-lg flex-1 mr-3">
                    <Text className="text-2xl font-bold text-orange-600 tracking-widest text-center">
                      {classCode.code}
                    </Text>
                  </View>
                  <View>
                    <TouchableOpacity
                      onPress={handleCopyClassCode}
                      className="bg-orange-500 px-4 py-2 rounded-lg mb-1"
                    >
                      <Text className="text-white font-semibold text-sm">Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleGenerateClassCode}
                      disabled={isGeneratingCode || !isFacultyVerified}
                      className="bg-orange-200 px-4 py-2 rounded-lg"
                    >
                      <Text className={`font-semibold text-sm ${isFacultyVerified ? 'text-orange-700' : 'text-gray-500'}`}>
                        {isGeneratingCode ? '...' : isFacultyVerified ? 'New' : 'Locked'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleGenerateClassCode}
                  disabled={isGeneratingCode || !isFacultyVerified}
                  className={`py-3 rounded-lg items-center ${isFacultyVerified ? 'bg-orange-500' : 'bg-gray-400'}`}
                >
                  {isGeneratingCode ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text className="text-white font-bold">{isFacultyVerified ? 'Generate Class Code' : 'Verification Required'}</Text>
                  )}
                </TouchableOpacity>
              )}
              <Text className="text-orange-600 text-xs mt-2">
                Share this code with students so they can join your class.
              </Text>
            </View>}

            <View className="flex-row mb-5">
              <TouchableOpacity
                onPress={() => setShowFacultyTaskComposer(true)}
                className="flex-1 bg-orange-500 rounded-xl py-3.5 px-3 mr-2 items-center"
              >
                <Text className="text-white font-bold text-sm">New Class Task</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openCreateNoteComposer}
                className="flex-1 bg-white border border-gray-300 rounded-xl py-3.5 px-3 ml-2 items-center"
              >
                <Text className="text-gray-800 font-semibold text-sm">New Note</Text>
              </TouchableOpacity>
            </View>

            {/* Faculty Tasks List */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-gray-900">{taskLabelPlural}</Text>
              {isFacultyLoading && <ActivityIndicator size="small" color="#f97316" />}
            </View>

            {isFacultyLoading ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#f97316" />
                <Text className="text-gray-500 mt-2">Loading tasks...</Text>
              </View>
            ) : facultyTasks.length === 0 ? (
              <Text className="text-gray-500 mb-4">{noTasksLabel}</Text>
            ) : (
              facultyTasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  onPress={() => handleViewStats(task)}
                  className="bg-white p-4 rounded-2xl mb-3 border border-gray-200"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <View className="flex-row items-center mb-1">
                        <View className={`px-2 py-0.5 rounded-full ${facultyUrgencyStyles[(task.effective_urgency || task.urgency || 'medium') as TaskUrgency].bg}`}>
                          <Text className={`text-[10px] font-semibold uppercase ${facultyUrgencyStyles[(task.effective_urgency || task.urgency || 'medium') as TaskUrgency].text}`}>
                            {task.effective_urgency || task.urgency || 'medium'}
                          </Text>
                        </View>
                        {task.is_overdue && (
                          <Text className="text-[10px] font-semibold text-red-600 ml-2">Overdue</Text>
                        )}
                      </View>
                      <Text className="font-semibold text-black">{task.text}</Text>
                      {task.due_date && (
                        <Text className="text-gray-400 text-xs mt-1">
                          Due: {new Date(task.due_date).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                    <View className="flex-row items-center">
                      {/* Completion badge */}
                      <View className="bg-orange-100 px-3 py-1 rounded-full mr-2">
                        <Text className="text-orange-700 font-bold text-sm">
                          {task.completed_count}/{task.total_enrolled}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDeleteFacultyTask(task)}
                        className="p-2"
                      >
                        <TrashIcon size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}

          </>
        )}

        {/* ============================================ */}
        {/* STUDENT VIEW: Faculty Tasks + Personal Tasks */}
        {/* ============================================ */}
        {isStudent && (
          <>
            {/* Faculty Tasks Section */}
            <View className="mb-6">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-lg font-semibold text-gray-900">Faculty Tasks</Text>
                {studentFacultyTasks.length > 0 && (
                  <View className="bg-gray-100 rounded-full px-2 py-0.5">
                    <Text className="text-gray-600 text-xs font-semibold">{studentFacultyTasks.length}</Text>
                  </View>
                )}
                {isFacultyLoading && <ActivityIndicator size="small" color="#f97316" />}
              </View>

              {isFacultyLoading ? (
                <View className="py-4 items-center">
                  <ActivityIndicator size="small" color="#f97316" />
                </View>
              ) : studentFacultyTasks.length > 0 ? (
                studentFacultyTasks.map((task) => (
                  <View
                    key={`ft-${task.id}`}
                    className={`bg-white p-3.5 rounded-xl mb-2.5 border border-gray-200 flex-row items-center ${task.is_completed ? 'opacity-60' : ''
                      }`}
                  >
                    <ExpoCheckbox
                      value={task.is_completed}
                      onValueChange={() => handleToggleFacultyTaskComplete(task)}
                      color="#f97316"
                    />
                    <View className="flex-1 ml-3">
                      <View className="flex-row items-center mb-1">
                        <View className={`px-2 py-0.5 rounded-full ${facultyUrgencyStyles[(task.effective_urgency || task.urgency || 'medium') as TaskUrgency].bg}`}>
                          <Text className={`text-[10px] font-semibold uppercase ${facultyUrgencyStyles[(task.effective_urgency || task.urgency || 'medium') as TaskUrgency].text}`}>
                            {task.effective_urgency || task.urgency || 'medium'}
                          </Text>
                        </View>
                        {task.is_overdue && (
                          <Text className="text-[10px] font-semibold text-red-600 ml-2">Overdue</Text>
                        )}
                      </View>
                      <Text
                        className={`font-semibold ${task.is_completed ? 'text-gray-400 line-through' : 'text-black'
                          }`}
                      >
                        {task.text}
                      </Text>
                      <Text className="text-gray-500 text-xs mt-0.5">
                        By {task.faculty_name}
                        {task.due_date && ` • Due ${new Date(task.due_date).toLocaleDateString()}`}
                      </Text>
                      {task.has_file && task.files && task.files.length > 0 && (
                        <View className="mt-1.5">
                          {task.files.map((f, idx) => (
                            <TouchableOpacity
                              key={f.id ?? idx}
                              onPress={() => handleDownloadFile({ id: task.id, file_name: f.file_name, file_id: f.id })}
                              disabled={downloadingTaskId !== null}
                              className={`flex-row items-center max-w-full overflow-hidden px-2.5 py-1.5 rounded-md mb-1 ${downloadingTaskId === task.id ? 'bg-blue-100' : 'bg-blue-50'
                                }`}
                              activeOpacity={0.6}
                            >
                              {downloadingTaskId === task.id ? (
                                <ActivityIndicator size={12} color="#3b82f6" />
                              ) : (
                                <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" style={{ flexShrink: 0 }}>
                                  <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                  <Path d="M14 2v6h6" />
                                  <Path d="M16 13H8" />
                                  <Path d="M16 17H8" />
                                  <Path d="M10 9H8" />
                                </Svg>
                              )}
                              <Text className="text-blue-600 text-xs ml-1.5 font-medium flex-1 shrink" numberOfLines={1}>
                                {downloadingTaskId === task.id ? 'Downloading...' : (f.file_name || "Attachment")}
                              </Text>
                              {downloadingTaskId !== task.id && (
                                <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" style={{ marginLeft: 4, flexShrink: 0 }}>
                                  <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                  <Path d="M7 10l5 5 5-5" />
                                  <Path d="M12 15V3" />
                                </Svg>
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                ))
              ) : canShowJoinClassCode ? (
                /* Join Class Code — opens the verification modal */
                <View className="bg-white p-4 rounded-xl border border-gray-200">
                  <Text className="text-gray-600 text-sm mb-3">
                    Enter a class code from your instructor to see their tasks and join the class.
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowJoinClassModal(true)}
                    className="bg-orange-500 py-3 rounded-xl items-center"
                  >
                    <Text className="text-white font-bold">Enter Class Code</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View className="bg-white border border-dashed border-gray-300 rounded-xl p-4">
                  <Text className="text-gray-500 text-sm">No faculty tasks assigned yet.</Text>
                </View>
              )}
            </View>

            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-lg font-semibold text-gray-900">Faculty Notes</Text>
                <View className="bg-gray-100 rounded-full px-2 py-0.5">
                  <Text className="text-gray-600 text-xs font-semibold">{sortedFacultyPublishedNotes.length}</Text>
                </View>
              </View>
              {sortedFacultyPublishedNotes.length === 0 ? (
                <View className="bg-white border border-gray-200 rounded-xl p-3">
                  <Text className="text-gray-500 text-sm">No faculty notes published for this class yet.</Text>
                </View>
              ) : (
                sortedFacultyPublishedNotes.map((note) => (
                  <View key={`faculty-note-${note.id}`} className="bg-white border border-gray-200 rounded-xl p-3 mb-2">
                    <View className="flex-row items-center mb-1.5">
                      {note.is_pinned && (
                        <View className="bg-orange-50 px-2 py-0.5 rounded-full mr-2">
                          <Text className="text-[10px] font-semibold uppercase text-orange-700">Pinned</Text>
                        </View>
                      )}
                      <Text className="text-[11px] text-gray-500 flex-1" numberOfLines={1}>
                        {note.faculty_name || 'Faculty'}
                      </Text>
                      <Text className="text-[11px] text-gray-400">
                        {new Date(note.updated_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text className="text-sm text-gray-800 leading-5">{note.text}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Personal Tasks Section */}
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-gray-900">My Tasks</Text>
              {isLoading && <ActivityIndicator size="small" color="#DC2626" />}
            </View>

            {/* Faculty Remarks Section (Student view) */}
            {studentRemarks.length > 0 && (
              <View className="mb-6">
                <View className="flex-row items-center mb-3">
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
                    <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </Svg>
                  <Text className="text-base font-bold text-gray-800 ml-2">Faculty Remarks</Text>
                  <View className="bg-gray-100 rounded-full px-2 py-0.5 ml-2">
                    <Text className="text-gray-500 text-xs font-medium">{studentRemarks.length}</Text>
                  </View>
                </View>
                {studentRemarks.map((remark) => (
                  <TouchableOpacity
                    key={remark.id}
                    onPress={() => setViewingStudentRemark(remark)}
                    activeOpacity={0.7}
                    className="bg-white rounded-xl mb-2.5 p-3.5"
                    style={{
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 3,
                      elevation: 1,
                    }}
                  >
                    <View className="flex-row items-center mb-2">
                      <View className="w-8 h-8 rounded-full bg-orange-100 justify-center items-center mr-2.5">
                        <Text className="text-xs font-bold text-orange-600">
                          {(remark.faculty_name?.charAt(0) || 'F').toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-900 text-sm">{remark.faculty_name}</Text>
                      </View>
                      <Text className="text-gray-400 text-xs">{remark.time_ago}</Text>
                    </View>
                    <Text className="text-gray-700 text-sm leading-5" numberOfLines={3}>
                      {remark.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {/* ============================================ */}
        {/* PERSONAL TASKS (all users outside faculty-task flow) */}
        {/* ============================================ */}
        {!shouldUseFacultyTaskFlow && (
          <>
            {/* Only show header for non-student (students already have it above) */}
            {!isStudent && (
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-lg font-semibold text-gray-900">Tasks</Text>
                {isLoading && <ActivityIndicator size="small" color="#DC2626" />}
              </View>
            )}

            {isLoading ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#DC2626" />
                <Text className="text-gray-500 mt-2">Loading tasks...</Text>
              </View>
            ) : tasks.length === 0 ? (
              <Text className="text-gray-500 mb-4">No active tasks yet. Tap + to add one.</Text>
            ) : (
              tasks.map((task) => (
                <View
                  key={task.id}
                  className={`bg-white p-3.5 rounded-xl mb-2.5 border border-gray-200 flex-row items-center ${task.is_completed ? 'opacity-60' : ''
                    }`}
                >
                  <ExpoCheckbox
                    value={task.is_completed}
                    onValueChange={() => handleToggleComplete(task)}
                    color="#DC2626"
                  />
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center mb-1">
                      <View className={`px-2 py-0.5 rounded-full ${urgencyBadgeStyles[(task.effective_urgency || task.urgency || 'medium') as TaskUrgency].bg}`}>
                        <Text className={`text-[10px] font-semibold uppercase ${urgencyBadgeStyles[(task.effective_urgency || task.urgency || 'medium') as TaskUrgency].text}`}>
                          {task.effective_urgency || task.urgency || 'medium'}
                        </Text>
                      </View>
                      {task.is_overdue && (
                        <Text className="text-[10px] font-semibold text-red-600 ml-2">Overdue</Text>
                      )}
                    </View>
                    <Text
                      className={`font-semibold ${task.is_completed ? 'text-gray-400 line-through' : 'text-black'
                        }`}
                    >
                      {task.text}
                    </Text>
                    {task.due_date && (
                      <Text className="text-xs text-gray-500 mt-0.5">
                        Due {new Date(task.due_date).toLocaleString()}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteTask(task)}
                    className="p-2"
                  >
                    <TrashIcon size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              ))
            )}

          </>
        )}

        {/* ============================================ */}
        {/* QUICK NOTES (all users)                      */}
        {/* ============================================ */}
        <View className="mb-8">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-lg font-semibold text-gray-900">
              {shouldUseFacultyTaskFlow ? 'Class Notes' : 'Quick Notes'}
            </Text>
            {(isLoading || isFacultyLoading) && (
              <ActivityIndicator size="small" color={shouldUseFacultyTaskFlow ? '#F97316' : '#0284C7'} />
            )}
          </View>

          {isLoading || isFacultyLoading ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color={shouldUseFacultyTaskFlow ? '#F97316' : '#0284C7'} />
              <Text className="text-gray-500 mt-2">Loading notes...</Text>
            </View>
          ) : sortedNotes.length === 0 ? (
            <Text className="text-gray-500 mb-4">No quick notes yet. Tap + to add one.</Text>
          ) : (
            sortedNotes.map((note) => (
              <View
                key={`note-${note.id}`}
                className="bg-white p-3.5 rounded-xl mb-2.5 border border-gray-200"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-3">
                    <View className="flex-row items-center mb-1.5">
                      {note.is_pinned && (
                        <View className="bg-gray-100 px-2 py-0.5 rounded-full mr-2">
                          <Text className="text-[10px] font-semibold uppercase text-gray-700">
                            Favorite
                          </Text>
                        </View>
                      )}
                      <Text className="text-[11px] text-gray-500">
                        {inlineEditingNoteId === note.id ? 'Editing... auto-saves when you tap away' : 'Tap to edit inline'}
                      </Text>
                    </View>

                    {inlineEditingNoteId === note.id ? (
                      <>
                        <View className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 mb-2">
                          <TextInput
                            value={inlineNoteText}
                            onChangeText={setInlineNoteText}
                            onBlur={() => handleInlineNoteBlur(note)}
                            editable={!isSavingInlineNote}
                            multiline
                            textAlignVertical="top"
                            autoFocus
                            className="text-gray-800 min-h-[72px]"
                          />
                        </View>
                        <View className="flex-row items-center">
                          <TouchableOpacity
                            onPress={() => {
                              skipInlineBlurSaveRef.current = true;
                              handleSaveInlineEdit(note);
                            }}
                            disabled={isSavingInlineNote || !inlineNoteText.trim()}
                            className={`px-3 py-2 rounded-lg mr-2 ${isSavingInlineNote || !inlineNoteText.trim() ? 'bg-gray-300' : 'bg-gray-900'}`}
                          >
                            <Text className="text-white text-xs font-semibold">Save</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              skipInlineBlurSaveRef.current = true;
                              handleCancelInlineEdit();
                            }}
                            disabled={isSavingInlineNote}
                            className="px-3 py-2 rounded-lg bg-gray-100"
                          >
                            <Text className="text-gray-700 text-xs font-semibold">Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : (
                      <TouchableOpacity activeOpacity={0.7} onPress={() => handleStartInlineEdit(note)}>
                        <Text className="text-gray-800 leading-5">{note.text}</Text>
                        <Text className="text-[11px] mt-2 text-gray-500">
                          Updated {new Date(note.updated_at).toLocaleString()}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View className="items-center">
                    <TouchableOpacity
                      onPress={() => handleTogglePinNote(note)}
                      disabled={inlineEditingNoteId === note.id && isSavingInlineNote}
                      className={`p-2 rounded-full mb-1 ${(note.is_pinned ? 'bg-gray-100' : '')} ${inlineEditingNoteId === note.id && isSavingInlineNote ? 'opacity-50' : ''}`}
                    >
                      <FavoriteIcon size={18} color="#374151" active={note.is_pinned} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteNote(note)} className="p-2" disabled={inlineEditingNoteId === note.id && isSavingInlineNote}>
                      <TrashIcon size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}

        </View>

        {/* Classmates Section (lower priority placement) */}
        {isStudent && isClassItem && (
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-semibold text-gray-900">Classmates</Text>
              {isClassmatesLoading ? (
                <ActivityIndicator size="small" color="#0284C7" />
              ) : (
                <View className="bg-gray-100 rounded-full px-2 py-0.5">
                  <Text className="text-gray-600 text-xs font-semibold">{classmates.length}</Text>
                </View>
              )}
            </View>

            {!isEnrolled ? (
              <View className="bg-white border border-dashed border-gray-300 rounded-xl p-4">
                <Text className="text-gray-500 text-sm">Join this class first to view classmates.</Text>
              </View>
            ) : isClassmatesLoading ? (
              <View className="bg-white border border-gray-200 rounded-xl p-4 items-center">
                <ActivityIndicator size="small" color="#0284C7" />
                <Text className="text-gray-500 text-sm mt-2">Loading classmates...</Text>
              </View>
            ) : classmates.length === 0 ? (
              <View className="bg-white border border-dashed border-gray-300 rounded-xl p-4">
                <Text className="text-gray-500 text-sm">No classmates found yet for this class.</Text>
              </View>
            ) : (
              <View className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {classmateFacultyName ? (
                  <View className="px-3.5 py-3 border-b border-gray-100">
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Faculty</Text>
                    <Text className="text-sm font-medium text-gray-800">{classmateFacultyName}</Text>
                  </View>
                ) : null}

                {sortedClassmates.map((classmate, index) => (
                  <View
                    key={`classmate-${classmate.id}`}
                    className={`px-3.5 py-3 flex-row items-center ${index < sortedClassmates.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <View className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center mr-3">
                      <Text className="text-xs font-bold text-gray-700">{getClassmateInitials(classmate)}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-gray-900">{getClassmateDisplayName(classmate)}</Text>
                      {classmate.enrollment_type && (
                        <Text className="text-xs text-gray-500 mt-0.5">
                          Joined via {classmate.enrollment_type === 'auto' ? 'auto-match' : 'class code'}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        </View>

      </ScrollView>

      {shouldShowFab && (
        <>
          {isFabMenuOpen && (
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setIsFabMenuOpen(false)}
              className="absolute inset-0 bg-black/20"
            />
          )}

          <View pointerEvents="box-none" className="absolute bottom-6 right-5 items-end">
            {isFabMenuOpen && (
              <View className="mb-3 items-end">
                <TouchableOpacity
                  onPress={openTaskComposerFromFab}
                  className="bg-white border border-gray-300 rounded-full px-4 py-2.5 mb-2"
                  style={{
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 3,
                  }}
                >
                  <Text className="text-[13px] font-semibold text-gray-800">{fabTaskLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={openNoteComposerFromFab}
                  className="bg-white border border-gray-300 rounded-full px-4 py-2.5"
                  style={{
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 3,
                  }}
                >
                  <Text className="text-[13px] font-semibold text-gray-800">Add Note</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              onPress={() => setIsFabMenuOpen((prev) => !prev)}
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{
                backgroundColor: fabButtonColor,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.18,
                shadowRadius: 6,
                elevation: 6,
              }}
            >
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                {isFabMenuOpen ? (
                  <Path d="M18 6L6 18M6 6l12 12" />
                ) : (
                  <Path d="M12 5v14M5 12h14" />
                )}
              </Svg>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Modal
        visible={showTaskComposer}
        transparent
        animationType="slide"
        onRequestClose={closeTaskComposer}
      >
        <KeyboardAvoidingView
          className="flex-1 justify-end"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Backdrop — tap to dismiss */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeTaskComposer}
            className="absolute inset-0 bg-black/45"
          />
          <Animated.View className="bg-white rounded-t-3xl max-h-[92%]" style={taskComposerPanelStyle}>
            {/* Drag handle — swipe down to dismiss */}
            <View className="items-center pt-3 pb-2" {...taskSheetPanResponder.panHandlers}>
              <View className="w-12 h-1 bg-gray-300 rounded-full" />
            </View>

            <ScrollView className="px-5" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
              <View className="flex-row items-start justify-between mb-4">
                <View className="flex-1 mr-3">
                  <Text className="text-lg font-bold text-gray-900">Add New Task</Text>
                  <Text className="text-xs text-gray-500 mt-1">
                    Capture it fast, then set urgency and due date in one place.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeTaskComposer}
                  className="bg-gray-100 rounded-full px-3 py-1.5"
                >
                  <Text className="text-xs font-semibold text-gray-600">Close</Text>
                </TouchableOpacity>
              </View>

              <View className="bg-gray-50 border border-gray-200 rounded-2xl p-3 mb-4">
                <TextInput
                  value={newTaskText}
                  onChangeText={setNewTaskText}
                  placeholder="What needs to be done?"
                  className="text-base text-gray-900"
                  editable={!isAddingTask}
                  onSubmitEditing={handleAddTask}
                  returnKeyType="done"
                  autoFocus
                />
              </View>

              <Text className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mb-2">Priority</Text>
              <View className="flex-row flex-wrap mb-4">
                {urgencyChoices.map((urgency) => {
                  const selected = newTaskUrgency === urgency;
                  return (
                    <TouchableOpacity
                      key={`modal-${urgency}`}
                      onPress={() => handleTaskUrgencyChange(urgency)}
                      className="mr-2 mb-2 px-3.5 py-2 rounded-full border flex-row items-center"
                      style={getUrgencyChipContainerStyle(urgency, selected)}
                    >
                      <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: urgencyPalette[urgency] }} />
                      <Text className="text-xs font-semibold uppercase" style={{ color: getUrgencyChipTextColor(urgency, selected) }}>
                        {urgency}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mb-2">Due Date</Text>
              <View className="flex-row flex-wrap mb-1">
                {dueDatePresets.map((preset) => (
                  <TouchableOpacity
                    key={`modal-personal-due-${preset.key}`}
                    onPress={() => applyTaskDuePreset(preset)}
                    className="mr-2 mb-2 px-3 py-2 rounded-full border"
                    style={getUrgencyChipContainerStyle(newTaskUrgency, newTaskDuePreset === preset.key)}
                  >
                    <Text className="text-xs font-semibold" style={{ color: getUrgencyChipTextColor(newTaskUrgency, newTaskDuePreset === preset.key) }}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={clearTaskDueDate}
                  className="mr-2 mb-2 px-3 py-2 rounded-full border"
                  style={getUrgencyChipContainerStyle(newTaskUrgency, !newTaskDueDate)}
                >
                  <Text className="text-xs font-semibold" style={{ color: getUrgencyChipTextColor(newTaskUrgency, !newTaskDueDate) }}>No Due Date</Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row mb-3">
                <TouchableOpacity
                  onPress={() => openTaskDuePicker('date')}
                  className="flex-1 bg-white border border-gray-300 rounded-xl py-2.5 px-3 mr-2"
                >
                  <Text className="text-[11px] font-semibold uppercase text-gray-500 mb-0.5">Date</Text>
                  <Text className="text-sm text-gray-800">
                    {newTaskDueDate ? new Date(newTaskDueDate).toLocaleDateString() : 'Select date'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openTaskDuePicker('time')}
                  className="flex-1 bg-white border border-gray-300 rounded-xl py-2.5 px-3"
                >
                  <Text className="text-[11px] font-semibold uppercase text-gray-500 mb-0.5">Time</Text>
                  <Text className="text-sm text-gray-800">
                    {newTaskDueDate
                      ? new Date(newTaskDueDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      : 'Select time'}
                  </Text>
                </TouchableOpacity>
              </View>

              {showTaskDuePicker && (
                <View className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3">
                  <DateTimePicker
                    value={newTaskDueDate ? new Date(newTaskDueDate) : new Date()}
                    mode={taskDuePickerMode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleTaskDuePickerChange}
                  />
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity
                      onPress={() => setShowTaskDuePicker(false)}
                      className="bg-primary-600 py-2.5 rounded-lg mt-2 items-center"
                    >
                      <Text className="text-white text-xs font-semibold">Done</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
                <Text className="text-[11px] text-gray-600 font-semibold uppercase mb-1">Selected Deadline</Text>
                <Text className="text-sm font-semibold text-gray-900">{formatDueDatePreview(newTaskDueDate)}</Text>
                <Text className={`text-[11px] mt-1 ${requiresDueDate(newTaskUrgency) && !newTaskDueDate ? 'text-red-600' : 'text-gray-600'}`}>
                  {getUrgencyHint(newTaskUrgency, newTaskDueDate)}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleAddTask}
                disabled={isAddingTask || !newTaskText.trim()}
                className={`py-3 rounded-xl items-center ${isAddingTask || !newTaskText.trim() ? 'bg-gray-300' : 'bg-primary-600'}`}
              >
                {isAddingTask ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold">Create Task</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showNoteComposer}
        transparent
        animationType="slide"
        onRequestClose={closeNoteComposer}
      >
        <KeyboardAvoidingView
          className="flex-1 justify-end"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Backdrop — tap to dismiss */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeNoteComposer}
            className="absolute inset-0 bg-black/45"
          />
          <Animated.View className="bg-white rounded-t-3xl max-h-[86%]" style={noteComposerPanelStyle}>
            {/* Drag handle — swipe down to dismiss */}
            <View className="items-center pt-3 pb-2" {...noteSheetPanResponder.panHandlers}>
              <View className="w-12 h-1 bg-gray-300 rounded-full" />
            </View>

            <ScrollView className="px-5" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
              <View className="flex-row items-start justify-between mb-4">
                <View className="flex-1 mr-3">
                  <Text className="text-lg font-bold text-gray-900">Add Quick Note</Text>
                  <Text className="text-xs text-gray-500 mt-1">
                    Keep it short and useful. Notes are tied to this subject only.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeNoteComposer}
                  className="bg-gray-100 rounded-full px-3 py-1.5"
                >
                  <Text className="text-xs font-semibold text-gray-600">Close</Text>
                </TouchableOpacity>
              </View>

              <View className="bg-sky-50 border border-sky-200 rounded-2xl p-3 mb-4">
                <TextInput
                  value={newNoteText}
                  onChangeText={setNewNoteText}
                  placeholder="Type a quick note for this subject..."
                  className="text-base text-gray-900 min-h-[120px]"
                  editable={!isAddingNote}
                  multiline
                  textAlignVertical="top"
                  autoFocus
                />
              </View>

              <TouchableOpacity
                onPress={handleSaveNote}
                disabled={isAddingNote || !newNoteText.trim()}
                className={`py-3 rounded-xl items-center ${isAddingNote || !newNoteText.trim() ? 'bg-gray-300' : 'bg-sky-700'}`}
              >
                {isAddingNote ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold">Save Note</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showFacultyTaskComposer}
        transparent
        animationType="slide"
        onRequestClose={closeFacultyTaskComposer}
      >
        <KeyboardAvoidingView
          className="flex-1 justify-end"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Backdrop — tap to dismiss */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeFacultyTaskComposer}
            className="absolute inset-0 bg-black/45"
          />
          <Animated.View className="bg-white rounded-t-3xl max-h-[92%]" style={facultyComposerPanelStyle}>
            {/* Drag handle — swipe down to dismiss */}
            <View className="items-center pt-3 pb-2" {...facultySheetPanResponder.panHandlers}>
              <View className="w-12 h-1 bg-gray-300 rounded-full" />
            </View>

            <ScrollView className="px-5" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
              <View className="flex-row items-start justify-between mb-4">
                <View className="flex-1 mr-3">
                  <Text className="text-lg font-bold text-gray-900">{addTaskLabel}</Text>
                  <Text className="text-xs text-gray-500 mt-1">
                    Keep class assignments clear with urgency, due date, and a concise task description.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeFacultyTaskComposer}
                  className="bg-gray-100 rounded-full px-3 py-1.5"
                >
                  <Text className="text-xs font-semibold text-gray-600">Close</Text>
                </TouchableOpacity>
              </View>

              <View className="bg-orange-50 border border-orange-200 rounded-2xl p-3 mb-4">
                <TextInput
                  value={newFacultyTaskText}
                  onChangeText={setNewFacultyTaskText}
                  placeholder={isNonClassItem ? 'Enter task...' : 'Enter task for students...'}
                  className="text-base text-gray-900"
                  editable={!isAddingFacultyTask}
                  onSubmitEditing={handleAddFacultyTask}
                  returnKeyType="done"
                  autoFocus
                />
              </View>

              <Text className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mb-2">Priority</Text>
              <View className="flex-row flex-wrap mb-4">
                {facultyUrgencyChoices.map((urgency) => {
                  const selected = newFacultyTaskUrgency === urgency;
                  return (
                    <TouchableOpacity
                      key={`modal-faculty-${urgency}`}
                      onPress={() => handleFacultyUrgencyChange(urgency)}
                      className="mr-2 mb-2 px-3.5 py-2 rounded-full border flex-row items-center"
                      style={getUrgencyChipContainerStyle(urgency, selected)}
                    >
                      <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: urgencyPalette[urgency] }} />
                      <Text className="text-xs font-semibold uppercase" style={{ color: getUrgencyChipTextColor(urgency, selected) }}>
                        {urgency}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mb-2">Due Date</Text>
              <View className="flex-row flex-wrap mb-1">
                {dueDatePresets.map((preset) => (
                  <TouchableOpacity
                    key={`modal-faculty-due-${preset.key}`}
                    onPress={() => applyFacultyDuePreset(preset)}
                    className="mr-2 mb-2 px-3 py-2 rounded-full border"
                    style={getUrgencyChipContainerStyle(newFacultyTaskUrgency, newFacultyTaskDuePreset === preset.key)}
                  >
                    <Text className="text-xs font-semibold" style={{ color: getUrgencyChipTextColor(newFacultyTaskUrgency, newFacultyTaskDuePreset === preset.key) }}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={clearFacultyDueDate}
                  className="mr-2 mb-2 px-3 py-2 rounded-full border"
                  style={getUrgencyChipContainerStyle(newFacultyTaskUrgency, !newFacultyTaskDueDate)}
                >
                  <Text className="text-xs font-semibold" style={{ color: getUrgencyChipTextColor(newFacultyTaskUrgency, !newFacultyTaskDueDate) }}>No Due Date</Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row mb-3">
                <TouchableOpacity
                  onPress={() => openFacultyTaskDuePicker('date')}
                  className="flex-1 bg-white border border-gray-300 rounded-xl py-2.5 px-3 mr-2"
                >
                  <Text className="text-[11px] font-semibold uppercase text-gray-500 mb-0.5">Date</Text>
                  <Text className="text-sm text-gray-800">
                    {newFacultyTaskDueDate ? new Date(newFacultyTaskDueDate).toLocaleDateString() : 'Select date'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openFacultyTaskDuePicker('time')}
                  className="flex-1 bg-white border border-gray-300 rounded-xl py-2.5 px-3"
                >
                  <Text className="text-[11px] font-semibold uppercase text-gray-500 mb-0.5">Time</Text>
                  <Text className="text-sm text-gray-800">
                    {newFacultyTaskDueDate
                      ? new Date(newFacultyTaskDueDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      : 'Select time'}
                  </Text>
                </TouchableOpacity>
              </View>

              {showFacultyTaskDuePicker && (
                <View className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
                  <DateTimePicker
                    value={newFacultyTaskDueDate ? new Date(newFacultyTaskDueDate) : new Date()}
                    mode={facultyTaskDuePickerMode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleFacultyTaskDuePickerChange}
                  />
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity
                      onPress={() => setShowFacultyTaskDuePicker(false)}
                      className="bg-orange-500 py-2.5 rounded-lg mt-2 items-center"
                    >
                      <Text className="text-white text-xs font-semibold">Done</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4">
                <Text className="text-[11px] text-orange-700 font-semibold uppercase mb-1">Selected Deadline</Text>
                <Text className="text-sm font-semibold text-gray-900">{formatDueDatePreview(newFacultyTaskDueDate)}</Text>
                <Text className={`text-[11px] mt-1 ${requiresDueDate(newFacultyTaskUrgency) && !newFacultyTaskDueDate ? 'text-red-600' : 'text-gray-600'}`}>
                  {getUrgencyHint(newFacultyTaskUrgency, newFacultyTaskDueDate)}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleAddFacultyTask}
                disabled={isAddingFacultyTask || !newFacultyTaskText.trim()}
                className={`py-3 rounded-xl items-center ${isAddingFacultyTask || !newFacultyTaskText.trim() ? 'bg-gray-300' : 'bg-orange-500'}`}
              >
                {isAddingFacultyTask ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold">Create Class Task</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Download Progress Modal */}
      <Modal
        visible={downloadingTaskId !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View className="bg-white rounded-2xl p-6 mx-8 items-center" style={{ minWidth: 280 }}>
            <View className="w-14 h-14 rounded-full bg-blue-50 items-center justify-center mb-4">
              <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <Path d="M7 10l5 5 5-5" />
                <Path d="M12 15V3" />
              </Svg>
            </View>
            <Text className="font-bold text-base text-gray-800 mb-1">Downloading File</Text>
            <Text className="text-gray-500 text-sm mb-4">{downloadStatus}</Text>
            {downloadProgress < 0 ? (
              <ActivityIndicator size="small" color="#3b82f6" style={{ marginBottom: 8 }} />
            ) : (
              <>
                <View className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                  <View
                    className="bg-blue-500 h-2.5 rounded-full"
                    style={{ width: `${Math.max(Math.round(downloadProgress * 100), 2)}%` }}
                  />
                </View>
                <Text className="text-gray-400 text-xs">
                  {Math.round(downloadProgress * 100)}%
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Join Class Modal (Student) */}
      {isStudent && (
        <JoinClassModal
          visible={showJoinClassModal}
          onClose={() => setShowJoinClassModal(false)}
          onEnrolled={handleJoinClassEnrolled}
        />
      )}

      {/* Student Remark Detail Modal (tap-to-expand) */}
      <Modal visible={!!viewingStudentRemark} transparent animationType="fade" onRequestClose={() => setViewingStudentRemark(null)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[70%]">
            <View className="items-center pt-3 pb-2">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            {viewingStudentRemark && (
              <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 30 }}>
                <View className="px-5 pb-4">
                  {/* Faculty info */}
                  <View className="flex-row items-center mb-4">
                    <View className="w-11 h-11 rounded-full bg-orange-100 justify-center items-center mr-3">
                      <Text className="text-base font-bold text-orange-600">
                        {(viewingStudentRemark.faculty_name?.charAt(0) || 'F').toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-gray-900 text-base">{viewingStudentRemark.faculty_name}</Text>
                      <View className="flex-row items-center mt-0.5">
                        <View className="bg-orange-100 rounded px-1.5 py-0.5 mr-2">
                          <Text className="text-orange-700 text-xs font-medium">{viewingStudentRemark.subject_code}</Text>
                        </View>
                        <Text className="text-gray-400 text-xs">{viewingStudentRemark.time_ago}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => setViewingStudentRemark(null)}
                      className="p-2 bg-gray-100 rounded-full"
                    >
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5">
                        <Path d="M18 6L6 18M6 6l12 12" />
                      </Svg>
                    </TouchableOpacity>
                  </View>
                  <View className="h-px bg-gray-100 mb-4" />
                  <Text className="text-gray-800 text-base leading-6">{viewingStudentRemark.text}</Text>
                  <Text className="text-gray-400 text-xs mt-4">
                    {viewingStudentRemark.created_at
                      ? new Date(viewingStudentRemark.created_at).toLocaleString()
                      : viewingStudentRemark.time_ago}
                  </Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}