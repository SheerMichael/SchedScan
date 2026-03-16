import React, { useState, useCallback } from "react";
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
} from "react-native";
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
} from "../../services/facultyTaskService";
import { useFileDownload } from "../../hooks/useFileDownload";

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
  const isFacultyVerified = user?.is_verified !== false;

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
  const [isAddingTask, setIsAddingTask] = useState(false);

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
      try {
        const variantCodes = Array.from(new Set(subject.subject_codes)).filter(Boolean);

        const [tasksResponses, studentsResponses] = await Promise.all([
          Promise.all(variantCodes.map((code) => facultyTaskService.getFacultyTasks(code))),
          Promise.all(variantCodes.map((code) => facultyTaskService.getEnrolledStudents(code))),
        ]);

        const mergedTasks = tasksResponses.flatMap((resp) =>
          Array.isArray(resp) ? resp : (resp as any).results ?? []
        );
        const mergedStudents = studentsResponses.flatMap((resp) => resp.enrollments || []);

        const dedupedTasks = Array.from(new Map(mergedTasks.map((task) => [task.id, task])).values());
        const dedupedStudents = Array.from(new Map(mergedStudents.map((enrollment) => [enrollment.id, enrollment])).values());

        setFacultyTasks(dedupedTasks);
        setEnrolledStudents(dedupedStudents);
      } catch (err) {
        console.error("Error loading subject detail:", err);
      } finally {
        setIsTasksLoading(false);
        setIsStudentsLoading(false);
      }
    },
    []
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
      loadSubjectDetail(sub);
    },
    [loadSubjectDetail]
  );

  // ---- Class code actions ----
  const handleGenerateClassCode = async (subjectCode: string) => {
    if (!isFacultyVerified) {
      Alert.alert(
        "Verification Required",
        "Your faculty account is pending admin verification. Class code generation is disabled until verification is approved."
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
    if (!newTaskText.trim() || !selectedSubject) return;
    try {
      setIsAddingTask(true);
      const newTask = await facultyTaskService.createFacultyTask({
        subject_code: selectedSubject.subject_code,
        text: newTaskText.trim(),
        files: selectedFiles.length > 0 ? selectedFiles : undefined,
      });
      setFacultyTasks((prev) => [newTask, ...prev]);
      setNewTaskText("");
      setSelectedFiles([]);
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

  const handleViewStats = async (task: FacultyTaskWithStats) => {
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
                  Pending Verification: Class code generation is disabled until an admin verifies your faculty account.
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
              onPress={() => setSelectedSubject(null)}
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
              {isTasksLoading ? (
                <View className="py-8 items-center">
                  <ActivityIndicator size="small" color="#f97316" />
                  <Text className="text-gray-500 mt-2">Loading tasks...</Text>
                </View>
              ) : facultyTasks.length === 0 ? (
                <View className="py-8 items-center">
                  <ClipboardList size={40} color="#d1d5db" />
                  <Text className="text-gray-400 mt-3 text-center">
                    No tasks yet.{"\n"}Create one for your students below.
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

              {/* Add task input */}
              <View className="mt-4 mb-6">
                <Text className="font-bold text-base mb-2">Add Class Task</Text>
                <View className="bg-white p-3 rounded-xl border border-gray-200">
                  <View className="flex-row items-center">
                    <TextInput
                      value={newTaskText}
                      onChangeText={setNewTaskText}
                      placeholder="Enter task for students..."
                      className="flex-1 text-base"
                      editable={!isAddingTask}
                      onSubmitEditing={handleAddTask}
                      returnKeyType="done"
                    />
                    <TouchableOpacity
                      onPress={handlePickFile}
                      disabled={isAddingTask}
                      className="p-2 mr-1"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Paperclip size={20} color={selectedFiles.length > 0 ? "#3b82f6" : "#9ca3af"} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleAddTask}
                      disabled={isAddingTask || !newTaskText.trim()}
                      className={`px-4 py-2 rounded-xl ${isAddingTask || !newTaskText.trim()
                        ? "bg-gray-300"
                        : "bg-orange-500"
                        }`}
                    >
                      {isAddingTask ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text className="text-white font-bold">Add</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {selectedFiles.length > 0 && (
                    <View className="mt-2">
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
                </View>
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
              router.push({
                pathname: "/Home/Subject/remarks" as any,
                params: { subjectCode },
              })
            }
            className="bg-orange-50 border border-orange-200 p-4 rounded-xl mt-4 mb-4 flex-row items-center justify-between"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-3">
                <Svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="2"
                >
                  <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </Svg>
              </View>
              <View>
                <Text className="font-bold text-orange-800">
                  Student Remarks
                </Text>
                <Text className="text-orange-600 text-xs">
                  Leave performance comments
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color="#f97316" />
          </TouchableOpacity>
        </View>

        {/* Bottom spacing */}
        <View className="h-10" />
      </ScrollView>

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
