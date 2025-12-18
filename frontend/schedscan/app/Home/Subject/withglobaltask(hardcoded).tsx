import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import Checkbox from "expo-checkbox";
import { useState, useEffect } from "react";
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, router } from "expo-router";

// --- MAKESHIFT GLOBAL POOL ---
let globalClassTasks: { [key: string]: string[] } = {
  "Operating System": ["Final Project Submission - Due Friday"],
};

const subjectDetailsData: { [key: string]: { description: string; tasks: string[] } } = {
  "Operating System": {
    description: "Study process management, memory management, threads, and CPU scheduling.",
    tasks: ["Finish Lab 3", "Review CPU Scheduling algorithms"]
  },
  "Database Systems": {
    description: "Covers SQL, schema design, normalization, transactions, and indexing.",
    tasks: ["Finish ERD diagram", "Practice SQL joins"]
  }
};

interface Task {
  id: string;
  text: string;
  is_completed: boolean;
  is_global?: boolean;
}

export default function SubjectDetails() {
  const { title, time, location, day } = useLocalSearchParams();
  const subjectTitle = Array.isArray(title) ? title[0] : title || '';

  const [isFaculty, setIsFaculty] = useState(true); // Toggle to test
  const [taskType, setTaskType] = useState<'self' | 'announcement'>('self');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const subjectData = subjectDetailsData[subjectTitle];
    
    let combinedTasks: Task[] = subjectData ? subjectData.tasks.map((taskText, index) => ({
      id: `personal-${index}`,
      text: taskText,
      is_completed: false
    })) : [];

    const globalTasks = globalClassTasks[subjectTitle] || [];
    const formattedGlobals: Task[] = globalTasks.map((text, index) => ({
      id: `global-${index}`,
      text: `📢 ${text}`,
      is_completed: false,
      is_global: true
    }));

    setTasks([...formattedGlobals, ...combinedTasks]);
    setIsLoading(false);
  }, [subjectTitle]);

  const handleToggleComplete = (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_completed: !t.is_completed } : t));
  };

  const handleAddTask = () => {
    if (!newTaskText.trim()) return;
    
    const newId = Math.random().toString(36).substr(2, 9);
    const text = newTaskText.trim();
    const isGlobal = isFaculty && taskType === 'announcement';

    const newTask: Task = {
      id: newId,
      text: isGlobal ? `📢 ${text}` : text,
      is_completed: false,
      is_global: isGlobal
    };

    if (isGlobal) {
      if (!globalClassTasks[subjectTitle]) globalClassTasks[subjectTitle] = [];
      globalClassTasks[subjectTitle].push(text);
      Alert.alert("Class Announcement", "This task has been shared with all students.");
    }

    setTasks(prev => [newTask, ...prev]);
    setNewTaskText("");
  };

  const handleDeleteTask = (task: Task) => {
    Alert.alert('Delete Task', `Remove "${task.text}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setTasks(prev => prev.filter(t => t.id !== task.id)) }
    ]);
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
      <View className='pl-8 pt-2 flex-row justify-between items-center pr-8'>
        <TouchableOpacity onPress={() => router.back()}>
          <LeftPointingArrow size={30} color="#000000" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setIsFaculty(!isFaculty)}>
            <View className={`px-3 py-1 rounded-full ${isFaculty ? 'bg-purple-500' : 'bg-blue-500'}`}>
                <Text className="text-white text-[10px] font-bold">{isFaculty ? "FACULTY" : "STUDENT"}</Text>
            </View>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-4">
        <View className="w-full bg-primary-500 p-4 rounded-xl mb-4">
          <Text className="text-white/75 mb-2">Class Title</Text>
          <View className="bg-gray-200/65 p-4 rounded-xl">
            <Text className="text-xl font-bold text-white">{subjectTitle}</Text>
          </View>
        </View>

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

        <Text className="text-xl font-bold mb-3">Tasks</Text>

        {tasks.map((task) => (
          <View 
            key={task.id} 
            className={`p-3 rounded-lg mb-2 shadow flex-row items-center ${
              task.is_global ? 'bg-purple-50 border border-purple-100' : 'bg-white'
            } ${task.is_completed ? 'opacity-60' : ''}`}
          >
            <Checkbox
              value={task.is_completed}
              onValueChange={() => handleToggleComplete(task.id)}
              color={task.is_global ? "#6B46C1" : "#DC2626"}
            />
            <View className="flex-1 ml-3">
              {task.is_global && <Text className="text-[10px] font-bold text-purple-600">CLASS ANNOUNCEMENT</Text>}
              <Text className={`font-semibold ${task.is_completed ? 'text-gray-400 line-through' : 'text-black'}`}>
                  {task.text}
              </Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteTask(task)} className="p-2">
              <TrashIcon size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Add New Task Section */}
        <View className="mt-6 mb-8">
          <View className="flex-row justify-between items-end mb-2">
            <Text className="font-bold text-lg">Add New Task</Text>
            
            {/* FACULTY TOGGLE TRIGGER */}
            {isFaculty && (
              <View className="flex-row bg-gray-200 p-1 rounded-lg">
                <TouchableOpacity 
                  onPress={() => setTaskType('self')}
                  className={`px-3 py-1 rounded-md ${taskType === 'self' ? 'bg-white shadow-sm' : ''}`}
                >
                  <Text className={`text-[10px] font-bold ${taskType === 'self' ? 'text-blue-600' : 'text-gray-500'}`}>Self</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => setTaskType('announcement')}
                  className={`px-3 py-1 rounded-md ${taskType === 'announcement' ? 'bg-purple-600' : ''}`}
                >
                  <Text className={`text-[10px] font-bold ${taskType === 'announcement' ? 'text-white' : 'text-gray-500'}`}>Class</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View className="bg-white p-3 rounded-xl shadow flex-row items-center border border-gray-100">
            <TextInput
              value={newTaskText}
              onChangeText={setNewTaskText}
              placeholder={taskType === 'announcement' ? "Post announcement..." : "Enter self task..."}
              className="flex-1 text-base"
              onSubmitEditing={handleAddTask}
            />
            <TouchableOpacity
              onPress={handleAddTask}
              disabled={!newTaskText.trim()}
              className={`px-4 py-2 rounded-xl ml-2 ${!newTaskText.trim() ? 'bg-gray-300' : (taskType === 'announcement' ? 'bg-purple-600' : 'bg-primary-600')}`}
            >
              <Text className="text-white font-bold">{taskType === 'announcement' ? "Post" : "Add"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </>
  );
}