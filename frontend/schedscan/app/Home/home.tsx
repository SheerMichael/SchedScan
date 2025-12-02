import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G, Rect, Polygon } from "react-native-svg";
import { router } from "expo-router";
import { useAuth } from '../../context/AuthContext';
import { Course } from '../../services/courseService';
import { scheduleStorageService, SavedSchedule } from '../../services/scheduleStorageService';
import { useFocusEffect } from '@react-navigation/native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

export default function SchedScanApp() {
  const { user } = useAuth();
  const startYear = 2025;
  const endYear = 2050;
  const now = new Date();

  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'teaching' | 'attending'>('all');
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [activeSchedule, setActiveSchedule] = useState<SavedSchedule | null>(null);

  type ScheduleItem = {
    title: string;
    subjectName: string;
    time: string;
    startTime: string;
    endTime: string;
    location: string;
    day: string;
    priority_level: string;
  };
  
  type WeeklySchedule = {
    [key: number]: ScheduleItem[];
  };

  // Draggable card component using modern Gesture API
  const DraggableCard = ({ 
    item, 
    index, 
    onDragEnd, 
    totalItems
  }: { 
    item: ScheduleItem; 
    index: number; 
    onDragEnd: (fromIndex: number, toIndex: number) => void;
    totalItems: number;
  }) => {
    const translateY = useSharedValue(0);
    const scale = useSharedValue(1);
    const isActive = useSharedValue(false);
    const cardHeight = 100; // Approximate card height

    const animatedStyle = useAnimatedStyle(() => {
      return {
        transform: [
          { translateY: translateY.value },
          { scale: withSpring(isActive.value ? 1.03 : 1) }
        ],
        zIndex: isActive.value ? 1000 : 0,
        shadowOpacity: isActive.value ? 0.3 : 0.1,
      };
    });

    const panGesture = Gesture.Pan()
      .onBegin(() => {
        isActive.value = true;
      })
      .onUpdate((event) => {
        translateY.value = event.translationY;
      })
      .onEnd((event) => {
        const offsetY = event.translationY;
        const moveBy = Math.round(offsetY / cardHeight);
        let newIndex = index + moveBy;
        
        // Clamp to valid range
        newIndex = Math.max(0, Math.min(totalItems - 1, newIndex));
        
        translateY.value = withSpring(0);
        isActive.value = false;
        
        if (newIndex !== index) {
          runOnJS(onDragEnd)(index, newIndex);
        }
      })
      .onFinalize(() => {
        translateY.value = withSpring(0);
        isActive.value = false;
      });

    return (
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            animatedStyle,
            {
              backgroundColor: 'white',
              padding: 16,
              marginBottom: 12,
              borderRadius: 12,
              borderLeftWidth: 4,
              borderLeftColor: item.priority_level === "Holiday" ? "#16a34a" : "#ef4444",
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowRadius: 4,
              elevation: 3,
            }
          ]}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#000' }}>{item.title}</Text>
              <Text style={{ fontSize: 14, color: '#666' }}>{item.time}</Text>
              <Text style={{ fontSize: 14, color: '#666' }}>{item.location}</Text>
              <Text style={{ fontSize: 14, color: '#666' }}>{item.priority_level}</Text>
            </View>
            <View style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: '#9ca3af', fontSize: 18 }}>≡</Text>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    );
  };

  interface Star {
    value: number;
  }
const StarBadge = ({ value }: Star) => {
  return (
    <View className="items-center justify-center">
      <Svg width={40} height={40} viewBox="0 0 100 100">
        <Path
          d="M50 5 L61 35 L94 35 L67 55 L78 85 L50 65 L22 85 L33 55 L6 35 L39 35 Z"
          fill="#F7FF63" 
          stroke="black"
          strokeWidth="1"
        />
      </Svg>

      <View className="absolute">
        <Text className="font-bold text-black text-lg">{value}</Text>
      </View>
    </View>
  );
};

