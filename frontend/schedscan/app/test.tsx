import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, G, Rect, Polygon } from "react-native-svg";
import { router } from "expo-router";

export default function SchedScanApp() {
  const startYear = 2025;
  const endYear = 2050;
  const now = new Date();

  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'teaching' | 'attending'>('all');

  type ScheduleItem = {
    title: string;
    time: string;
    location: string;
    priority_level: string;
  };
  
  type WeeklySchedule = {
    [key: number]: ScheduleItem[];
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

const Home = ({ size = 24, color = '#CB2222' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF" stroke={color} strokeWidth="2">
    <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  </Svg>
);

const Scan = ({ size = 24, color = '#4D4D4D' }) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="#FFFFFF" stroke="#000000" strokeWidth="2">
    <Path d="M0.5 5V2.5C0.5 1.39543 1.39543 0.5 2.5 0.5H5M10 0.5H12.5C13.6046 0.5 14.5 1.39543 14.5 2.5V5M0.5 10V12.5C0.5 13.6046 1.39543 14.5 2.5 14.5H5M14.5 10V12.5C14.5 13.6046 13.6046 14.5 12.5 14.5H10M2 7.5H13"/>
  </Svg>
);

const Reminders = ({ size = 24, color = '#4D4D4D' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF" stroke={color} strokeWidth="2">
    <Path d="M12 2a10 10 0 1 0 10 10H12V2zM21.18 8.02c-1-2.3-2.85-4.17-5.16-5.18"/>
  </Svg>
);

const Schedules = ({ size = 32, color = '#4D4D4D' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#000000">
    <Path
      d="M9 2a1 1 0 0 1 1 1v1h4V3a1 1 0 1 1 2 0v1h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V3a1 1 0 0 1 1-1zM8 6H5v3h14V6h-3v1a1 1 0 1 1-2 0V6h-4v1a1 1 0 0 1-2 0V6zm11 5H5v8h14v-8z"/>
  </Svg>
);

const Account = ({ size = 24, color = '#4D4D4D' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF" stroke={color} strokeWidth="2">
    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <Circle cx={12} cy={7} r={4}></Circle>
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

  const weeklySchedule: WeeklySchedule = {
    1: [
      { title: "Operating System", time: "8:00 AM - 10:00 AM", location: "LR1", priority_level: "High Priority" },
      { title: "Christmas", time: "10:30 AM - 12:00 PM", location: "", priority_level: "" }
    ],
    2: [
      { title: "Database Systems", time: "8:00 AM - 10:00 AM", location: "LR1", priority_level: "High Priority" }
    ],
    3: [
      { title: "Operating System", time: "8:00 AM - 10:00 AM", location: "LR1", priority_level: "High Priority" }
    ],
    5: [
      { title: "Operating System", time: "8:00 AM - 10:00 AM", location: "LR1", priority_level: "High Priority" }
    ]
  };

  // ✅ One-time Holidays / Events
  const holidaySchedule: { [key: string]: ScheduleItem[] } = {
    "2025-12-25": [
      { title: "Christmas Day", time: "-", location: "", priority_level: "Holiday" }
    ],
    "2025-02-14": [
      { title: "Valentine's Day", time: "-", location: "", priority_level: "Holiday" }
    ]
  };

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

  // ✅ UPDATED — Merge weekly & holiday
  const selectDay = (day:number) => {
    setSelectedDay(day);

    const weekday = new Date(selectedYear, selectedMonth, day).getDay();
    const weekly = weeklySchedule[weekday] ?? [];

    const dateKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const holiday = holidaySchedule[dateKey] ?? [];

    const schedule = [...holiday, ...weekly];
    setDaySchedule(schedule);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="w-full h-14 bg-white border-b-2 border-gray-200 shadow-[0_4px_8px_rgba(0,0,0,0.15)] justify-between items-left flex-row">
        <View className='ml-8 flex-row justify-center items-center'>
          <Image source={require('../assets/images/logo.png')} className='w-12 h-12'/>
          <View className='flex-col justify-center items-left'>
            <Text className="text-xl font-bold text-primary-900/50 leading-none">Sched</Text>
            <Text className="text-xl font-bold text-primary-900 leading-none">Scan</Text>
          </View>
        </View>
        <View className='flex-row justify-center items-center mr-4'>
        <StarBadge value={5} />
        <TouchableOpacity
          onPress={() => router.push('/intro/login')}>
          <Bell size={24} color="#4D4D4D"/>
        </TouchableOpacity>
        </View>
      </View>

        {/* Banner */}
      <ScrollView className="flex-1">
        <View className="bg-red-600 m-4 p-6 rounded-2xl">
          <Text className="text-3xl font-bold text-white mb-1">Hi, Jane!</Text>
          <Text className="text-base text-red-200">Ready to organize?</Text>
        </View>
        
        <View className="flex-row justify-between px-4 mt-2">
          {/* Classes Today */}
          <View className="flex-1 bg-white rounded-xl p-4 items-center border border-red-200 mx-1">
            <Classes_Today size={24}/>
            <Text className="text-3xl font-bold text-primary-600">0</Text>
            <Text className="text-sm text-gray-500">Classes Today</Text>
          </View>

          {/* Teaching */}
          <View className="flex-1 bg-white rounded-xl p-4 items-center border border-red-200 mx-1">
            <Teaching size={24}/>
            <Text className="text-3xl font-bold text-primary-600">0</Text>
            <Text className="text-sm text-gray-500">Teaching</Text>
          </View>

          {/* Attending */}
          <View className="flex-1 bg-white rounded-xl p-4 items-center border border-red-200 mx-1">
            <Attending size={24}/>
            <Text className="text-3xl font-bold text-primary-600">0</Text>
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

        {/* Year Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 mt-4" contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {years.map(year => (
            <TouchableOpacity key={year} onPress={() => setSelectedYear(year)}
              className={`px-4 py-2.5 rounded-full ${selectedYear === year ? 'bg-red-600' : 'bg-gray-100'}`}>
              <Text className={`text-sm font-semibold ${selectedYear === year ? 'text-white' : 'text-gray-600'}`}>
                {year}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Month Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
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

                const recurring = weeklySchedule[new Date(selectedYear, selectedMonth, day).getDay()] !== undefined;
                const selected = selectedDay === day;
                const holiday = isHoliday(day);

                return (
                  <View key={idx} className="w-[14.28%] aspect-square justify-center items-center">
                    <TouchableOpacity
                      onPress={() => selectDay(day)}
                      className={`w-9 h-9 rounded-full justify-center items-center
                        ${selected ? 'bg-primary-600' : ''}
                        ${holiday && !selected ? 'bg-green-300' : ''}
                        ${recurring && !selected ? 'bg-yellow-300' : ''}
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

          {daySchedule.length === 0 ? (
            <Text className="text-gray-500">No classes / events today</Text>
          ) : (
            daySchedule.map((item, index) => (
            <View
              key={index}
              className={` bg-white p-4 mb-3 rounded-xl shadow border-l-4 ${item.priority_level === "Holiday" ? "border-green-600" : "border-red-500"}`}
            >
              <Text className="font-bold text-base text-black">{item.title}</Text>
              <Text className="text-sm text-gray-600">{item.time}</Text>
              <Text className="text-sm text-gray-600">{item.location}</Text>
              <Text className="text-sm text-gray-600">{item.priority_level}</Text>
            </View>
            ))
          )}
        </View>

      </ScrollView>

      <View className="w-full h-16 bg-white border-t-2 border-gray-200 justify-evenly items-center flex-row">
        <View className='flex-col justify-center items-center'>
          <Home size={24}/>
          <Text className='text-primary-600 text-sm'>Home</Text>
        </View>
        <View className='flex-col justify-center items-center'>
          <Reminders size={24}/>
          <Text className='text-gray-500 text-sm'>Reminders</Text>
        </View>
        <TouchableOpacity className="w-20 h-20 rounded-full flex-col border border-gray-500 bg-white -mt-8 justify-center items-center">
          <Scan size={40}/>
        </TouchableOpacity>
        <View className='flex-col justify-center items-center'>
          <Schedules size={24}/>
          <Text className='text-gray-500 text-sm'>Schedules</Text>
        </View>
        <View className='flex-col justify-center items-center'>
          <Account size={24}/>
          <Text className='text-gray-500 text-sm'>Account</Text>
        </View>
      </View>

    </SafeAreaView>
  );
}
