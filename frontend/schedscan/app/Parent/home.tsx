import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, TextInput, Alert } from "react-native";
import React, { useState, useEffect, useCallback } from "react";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../context/AuthContext";
import { parentService, ChildInfo, ChildScheduleResponse } from "../../services/parentService";

// --- Types ---
type Course = {
  id: number;
  subject_code: string;
  subject_name: string;
  start_time: string;
  end_time: string;
  day: string;
  location: string;
};

const ParentHomePage = () => {
  const { user, logout } = useAuth();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [linkedChild, setLinkedChild] = useState<ChildInfo | null>(null);
  const [schedule, setSchedule] = useState<any | null>(null);
  const [todaysCourses, setTodaysCourses] = useState<Course[]>([]);

  // Link child modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  // Load data on focus
  useFocusEffect(
    useCallback(() => {
      loadChildData();
    }, [])
  );

  const loadChildData = async () => {
    try {
      setIsLoading(true);

      // First check if we have a linked child
      const childLink = await parentService.getLinkedChild();

      if (childLink.has_linked_child && childLink.child) {
        setLinkedChild(childLink.child);

        // Get the child's schedule
        try {
          const scheduleData = await parentService.getChildSchedule();
          setSchedule(scheduleData.schedule);

          if (scheduleData.schedule?.courses) {
            // Filter today's courses
            const today = getDayAbbrev(new Date().getDay());
            const filtered = scheduleData.schedule.courses.filter(
              (c: Course) => c.day === today
            );
            setTodaysCourses(filtered);
          }
        } catch (scheduleError) {
          console.log('No schedule available');
          setSchedule(null);
          setTodaysCourses([]);
        }
      } else {
        setLinkedChild(null);
        setSchedule(null);
        setTodaysCourses([]);
      }
    } catch (error) {
      console.error("Error loading child data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkChild = async () => {
    if (!inviteCode.trim()) {
      Alert.alert("Error", "Please enter an invite code");
      return;
    }

    try {
      setIsLinking(true);
      const result = await parentService.useInviteCode(inviteCode.trim());

      Alert.alert("Success!", result.message);
      setShowLinkModal(false);
      setInviteCode("");
      loadChildData();
    } catch (error: any) {
      const message = error.response?.data?.error || "Failed to link. Please check the code and try again.";
      Alert.alert("Link Failed", message);
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    Alert.alert(
      "Unlink Child",
      `Are you sure you want to unlink from ${linkedChild?.full_name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlink",
          style: "destructive",
          onPress: async () => {
            try {
              await parentService.unlinkFromChild();
              setLinkedChild(null);
              setSchedule(null);
              setTodaysCourses([]);
              Alert.alert("Unlinked", "You have been unlinked from your child's account.");
            } catch (error) {
              Alert.alert("Error", "Failed to unlink. Please try again.");
            }
          }
        }
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        onPress: async () => {
          await logout();
          router.replace("/intro/getstarted");
        }
      }
    ]);
  };

  const getDayAbbrev = (dayNum: number): string => {
    const days = ['S', 'M', 'T', 'W', 'TH', 'F', 'S'];
    return days[dayNum];
  };

  const formatTime = (time: string) => {
    // Convert 24h to 12h format if needed
    return time;
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text className="mt-4 text-gray-600">Loading...</Text>
      </View>
    );
  }

  // No linked child - show link prompt
  if (!linkedChild) {
    return (
      <View className="flex-1 bg-gray-50">
        {/* Header */}
        <View className="w-full h-14 bg-white border-b-2 border-gray-200 justify-between items-center flex-row px-4">
          <View className="flex-row items-center">
            <Image
              source={require("../../assets/images/logo.png")}
              className="w-12 h-12"
            />
            <View className="flex-col ml-2">
              <Text className="text-xl font-bold text-primary-900/50 leading-none">Sched</Text>
              <Text className="text-xl font-bold text-primary-900 leading-none">Scan</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleLogout}>
            <Text className="text-primary-600 font-semibold">Logout</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-1 justify-center items-center px-8">
          <Text className="text-6xl mb-4">👪</Text>
          <Text className="text-2xl font-bold text-gray-800 text-center mb-2">
            Welcome, {user?.first_name}!
          </Text>
          <Text className="text-gray-600 text-center mb-8">
            Link to your child's account to view their schedule.
          </Text>

          <View className="w-full bg-white p-6 rounded-2xl shadow-sm">
            <Text className="text-lg font-semibold text-gray-800 mb-4">
              Enter Invite Code
            </Text>
            <Text className="text-gray-600 mb-4 text-sm">
              Ask your child to generate an invite code from their SchedScan app and share it with you.
            </Text>

            <TextInput
              className="bg-gray-100 rounded-xl p-4 mb-4 text-center text-xl font-bold tracking-widest"
              placeholder="ABC123XYZ0"
              placeholderTextColor="#9CA3AF"
              value={inviteCode}
              onChangeText={(text) => setInviteCode(text.toUpperCase())}
              autoCapitalize="characters"
              maxLength={10}
            />

            <TouchableOpacity
              className={`bg-primary-600 rounded-xl py-4 ${isLinking ? 'opacity-50' : ''}`}
              onPress={handleLinkChild}
              disabled={isLinking}
            >
              {isLinking ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-center">Link to Child</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Has linked child - show schedule
  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="w-full h-14 bg-white border-b-2 border-gray-200 justify-between items-center flex-row px-4">
        <View className="flex-row items-center">
          <Image
            source={require("../../assets/images/logo.png")}
            className="w-12 h-12"
          />
          <View className="flex-col ml-2">
            <Text className="text-xl font-bold text-primary-900/50 leading-none">Sched</Text>
            <Text className="text-xl font-bold text-primary-900 leading-none">Scan</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text className="text-primary-600 font-semibold">Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1">
        {/* Welcome Header */}
        <View className="bg-primary-600 m-4 p-6 rounded-2xl">
          <Text className="text-3xl font-bold text-white mb-1">Hi, {user?.first_name}!</Text>
          <Text className="text-base text-primary-200">
            Viewing: {linkedChild.full_name}'s Schedule
          </Text>
        </View>

        {/* Child Info Card */}
        <View className="mx-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-row items-center mb-4">
          {linkedChild.profile_picture ? (
            <Image
              source={{ uri: linkedChild.profile_picture }}
              className="w-16 h-16 rounded-full"
            />
          ) : (
            <View className="w-16 h-16 rounded-full bg-primary-100 justify-center items-center">
              <Text className="text-2xl">{linkedChild.first_name[0]}</Text>
            </View>
          )}
          <View className="ml-4 flex-1">
            <Text className="text-lg font-bold text-gray-800">{linkedChild.full_name}</Text>
            <Text className="text-gray-500">{linkedChild.email}</Text>
          </View>
          <TouchableOpacity onPress={handleUnlink} className="p-2">
            <Text className="text-red-500 text-sm">Unlink</Text>
          </TouchableOpacity>
        </View>

        {/* Today's Schedule */}
        <View className="px-4 mt-2 mb-20">
          <Text className="text-lg font-bold mb-3">
            {linkedChild.first_name}'s Schedule Today
          </Text>

          {!schedule ? (
            <View className="items-center justify-center p-8 bg-white rounded-xl border-dashed border-2 border-gray-200">
              <Text className="text-gray-400 font-medium text-center">
                No active schedule found.{"\n"}
                Your child needs to upload their schedule first.
              </Text>
            </View>
          ) : todaysCourses.length === 0 ? (
            <View className="items-center justify-center p-8 bg-white rounded-xl border-dashed border-2 border-gray-200">
              <Text className="text-gray-400 font-medium">No classes today</Text>
            </View>
          ) : (
            todaysCourses.map((course, index) => (
              <View
                key={index}
                className="bg-white p-4 mb-3 rounded-xl shadow border-l-4 border-primary-500"
              >
                <Text className="font-bold text-base text-black">
                  {course.subject_code}
                </Text>
                {course.subject_name && (
                  <Text className="text-sm text-gray-700">{course.subject_name}</Text>
                )}
                <Text className="text-sm text-gray-600">
                  {formatTime(course.start_time)} - {formatTime(course.end_time)}
                </Text>
                {course.location && (
                  <Text className="text-sm text-gray-600">{course.location}</Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Full Week Schedule */}
        {schedule && schedule.courses && schedule.courses.length > 0 && (
          <View className="px-4 mb-20">
            <Text className="text-lg font-bold mb-3">Full Week Schedule</Text>
            {['M', 'T', 'W', 'TH', 'F', 'S'].map((day) => {
              const dayCourses = schedule.courses.filter((c: Course) => c.day === day);
              if (dayCourses.length === 0) return null;

              const dayNames: Record<string, string> = {
                'M': 'Monday', 'T': 'Tuesday', 'W': 'Wednesday',
                'TH': 'Thursday', 'F': 'Friday', 'S': 'Saturday'
              };

              return (
                <View key={day} className="mb-4">
                  <Text className="font-semibold text-gray-700 mb-2">{dayNames[day]}</Text>
                  {dayCourses.map((course: Course, idx: number) => (
                    <View key={idx} className="bg-white p-3 mb-2 rounded-lg border border-gray-100">
                      <Text className="font-medium">{course.subject_code}</Text>
                      <Text className="text-sm text-gray-500">
                        {course.start_time} - {course.end_time} {course.location && `• ${course.location}`}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default ParentHomePage;