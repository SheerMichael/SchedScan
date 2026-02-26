import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Modal } from "react-native";
import * as Clipboard from 'expo-clipboard';
import Checkbox from "expo-checkbox";
import { useState, useEffect, useCallback } from "react";
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, router } from "expo-router";
import { taskService, Task } from "../../../services/taskService";
import { useAuth } from "../../../context/AuthContext";
import {
  facultyTaskService,
  studentEnrollmentService,
  FacultyTaskWithStats,
  StudentFacultyTask,
  ClassCode,
} from "../../../services/facultyTaskService";
import JoinClassModal from "../../../components/JoinClassModal";
import { useFileDownload } from "../../../hooks/useFileDownload";

export default function SubjectDetails() {
  const { user } = useAuth();
  const isFaculty = user?.user_type === 'faculty';
  const isStudent = user?.user_type === 'student';

  // Receive all course data from navigation params
  const {
    title,           // subject_code (e.g., "CS101")
    subjectName,     // subject_name
    time,            // formatted time
    startTime,       // start_time
    endTime,         // end_time
    location,        // location
    day,             // day code
    sourceType,      // 'student' | 'faculty' | 'merged' — schedule source type
  } = useLocalSearchParams();

  // Determine if this course is from a faculty-extracted schedule
  const isFacultyCourse = sourceType === 'faculty';

  const subjectCode = Array.isArray(title) ? title[0] : title || '';

  // ============================================
  // Personal Task State (Student only)
  // ============================================
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingTask, setIsAddingTask] = useState(false);

  // ============================================
  // Faculty Task State
  // ============================================
  const [facultyTasks, setFacultyTasks] = useState<FacultyTaskWithStats[]>([]);
  const [studentFacultyTasks, setStudentFacultyTasks] = useState<StudentFacultyTask[]>([]);
  const [isFacultyLoading, setIsFacultyLoading] = useState(false);
  const [newFacultyTaskText, setNewFacultyTaskText] = useState<string>("");
  const [isAddingFacultyTask, setIsAddingFacultyTask] = useState(false);

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

  // ============================================
  // File Download
  // ============================================
  const { downloadingTaskId, downloadProgress, downloadStatus, downloadFile: handleDownloadFile } = useFileDownload();

  // ============================================
  // Load Data
  // ============================================
  useEffect(() => {
    loadAllData();
  }, [subjectCode]);

  const loadAllData = useCallback(async () => {
    if (!subjectCode) return;
    setIsLoading(true);
    setIsFacultyLoading(true);

    try {
      if (isFaculty) {
        // Faculty: load their tasks + class code
        const [tasksData, codes] = await Promise.all([
          facultyTaskService.getFacultyTasks(subjectCode),
          facultyTaskService.getClassCodes(subjectCode),
        ]);
        setFacultyTasks(tasksData);
        if (codes.length > 0) setClassCode(codes[0]);
      } else if (isStudent) {
        // Student: load personal tasks + faculty tasks + enrollment status
        const [personalTasks, fTasks, enrollments] = await Promise.all([
          taskService.getTasks(subjectCode),
          studentEnrollmentService.getFacultyTasks(subjectCode).catch(() => []),
          studentEnrollmentService.getEnrollments().catch(() => []),
        ]);
        setTasks(personalTasks);
        setStudentFacultyTasks(fTasks);
        // Check enrollment using actual enrollments, not task count
        const enrolled = enrollments.some(
          (e) => e.subject_code === subjectCode && e.status === 'active'
        );
        setIsEnrolled(enrolled);
      } else {
        // Other user types (e.g., parent) — just load personal tasks
        const personalTasks = await taskService.getTasks(subjectCode);
        setTasks(personalTasks);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
      setIsFacultyLoading(false);
    }
  }, [subjectCode, isFaculty, isStudent]);

  // ============================================
  // Personal Task Handlers
  // ============================================
  const handleToggleComplete = async (task: Task) => {
    try {
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, is_completed: !t.is_completed } : t
      ));
      await taskService.toggleTaskCompletion(task);
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
    try {
      setIsAddingTask(true);
      const newTask = await taskService.createTask({
        subject_code: subjectCode,
        text: newTaskText.trim(),
      });
      setTasks(prev => [newTask, ...prev]);
      setNewTaskText("");
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
  // Faculty Task Handlers (Faculty side)
  // ============================================
  const handleAddFacultyTask = async () => {
    if (!newFacultyTaskText.trim() || !subjectCode) return;
    try {
      setIsAddingFacultyTask(true);
      const newTask = await facultyTaskService.createFacultyTask({
        subject_code: subjectCode,
        text: newFacultyTaskText.trim(),
      });
      setFacultyTasks(prev => [newTask, ...prev]);
      setNewFacultyTaskText("");
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
    try {
      setIsGeneratingCode(true);
      const newCode = await facultyTaskService.generateClassCode(subjectCode);
      setClassCode(newCode);
      Alert.alert('Class Code Generated', `Your new class code is: ${newCode.code}`);
    } catch (error) {
      console.error('Error generating code:', error);
      Alert.alert('Error', 'Failed to generate class code.');
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
      const fTasks = await studentEnrollmentService.getFacultyTasks(subjectCode);
      setStudentFacultyTasks(fTasks);
    } catch (e) {
      console.error('Error reloading faculty tasks after enrollment:', e);
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

  // ============================================
  // Render
  // ============================================
  return (
    <>
      <View className='pl-8 pt-2'>
        <TouchableOpacity onPress={handleBack}>
          <LeftPointingArrow size={30} color="#000000" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Subject Title Box */}
        <View className="w-full bg-primary-500 p-4 rounded-xl mb-4">
          <Text className="text-white/75 mb-2">Class Title</Text>
          <View className="bg-gray-200/65 p-4 rounded-xl">
            <Text className="text-xl font-bold text-white">{title}</Text>
          </View>
        </View>

        {/* Schedule Details */}
        <View className="bg-gray-100 p-4 rounded-xl mb-6">
          <Text className="text-lg font-semibold text-gray-800 mb-3">Schedule Details</Text>

          <View className="flex-row items-center mb-2">
            <Text className="text-gray-500 w-20">Time:</Text>
            <Text className="text-gray-700 font-medium">{time || "N/A"}</Text>
          </View>

          <View className="flex-row items-center mb-2">
            <Text className="text-gray-500 w-20">Day:</Text>
            <Text className="text-gray-700 font-medium">{day || "N/A"}</Text>
          </View>

          <View className="flex-row items-center">
            <Text className="text-gray-500 w-20">Location:</Text>
            <Text className="text-gray-700 font-medium">{location || "N/A"}</Text>
          </View>
        </View>

        {/* ============================================ */}
        {/* FACULTY VIEW: Class Code + Faculty Tasks     */}
        {/* ============================================ */}
        {isFaculty && (
          <>
            {/* Class Code Section */}
            <View className="bg-orange-50 p-4 rounded-xl mb-4 border border-orange-200">
              <Text className="text-lg font-bold text-orange-800 mb-2">Class Code</Text>
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
                      disabled={isGeneratingCode}
                      className="bg-orange-200 px-4 py-2 rounded-lg"
                    >
                      <Text className="text-orange-700 font-semibold text-sm">
                        {isGeneratingCode ? '...' : 'New'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleGenerateClassCode}
                  disabled={isGeneratingCode}
                  className="bg-orange-500 py-3 rounded-lg items-center"
                >
                  {isGeneratingCode ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text className="text-white font-bold">Generate Class Code</Text>
                  )}
                </TouchableOpacity>
              )}
              <Text className="text-orange-600 text-xs mt-2">
                Share this code with students so they can join your class.
              </Text>
            </View>

            {/* Faculty Tasks List */}
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-xl font-bold">Class Tasks</Text>
              {isFacultyLoading && <ActivityIndicator size="small" color="#f97316" />}
            </View>

            {isFacultyLoading ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#f97316" />
                <Text className="text-gray-500 mt-2">Loading tasks...</Text>
              </View>
            ) : facultyTasks.length === 0 ? (
              <Text className="text-gray-500 mb-4">No class tasks yet. Create one below!</Text>
            ) : (
              facultyTasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  onPress={() => handleViewStats(task)}
                  className="bg-white p-3 rounded-lg mb-2 shadow"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
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

            {/* Add Faculty Task */}
            <View className="mt-4 mb-8">
              <Text className="font-bold text-lg mb-2">Add Class Task</Text>
              <View className="bg-white p-3 rounded-xl shadow flex-row items-center">
                <TextInput
                  value={newFacultyTaskText}
                  onChangeText={setNewFacultyTaskText}
                  placeholder="Enter task for students..."
                  className="flex-1 text-base"
                  editable={!isAddingFacultyTask}
                  onSubmitEditing={handleAddFacultyTask}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  onPress={handleAddFacultyTask}
                  disabled={isAddingFacultyTask || !newFacultyTaskText.trim()}
                  className={`px-4 py-2 rounded-xl ml-2 ${isAddingFacultyTask || !newFacultyTaskText.trim() ? 'bg-gray-300' : 'bg-orange-500'
                    }`}
                >
                  {isAddingFacultyTask ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text className="text-white font-bold">Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
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
                <Text className="text-xl font-bold text-orange-600">Faculty Tasks</Text>
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
                    className={`bg-orange-50 p-3 rounded-lg mb-2 border border-orange-200 flex-row items-center ${task.is_completed ? 'opacity-60' : ''
                      }`}
                  >
                    <Checkbox
                      value={task.is_completed}
                      onValueChange={() => handleToggleFacultyTaskComplete(task)}
                      color="#f97316"
                    />
                    <View className="flex-1 ml-3">
                      <Text
                        className={`font-semibold ${task.is_completed ? 'text-gray-400 line-through' : 'text-black'
                          }`}
                      >
                        {task.text}
                      </Text>
                      <Text className="text-orange-500 text-xs mt-0.5">
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
                              className={`flex-row items-center self-start px-2.5 py-1.5 rounded-md mb-1 ${
                                downloadingTaskId === task.id ? 'bg-blue-100' : 'bg-blue-50'
                              }`}
                              activeOpacity={0.6}
                            >
                              {downloadingTaskId === task.id ? (
                                <ActivityIndicator size={12} color="#3b82f6" />
                              ) : (
                                <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                                  <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                  <Path d="M14 2v6h6" />
                                  <Path d="M16 13H8" />
                                  <Path d="M16 17H8" />
                                  <Path d="M10 9H8" />
                                </Svg>
                              )}
                              <Text className="text-blue-600 text-xs ml-1.5 font-medium" numberOfLines={1}>
                                {downloadingTaskId === task.id ? 'Downloading...' : (f.file_name || "Attachment")}
                              </Text>
                              {downloadingTaskId !== task.id && (
                                <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" style={{ marginLeft: 4 }}>
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
              ) : !isEnrolled && !isFacultyCourse ? (
                /* Join Class Code — opens the verification modal */
                <View className="bg-gray-50 p-4 rounded-xl border border-gray-200">
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
                <Text className="text-gray-500 text-sm">No faculty tasks assigned yet.</Text>
              )}
            </View>

            {/* Personal Tasks Section */}
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-xl font-bold">My Tasks</Text>
              {isLoading && <ActivityIndicator size="small" color="#DC2626" />}
            </View>
          </>
        )}

        {/* ============================================ */}
        {/* PERSONAL TASKS (Student & other user types)  */}
        {/* ============================================ */}
        {!isFaculty && (
          <>
            {/* Only show header for non-student (students already have it above) */}
            {!isStudent && (
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-xl font-bold">Tasks</Text>
                {isLoading && <ActivityIndicator size="small" color="#DC2626" />}
              </View>
            )}

            {isLoading ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#DC2626" />
                <Text className="text-gray-500 mt-2">Loading tasks...</Text>
              </View>
            ) : tasks.length === 0 ? (
              <Text className="text-gray-500 mb-4">No tasks for this subject.</Text>
            ) : (
              tasks.map((task) => (
                <View
                  key={task.id}
                  className={`bg-white p-3 rounded-lg mb-2 shadow flex-row items-center ${task.is_completed ? 'opacity-60' : ''
                    }`}
                >
                  <Checkbox
                    value={task.is_completed}
                    onValueChange={() => handleToggleComplete(task)}
                    color="#DC2626"
                  />
                  <Text
                    className={`flex-1 font-semibold ml-3 ${task.is_completed ? 'text-gray-400 line-through' : 'text-black'
                      }`}
                  >
                    {task.text}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleDeleteTask(task)}
                    className="p-2"
                  >
                    <TrashIcon size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              ))
            )}

            {/* Add New Personal Task */}
            <View className="mt-6 mb-8">
              <Text className="font-bold text-lg mb-2">Add New Task</Text>
              <View className="bg-white p-3 rounded-xl shadow flex-row items-center">
                <TextInput
                  value={newTaskText}
                  onChangeText={setNewTaskText}
                  placeholder="Enter new task..."
                  className="flex-1 text-base"
                  editable={!isAddingTask}
                  onSubmitEditing={handleAddTask}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  onPress={handleAddTask}
                  disabled={isAddingTask || !newTaskText.trim()}
                  className={`px-4 py-2 rounded-xl ml-2 ${isAddingTask || !newTaskText.trim() ? 'bg-gray-300' : 'bg-primary-600'
                    }`}
                >
                  {isAddingTask ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text className="text-white font-bold">Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

      </ScrollView>

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
    </>
  );
}