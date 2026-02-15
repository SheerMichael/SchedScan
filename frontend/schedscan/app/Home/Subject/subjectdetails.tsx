import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
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
  const [joinCode, setJoinCode] = useState<string>("");
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);

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
  const handleEnroll = async () => {
    if (!joinCode.trim()) return;
    try {
      setIsEnrolling(true);
      await studentEnrollmentService.enrollWithCode(joinCode.trim());
      setJoinCode("");
      setIsEnrolled(true);
      // Reload faculty tasks after enrollment
      const fTasks = await studentEnrollmentService.getFacultyTasks(subjectCode);
      setStudentFacultyTasks(fTasks);
      Alert.alert('Enrolled!', 'You have been enrolled in this class.');
    } catch (error: any) {
      console.error('Error enrolling:', error);
      const msg = error?.response?.data?.error || 'Failed to enroll. Check your class code.';
      Alert.alert('Error', msg);
    } finally {
      setIsEnrolling(false);
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
              <Text className="text-lg font-bold text-orange-800 mb-2">📋 Class Code</Text>
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
                <Text className="text-xl font-bold text-orange-600">📋 Faculty Tasks</Text>
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
                    </View>
                  </View>
                ))
              ) : !isEnrolled && !isFacultyCourse ? (
                /* Join Class Code — only show for student-type courses, not faculty-extracted ones */
                <View className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <Text className="text-gray-600 text-sm mb-2">
                    Enter a class code from your instructor to see their tasks.
                  </Text>
                  <View className="flex-row items-center">
                    <TextInput
                      value={joinCode}
                      onChangeText={setJoinCode}
                      placeholder="Enter class code..."
                      className="flex-1 bg-white p-3 rounded-lg border border-gray-200 text-base font-medium tracking-widest"
                      autoCapitalize="characters"
                      maxLength={8}
                      editable={!isEnrolling}
                    />
                    <TouchableOpacity
                      onPress={handleEnroll}
                      disabled={isEnrolling || !joinCode.trim()}
                      className={`px-4 py-3 rounded-lg ml-2 ${isEnrolling || !joinCode.trim() ? 'bg-gray-300' : 'bg-orange-500'
                        }`}
                    >
                      {isEnrolling ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text className="text-white font-bold">Join</Text>
                      )}
                    </TouchableOpacity>
                  </View>
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
    </>
  );
}