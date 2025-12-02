import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import Checkbox from "expo-checkbox"; /* expo install expo-checkbox */
import { useState, useEffect, useCallback } from "react";
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, router } from "expo-router";
import { taskService, Task } from "../../../services/taskService";

export default function SubjectDetails() {
  // Receive all course data from navigation params
  const { 
    title,           // subject_code (e.g., "CS101")
    subjectName,     // subject_name (e.g., "Introduction to Programming")
    time,            // formatted time (e.g., "9:00AM - 10:30AM")
    startTime,       // start_time
    endTime,         // end_time
    location,        // location
    day,             // day code (e.g., "MWF")
  } = useLocalSearchParams();

  // Get subject code as string
  const subjectCode = Array.isArray(title) ? title[0] : title || '';

  // Task state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingTask, setIsAddingTask] = useState(false);

  // Load tasks on mount
  useEffect(() => {
    loadTasks();
  }, [subjectCode]);

  const loadTasks = useCallback(async () => {
    if (!subjectCode) return;
    
    try {
      setIsLoading(true);
      const fetchedTasks = await taskService.getTasks(subjectCode);
      setTasks(fetchedTasks);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [subjectCode]);

  // Toggle task completion (permanently marks as done)
  const handleToggleComplete = async (task: Task) => {
    try {
      // Optimistic update
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, is_completed: !t.is_completed } : t
      ));

      // Update on backend
      await taskService.toggleTaskCompletion(task);
    } catch (error) {
      console.error('Error toggling task:', error);
      // Revert on error
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, is_completed: task.is_completed } : t
      ));
      Alert.alert('Error', 'Failed to update task. Please try again.');
    }
  };

  // Add a new task
  const handleAddTask = async () => {
    if (!newTaskText.trim() || !subjectCode) return;

    try {
      setIsAddingTask(true);
      const newTask = await taskService.createTask({
        subject_code: subjectCode,
        text: newTaskText.trim(),
      });
      
      // Add to local state
      setTasks(prev => [newTask, ...prev]);
      setNewTaskText("");
    } catch (error) {
      console.error('Error adding task:', error);
      Alert.alert('Error', 'Failed to add task. Please try again.');
    } finally {
      setIsAddingTask(false);
    }
  };

  // Delete a task
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
              // Optimistic delete
              setTasks(prev => prev.filter(t => t.id !== task.id));
              
              await taskService.deleteTask(task.id, subjectCode);
            } catch (error) {
              console.error('Error deleting task:', error);
              // Reload tasks on error
              loadTasks();
              Alert.alert('Error', 'Failed to delete task. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Go back
  const handleBack = () => {
    router.back();
  };

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

        {/* Subject Name / Description - Hidden until OCR properly extracts subject names
        <View className="mb-4">
          <Text className="text-lg font-semibold text-gray-800 mb-1">Subject Name</Text>
          <Text className="text-base text-gray-700">
            {subjectName || "No subject name available."}
          </Text>
        </View>
        */}

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

        {/* Tasks Section */}
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-xl font-bold">Tasks</Text>
          {isLoading && <ActivityIndicator size="small" color="#DC2626" />}
        </View>

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
              className={`bg-white p-3 rounded-lg mb-2 shadow flex-row items-center ${
                task.is_completed ? 'opacity-60' : ''
              }`}
            >
              <Checkbox
                value={task.is_completed}
                onValueChange={() => handleToggleComplete(task)}
                color="#DC2626"
              />

              <Text 
                className={`flex-1 font-semibold ml-3 ${
                  task.is_completed ? 'text-gray-400 line-through' : 'text-black'
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

        {/* Add New Task */}
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
              className={`px-4 py-2 rounded-xl ml-2 ${
                isAddingTask || !newTaskText.trim() ? 'bg-gray-300' : 'bg-primary-600'
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

      </ScrollView>
    </>
  );
}