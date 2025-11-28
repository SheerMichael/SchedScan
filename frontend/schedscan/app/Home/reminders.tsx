import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Keyboard, ActivityIndicator, Alert } from 'react-native';
import { router } from "expo-router";
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import DropDownPicker from "react-native-dropdown-picker";
import { Search, Clock, PencilLine } from "lucide-react-native";
import ScheduleItem from "../../components/reminderschedule";
import DayHeader from "../../components/reminderdayheader";
import { useAuth } from '../../context/AuthContext';
import { courseService, Course } from '../../services/courseService';

const RemindersScreen = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSchedules, setHasSchedules] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const [openSemester, setOpenSemester] = useState(false);
  const [semesterValue, setSemesterValue] = useState("1st");
  const [semesterItems, setSemesterItems] = useState([
    { label: "1st", value: "1st" },
    { label: "2nd", value: "2nd" },
    { label: "Summer", value: "Summer" },
  ]);

  type ScheduleItemType = {
    id: number;
    subject: string;
    start_time: string;
    end_time: string;
    day: string; 
    location: string;
  };


  const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
  );

  // Helper: Expand day codes to full names
  const expandDayCode = (dayCode: string): string[] => {
    const dayMap: Record<string, string[]> = {
      'M': ['Monday'],
      'T': ['Tuesday'],
      'W': ['Wednesday'],
      'TH': ['Thursday'],
      'F': ['Friday'],
      'S': ['Saturday'],
      'TF': ['Tuesday', 'Friday'],
      'MW': ['Monday', 'Wednesday'],
      'MWF': ['Monday', 'Wednesday', 'Friday'],
      'MTH': ['Monday', 'Thursday'],
      'TTH': ['Tuesday', 'Thursday']
    };
    return dayMap[dayCode] || [];
  };

  // Transform courses into day-grouped schedule data
  const transformCoursesToScheduleData = (courseList: Course[]) => {
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayColors: Record<string, string> = {
      'Monday': 'bg-primary-500',
      'Tuesday': 'bg-primary-500',
      'Wednesday': 'bg-green-500',
      'Thursday': 'bg-blue-800',
      'Friday': 'bg-yellow-500',
      'Saturday': 'bg-purple-500'
    };

    // Group courses by day
    const coursesByDay: Record<string, any[]> = {};

    courseList.forEach((course) => {
      const days = expandDayCode(course.day);
      
      days.forEach((dayName) => {
        if (!coursesByDay[dayName]) {
          coursesByDay[dayName] = [];
        }
        
        coursesByDay[dayName].push({
          id: course.id,
          subject: course.subject_name || course.subject_code,
          start_time: course.start_time,
          end_time: course.end_time,
          day: course.day, // Keep original day code for reference
          location: course.location,
        });
      });
    });

    // Convert to array format expected by UI, maintaining day order
    return dayOrder
      .filter((day) => coursesByDay[day] && coursesByDay[day].length > 0)
      .map((day) => ({
        day,
        color: dayColors[day] || 'bg-gray-500',
        items: coursesByDay[day].sort((a, b) => {
          // Sort by start time
          return a.start_time.localeCompare(b.start_time);
        }),
      }));
  };

  // Fetch courses from backend
  const loadCourses = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const fetchedCourses = await courseService.getCourses();
      setCourses(fetchedCourses);
      setHasSchedules(fetchedCourses.length > 0);
    } catch (error: any) {
      console.error('Error loading courses:', error);
      Alert.alert(
        'Error',
        'Failed to load courses. Please try again.',
        [{ text: 'OK' }]
      );
      setHasSchedules(false);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Load courses when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadCourses();
    }, [loadCourses])
  );

  // Transform courses into schedule data
  const scheduleData = transformCoursesToScheduleData(courses);

  const onEdit = (item: ScheduleItemType) => {
    router.push({
    pathname: '/Home/Reminders/edit_reminders',
    params: {
      id: item.id,
      subject: item.subject,
      start_time: item.start_time,
      end_time: item.end_time,
      day: item.day,
      location: item.location,
    },
    });
  };

  // Show loading spinner while fetching
  if (isLoading) {
    return (
      <>
        <View className="w-full h-14 bg-white border-b-2 border-b-gray-200 justify-between items-center flex-row">
          <View className='pl-8 flex-row justify-center items-center'>
            <TouchableOpacity onPress={() => router.push('/Home/home')}>
              <LeftPointingArrow size={30} color="#000000" />
            </TouchableOpacity>
          </View>
          <View className='flex-row justify-center items-center mr-4'>
            <Text className='font-bold text-2xl'>Reminders</Text>
          </View>
          <View>
          </View>
        </View>
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#DC2626" />
          <Text className="mt-4 text-gray-600">Loading courses...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <View className="w-full h-14 bg-white border-b-2 border-b-gray-200 justify-between items-center flex-row">
        <View className='pl-8 flex-row justify-center items-center'>
          <TouchableOpacity onPress={() => router.push('/Home/home')}>
            <LeftPointingArrow size={30} color="#000000" />
          </TouchableOpacity>
        </View>
        <View className='flex-row justify-center items-center mr-4'>
          <Text className='font-bold text-2xl'>Reminders</Text>
        </View>
        <View>
        </View>
      </View>

        {hasSchedules ? (
        <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled">
          <View className="bg-primary-700 m-4 p-6 rounded-2xl">
            <View className="flex-row justify-between">

              <View className="flex-col w-40">
                <Text className="text-white/75 text-lg font-bold">School Year</Text>
                <View className="bg-gray-200/65 flex justify-start items-start p-4 rounded-xl">
                  <Text className="text-xl text-white font-bold pl-2">2024-2025</Text>
                </View>
              </View>

              <View className="flex-col w-40">
                <Text className="text-white/75 text-lg font-bold">Semester</Text>
                <DropDownPicker
                  open={openSemester}
                  value={semesterValue}
                  items={semesterItems}
                  setOpen={setOpenSemester}
                  setValue={setSemesterValue}
                  setItems={setSemesterItems}
                  listMode="SCROLLVIEW"
                  onOpen={() => {
                    // Dismiss keyboard when dropdown opens
                    if (searchFocused) {
                      Keyboard.dismiss();
                    }
                  }}
                  onClose={() => {
                    // Optional: handle close
                  }}
                  style={{
                    backgroundColor: "rgba(229, 231, 235, 0.65)",
                    borderColor: "transparent",
                    borderRadius: 12,
                    paddingVertical: 12,
                  }}
                  dropDownContainerStyle={{
                    backgroundColor: "rgba(229, 231, 235, 0.65)",
                    borderColor: "transparent",
                    borderRadius: 12,
                  }}
                  textStyle={{
                    fontSize: 18,
                    fontWeight: "500",
                    color: "#000",
                    paddingLeft: 6,
                  }}
                  labelStyle={{
                    color: "#fff",
                    fontWeight: "700",
                    fontSize: 18,
                    paddingLeft: 6,
                  }}
                  zIndex={1000}
                  zIndexInverse={3000}
                />
              </View>

            </View>
          </View>

          <View className="relative mb-2 w-full">
            <TextInput
                placeholder="Search"
                placeholderTextColor="#9CA3AF"
                className="border border-gray-300 rounded-lg px-4 py-3 mb-5 text-gray-800 w-full"
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
            <View className="absolute right-3 top-3">
              <Search size={20} color="#444"/>
            </View>
          </View>

          <View>
            {scheduleData.map((day) => (
              <View key={day.day}>
                {/* Day Header */}
                <DayHeader label={day.day} color={day.color} />

                {/* Schedule Items */}
                {day.items.map((item) => (
                  <ScheduleItem
                    key={item.id}
                    subject={item.subject}
                    start_time={item.start_time}
                    end_time={item.end_time}
                    day={day.day}
                    onEdit={() => onEdit({...item, day: day.day})}
                  />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        ) : (
        <View className='flex-1 justify-center items-center'>
          <Image source={require('../../assets/images/Reminders.png')}
          style={{ width: 268, height: 168 }}
          />
          <Text className="text-gray-600 text-lg mt-4">No schedule, yet!</Text>
          <Text className="text-gray-500">Scan your schedule now</Text>
        </View>
        )}

    </>
  );
};

export default RemindersScreen;