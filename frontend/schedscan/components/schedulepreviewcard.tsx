import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Download } from 'lucide-react-native';
import { Course } from '../services/courseService';

interface SchedulePreviewCardProps {
  title: string;
  courses: Course[];
  uploadType: 'student' | 'faculty';
  uploadDate: string;
  onApplyReminders: () => void;
  onDownload: () => void;
}

const SchedulePreviewCard: React.FC<SchedulePreviewCardProps> = ({
  title,
  courses,
  uploadType,
  uploadDate,
  onApplyReminders,
  onDownload,
}) => {
  // Create weekly grid structure
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thurs', 'Fri', 'Sat'];
  
  // Map day codes to grid columns
  const dayCodeToIndex = (dayCode: string): number[] => {
    const dayMap: { [key: string]: number } = {
      'SUN': 0, 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6,
    };

    if (dayCode === 'MTH') return [1, 2, 3, 4];
    if (dayCode === 'MW') return [1, 3];
    if (dayCode === 'TTH') return [2, 4];
    
    return dayMap[dayCode] !== undefined ? [dayMap[dayCode]] : [];
  };

  // Group courses by time slots for display
  const getCoursesForDay = (dayIndex: number) => {
    return courses.filter(course => {
      const courseDays = dayCodeToIndex(course.day);
      return courseDays.includes(dayIndex);
    });
  };

  // Find unique time slots
  const timeSlots = Array.from(
    new Set(courses.map(c => `${c.start_time}-${c.end_time}`))
  ).slice(0, 4); // Limit to 4 rows for preview

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <View className="bg-white rounded-lg border border-gray-300 mb-4 p-4 mx-2">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-red-500 capitalize">
            {uploadType}
          </Text>
          <Text className="text-sm text-gray-600 mt-1">{title}</Text>
          <Text className="text-xs text-gray-400">{formatDate(uploadDate)}</Text>
        </View>
        <TouchableOpacity onPress={onDownload}>
          <Download size={28} color="#990100" />
        </TouchableOpacity>
      </View>

      {/* Calendar Grid Preview */}
      <View className="bg-white rounded-lg overflow-hidden mb-3">
        {/* Day headers */}
        <View className="flex-row bg-gray-100 border-b border-gray-300">
          {daysOfWeek.map((day, idx) => (
            <View key={idx} className="flex-1 p-1 border-r border-gray-200">
              <Text className="text-center text-xs font-semibold text-gray-700">
                {day}
              </Text>
            </View>
          ))}
        </View>

        {/* Course grid - 4 rows max for preview */}
        {timeSlots.map((timeSlot, rowIdx) => (
          <View key={rowIdx} className="flex-row border-b border-gray-200">
            {daysOfWeek.map((_, dayIdx) => {
              const dayCourses = getCoursesForDay(dayIdx).filter(
                c => `${c.start_time}-${c.end_time}` === timeSlot
              );
              
              return (
                <View 
                  key={dayIdx} 
                  className={`flex-1 p-1 border-r border-gray-200 min-h-[50px] ${
                    dayCourses.length > 0 ? 'bg-red-100' : 'bg-white'
                  }`}
                >
                  {dayCourses.map((course, idx) => (
                    <View key={idx}>
                      <Text className="text-[8px] font-semibold text-red-900" numberOfLines={1}>
                        {course.subject_code}
                      </Text>
                      <Text className="text-[7px] text-gray-600" numberOfLines={1}>
                        {course.start_time}
                      </Text>
                      <Text className="text-[7px] text-gray-600" numberOfLines={1}>
                        {course.location}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ))}

        {/* Show total courses if more than what's displayed */}
        {courses.length > timeSlots.length * 7 && (
          <View className="p-2 bg-gray-50">
            <Text className="text-xs text-gray-500 text-center">
              + {courses.length - (timeSlots.length * 7)} more courses
            </Text>
          </View>
        )}
      </View>

      {/* Apply Reminders Button */}
      <View className="flex-row justify-end">
        <TouchableOpacity 
          className="bg-primary-800 px-6 py-2 rounded-full"
          onPress={onApplyReminders}
        >
          <Text className="font-semibold text-white text-sm">Apply Reminders</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SchedulePreviewCard;
