import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Download, Trash2 } from 'lucide-react-native';
import { Course } from '../services/courseService';

interface SchedulePreviewCardProps {
  title: string;
  courses: Course[];
  uploadType: 'student' | 'faculty';
  uploadDate: string;
  isActive: boolean;
  onApplyReminders: () => void;
  onDownload: () => void;
  onDelete?: () => void;
}

const SchedulePreviewCard: React.FC<SchedulePreviewCardProps> = ({
  title,
  courses,
  uploadType,
  uploadDate,
  isActive,
  onApplyReminders,
  onDownload,
  onDelete,
}) => {
  // Create weekly grid structure
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thurs', 'Fri', 'Sat'];
  
  // Map day codes to grid columns (handle various formats)
  const dayCodeToIndex = (dayCode: string): number[] => {
    if (!dayCode) return [];
    
    const code = dayCode.toUpperCase().trim();
    
    // Single day mappings
    const dayMap: { [key: string]: number } = {
      'SUN': 0, 'SUNDAY': 0, 'S': 0,
      'MON': 1, 'MONDAY': 1, 'M': 1,
      'TUE': 2, 'TUESDAY': 2, 'T': 2,
      'WED': 3, 'WEDNESDAY': 3, 'W': 3,
      'THU': 4, 'THURSDAY': 4, 'TH': 4, 'R': 4,
      'FRI': 5, 'FRIDAY': 5, 'F': 5,
      'SAT': 6, 'SATURDAY': 6,
    };

    // Multi-day patterns
    if (code === 'MTH' || code === 'MWTH' || code === 'MTWHF') return [1, 2, 3, 4, 5];
    if (code === 'MWF') return [1, 3, 5];
    if (code === 'MW') return [1, 3];
    if (code === 'TTH' || code === 'TR') return [2, 4];
    if (code === 'MTWTHF' || code === 'MTWTF') return [1, 2, 3, 4, 5];
    
    return dayMap[code] !== undefined ? [dayMap[code]] : [];
  };

  // Group courses by day
  const getCoursesForDay = (dayIndex: number) => {
    return courses.filter(course => {
      const courseDays = dayCodeToIndex(course.day);
      return courseDays.includes(dayIndex);
    });
  };

  // Create simple time-based rows (limit to 4 for preview)
  const getPreviewRows = () => {
    // Get unique courses with valid data
    const validCourses = courses.filter(c => c.start_time || c.subject_code);
    
    // If no valid courses, show empty rows
    if (validCourses.length === 0) {
      return [null, null, null, null];
    }
    
    // Group by time slot and take first 4
    const timeGroups = new Map<string, Course[]>();
    validCourses.forEach(course => {
      const key = course.start_time || 'unknown';
      if (!timeGroups.has(key)) {
        timeGroups.set(key, []);
      }
      timeGroups.get(key)!.push(course);
    });
    
    const rows = Array.from(timeGroups.keys()).slice(0, 4);
    // Pad to 4 rows if needed
    while (rows.length < 4) {
      rows.push(null as any);
    }
    return rows;
  };

  const previewRows = getPreviewRows();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <View className={`bg-white rounded-lg border mb-4 p-4 mx-2 ${isActive ? 'border-green-500 border-2' : 'border-gray-300'}`}>
      {/* Active badge */}
      {isActive && (
        <View className="absolute -top-2 -right-2 bg-green-500 px-2 py-1 rounded-full z-10">
          <Text className="text-white text-xs font-bold">ACTIVE</Text>
        </View>
      )}
      
      {/* Header */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-red-500 capitalize">
            {uploadType}
          </Text>
          <Text className="text-sm text-gray-600 mt-1">{title}</Text>
          <Text className="text-xs text-gray-400">{formatDate(uploadDate)}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={onDownload}>
            <Download size={26} color="#990100" />
          </TouchableOpacity>
          {onDelete && (
            <TouchableOpacity onPress={onDelete}>
              <Trash2 size={24} color="#dc2626" />
            </TouchableOpacity>
          )}
        </View>
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
        {previewRows.map((timeKey, rowIdx) => (
          <View key={rowIdx} className="flex-row border-b border-gray-200">
            {daysOfWeek.map((_, dayIdx) => {
              const dayCourses = timeKey 
                ? getCoursesForDay(dayIdx).filter(c => (c.start_time || 'unknown') === timeKey)
                : [];
              
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

        {/* Show total courses count */}
        {courses.length > 0 && (
          <View className="p-2 bg-gray-50">
            <Text className="text-xs text-gray-500 text-center">
              {courses.length} course{courses.length !== 1 ? 's' : ''} total
            </Text>
          </View>
        )}
      </View>

      {/* Apply Reminders Button */}
      <View className="flex-row justify-end">
        {isActive ? (
          <View className="bg-green-600 px-6 py-2 rounded-full">
            <Text className="font-semibold text-white text-sm">Currently Active</Text>
          </View>
        ) : (
          <TouchableOpacity 
            className="bg-primary-800 px-6 py-2 rounded-full"
            onPress={onApplyReminders}
          >
            <Text className="font-semibold text-white text-sm">Apply Reminders</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default SchedulePreviewCard;
