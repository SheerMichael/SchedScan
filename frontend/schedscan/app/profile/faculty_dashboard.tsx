import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import Svg, { Path } from "react-native-svg";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import {
  ChevronRight,
  Copy,
  UserMinus,
  Trash2,
  Users,
  BookOpen,
  ClipboardList,
  X,
  Paperclip,
  FileText,
  Download,
} from "lucide-react-native";
import { useAuth } from "../../context/AuthContext";
import {
  facultyTaskService,
  FacultyTaskWithStats,
  ClassCode,
  TaskStats,
  ClassEnrollment,
  TaskUrgency,
} from "../../services/facultyTaskService";
import { noteService, Note } from "../../services/noteService";
import { useFileDownload } from "../../hooks/useFileDownload";
import {
  formatDueDatePreview,
  getDueDatePresets,
  getSuggestedDueDateForUrgency,
  getUrgencyHint,
  requiresDueDate,
  toDueDateISOString,
} from "../../utils/taskDueDate";
import type { DueDatePresetKey } from "../../utils/taskDueDate";

// ============================================
// Types
// ============================================

interface SubjectInfo {
  subject_key: string;
  subject_code: string;
  subject_codes: string[];
  display_subject_code: string;
  subject_name: string;
}

const normalizeSubjectCode = (value: string | null | undefined): string => {
  return (value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
};

// ============================================
// Component
// ============================================

export default function FacultyDashboard() {
  const {
    user,
    refreshUser,
    getFacultySchedules,
    getClassCodes,
    invalidateFacultyDataCache,
  } = useAuth();
  const isFacultyVerified = user?.is_verified === true;
  const verificationLockMessage =
    "Your faculty account is pending admin verification. This faculty feature is disabled until verification is approved.";

  // ---- State ----
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Subjects derived from faculty schedules
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);

  // Selected subject for detail view
  const [selectedSubject, setSelectedSubject] = useState<SubjectInfo | null>(null);

  // Class codes keyed by subject_code
  const [classCodes, setClassCodes] = useState<Record<string, ClassCode>>({});
  const [generatingCodeFor, setGeneratingCodeFor] = useState<string | null>(null);

  // Faculty tasks for selected subject
  const [facultyTasks, setFacultyTasks] = useState<FacultyTaskWithStats[]>([]);
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskUrgency, setNewTaskUrgency] = useState<TaskUrgency>('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState<string | null>(null);
  const [newTaskDuePreset, setNewTaskDuePreset] = useState<DueDatePresetKey | null>(null);
  const [showTaskDuePicker, setShowTaskDuePicker] = useState(false);
  const [taskDuePickerMode, setTaskDuePickerMode] = useState<'date' | 'time'>('date');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [showTaskComposer, setShowTaskComposer] = useState(false);

  // Subject notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [isNotesLoading, setIsNotesLoading] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [isSavingEditedNote, setIsSavingEditedNote] = useState(false);

  // Enrolled students for selected subject
  const [enrolledStudents, setEnrolledStudents] = useState<ClassEnrollment[]>([]);
  const [isStudentsLoading, setIsStudentsLoading] = useState(false);

  // Task stats modal
  const [taskStatsModal, setTaskStatsModal] = useState<TaskStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // File attachments for new task (multiple)
  const [selectedFiles, setSelectedFiles] = useState<{
    uri: string;
    name: string;
    type: string;
  }[]>([]);

  // Active tab in subject detail
  const [activeTab, setActiveTab] = useState<"tasks" | "students">("tasks");

  // File download
  const { downloadingTaskId, downloadProgress, downloadStatus, downloadFile: handleDownloadFile } = useFileDownload();

  // ---- Load top-level data ----
  const loadDashboardData = useCallback(
    async (forceRefresh = false) => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const schedules = await getFacultySchedules(forceRefresh);

        // Derive unique subjects (normalize code to consolidate split-day duplicates)
        const subjectMap = new Map<string, SubjectInfo>();
        schedules.forEach((s) => {
          s.courses.forEach((c) => {
            const rawSubjectCode = c.subject_code || "";
            const subjectKey = normalizeSubjectCode(rawSubjectCode);
            if (!subjectKey) return;

            const existing = subjectMap.get(subjectKey);
            const rawDisplayCode = rawSubjectCode.trim();
            const subjectName = (c.subject_name || "").trim();

            if (!existing) {
              subjectMap.set(subjectKey, {
                subject_key: subjectKey,
                subject_code: rawSubjectCode,
                subject_codes: [rawSubjectCode],
                display_subject_code: rawDisplayCode || subjectKey,
                subject_name: subjectName,
              });
              return;
            }

            const hasVariant = existing.subject_codes.includes(rawSubjectCode);
            if (!hasVariant) {
              existing.subject_codes.push(rawSubjectCode);
            }

            if (!existing.subject_name && subjectName) {
              existing.subject_name = subjectName;
            }

            if (subjectName && subjectName.length > existing.subject_name.length) {
              existing.subject_name = subjectName;
            }
          });
        });
        const subs: SubjectInfo[] = Array.from(subjectMap.values()).sort((a, b) =>
          a.display_subject_code.localeCompare(b.display_subject_code)
        );
        setSubjects(subs);

        // Load class codes
        try {
          const allCodes = await getClassCodes(forceRefresh);
          const codeMap: Record<string, ClassCode> = {};
          allCodes.forEach((c) => {
            const subjectKey = normalizeSubjectCode(c.subject_code);
            if (subjectKey) {
              codeMap[subjectKey] = c;
            }
          });
          setClassCodes(codeMap);
        } catch {
          // silent
        }
      } catch (err) {
        console.error("Faculty dashboard load error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id, getFacultySchedules, getClassCodes]
  );

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const run = async () => {
        try {
          await refreshUser();
        } catch (error) {
          console.warn("Failed to refresh user before loading faculty dashboard:", error);
        }

        if (isMounted) {
          await loadDashboardData(false);
        }
      };

      run();

      return () => {
        isMounted = false;
      };
    }, [refreshUser, loadDashboardData])
  );

  // ---- Load subject detail (tasks + students) ----
  const loadSubjectDetail = useCallback(
    async (subject: SubjectInfo, force = false) => {
      setIsTasksLoading(true);
      setIsStudentsLoading(true);
      setIsNotesLoading(true);
      try {
        const variantCodes = Array.from(new Set(subject.subject_codes)).filter(Boolean);

        const [tasksResponses, studentsResponses, notesResponses] = await Promise.all([
          isFacultyVerified
            ? Promise.all(variantCodes.map((code) => facultyTaskService.getFacultyTasks(code)))
            : Promise.resolve([]),
          isFacultyVerified
            ? Promise.all(variantCodes.map((code) => facultyTaskService.getEnrolledStudents(code)))
            : Promise.resolve([]),
          Promise.all(variantCodes.map((code) => noteService.getNotes(code, user?.id))),
        ]);

        const mergedTasks = tasksResponses.flatMap((resp) =>
          Array.isArray(resp) ? resp : (resp as any).results ?? []
        );
        const mergedStudents = studentsResponses.flatMap((resp) => resp.enrollments || []);
        const mergedNotes = notesResponses.flatMap((resp) => resp || []);

        const dedupedTasks = Array.from(new Map(mergedTasks.map((task) => [task.id, task])).values());
        const dedupedStudents = Array.from(new Map(mergedStudents.map((enrollment) => [enrollment.id, enrollment])).values());
        const dedupedNotes = Array.from(new Map(mergedNotes.map((note) => [note.id, note])).values());

        setFacultyTasks(dedupedTasks);
        setEnrolledStudents(dedupedStudents);
        setNotes(dedupedNotes);
      } catch (err) {
        console.error("Error loading subject detail:", err);
      } finally {
        setIsTasksLoading(false);
        setIsStudentsLoading(false);
        setIsNotesLoading(false);
      }
    },
    [isFacultyVerified, user?.id]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboardData(true);
    if (selectedSubject) {
      await loadSubjectDetail(selectedSubject, true);
    }
    setRefreshing(false);
  }, [loadDashboardData, loadSubjectDetail, selectedSubject]);

  const openSubjectDetail = useCallback(
    (sub: SubjectInfo) => {
      setSelectedSubject(sub);
      setActiveTab("tasks");
      setShowTaskComposer(false);
      setShowNoteComposer(false);
      setEditingNoteId(null);
      setEditingNoteText("");
      loadSubjectDetail(sub);
    },
    [loadSubjectDetail]
  );

  // ---- Class code actions ----
  const handleGenerateClassCode = async (subjectCode: string) => {
    if (!isFacultyVerified) {
      Alert.alert(
        "Verification Required",
        verificationLockMessage
      );
      return;
    }

    try {
      setGeneratingCodeFor(subjectCode);
      const newCode = await facultyTaskService.generateClassCode(subjectCode);
      const subjectKey = normalizeSubjectCode(newCode.subject_code || subjectCode);
      setClassCodes((prev) => ({ ...prev, [subjectKey]: newCode }));
      invalidateFacultyDataCache();
      Alert.alert("Class Code Generated", `New code: ${newCode.code}`);
    } catch (error: any) {
      const message = error?.response?.data?.error || "Failed to generate class code.";
      Alert.alert("Error", message);
    } finally {
      setGeneratingCodeFor(null);
    }
  };

  const handleCopyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert("Copied!", "Class code copied to clipboard.");
  };

  // ---- Task actions ----
  const handleAddTask = async () => {
    if (!isFacultyVerified) {
      Alert.alert("Verification Required", verificationLockMessage);
      return;
    }

    if (!newTaskText.trim() || !selectedSubject) return;

    if (requiresDueDate(newTaskUrgency) && !newTaskDueDate) {
      Alert.alert(
        "Due Date Required",
        "High and critical class tasks must include a due date."
      );
      return;
    }

    try {
      setIsAddingTask(true);
      const newTask = await facultyTaskService.createFacultyTask({
        subject_code: selectedSubject.subject_code,
        text: newTaskText.trim(),
        urgency: newTaskUrgency,
        due_date: newTaskDueDate,
        files: selectedFiles.length > 0 ? selectedFiles : undefined,
      });
      setFacultyTasks((prev) => [newTask, ...prev]);
      setNewTaskText("");
      setNewTaskUrgency('medium');
      setNewTaskDueDate(null);
      setNewTaskDuePreset(null);
      setShowTaskDuePicker(false);
      setSelectedFiles([]);
      setShowTaskComposer(false);
    } catch {
      Alert.alert("Error", "Failed to add task.");
    } finally {
      setIsAddingTask(false);
    }
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "image/png",
          "image/jpeg",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newFiles: { uri: string; name: string; type: string }[] = [];
        for (const asset of result.assets) {
          if (asset.size && asset.size > 10 * 1024 * 1024) {
            Alert.alert("File too large", `"${asset.name}" exceeds the 10 MB limit.`);
            continue;
          }
          newFiles.push({
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType || "application/octet-stream",
          });
        }
        const combined = [...selectedFiles, ...newFiles];
        if (combined.length > 5) {
          const available = 5 - selectedFiles.length;
          Alert.alert(
            "Too many files",
            available > 0
              ? `You can only attach ${available} more file${available === 1 ? '' : 's'} (max 5 per task). Please select fewer files.`
              : "You've already attached the maximum of 5 files per task."
          );
          // Don't add any of the new files — keeps previously selected files intact
        } else {
          setSelectedFiles(combined);
        }
      }
    } catch {
      Alert.alert("Error", "Failed to pick file.");
    }
  };

  const handleDeleteTask = (task: FacultyTaskWithStats) => {
    if (!isFacultyVerified) {
      Alert.alert("Verification Required", verificationLockMessage);
      return;
    }

    Alert.alert("Delete Task", `Delete "${task.text}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setFacultyTasks((prev) => prev.filter((t) => t.id !== task.id));
            await facultyTaskService.deleteFacultyTask(task.id);
          } catch {
            Alert.alert("Error", "Failed to delete task.");
            if (selectedSubject) loadSubjectDetail(selectedSubject);
          }
        },
      },
    ]);
  };

  const handleAddNote = async () => {
    if (!newNoteText.trim() || !selectedSubject) return;

    try {
      setIsAddingNote(true);
      const createdNote = await noteService.createNote(
        {
          subject_code: selectedSubject.subject_code,
          text: newNoteText.trim(),
        },
        user?.id
      );
      setNotes((prev) => [createdNote, ...prev]);
      setNewNoteText("");
      setShowNoteComposer(false);
    } catch (error) {
      console.error("Error saving note:", error);
      Alert.alert("Error", "Failed to save note.");
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleStartEditNote = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
  };

  const handleCancelEditNote = () => {
    if (isSavingEditedNote) return;
    setEditingNoteId(null);
    setEditingNoteText("");
  };

  const handleSaveEditedNote = async (note: Note) => {
    if (!selectedSubject) return;
    const nextText = editingNoteText.trim();

    if (!nextText || nextText === note.text.trim()) {
      handleCancelEditNote();
      return;
    }

    try {
      setIsSavingEditedNote(true);
      const updated = await noteService.updateNote(
        note.id,
        selectedSubject.subject_code,
        { text: nextText },
        user?.id
      );
      setNotes((prev) => prev.map((item) => (item.id === note.id ? updated : item)));
      setEditingNoteId(null);
      setEditingNoteText("");
    } catch (error) {
      console.error("Error updating note:", error);
      Alert.alert("Error", "Failed to update note.");
    } finally {
      setIsSavingEditedNote(false);
    }
  };

  const handleTogglePinNote = async (note: Note) => {
    if (!selectedSubject) return;

    const nextPinned = !note.is_pinned;
    setNotes((prev) =>
      prev.map((item) =>
        item.id === note.id ? { ...item, is_pinned: nextPinned } : item
      )
    );

    try {
      const updated = await noteService.updateNote(
        note.id,
        selectedSubject.subject_code,
        { is_pinned: nextPinned },
        user?.id
      );
      setNotes((prev) => prev.map((item) => (item.id === note.id ? updated : item)));
    } catch (error) {
      console.error("Error pinning note:", error);
      setNotes((prev) =>
        prev.map((item) =>
          item.id === note.id ? { ...item, is_pinned: note.is_pinned } : item
        )
      );
      Alert.alert("Error", "Failed to update note favorite.");
    }
  };

  const handleDeleteNote = (note: Note) => {
    if (!selectedSubject) return;

    Alert.alert("Delete Note", "Delete this note?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setNotes((prev) => prev.filter((item) => item.id !== note.id));
            if (editingNoteId === note.id) {
              setEditingNoteId(null);
              setEditingNoteText("");
            }
            await noteService.deleteNote(note.id, selectedSubject.subject_code, user?.id);
          } catch (error) {
            console.error("Error deleting note:", error);
            Alert.alert("Error", "Failed to delete note.");
            loadSubjectDetail(selectedSubject);
          }
        },
      },
    ]);
  };

  const handleViewStats = async (task: FacultyTaskWithStats) => {
    if (!isFacultyVerified) {
      Alert.alert("Verification Required", verificationLockMessage);
      return;
    }

    try {
      setIsLoadingStats(true);
      const stats = await facultyTaskService.getTaskStats(task.id);
      setTaskStatsModal(stats);
    } catch {
      Alert.alert("Error", "Failed to load stats.");
    } finally {
      setIsLoadingStats(false);
    }
  };

  // ---- Student actions ----
  const handleRemoveStudent = (enrollment: ClassEnrollment) => {
    if (!isFacultyVerified) {
      Alert.alert("Verification Required", verificationLockMessage);
      return;
    }

    Alert.alert(
      "Remove Student",
      `Remove ${enrollment.student_name} from this class?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await facultyTaskService.removeStudent({
                enrollment_id: enrollment.id,
              });
              setEnrolledStudents((prev) =>
                prev.filter((e) => e.id !== enrollment.id)
              );
            } catch {
              Alert.alert("Error", "Failed to remove student.");
            }
          },
        },
      ]
    );
  };

  // ---- Icons ----
  const LeftArrow = ({ size = 24, color = "#000" }) => (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
    >
      <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
  );

  const urgencyBadgeStyles: Record<TaskUrgency, { bg: string; text: string }> = {
    low: { bg: 'bg-gray-100', text: 'text-gray-700' },
    medium: { bg: 'bg-blue-100', text: 'text-blue-700' },
    high: { bg: 'bg-amber-100', text: 'text-amber-700' },
    critical: { bg: 'bg-red-100', text: 'text-red-700' },
  };

  const urgencyChoices: TaskUrgency[] = ['low', 'medium', 'high', 'critical'];
  const dueDatePresets = getDueDatePresets();

  const applyDuePreset = (preset: { key: DueDatePresetKey; date: Date }) => {
    setNewTaskDueDate(toDueDateISOString(preset.date));
    setNewTaskDuePreset(preset.key);
  };

  const clearDueDate = () => {
    setNewTaskDueDate(null);
    setNewTaskDuePreset(null);
    setShowTaskDuePicker(false);
  };

  const handleUrgencyChange = (urgency: TaskUrgency) => {
    setNewTaskUrgency(urgency);
    if (!newTaskDueDate) {
      const suggestedDue = getSuggestedDueDateForUrgency(urgency);
      if (suggestedDue) {
        setNewTaskDueDate(suggestedDue);
        setNewTaskDuePreset('tomorrow_9');
      }
    }
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

  const closeSubjectDetail = () => {
    if (isAddingTask || isAddingNote || isSavingEditedNote) return;
    setShowTaskComposer(false);
    setShowTaskDuePicker(false);
    setShowNoteComposer(false);
    setEditingNoteId(null);
    setEditingNoteText("");
    setSelectedSubject(null);
  };

  // ============================================
  // RENDER — Subject List (top-level)
  // ============================================
  if (!selectedSubject) {
    return (
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="px-5">
          {/* Header */}
          <View className="flex-row items-center mb-5">
            <TouchableOpacity onPress={() => router.back()} className="mr-3">
              <LeftArrow size={28} />
            </TouchableOpacity>
            <Text className="text-2xl font-bold flex-1">Faculty Dashboard</Text>
          </View>

          {/* Summary banner */}
          <View className="bg-orange-500 rounded-2xl p-5 mb-6">
            <Text className="text-white text-lg font-bold mb-1">
              Faculty Mode Active
            </Text>
            <Text className="text-white/80 text-sm">
              Manage your subjects, class codes, tasks, and students all in one
              place.
            </Text>
            {!isFacultyVerified && (
              <View className="mt-3 bg-red-500/80 rounded-lg px-3 py-2">
                <Text className="text-white text-xs font-semibold">
                  Pending Verification: Faculty tools are disabled until an admin verifies your account.
                </Text>
              </View>
            )}
            <View className="flex-row mt-3 gap-4">
              <View className="bg-white/20 rounded-xl px-4 py-2 items-center">
                <Text className="text-white font-bold text-xl">
                  {subjects.length}
                </Text>
                <Text className="text-white/80 text-xs">Subjects</Text>
              </View>
              <View className="bg-white/20 rounded-xl px-4 py-2 items-center">
                <Text className="text-white font-bold text-xl">
                  {Object.keys(classCodes).length}
                </Text>
                <Text className="text-white/80 text-xs">Active Codes</Text>
              </View>
            </View>
          </View>

          {isLoading ? (
            <View className="py-12 items-center">
              <ActivityIndicator size="large" color="#f97316" />
              <Text className="text-gray-500 mt-3">Loading subjects...</Text>
            </View>
          ) : subjects.length === 0 ? (
            <View className="py-12 items-center">
              <BookOpen size={48} color="#d1d5db" />
              <Text className="text-gray-400 mt-4 text-center">
                No faculty subjects found.{"\n"}Upload a faculty schedule to get
                started.
              </Text>
            </View>
          ) : (
            /* Subject cards */
            subjects.map((sub) => {
              const code = classCodes[sub.subject_key];
              return (
                <TouchableOpacity
                  key={sub.subject_key}
                  onPress={() => openSubjectDetail(sub)}
                  className="bg-white rounded-xl mb-3 p-4 border border-gray-200"
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="font-bold text-base text-black">
                        {sub.display_subject_code}
                      </Text>
                      {sub.subject_name ? (
                        <Text className="text-gray-500 text-sm mt-0.5">
                          {sub.subject_name}
                        </Text>
                      ) : null}
                      {code ? (
                        <View className="flex-row items-center mt-2">
                          <View className="bg-orange-100 px-2 py-1 rounded-md mr-2">
                            <Text className="text-orange-700 font-mono font-bold text-xs tracking-wider">
                              {code.code}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleCopyCode(code.code)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Copy size={14} color="#f97316" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() =>
                            handleGenerateClassCode(sub.subject_code)
                          }
                          disabled={generatingCodeFor === sub.subject_code || !isFacultyVerified}
                          className="mt-2"
                        >
                          {generatingCodeFor === sub.subject_code ? (
                            <ActivityIndicator size="small" color="#f97316" />
                          ) : (
                            <Text className={`text-xs font-semibold ${isFacultyVerified ? 'text-orange-500' : 'text-gray-400'}`}>
                              {isFacultyVerified ? '+ Generate Class Code' : 'Verification Required'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                    <ChevronRight size={20} color="#9ca3af" />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Bottom spacing */}
        <View className="h-10" />
      </ScrollView>
    );
  }

  // ============================================
  // RENDER — Subject Detail View
  // ============================================
  const subjectCode = selectedSubject.subject_code;
  const currentCode = classCodes[selectedSubject.subject_key];

  return (
    <>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="px-5">
          {/* Header */}
          <View className="flex-row items-center mb-4">
            <TouchableOpacity
              onPress={closeSubjectDetail}
              className="mr-3"
            >
              <LeftArrow size={28} />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-2xl font-bold">{selectedSubject.display_subject_code}</Text>
              {selectedSubject.subject_name ? (
                <Text className="text-gray-500 text-sm">
                  {selectedSubject.subject_name}
                </Text>
              ) : null}
            </View>
          </View>

          {/* ---- Class Code Card ---- */}
          <View className="bg-orange-50 rounded-xl p-4 mb-4 border border-orange-200">
            <Text className="font-bold text-orange-800 mb-2">
              <Text className="font-bold text-orange-800 mb-2">Class Code</Text>
            </Text>
            {currentCode ? (
              <View className="flex-row items-center justify-between">
                <View className="bg-white px-4 py-3 rounded-lg flex-1 mr-3">
                  <Text className="text-2xl font-bold text-orange-600 tracking-widest text-center">
                    {currentCode.code}
                  </Text>
                </View>
                <View>
                  <TouchableOpacity
                    onPress={() => handleCopyCode(currentCode.code)}
                    className="bg-orange-500 px-4 py-2 rounded-lg mb-1"
                  >
                    <Text className="text-white font-semibold text-sm">
                      Copy
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleGenerateClassCode(subjectCode)}
                    disabled={generatingCodeFor === subjectCode || !isFacultyVerified}
                    className="bg-orange-200 px-4 py-2 rounded-lg"
                  >
                    <Text className={`font-semibold text-sm ${isFacultyVerified ? 'text-orange-700' : 'text-gray-500'}`}>
                      {generatingCodeFor === subjectCode ? "..." : isFacultyVerified ? "New" : "Locked"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => handleGenerateClassCode(subjectCode)}
                disabled={generatingCodeFor === subjectCode || !isFacultyVerified}
                className={`py-3 rounded-lg items-center ${isFacultyVerified ? 'bg-orange-500' : 'bg-gray-400'}`}
              >
                {generatingCodeFor === subjectCode ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-bold">
                    {isFacultyVerified ? 'Generate Class Code' : 'Verification Required'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            <Text className="text-orange-600 text-xs mt-2">
              Share this code with students so they can join your class.
            </Text>
          </View>

          {/* ---- Tabs ---- */}
          <View className="flex-row mb-4 bg-gray-100 rounded-xl p-1">
            <TouchableOpacity
              onPress={() => setActiveTab("tasks")}
              className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === "tasks" ? "bg-orange-500" : ""
                }`}
            >
              <Text
                className={`font-semibold text-sm ${activeTab === "tasks" ? "text-white" : "text-gray-600"
                  }`}
              >
                Tasks
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("students")}
              className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === "students" ? "bg-orange-500" : ""
                }`}
            >
              <Text
                className={`font-semibold text-sm ${activeTab === "students" ? "text-white" : "text-gray-600"
                  }`}
              >
                Students ({enrolledStudents.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* ---- Tasks Tab ---- */}
          {activeTab === "tasks" && (
            <View>
              <View className="flex-row mb-4">
                <TouchableOpacity
                  onPress={() => {
                    setShowTaskDuePicker(false);
                    setShowTaskComposer(true);
                  }}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 mr-2"
                  activeOpacity={0.7}
                >
                  <Text className="text-black font-semibold">New Class Task</Text>
                  <Text className="text-xs text-gray-500 mt-1">
                    Assign work with urgency and deadline
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowNoteComposer(true)}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 ml-2"
                  activeOpacity={0.7}
                >
                  <Text className="text-black font-semibold">New Note</Text>
                  <Text className="text-xs text-gray-500 mt-1">
                    Keep class reminders in one place
                  </Text>
                </TouchableOpacity>
              </View>

              {isTasksLoading ? (
                <View className="py-8 items-center">
                  <ActivityIndicator size="small" color="#f97316" />
                  <Text className="text-gray-500 mt-2">Loading tasks...</Text>
                </View>
              ) : facultyTasks.length === 0 ? (
                <View className="py-8 items-center">
                  <ClipboardList size={40} color="#d1d5db" />
                  <Text className="text-gray-400 mt-3 text-center">
                    No tasks yet.{"\n"}Tap New Class Task to create one.
                  </Text>
                </View>
              ) : (
                facultyTasks.map((task) => (
                  <TouchableOpacity
                    key={task.id}
                    onPress={() => handleViewStats(task)}
                    className="bg-white p-4 rounded-xl mb-2 border border-gray-100"
                    activeOpacity={0.7}
                  >
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 mr-3">
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
                        <Text className="font-semibold text-black">
                          {task.text}
                        </Text>
                        {task.due_date && (
                          <Text className="text-gray-400 text-xs mt-1">
                            Due:{" "}
                            {new Date(task.due_date).toLocaleDateString()}
                          </Text>
                        )}
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
                                  <FileText size={12} color="#3b82f6" style={{ flexShrink: 0 }} />
                                )}
                                <Text className="text-blue-600 text-xs ml-1.5 font-medium flex-1 shrink" numberOfLines={1}>
                                  {downloadingTaskId === task.id ? 'Downloading...' : (f.file_name || "Attachment")}
                                </Text>
                                {downloadingTaskId !== task.id && (
                                  <Download size={10} color="#3b82f6" style={{ marginLeft: 4, flexShrink: 0 }} />
                                )}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                      <View className="flex-row items-center">
                        <View className="bg-orange-100 px-3 py-1 rounded-full mr-2">
                          <Text className="text-orange-700 font-bold text-sm">
                            {task.completed_count}/{task.total_enrolled}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleDeleteTask(task)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          className="p-1"
                        >
                          <Trash2 size={16} color="#9ca3af" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )}

              <View className="bg-white border border-gray-200 rounded-xl px-4 py-3 mt-4 mb-5">
                <Text className="text-xs font-semibold text-gray-700">Task deadline policy</Text>
                <Text className="text-xs text-gray-500 mt-1">
                  High and critical tasks should include a due date so students can receive reminders.
                </Text>
              </View>

              <View className="mb-6">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-bold text-base text-gray-900">Class Notes</Text>
                  <View className="px-2 py-0.5 rounded-full bg-gray-100">
                    <Text className="text-xs font-semibold text-gray-600">{sortedNotes.length}</Text>
                  </View>
                </View>

                {isNotesLoading ? (
                  <View className="py-5 items-center">
                    <ActivityIndicator size="small" color="#f97316" />
                    <Text className="text-gray-500 mt-2 text-xs">Loading notes...</Text>
                  </View>
                ) : sortedNotes.length === 0 ? (
                  <View className="bg-white border border-dashed border-gray-300 rounded-xl p-4">
                    <Text className="text-gray-500 text-sm text-center">
                      No notes yet. Use New Note for quick reminders.
                    </Text>
                  </View>
                ) : (
                  sortedNotes.map((note) => (
                    <View
                      key={`dash-note-${note.id}`}
                      className="bg-white border border-gray-200 rounded-xl p-3 mb-2"
                    >
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 mr-3">
                          <View className="flex-row items-center mb-1.5">
                            {note.is_pinned && (
                              <View className="bg-orange-50 px-2 py-0.5 rounded-full mr-2">
                                <Text className="text-[10px] uppercase font-semibold text-orange-700">Pinned</Text>
                              </View>
                            )}
                            <Text className="text-[11px] text-gray-500">
                              Updated {new Date(note.updated_at).toLocaleString()}
                            </Text>
                          </View>

                          {editingNoteId === note.id ? (
                            <>
                              <TextInput
                                value={editingNoteText}
                                onChangeText={setEditingNoteText}
                                editable={!isSavingEditedNote}
                                multiline
                                textAlignVertical="top"
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 min-h-[72px]"
                              />
                              <View className="flex-row mt-2">
                                <TouchableOpacity
                                  onPress={() => handleSaveEditedNote(note)}
                                  disabled={isSavingEditedNote || !editingNoteText.trim()}
                                  className={`px-3 py-2 rounded-lg mr-2 ${isSavingEditedNote || !editingNoteText.trim() ? 'bg-gray-300' : 'bg-black'}`}
                                >
                                  <Text className="text-white text-xs font-semibold">Save</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={handleCancelEditNote}
                                  disabled={isSavingEditedNote}
                                  className="px-3 py-2 rounded-lg bg-gray-100"
                                >
                                  <Text className="text-gray-700 text-xs font-semibold">Cancel</Text>
                                </TouchableOpacity>
                              </View>
                            </>
                          ) : (
                            <TouchableOpacity
                              onPress={() => handleStartEditNote(note)}
                              activeOpacity={0.7}
                            >
                              <Text className="text-gray-800 text-sm leading-5">{note.text}</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        <View className="items-end">
                          <TouchableOpacity
                            onPress={() => handleTogglePinNote(note)}
                            className="px-2.5 py-1 rounded-full bg-gray-100 mb-1"
                            disabled={isSavingEditedNote}
                          >
                            <Text className="text-[11px] font-semibold text-gray-700">
                              {note.is_pinned ? "Unpin" : "Pin"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteNote(note)}
                            className="px-2.5 py-1 rounded-full bg-red-50"
                            disabled={isSavingEditedNote}
                          >
                            <Text className="text-[11px] font-semibold text-red-600">Delete</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* ---- Students Tab ---- */}
          {activeTab === "students" && (
            <View>
              {isStudentsLoading ? (
                <View className="py-8 items-center">
                  <ActivityIndicator size="small" color="#f97316" />
                  <Text className="text-gray-500 mt-2">
                    Loading students...
                  </Text>
                </View>
              ) : enrolledStudents.length === 0 ? (
                <View className="py-8 items-center">
                  <Users size={40} color="#d1d5db" />
                  <Text className="text-gray-400 mt-3 text-center">
                    No students enrolled yet.{"\n"}Share your class code to get
                    started.
                  </Text>
                </View>
              ) : (
                enrolledStudents.map((enrollment) => (
                  <View
                    key={enrollment.id}
                    className="bg-white p-4 rounded-xl mb-2 border border-gray-100 flex-row items-center"
                  >
                    {/* Avatar circle */}
                    <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
                      <Text className="text-orange-600 font-bold text-base">
                        {enrollment.student_name?.charAt(0)?.toUpperCase() ||
                          "?"}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold text-black">
                        {enrollment.student_name}
                      </Text>
                      <Text className="text-gray-400 text-xs">
                        {enrollment.student_email}
                      </Text>
                      <Text className="text-gray-300 text-xs mt-0.5">
                        Joined via{" "}
                        {enrollment.enrollment_type === "auto"
                          ? "auto-enroll"
                          : "class code"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveStudent(enrollment)}
                      className="p-2"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <UserMinus size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ---- Student Remarks Button ---- */}
          <TouchableOpacity
            onPress={() =>
              isFacultyVerified
                ? router.push({
                  pathname: "/Home/Subject/remarks" as any,
                  params: { subjectCode },
                })
                : Alert.alert("Verification Required", verificationLockMessage)
            }
            className={`border p-4 rounded-xl mt-4 mb-4 flex-row items-center justify-between ${isFacultyVerified ? 'bg-orange-50 border-orange-200' : 'bg-gray-100 border-gray-300'
              }`}
            activeOpacity={0.7}
          >
            <View className="flex-row items-center">
              <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${isFacultyVerified ? 'bg-orange-100' : 'bg-gray-200'}`}>
                <Svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isFacultyVerified ? '#f97316' : '#6b7280'}
                  strokeWidth="2"
                >
                  <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </Svg>
              </View>
              <View>
                <Text className={`font-bold ${isFacultyVerified ? 'text-orange-800' : 'text-gray-600'}`}>
                  Student Remarks
                </Text>
                <Text className={`text-xs ${isFacultyVerified ? 'text-orange-600' : 'text-gray-500'}`}>
                  {isFacultyVerified ? 'Leave performance comments' : 'Verification required'}
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color={isFacultyVerified ? '#f97316' : '#6b7280'} />
          </TouchableOpacity>
        </View>

        {/* Bottom spacing */}
        <View className="h-10" />
      </ScrollView>

      {/* ---- Create Task Modal ---- */}
      <Modal
        animationType="slide"
        transparent
        visible={showTaskComposer}
        onRequestClose={() => {
          if (isAddingTask) return;
          setShowTaskDuePicker(false);
          setShowTaskComposer(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 bg-black/35 justify-end"
        >
          <View className="bg-white rounded-t-3xl px-5 pt-3 pb-6 max-h-[88%]">
            <View className="w-12 h-1.5 rounded-full bg-gray-300 self-center mb-4" />
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-2xl font-bold text-gray-900">Add Class Task</Text>
              <TouchableOpacity
                onPress={() => {
                  if (isAddingTask) return;
                  setShowTaskDuePicker(false);
                  setShowTaskComposer(false);
                }}
                className="bg-gray-100 px-3 py-1.5 rounded-full"
                disabled={isAddingTask}
              >
                <Text className="text-gray-600 font-semibold">Close</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-gray-500 text-sm mb-4">
              Keep assignments clear with urgency, due date, and a concise description.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="bg-orange-50 border border-orange-100 rounded-2xl p-3 mb-4">
                <TextInput
                  value={newTaskText}
                  onChangeText={setNewTaskText}
                  placeholder="Enter task for students..."
                  multiline
                  textAlignVertical="top"
                  editable={!isAddingTask}
                  className="text-base text-gray-900 min-h-[84px]"
                />
              </View>

              <Text className="text-xs font-semibold text-gray-600 mb-2">PRIORITY</Text>
              <View className="flex-row flex-wrap mb-4">
                {urgencyChoices.map((urgency) => (
                  <TouchableOpacity
                    key={`dash-modal-urgency-${urgency}`}
                    onPress={() => handleUrgencyChange(urgency)}
                    className={`mr-2 mb-2 px-4 py-2 rounded-full border ${newTaskUrgency === urgency ? 'border-orange-500 bg-orange-500' : 'border-gray-300 bg-white'}`}
                  >
                    <Text className={`text-xs font-semibold uppercase ${newTaskUrgency === urgency ? 'text-white' : 'text-gray-700'}`}>
                      {urgency}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-xs font-semibold text-gray-600 mb-2">DUE DATE</Text>
              <View className="flex-row flex-wrap mb-2">
                {dueDatePresets.map((preset) => (
                  <TouchableOpacity
                    key={`dash-modal-due-${preset.key}`}
                    onPress={() => applyDuePreset(preset)}
                    className={`mr-2 mb-2 px-3 py-2 rounded-full border ${newTaskDuePreset === preset.key ? 'border-orange-500 bg-orange-500' : 'border-gray-300 bg-white'}`}
                  >
                    <Text className={`text-xs font-semibold ${newTaskDuePreset === preset.key ? 'text-white' : 'text-gray-700'}`}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={clearDueDate}
                  className="mr-2 mb-2 px-3 py-2 rounded-full border border-gray-300 bg-white"
                >
                  <Text className="text-xs font-semibold text-gray-700">No Due Date</Text>
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
                <View className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
                  <DateTimePicker
                    value={newTaskDueDate ? new Date(newTaskDueDate) : new Date()}
                    mode={taskDuePickerMode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleTaskDuePickerChange}
                  />
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity
                      onPress={() => setShowTaskDuePicker(false)}
                      className="bg-orange-500 py-2.5 rounded-lg mt-2 items-center"
                    >
                      <Text className="text-white text-xs font-semibold">Done</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-3">
                <Text className="text-[11px] text-gray-600">Selected deadline</Text>
                <Text className="text-base font-semibold text-gray-900 mt-0.5">
                  {formatDueDatePreview(newTaskDueDate)}
                </Text>
                <Text className={`text-xs mt-1 ${requiresDueDate(newTaskUrgency) && !newTaskDueDate ? 'text-red-600' : 'text-gray-600'}`}>
                  {getUrgencyHint(newTaskUrgency, newTaskDueDate)}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handlePickFile}
                disabled={isAddingTask}
                className="flex-row items-center justify-center border border-gray-300 rounded-xl py-3 mb-2"
              >
                <Paperclip size={16} color={selectedFiles.length > 0 ? "#3b82f6" : "#6b7280"} />
                <Text className="ml-2 text-sm font-semibold text-gray-700">
                  {selectedFiles.length > 0 ? `Attachments (${selectedFiles.length})` : "Attach files"}
                </Text>
              </TouchableOpacity>

              {selectedFiles.length > 0 && (
                <View className="mb-3">
                  {selectedFiles.map((f, idx) => (
                    <View key={idx} className="flex-row items-center bg-blue-50 px-2 py-1.5 rounded-md mb-1">
                      <FileText size={14} color="#3b82f6" />
                      <Text className="text-blue-600 text-xs ml-1.5 flex-1" numberOfLines={1}>
                        {f.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <X size={14} color="#6b7280" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                onPress={handleAddTask}
                disabled={isAddingTask || !newTaskText.trim() || !isFacultyVerified}
                className={`py-4 rounded-2xl items-center ${isAddingTask || !newTaskText.trim() || !isFacultyVerified ? "bg-gray-300" : "bg-orange-500"}`}
              >
                {isAddingTask ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-lg">Create Class Task</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ---- Create Note Modal ---- */}
      <Modal
        animationType="slide"
        transparent
        visible={showNoteComposer}
        onRequestClose={() => !isAddingNote && setShowNoteComposer(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 bg-black/35 justify-end"
        >
          <View className="bg-white rounded-t-3xl px-5 pt-3 pb-6">
            <View className="w-12 h-1.5 rounded-full bg-gray-300 self-center mb-4" />
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-2xl font-bold text-gray-900">Add Note</Text>
              <TouchableOpacity
                onPress={() => !isAddingNote && setShowNoteComposer(false)}
                className="bg-gray-100 px-3 py-1.5 rounded-full"
                disabled={isAddingNote}
              >
                <Text className="text-gray-600 font-semibold">Close</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-gray-500 text-sm mb-4">
              Save quick reminders for this class.
            </Text>

            <View className="bg-orange-50 border border-orange-100 rounded-2xl p-3 mb-4">
              <TextInput
                value={newNoteText}
                onChangeText={setNewNoteText}
                placeholder="Type a class note..."
                multiline
                textAlignVertical="top"
                editable={!isAddingNote}
                className="text-base text-gray-900 min-h-[120px]"
              />
            </View>

            <TouchableOpacity
              onPress={handleAddNote}
              disabled={isAddingNote || !newNoteText.trim()}
              className={`py-4 rounded-2xl items-center ${isAddingNote || !newNoteText.trim() ? "bg-gray-300" : "bg-black"}`}
            >
              {isAddingNote ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-bold text-lg">Save Note</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ---- Task Stats Modal ---- */}
      <Modal
        animationType="fade"
        transparent
        visible={taskStatsModal !== null}
        onRequestClose={() => setTaskStatsModal(null)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View className="bg-white rounded-2xl p-5 w-[85%] max-w-md max-h-[70%]">
            {/* Modal header */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-gray-800 flex-1 mr-2">
                Completion Stats
              </Text>
              <TouchableOpacity onPress={() => setTaskStatsModal(null)}>
                <X size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {taskStatsModal && (
              <>
                {/* Task text */}
                <Text className="text-gray-600 text-sm mb-3">
                  {taskStatsModal.text}
                </Text>

                {/* Progress bar */}
                <View className="bg-gray-200 rounded-full h-3 mb-1 overflow-hidden">
                  <View
                    className="bg-orange-500 h-full rounded-full"
                    style={{
                      width: `${taskStatsModal.total_enrolled > 0
                        ? (taskStatsModal.completed_count /
                          taskStatsModal.total_enrolled) *
                        100
                        : 0
                        }%`,
                    }}
                  />
                </View>
                <Text className="text-gray-500 text-xs mb-4">
                  {taskStatsModal.completed_count}/
                  {taskStatsModal.total_enrolled} completed
                </Text>

                {/* Student list */}
                <ScrollView className="max-h-60">
                  {taskStatsModal.students.length === 0 ? (
                    <Text className="text-gray-400 text-center py-4">
                      No students enrolled yet.
                    </Text>
                  ) : (
                    taskStatsModal.students.map((student) => (
                      <View
                        key={student.student_id}
                        className="flex-row items-center py-2.5 border-b border-gray-100"
                      >
                        <View
                          className={`w-6 h-6 rounded-full items-center justify-center mr-3 ${student.is_completed
                            ? "bg-green-100"
                            : "bg-gray-100"
                            }`}
                        >
                          <Text
                            className={`text-xs font-bold ${student.is_completed
                              ? "text-green-600"
                              : "text-gray-400"
                              }`}
                          >
                            {student.is_completed ? "✓" : "○"}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-black">
                            {student.student_name}
                          </Text>
                          {student.is_completed && student.completed_at && (
                            <Text className="text-gray-400 text-xs">
                              Completed{" "}
                              {new Date(
                                student.completed_at
                              ).toLocaleDateString()}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Loading overlay for stats */}
      {isLoadingStats && (
        <View className="absolute inset-0 bg-black/20 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      )}

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
              <Download size={28} color="#3b82f6" />
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
    </>
  );
}
