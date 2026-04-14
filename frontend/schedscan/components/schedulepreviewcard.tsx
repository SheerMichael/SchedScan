import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Download, Trash2, Users, GraduationCap, Merge } from 'lucide-react-native';
import { Course } from '../services/courseService';
import { dayCodeToWeekdayNumbers } from '../utils/dayCode';

interface SchedulePreviewCardProps {
  title: string;
  courses: Course[];
  uploadType: 'student' | 'faculty' | 'merged';
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
  // Get color based on upload type or course source type
  const getTypeColor = (type: string) => {
    if (type === 'faculty') return '#f97316'; // orange
    if (type === 'merged') return '#7c3aed';  // purple
    return '#dc2626'; // red for student
  };

  const getTypeIcon = () => {
    if (uploadType === 'faculty') return <Users size={24} color="#f97316" />;
    if (uploadType === 'merged') return <Merge size={24} color="#7c3aed" />;
    return <GraduationCap size={24} color="#dc2626" />;
  };

  // Create weekly grid structure
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Group courses by day
  const getCoursesForDay = (dayIndex: number) => {
    return courses.filter(course => {
      const courseDays = dayCodeToWeekdayNumbers(course.day);
      return courseDays.includes(dayIndex);
    });
  };

  const unscheduledCourses = courses.filter((course) => {
    if (!course.day || course.day.trim() === '') {
      return true;
    }
    return false;
  });

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
          <View className="flex-row items-center">
            {getTypeIcon()}
            <Text 
              className="text-2xl font-bold capitalize ml-2"
              style={{ color: getTypeColor(uploadType) }}
            >
              {uploadType}
            </Text>
          </View>
          <Text className="text-sm text-gray-600 mt-1">{title}</Text>
          <Text className="text-xs text-gray-400">{formatDate(uploadDate)}</Text>
          {/* Show course breakdown for merged schedules */}
          {uploadType === 'merged' && (
            <View className="flex-row mt-2 gap-3">
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-orange-500 mr-1" />
                <Text className="text-xs text-gray-500">
                  {courses.filter(c => c.source_type === 'faculty').length} faculty
                </Text>
              </View>
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-red-500 mr-1" />
                <Text className="text-xs text-gray-500">
                  {courses.filter(c => c.source_type === 'student').length} student
                </Text>
              </View>
            </View>
          )}
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
              
              // Determine cell background based on course source type
              const getCellBgColor = () => {
                if (dayCourses.length === 0) return 'bg-white';
                if (uploadType === 'merged') {
                  // For merged, check source type
                  const hasF = dayCourses.some(c => c.source_type === 'faculty');
                  const hasS = dayCourses.some(c => c.source_type === 'student');
                  if (hasF && hasS) return 'bg-purple-100'; // both
                  if (hasF) return 'bg-orange-100';
                  return 'bg-red-100';
                }
                return uploadType === 'faculty' ? 'bg-orange-100' : 'bg-red-100';
              };

              const getTextColor = () => {
                if (uploadType === 'merged') {
                  return dayCourses[0]?.source_type === 'faculty' ? 'text-orange-900' : 'text-red-900';
                }
                return uploadType === 'faculty' ? 'text-orange-900' : 'text-red-900';
              };
              
              return (
                <View 
                  key={dayIdx} 
                  className={`flex-1 p-1 border-r border-gray-200 min-h-[50px] ${getCellBgColor()}`}
                >
                  {dayCourses.map((course, idx) => (
                    <View key={idx}>
                      <Text className={`text-[8px] font-semibold ${getTextColor()}`} numberOfLines={1}>
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

        {/* Unscheduled courses (no day assigned) */}
        {unscheduledCourses.length > 0 && (
          <View className="bg-amber-50 p-3 rounded-b-lg border-t border-amber-200">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-semibold text-amber-800">No Day Assigned</Text>
            </View>
            {unscheduledCourses.map((course, idx) => (
              <View
                key={`${course.subject_code}-${course.start_time}-${course.end_time}-${idx}`}
                className="flex-row items-center justify-between py-2 px-2 rounded-lg mb-1"
              >
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-amber-800">{course.subject_code}</Text>
                  <Text className="text-[10px] text-amber-600">
                    {course.start_time} - {course.end_time}
                    {course.location ? ` • ${course.location}` : ''}
                  </Text>
                </View>
              </View>
            ))}
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
