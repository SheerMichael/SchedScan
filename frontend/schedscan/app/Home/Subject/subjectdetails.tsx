import { View, Text, ScrollView, TextInput, TouchableOpacity } from "react-native";
import Checkbox from "expo-checkbox"; /* expo install expo-checkbox */
import { useState, useEffect } from "react";
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, router } from "expo-router";

export default function SubjectDetails() {
  const { title, description } = useLocalSearchParams();

  // Load tasks (later from storage)
  const [taskList, setTaskList] = useState<string[]>([]);
  const [newTask, setNewTask] = useState<string>("");

  // TEMP: If needed, we can load tasks from storage here using the title as a key
  useEffect(() => {
    // Example: For now, load empty array
    setTaskList([]);
  }, []);

  // Remove task (but only applied after Save)
  const completeTask = (index: number) => {
    setTaskList(prev => prev.filter((_, i) => i !== index));
  };

  // Add a new task
  const addTask = () => {
    if (!newTask.trim()) return;
    setTaskList(prev => [...prev, newTask.trim()]);
    setNewTask("");
  };

  // Cancel → go back
  const handleCancel = () => {
    router.back();
  };

  // Save → future: save to AsyncStorage or backend
  const handleSave = () => {
    console.log("Saving updated tasks:", taskList);
    // TODO: Save to storage
    router.back();
  };

  const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <Path d="M19 12H6M12 5l-7 7 7 7" />
      </Svg>
  );

  return (
    <>

      <View className='pl-8'>
        <TouchableOpacity onPress={() => router.back()}>
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

        {/* Description */}
        <Text className="text-base text-gray-700 mb-6">
          {description || "No description available."}
        </Text>

        {/* Tasks */}
        <Text className="text-xl font-bold mb-2">Tasks</Text>

        {taskList.length === 0 ? (
          <Text className="text-gray-500 mb-4">No tasks for this subject.</Text>
        ) : (
          taskList.map((task, idx) => (
            <View
              key={idx}
              className="bg-white p-3 rounded-lg mb-2 shadow flex-row items-center"
            >
              {/* Checkbox */}
              <Checkbox
                value={false}
                onValueChange={() => completeTask(idx)}
                color="#DC2626"
                style={{ marginRight: 12 }}
              />

              {/* Task Text */}
              <Text className="font-semibold text-black">{task}</Text>
            </View>
          ))
        )}

        {/* Add New Task */}
        <View className="mt-6">
          <Text className="font-bold text-lg mb-2">Add New Task</Text>

          <View className="bg-white p-3 rounded-xl shadow flex-row items-center">
            <TextInput
              value={newTask}
              onChangeText={setNewTask}
              placeholder="Enter new task..."
              className="flex-1 text-base"
            />

            <TouchableOpacity
              onPress={addTask}
              className="bg-primary-600 px-4 py-2 rounded-xl ml-2"
            >
              <Text className="text-white font-bold">Add</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {/* Bottom Buttons */}
      <View className="bg-white px-4 py-3 flex-row justify-between items-center">
        <TouchableOpacity
          onPress={handleCancel}
          className="flex-1 mr-2 border-primary-600 border py-3 px-6 rounded-lg active:bg-gray-200"
        >
          <Text className="text-primary-700 font-semibold text-center text-base">
            Cancel
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSave}
          className="flex-1 ml-2 bg-primary-600 py-3 px-6 rounded-lg active:bg-primary-700"
        >
          <Text className="text-white font-semibold text-center text-base">
            Save 
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}