const Bell = ({ size = 24, color = '#4D4D4D' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="2">
    <Path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0" />
  </Svg>
);

const Classes_Today = ({ size = 24 }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="#EB3223"
  >
    <Path
      d="M14.5 2H13V1h-1v1H4V1H3v1H1.5l-.5.5v12l.5.5h13l.5-.5v-12l-.5-.5zM14 14H2V5h12v9zm0-10H2V3h12v1zM4 8H3v1h1V8zm-1 2h1v1H3v-1zm1 2H3v1h1v-1zm2-4h1v1H6V8zm1 2H6v1h1v-1zm-1 2h1v1H6v-1zm1-6H6v1h1V6zm2 2h1v1H9V8zm1 2H9v1h1v-1zm-1 2h1v1H9v-1zm1-6H9v1h1V6zm2 2h1v1h-1V8zm1 2h-1v1h1v-1zm-1-4h1v1h-1V6z"
    />
  </Svg>
);

const Teaching = ({ size = 24 }) => (
 <Svg
    id="Capa_1"
    width={size}
    height={size}
    viewBox="0 0 31.314 31.314"
    fill="#EB3223"
  >
    <G>
      <G>
        <Path d="M18.773,7.2c-0.09,0-0.094,0-0.103,0.128c-0.019,0.262-0.036,0.47-0.049,0.638h-0.354c-0.274,0-0.311,0.16-0.318,0.31 s-0.008,0.155-0.008,0.182c0,0.03,0.013,0.049,0.047,0.049h0.59c-0.018,0.195-0.021,0.256-0.021,0.345 c0,0.271,0.09,0.421,0.446,0.421c0.075,0,0.095-0.018,0.099-0.089l0.053-0.677h0.352c0.266,0,0.322-0.12,0.335-0.297l0.015-0.182 c0-0.039-0.035-0.062-0.07-0.062h-0.58c0.018-0.199,0.021-0.279,0.021-0.363C19.227,7.351,19.137,7.2,18.773,7.2z" />
        <Path d="M21.046,9.038c-0.014,0.022-0.03,0.071-0.03,0.103v0.265c0,0.235,0.11,0.323,0.406,0.323h1.452 c0.267,0,0.324-0.12,0.337-0.297l0.018-0.261c0-0.044-0.035-0.062-0.07-0.062h-1.124c0.274-0.218,1.292-0.886,1.292-1.74 c0-0.372-0.207-0.833-1.004-0.833c-0.551,0-1.139,0.234-1.139,0.845c0,0.31,0.158,0.474,0.49,0.474 c0.125,0,0.133-0.022,0.143-0.081c0.027-0.238,0.09-0.584,0.377-0.584c0.227,0,0.318,0.12,0.318,0.266 C22.512,8.006,21.215,8.728,21.046,9.038z" />
        <Path d="M24.634,9.025L24.62,9.264c0,0.031,0.014,0.049,0.049,0.049h1.427c0.266,0,0.321-0.12,0.336-0.297l0.019-0.239 c0-0.044-0.026-0.062-0.071-0.062h-1.426C24.68,8.715,24.643,8.874,24.634,9.025z" />
        <Path d="M26.59,7.865l0.02-0.24c0-0.044-0.027-0.062-0.07-0.062h-1.428c-0.273,0-0.31,0.16-0.316,0.31l-0.016,0.239 c0,0.031,0.015,0.049,0.05,0.049h1.424C26.52,8.161,26.577,8.042,26.59,7.865z" />
        <Rect x={23.695} y={15.25} width={5.053} height={1.878} />
        <Polygon points="2.932,0.463 2.932,3.416 4.222,3.018 4.222,1.753 30.023,1.753 30.023,18.201 9.491,18.201 9.424,19.49  31.314,19.49 31.314,0.463  " />
        <Circle cx={4.984} cy={7.526} r={3.821} />
        <Path d="M8.228,29.104v-6.802V21.66v-0.87h0.243l0.355-6.905l6.59-3.414l-0.358-0.692l0.65-0.449 c0.012,0.271,0.121,0.398,0.455,0.398h0.244c0.053,0,0.065-0.018,0.069-0.066c0.015-0.124,0.184-2.458,0.184-2.706 c0-0.217-0.133-0.373-0.457-0.373h-0.266c-0.01,0-0.15,0.094-0.247,0.151c-0.377,0.23-0.404,0.253-0.404,0.31 c0,0.155,0.12,0.416,0.346,0.416c0.071,0,0.15-0.026,0.214-0.097c-0.049,0.606-0.1,1.195-0.126,1.575l-0.096-0.139l-0.791,0.546 L14.55,8.801l-6.025,3.121h-2.15l-1.456,1.689L3.51,11.922l-3.095,0.495l-0.2,6.948h1.313l0.07,1.426h0.2v0.87v0.642v6.803H1.534 L0,29.438v1.414h1.307l1.523-0.25l0.014,0.25h1.688v-1.576v-0.17v-6.803h0.961v6.803v0.17v1.576h1.688l0.014-0.25l1.524,0.25 h1.306v-1.414L8.49,29.104H8.228z" />
      </G>
    </G>
  </Svg>
);

const Attending = ({ size = 24 }) => (
    <Svg
    fill="#EB3223"
    width={size}
    height={size}
    viewBox="0 0 512 512"
  >
    <G id="Graduation">
      <Polygon points="445.055 384.794 445.055 221.864 418.805 234.989 418.805 384.777 401.301 429.785 462.551 429.785 445.055 384.794" />
      <Path d="M229.0648,306.3708l-107.7643-53.88v53.7754c0,36.2433,58.7634,65.625,131.25,65.625,72.4887,0,131.25-29.3817,131.25-65.625V252.49L276.0277,306.3741C257.5813,313.681,247.5133,313.6789,229.0648,306.3708Z" />
      <Path d="M264.2912,282.8969l186.5207-93.26c6.4579-3.2289,6.4579-8.5107,0-11.74l-186.5207-93.26c-6.4556-3.2289-17.0214-3.2289-23.4793,0l-186.5207,93.26c-6.4556,3.2289-6.4556,8.5107,0,11.74l186.5207,93.26C247.27,286.1258,257.8356,286.1258,264.2912,282.8969Z" />
    </G>
  </Svg>
);

  const [daySchedule, setDaySchedule] = useState<ScheduleItem[]>([]);

  // Handle drag end and reorder
  const handleDragEnd = (fromIndex: number, toIndex: number) => {
    if (fromIndex !== toIndex) {
      setDaySchedule(prevSchedule => {
        const newSchedule = [...prevSchedule];
        const [movedItem] = newSchedule.splice(fromIndex, 1);
        newSchedule.splice(toIndex, 0, movedItem);
        return newSchedule;
      });
    }
  };

  // Fetch courses from active local schedule when component mounts or comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadActiveSchedule();
    }, [user?.id])
  );

  const loadActiveSchedule = async () => {
    if (!user?.id) {
      setIsLoadingCourses(false);
      return;
    }

    try {
      setIsLoadingCourses(true);
      const active = await scheduleStorageService.getActiveSchedule(user.id);
      setActiveSchedule(active);
      
      if (active) {
        setCourses(active.courses);
        console.log('Loaded active schedule:', active.title, 'with', active.courses.length, 'courses');
        
        // Update today's schedule if a day is selected
        if (selectedDay !== null) {
          updateDaySchedule(selectedDay, active.courses);
        }
      } else {
        setCourses([]);
        setDaySchedule([]);
        console.log('No active schedule found');
      }
    } catch (error: any) {
      console.error('Failed to load active schedule:', error);
      setCourses([]);
    } finally {
      setIsLoadingCourses(false);
    }
  };

  // Map backend day codes to JavaScript day numbers
  // OCR extracts codes like: M, T, W, TH, F, S, MTH, TF, MW, TTH, MWF, etc.
  const dayCodeToNumbers = (dayCode: string): number[] => {
    // Return empty array if no day code (course won't show on any day)
    if (!dayCode || dayCode.trim() === '') {
      return [];
    }

    // Single letter/code mappings
    const singleDayMap: { [key: string]: number } = {
      'M': 1,    // Monday
      'T': 2,    // Tuesday
      'W': 3,    // Wednesday
      'TH': 4,   // Thursday
      'F': 5,    // Friday
      'S': 6,    // Saturday
      'SUN': 0,  // Sunday
      'MON': 1,
      'TUE': 2,
      'WED': 3,
      'THU': 4,
      'FRI': 5,
      'SAT': 6,
      // Full day names as fallback
      'MONDAY': 1,
      'TUESDAY': 2,
      'WEDNESDAY': 3,
      'THURSDAY': 4,
      'FRIDAY': 5,
      'SATURDAY': 6,
      'SUNDAY': 0,
    };

    // Multi-day combination mappings
    const multiDayMap: { [key: string]: number[] } = {
      'MTH': [1, 4],      // Monday & Thursday
      'TF': [2, 5],       // Tuesday & Friday
      'MW': [1, 3],       // Monday & Wednesday
      'TTH': [2, 4],      // Tuesday & Thursday
      'MWF': [1, 3, 5],   // Monday, Wednesday & Friday
      'MTWTH': [1, 2, 3, 4], // Mon-Thu
      'MTWTHF': [1, 2, 3, 4, 5], // Mon-Fri
    };

    // Check multi-day codes first (they're more specific)
    const upperCode = dayCode.toUpperCase().trim();
    if (multiDayMap[upperCode]) {
      return multiDayMap[upperCode];
    }

    // Check single day codes
    if (singleDayMap[upperCode] !== undefined) {
      return [singleDayMap[upperCode]];
    }

    return [];
  };

  // Check if a specific date has courses
  const hasCoursesOnDate = (day: number): boolean => {
    const weekday = new Date(selectedYear, selectedMonth, day).getDay();
    
    return courses.some(course => {
      const courseDays = dayCodeToNumbers(course.day);
      return courseDays.includes(weekday);
    });
  };

  // Get courses for a specific date
  const getCoursesForDate = (day: number): Course[] => {
    const weekday = new Date(selectedYear, selectedMonth, day).getDay();
    
    return courses.filter(course => {
      const courseDays = dayCodeToNumbers(course.day);
      return courseDays.includes(weekday);
    });
  };

  // Helper function to convert time string to minutes for sorting
  const timeStringToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return 0;
    
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    
    // Convert to 24-hour format for proper sorting
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return hours * 60 + minutes;
  };

  // Update day schedule based on selected day
  const updateDaySchedule = (day: number, coursesData: Course[] = courses) => {
    const dateCourses = coursesData.filter(course => {
      const weekday = new Date(selectedYear, selectedMonth, day).getDay();
      const courseDays = dayCodeToNumbers(course.day);
      return courseDays.includes(weekday);
    });

    // Sort courses by start time (earliest first)
    const sortedCourses = [...dateCourses].sort((a, b) => {
      return timeStringToMinutes(a.start_time) - timeStringToMinutes(b.start_time);
    });

    // Convert Course[] to ScheduleItem[]
    const scheduleItems: ScheduleItem[] = sortedCourses.map(course => ({
      title: course.subject_code,
      subjectName: course.subject_name || '',
      time: `${course.start_time} - ${course.end_time}`,
      startTime: course.start_time,
      endTime: course.end_time,
      location: course.location || '',
      day: course.day,
      priority_level: 'Class',
    }));

    setDaySchedule(scheduleItems);
  };

  const weeklySchedule: WeeklySchedule = {};

  // ✅ One-time Holidays / Events
  const holidaySchedule: { [key: string]: ScheduleItem[] } = {};

  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const monthsFull = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  const daysOfWeek = ['S','M','T','W','T','F','S'];

  const getDaysInMonth = (month:number, year:number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month:number, year:number) => new Date(year, month, 1).getDay();

  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(selectedMonth, selectedYear);
    const firstDay = getFirstDayOfMonth(selectedMonth, selectedYear);
    const days = [];

    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const navigateMonth = (direction:'prev' | 'next') => {
    if (direction === 'prev') {
      if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear(selectedYear - 1);
      } else {
        setSelectedMonth(selectedMonth - 1);
      }
    } else {
      if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear(selectedYear + 1);
      } else {
        setSelectedMonth(selectedMonth + 1);
      }
    }
    setSelectedDay(null);
  };
  // ✅ NEW — Check if date has holiday
  const isHoliday = (day:number) => {
    const key = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return holidaySchedule[key] !== undefined;
  };

  // ✅ UPDATED — Only show real courses from backend
  const selectDay = (day:number) => {
    setSelectedDay(day);

    const dateKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const holiday = holidaySchedule[dateKey] ?? [];

    // Calculate the weekday (0=Sun, 1=Mon, 2=Tue, etc.)
    const weekday = new Date(selectedYear, selectedMonth, day).getDay();

    // Get real courses for this specific day
    const realCourses = courses
      .filter(course => {
        const courseDays = dayCodeToNumbers(course.day);
        return courseDays.includes(weekday);
      })
      .sort((a, b) => {
        // Sort by start time (chronological order)
        // Convert time strings like "11:30AM" to comparable values
        const parseTime = (timeStr: string): number => {
          const match = timeStr.match(/(\d{1,2}):(\d{2})(AM|PM)/i);
          if (!match) return 0;
          let hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const period = match[3].toUpperCase();
          
          if (period === 'PM' && hours !== 12) hours += 12;
          if (period === 'AM' && hours === 12) hours = 0;
          
          return hours * 60 + minutes;
        };
        return parseTime(a.start_time) - parseTime(b.start_time);
      })
      .map(course => ({
        title: course.subject_code,
        subjectName: course.subject_name || '',
        time: `${course.start_time} - ${course.end_time}`,
        startTime: course.start_time,
        endTime: course.end_time,
        location: course.location || '',
        day: course.day,
        priority_level: 'Class',
      }));

    const schedule = [...holiday, ...realCourses];
    setDaySchedule(schedule);
  };

  // Re-calculate day schedule when courses or selected month/year changes
  useEffect(() => {
    if (selectedDay !== null && courses.length > 0) {
      selectDay(selectedDay);
    }
  }, [courses, selectedMonth, selectedYear]);

  // Select today on initial load
  useEffect(() => {
    selectDay(new Date().getDate());
  }, [])

  return (
    <>
      <View className="w-full h-14 bg-white border-b-2 border-gray-200 justify-between items-center flex-row">
        <View className='ml-8 flex-row justify-center items-center'>
          <Image source={require('../../assets/images/logo.png')} className='w-12 h-12'/>
          <View className='flex-col justify-center items-left'>
            <Text className="text-xl font-bold text-primary-900/50 leading-none">Sched</Text>
            <Text className="text-xl font-bold text-primary-900 leading-none">Scan</Text>
          </View>
        </View>
        <View className='flex-row justify-center items-center mr-4'>
        <StarBadge value={5} />
        <TouchableOpacity
          onPress={() => router.push('/Home/notification')}>
          <Bell size={24} color="#4D4D4D"/>
        </TouchableOpacity>
        </View>
      </View>

        {/* Banner */}
      <ScrollView className="flex-1">
        <View className="bg-primary-600 m-4 p-6 rounded-2xl">
          <Text className="text-3xl font-bold text-white mb-1">
            Hi, {user?.first_name} {user?.last_name}!
          </Text>
          <Text className="text-base text-red-200">Ready to organize?</Text>
        </View>
        
        <View className="flex-row justify-between px-4 mt-2">
          {/* Classes Today */}
          <View className="flex-1 bg-white rounded-xl p-4 items-center border border-red-200 mx-1">
            <Classes_Today size={24}/>
            <Text className="text-3xl font-bold text-primary-600">{daySchedule.length}</Text>
            <Text className="text-sm text-gray-500">Classes Today</Text>
          </View>

          {/* Teaching - shows count for faculty schedules */}
          <View className="flex-1 bg-white rounded-xl p-4 items-center border border-red-200 mx-1">
            <Teaching size={24}/>
            <Text className="text-3xl font-bold text-primary-600">
              {activeSchedule?.uploadType === 'faculty' ? daySchedule.length : 0}
            </Text>
            <Text className="text-sm text-gray-500">Teaching</Text>
          </View>

          {/* Attending - shows count for student schedules */}
          <View className="flex-1 bg-white rounded-xl p-4 items-center border border-red-200 mx-1">
            <Attending size={24}/>
            <Text className="text-3xl font-bold text-primary-600">
              {activeSchedule?.uploadType === 'student' ? daySchedule.length : 0}
            </Text>
            <Text className="text-sm text-gray-500">Attending</Text>
          </View>
        </View>

        {/* Filter Buttons */}
        <View className="flex-row justify-evenly mt-3 px-4">

          {/* All Schedules */}
          <TouchableOpacity onPress={() => setSelectedFilter('all')} className={`px-4 py-2 rounded-full border w-1/3 items-center
              ${selectedFilter === 'all' ? 'bg-primary-500 border-primary-400': 'bg-white border-primary-400'}`}>
            <Text className={`text-xs font-semibold ${selectedFilter === 'all' ? 'text-white' : 'text-red-600'}`}>
              All Schedules
            </Text>
          </TouchableOpacity>

          {/* Teaching Only */}
          <TouchableOpacity onPress={() => setSelectedFilter('teaching')} className={`px-4 py-2 rounded-full border w-1/3 items-center mx-1
              ${selectedFilter === 'teaching'? 'bg-primary-500 border-primary-400': 'bg-white border-primary-400'}`}>
            <Text className={`text-xs font-semibold 
              ${selectedFilter === 'teaching' ? 'text-white' : 'text-red-600'}`}>
              Teaching Only
            </Text>
          </TouchableOpacity>

          {/* Attending */}
          <TouchableOpacity onPress={() => setSelectedFilter('attending')} className={`px-4 py-2 rounded-full border w-1/3 items-center
              ${selectedFilter === 'attending' ? 'bg-primary-500 border-primary-400': 'bg-white border-primary-400'}`}>
            <Text className={`text-xs font-semibold 
              ${selectedFilter === 'attending' ? 'text-white' : 'text-red-600'}`}>
              Attending Class
            </Text>
          </TouchableOpacity>
        </View>

        {/* Month Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 mt-4" contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {months.map((month, idx) => (
            <TouchableOpacity key={month} onPress={() => setSelectedMonth(idx)}
              className={`px-3 py-2 rounded-full ${selectedMonth === idx ? 'bg-red-600' : 'bg-gray-100'}`}>
              <Text className={`text-xs font-semibold ${selectedMonth === idx ? 'text-white' : 'text-gray-600'}`}>
                {month}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Calendar */}
        <View className="px-2 pb-2">
          <View className="bg-pink-50 rounded-3xl p-6">

            {/* Month Navigation */}
            <View className="flex-row justify-between items-center mb-4">
              <TouchableOpacity onPress={() => navigateMonth('prev')}>
                <Text className="text-2xl text-gray-600 font-semibold">‹</Text>
              </TouchableOpacity>

              <Text className="text-base font-bold text-black">
                {monthsFull[selectedMonth]}, {selectedYear}
              </Text>

              <TouchableOpacity onPress={() => navigateMonth('next')}>
                <Text className="text-2xl text-gray-600 font-semibold">›</Text>
              </TouchableOpacity>
            </View>

            {/* Weekdays */}
            <View className="flex-row mb-2">
              {daysOfWeek.map((day, index) => (
                <View key={index} className="flex-1 items-center py-2">
                  <Text className="text-xs font-bold text-gray-700">{day}</Text>
                </View>
              ))}
            </View>

            {/* Days */}
            <View className="flex-row flex-wrap">
              {generateCalendarDays().map((day, idx) => {
                if (!day) return <View key={idx} className="w-[14.28%] aspect-square" />;

                const hasCourses = hasCoursesOnDate(day);
                const selected = selectedDay === day;
                const holiday = isHoliday(day);

                return (
                  <View key={idx} className="w-[14.28%] aspect-square justify-center items-center">
                    <TouchableOpacity
                      onPress={() => selectDay(day)}
                      className={`w-9 h-9 rounded-full justify-center items-center
                        ${selected ? 'bg-primary-600' : ''}
                        ${holiday && !selected ? 'bg-green-300' : ''}
                        ${hasCourses && !selected && !holiday ? 'bg-yellow-300' : ''}
                      `}
                      activeOpacity={0.7}
                    >
                      <Text className={`${selected ? 'text-white' : 'text-black'} text-sm font-medium`}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Daily Schedule */}
        <View className="px-4 mt-4 mb-20">
          <Text className="text-lg font-bold mb-2">Today's Schedule</Text>

          {isLoadingCourses ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color="#DC2626" />
              <Text className="text-gray-500 mt-2">Loading courses...</Text>
            </View>
          ) : daySchedule.length === 0 ? (
            <Text className="text-gray-500">No classes / events today</Text>
          ) : (
            daySchedule.map((item, index) => (
              <TouchableOpacity
                key={`${item.title}-${index}`}
                onPress={() => {
                  router.push({
                    pathname: "/Home/Subject/subjectdetails",
                    params: {
                      title: item.title,
                      subjectName: item.subjectName,
                      time: item.time,
                      startTime: item.startTime,
                      endTime: item.endTime,
                      location: item.location,
                      day: item.day,
                    }
                  });
                }}
                className="bg-white p-4 mb-3 rounded-xl shadow border-l-4 border-red-500"
              >
                <Text className="font-bold text-base text-black">{item.title}</Text>
                {/* Subject name hidden until OCR properly extracts it */}
                <Text className="text-sm text-gray-600">{item.time}</Text>
                <Text className="text-sm text-gray-600">{item.location}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

      </ScrollView>

    </>
  );
}
