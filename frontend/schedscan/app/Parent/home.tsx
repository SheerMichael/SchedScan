import { View, Text, TouchableOpacity, ScrollView, Image } from "react-native";
import React, { useState, useEffect } from "react";
import { router } from "expo-router";

// --- Types ---
type ScheduleItem = {
  childId: number;
  title: string;
  time: string;
  location: string;
  priority_level: "low" | "medium" | "high";
  date: string; // YYYY-MM-DD
};

type Child = {
  id: number;
  name: string;
};

// New Type for Attendance
type AttendanceStats = {
  present: number;
  late: number;
  absent: number;
  percentage: number;
};

const ParentHomePage = () => {
  const [childrenList, setChildrenList] = useState<Child[]>([
    { id: 1, name: "John Doe" },
    { id: 2, name: "Jane Doe" },
  ]);

  const [selectedChild, setSelectedChild] = useState<Child>(childrenList[0]);

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [daySchedule, setDaySchedule] = useState<ScheduleItem[]>([]);

  // --- Mock Data ---

  // Mock Attendance Data (Keyed by Child ID)
  const mockAttendance: Record<number, AttendanceStats> = {
    1: { present: 45, late: 2, absent: 1, percentage: 94 }, // John
    2: { present: 38, late: 5, absent: 3, percentage: 82 }, // Jane
  };

  const allSchedules: ScheduleItem[] = [
    {
      childId: 1,
      title: "Math Class",
      time: "8:00 AM - 9:00 AM",
      location: "Room 204",
      priority_level: "high",
      date: "2025-12-07",
    },
    {
      childId: 1,
      title: "English",
      time: "9:30 AM - 10:30 AM",
      location: "Room 105",
      priority_level: "medium",
      date: "2025-12-08",
    },
    {
      childId: 2,
      title: "Science Project",
      time: "10:00 AM - 11:30 AM",
      location: "Lab 1",
      priority_level: "high",
      date: "2025-12-07",
    },
  ];

  // --- Effects ---

  useEffect(() => {
    const filtered = allSchedules.filter(
      (item) =>
        item.childId === selectedChild.id && item.date === selectedDate
    );
    setDaySchedule(filtered);
  }, [selectedChild, selectedDate]);

  // --- Helpers ---

  const getPriorityColor = (level: string) => {
    switch (level) {
      case "high":
        return "border-primary-500";
      case "medium":
        return "border-yellow-500";
      case "low":
        return "border-green-500";
      default:
        return "border-gray-300";
    }
  };

  // Helper for attendance bar color
  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 90) return "bg-green-500";
    if (percentage >= 75) return "bg-yellow-500";
    return "bg-primary-500";
  };

  // Get current child's stats
  const currentStats = mockAttendance[selectedChild.id] || {
    present: 0,
    late: 0,
    absent: 0,
    percentage: 0,
  };

  return (
    <>
      <View className="w-full h-14 bg-white border-b-2 border-gray-200 justify-between items-center flex-row">
        <View className="ml-8 flex-row justify-center items-center">
          <Image
            source={require("../../assets/images/logo.png")}
            className="w-12 h-12"
          />
          <View className="flex-col justify-center items-left">
            <Text className="text-xl font-bold text-primary-900/50 leading-none">
              Sched
            </Text>
            <Text className="text-xl font-bold text-primary-900 leading-none">
              Scan
            </Text>
          </View>
        </View>
        <View className="flex-row justify-center items-center mr-4">
          <TouchableOpacity
            onPress={() => router.push("/Home/notification")}
          ></TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 bg-gray-50">
        {/* Header */}
        <View className="bg-primary-600 m-4 p-6 rounded-2xl">
          <Text className="text-3xl font-bold text-white mb-1">Hi, Jane!</Text>
          <Text className="text-base text-primary-200">
            Viewing: {selectedChild.name}
          </Text>
        </View>

        {/* Child Switcher */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-4 mb-4"
        >
          {childrenList.map((child) => (
            <TouchableOpacity
              key={child.id}
              onPress={() => setSelectedChild(child)}
              className={`px-4 py-2 mr-2 rounded-full ${
                selectedChild.id === child.id
                  ? "bg-primary-500"
                  : "bg-gray-200"
              }`}
            >
              <Text
                className={`${
                  selectedChild.id === child.id
                    ? "text-white"
                    : "text-gray-700"
                } font-semibold`}
              >
                {child.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* --- NEW: Quick Attendance View --- */}
        <View className="mx-4 mb-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <View className="flex-row justify-between items-center mb-2">
                <Text className="font-bold text-gray-800 text-lg">Attendance Rate</Text>
                <Text className={`font-bold text-lg ${currentStats.percentage >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                    {currentStats.percentage}%
                </Text>
            </View>

            {/* Progress Bar */}
            <View className="w-full h-2 bg-gray-200 rounded-full mb-4 overflow-hidden">
                <View 
                    className={`h-full ${getAttendanceColor(currentStats.percentage)}`} 
                    style={{ width: `${currentStats.percentage}%` }}
                />
            </View>

            {/* Stats Grid */}
            <View className="flex-row justify-between">
                <View className="items-center bg-green-50 p-2 rounded-lg w-[30%]">
                    <Text className="text-green-700 font-bold text-xl">{currentStats.present}</Text>
                    <Text className="text-green-600 text-xs uppercase font-bold">Present</Text>
                </View>
                <View className="items-center bg-yellow-50 p-2 rounded-lg w-[30%]">
                    <Text className="text-yellow-700 font-bold text-xl">{currentStats.late}</Text>
                    <Text className="text-yellow-600 text-xs uppercase font-bold">Late</Text>
                </View>
                <View className="items-center bg-primary-50 p-2 rounded-lg w-[30%]">
                    <Text className="text-primary-700 font-bold text-xl">{currentStats.absent}</Text>
                    <Text className="text-primary-600 text-xs uppercase font-bold">Absent</Text>
                </View>
            </View>
        </View>

        {/* Date Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-4 mb-4"
          contentContainerStyle={{ paddingRight: 16 }}
        >
          {Array.from({ length: 7 }).map((_, i) => {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const isoDate = date.toISOString().split("T")[0];
            const label = date.toDateString().slice(0, 10);

            return (
              <TouchableOpacity
                key={i}
                onPress={() => setSelectedDate(isoDate)}
                className={`px-4 py-2 mr-3 rounded-lg ${
                  selectedDate === isoDate ? "bg-primary-500" : "bg-gray-200"
                }`}
              >
                <Text
                  className={`${
                    selectedDate === isoDate ? "text-white" : "text-gray-700"
                  } text-xs text-center`}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Schedule */}
        <View className="px-4 mt-2 mb-20">
          <Text className="text-lg font-bold mb-3">
            {selectedChild.name}'s Schedule Today
          </Text>

          {daySchedule.length === 0 ? (
            <View className="items-center justify-center p-8 bg-white rounded-xl border-dashed border-2 border-gray-200">
                <Text className="text-gray-400 font-medium">No classes today</Text>
            </View>
          ) : (
            daySchedule.map((item, index) => (
              <TouchableOpacity
                key={index}
                onPress={() =>
                  router.push({
                    pathname: "/Home/Subject/subjectdetails",
                    params: {
                      title: item.title,
                    },
                  })
                }
                className={`bg-white p-4 mb-3 rounded-xl shadow border-l-4 ${getPriorityColor(
                  item.priority_level
                )}`}
              >
                <Text className="font-bold text-base text-black">
                  {item.title}
                </Text>
                <Text className="text-sm text-gray-600">{item.time}</Text>
                <Text className="text-sm text-gray-600">{item.location}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
};

export default ParentHomePage;