import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Keyboard, TextInput as RNTextInput, Alert, Modal } from 'react-native';
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Path } from 'react-native-svg';
import DropDownPicker from "react-native-dropdown-picker";
import { History, Clock } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { scheduleStorageService } from '../../../services/scheduleStorageService';

const EditRemindersScreen = () => {

    const { user } = useAuth();
    const Z = {
        highest: 4000,
        high: 3000,
        mid: 2000,
        low: 1000,
    };

    const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <Path d="M19 12H6M12 5l-7 7 7 7" />
        </Svg>
    );

    const { id, subject, start_time, end_time, day, location } = useLocalSearchParams();

    const [subjectValue, setSubjectValue] = useState(String(subject || ""));
    const [locationValue, setLocationValue] = useState(String(location || ""));
    const startTimeString = Array.isArray(start_time) ? start_time[0] : start_time;
    const endTimeString = Array.isArray(end_time) ? end_time[0] : end_time;

    // Parse time string into components (e.g., "1:30 PM" -> { hour: 1, minute: 30, period: 'PM' })
    const parseTimeString = (timeStr: string | null): { hour: number; minute: number; period: 'AM' | 'PM' } => {
        if (!timeStr) return { hour: 12, minute: 0, period: 'AM' };
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (match) {
            return {
                hour: parseInt(match[1], 10),
                minute: parseInt(match[2], 10),
                period: match[3].toUpperCase() as 'AM' | 'PM'
            };
        }
        return { hour: 12, minute: 0, period: 'AM' };
    };

    // Format time components to string
    const formatTime = (hour: number, minute: number, period: 'AM' | 'PM'): string => {
        return `${hour}:${minute.toString().padStart(2, '0')} ${period}`;
    };

    const [keyboardfocused, setKeyboardFocused] = useState(false);
    const inputRef = useRef<RNTextInput>(null);

    // Time picker modal states
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);
    
    const [starttimeValue, setStarttimeValue] = useState<string | null>(startTimeString || null);
    const [endtimeValue, setEndtimeValue] = useState<string | null>(endTimeString || null);
    
    // Temp states for time picker selection
    const [tempHour, setTempHour] = useState(12);
    const [tempMinute, setTempMinute] = useState(0);
    const [tempPeriod, setTempPeriod] = useState<'AM' | 'PM'>('AM');


    // Helper to normalize day values - converts full names to codes
    const normalizeDayCode = (dayValue: string | undefined | null): string | null => {
        if (!dayValue) return null;
        const dayStr = String(dayValue).trim().toUpperCase();
        const dayMapping: Record<string, string> = {
            'M': 'M',
            'T': 'T',
            'W': 'W',
            'TH': 'TH',
            'F': 'F',
            'S': 'S',
            'MONDAY': 'M',
            'TUESDAY': 'T',
            'WEDNESDAY': 'W',
            'THURSDAY': 'TH',
            'FRIDAY': 'F',
            'SATURDAY': 'S',
        };
        return dayMapping[dayStr] || null;
    };

    // Day dropdown state
    const [dayOpen, setDayOpen] = useState(false);
    const [dayDropdownValue, setDayDropdownValue] = useState<string | null>(normalizeDayCode(day as string));
    const [dayItems, setDayItems] = useState([
        { label: "Monday", value: "M" },
        { label: "Tuesday", value: "T" },
        { label: "Wednesday", value: "W" },
        { label: "Thursday", value: "TH" },
        { label: "Friday", value: "F" },
        { label: "Saturday", value: "S" },
    ]);

    const [openNotification, setOpenNotification] = useState(false);
    const [NotificationValue, setNotificationValue] = useState("15 minutes before");
    const [NotificationItems, setNotificationItems] = useState([
        { label: "5 minutes before", value: "5 minutes" },
        { label: "15 minutes before", value: "10 minutes" },
        { label: "30 minutes before", value: "30 minutes" }, /* maybe change to seconds if used for backend and no storing into database yet */
        { label: "1 hour before", value: "1 hour" },
    ]);

    const [openPriority, setOpenPriority] = useState(false);
    const [PriorityValue, setPriorityValue] = useState("No Priority");
    const [PriorityItems, setPriorityItems] = useState([
        { label: "High Priority", value: "High Priority" },
        { label: "Medium Priority", value: "Medium Priority" },
        { label: "Low before", value: "Priority minutes" }, /* basta priority to and no storing into database yet */
    ]);

    // Open start time picker
    const openStartTimePicker = () => {
        const parsed = parseTimeString(starttimeValue);
        setTempHour(parsed.hour);
        setTempMinute(parsed.minute);
        setTempPeriod(parsed.period);
        setShowStartTimePicker(true);
    };

    // Open end time picker
    const openEndTimePicker = () => {
        const parsed = parseTimeString(endtimeValue);
        setTempHour(parsed.hour);
        setTempMinute(parsed.minute);
        setTempPeriod(parsed.period);
        setShowEndTimePicker(true);
    };

    // Confirm start time selection
    const confirmStartTime = () => {
        setStarttimeValue(formatTime(tempHour, tempMinute, tempPeriod));
        setShowStartTimePicker(false);
    };

    // Confirm end time selection
    const confirmEndTime = () => {
        setEndtimeValue(formatTime(tempHour, tempMinute, tempPeriod));
        setShowEndTimePicker(false);
    };

    // Helper function to convert time string to minutes for comparison
    // Handles formats: "2:00 PM", "02:00PM", "2:00PM", "02:00 PM"
    const timeToMinutes = (timeStr: string): number => {
        if (!timeStr) return 0;
        
        // Use regex to handle both "2:00 PM" and "02:00PM" formats
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return 0;
        
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const period = match[3].toUpperCase();
        
        // Convert to 24-hour format
        if (period === 'PM' && hours !== 12) {
            hours += 12;
        } else if (period === 'AM' && hours === 12) {
            hours = 0;
        }
        
        return hours * 60 + minutes;
    };

    // Check if two time ranges overlap
    const timesOverlap = (start1: string, end1: string, start2: string, end2: string): boolean => {
        const start1Min = timeToMinutes(start1);
        const end1Min = timeToMinutes(end1);
        const start2Min = timeToMinutes(start2);
        const end2Min = timeToMinutes(end2);
        
        // Check if ranges overlap
        return start1Min < end2Min && end1Min > start2Min;
    };

    // Expand day code to array of individual day codes
    // Handles both short codes (M, T, MW) and full names (Monday, Tuesday)
    const expandDayCode = (dayCode: string): string[] => {
        if (!dayCode) return [];
        const code = dayCode.toUpperCase().trim();
        
        // Map full day names to short codes
        const fullNameMap: { [key: string]: string } = {
            'MONDAY': 'M',
            'TUESDAY': 'T',
            'WEDNESDAY': 'W',
            'THURSDAY': 'TH',
            'FRIDAY': 'F',
            'SATURDAY': 'S',
            'SUNDAY': 'SUN',
        };
        
        // If it's a full day name, convert to short code
        if (fullNameMap[code]) {
            return [fullNameMap[code]];
        }
        
        // Multi-day mappings
        const multiDayMap: { [key: string]: string[] } = {
            'MTH': ['M', 'TH'],
            'TF': ['T', 'F'],
            'MW': ['M', 'W'],
            'TTH': ['T', 'TH'],
            'MWF': ['M', 'W', 'F'],
            'MTWTH': ['M', 'T', 'W', 'TH'],
            'MTWTHF': ['M', 'T', 'W', 'TH', 'F'],
        };
        
        if (multiDayMap[code]) {
            return multiDayMap[code];
        }
        
        // Single day code - return as array
        return [code];
    };

    // Check if two day codes share any common day
    const daysOverlap = (day1: string, day2: string): boolean => {
        const days1 = expandDayCode(day1);
        const days2 = expandDayCode(day2);
        
        return days1.some(d1 => days2.includes(d1));
    };

    // Get overlapping days between two day codes (for error message)
    const getOverlappingDays = (day1: string, day2: string): string[] => {
        const days1 = expandDayCode(day1);
        const days2 = expandDayCode(day2);
        
        const dayNames: { [key: string]: string } = {
            'M': 'Monday',
            'T': 'Tuesday',
            'W': 'Wednesday',
            'TH': 'Thursday',
            'F': 'Friday',
            'S': 'Saturday',
            'SUN': 'Sunday',
        };
        
        return days1
            .filter(d => days2.includes(d))
            .map(d => dayNames[d] || d);
    };

    const handleCancel = () => {
        router.back();
    };

    const handleSave = async () => {
        if (!user?.id) {
            Alert.alert('Error', 'User not authenticated');
            return;
        }

        if (!starttimeValue || !endtimeValue || !dayDropdownValue || !subjectValue) {
            Alert.alert('Error', 'Please fill in all required fields');
            return;
        }

        // Validate that start time is before end time
        if (timeToMinutes(starttimeValue) >= timeToMinutes(endtimeValue)) {
            Alert.alert('Invalid Time', 'Start time must be before end time');
            return;
        }

        try {
            // Get the active schedule
            const activeSchedule = await scheduleStorageService.getActiveSchedule(user.id);
            
            if (!activeSchedule) {
                Alert.alert('Error', 'No active schedule found');
                return;
            }

            // Check for conflicts with other courses on overlapping days (excluding the current course being edited)
            const conflictingCourse = activeSchedule.courses.find(course => {
                // Skip the course being edited
                if (course.id === Number(id)) {
                    return false;
                }
                
                // Check if days overlap (handles multi-day codes like MW, TTH, etc.)
                if (!daysOverlap(course.day, dayDropdownValue)) {
                    return false;
                }
                
                // Check if times overlap
                return timesOverlap(
                    starttimeValue,
                    endtimeValue,
                    course.start_time,
                    course.end_time
                );
            });

            if (conflictingCourse) {
                const overlappingDays = getOverlappingDays(conflictingCourse.day, dayDropdownValue);
                const dayText = overlappingDays.length > 1 
                    ? `on ${overlappingDays.join(' and ')}`
                    : `on ${overlappingDays[0]}`;
                    
                Alert.alert(
                    'Schedule Conflict',
                    `This time slot conflicts with "${conflictingCourse.subject_code}" (${conflictingCourse.start_time} - ${conflictingCourse.end_time}) ${dayText}.`,
                    [{ text: 'OK' }]
                );
                return;
            }

            // Update the course in the active schedule
            const updatedCourses = activeSchedule.courses.map(course => {
                if (course.id === Number(id)) {
                    return {
                        ...course,
                        subject_code: subjectValue,
                        start_time: starttimeValue,
                        end_time: endtimeValue,
                        day: dayDropdownValue,
                        location: locationValue,
                    };
                }
                return course;
            });

            // Update the schedule with new courses
            await scheduleStorageService.updateSchedule(
                activeSchedule.id,
                activeSchedule.uploadType,
                user.id,
                { courses: updatedCourses }
            );

            Alert.alert('Success', 'Schedule updated successfully', [
                { text: 'OK', onPress: () => router.back() }
            ]);
        } catch (error) {
            console.error('Error saving schedule:', error);
            Alert.alert('Error', 'Failed to save changes. Please try again.');
        }
    };


    return (
        <>
            <View className="w-full h-14 bg-white border-b-2 border-b-gray-200 justify-between items-center flex-row">
                <View className='pl-8 flex-row justify-center items-center'>
                    <TouchableOpacity onPress={() => router.back()}>
                        <LeftPointingArrow size={30} color="#000000" />
                    </TouchableOpacity>
                </View>
                <View className='flex-row justify-center items-center mr-4 '>
                    <Text className='font-bold text-2xl'>Edit Reminders</Text>
                </View>
                <View></View>
            </View>

            
            <ScrollView
            className="flex"
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">

                {/* Day Dropdown */}
                <View className='mb-4' style={{ zIndex: dayOpen ? Z.highest : Z.high, position: "relative" }}>
                    <Text className="mb-1 font-semibold text-gray-500">Day</Text>
                    <DropDownPicker
                        open={dayOpen}
                        value={dayDropdownValue}
                        items={dayItems}
                        setOpen={setDayOpen}
                        setValue={setDayDropdownValue}
                        setItems={setDayItems}
                        placeholder="Select day"
                        listMode="SCROLLVIEW"
                        onOpen={() => {
                            if (keyboardfocused) {
                                inputRef.current?.blur();
                                Keyboard.dismiss();
                                setKeyboardFocused(false);
                            }
                            setOpenNotification(false);
                            setOpenPriority(false);
                        }}
                        style={{
                            backgroundColor: "rgba(229, 231, 235)",
                            borderColor: "transparent",
                            borderRadius: 12,
                            paddingVertical: 12,
                        }}
                        dropDownContainerStyle={{
                            backgroundColor: "rgba(229, 231, 235)",
                            borderColor: "transparent",
                            borderRadius: 12,
                        }}
                        textStyle={{
                            fontSize: 15,
                            fontWeight: "500",
                            color: "#000",
                            paddingLeft: 6,
                        }}
                        labelStyle={{
                            color: "#000",
                            fontWeight: "500",
                            fontSize: 15,
                            paddingLeft: 6,
                        }}
                    />
                </View>

                <View className="mb-4">
                    <Text className="mb-1 font-semibold text-gray-500">Class Title</Text>
                    <TextInput
                        ref={inputRef}
                        value={subjectValue}
                        onChangeText={setSubjectValue}
                        placeholder="Enter subject"
                        className="border border-gray-300 p-4 rounded-2xl bg-slate-200/65 pl-6 font-semibold"
                        onFocus={() => {
                            setKeyboardFocused(true);
                            setDayOpen(false);
                            setOpenNotification(false);
                            setOpenPriority(false);
                        }}
                        onBlur={() => setKeyboardFocused(false)}
                    />
                </View>
                
                <View className='mb-4'>
                    <Text className="mb-1 font-semibold text-gray-500">Description</Text>
                    <TextInput
                        placeholder='Add Description'
                        placeholderTextColor="#9CA3AF"
                        className='border border-gray-300 p-4 rounded-2xl bg-slate-200/65 pl-6 font-semibold h-40 text-start'
                        multiline={true}
                        textAlignVertical="top"
                        numberOfLines={4} 
                    />
                </View>
            
                <View>
                    <Text className="mb-1 font-semibold text-gray-500">Time: </Text>
                    <View className='flex-1 flex-row items-center mb-4'>
                        {/* Start Time Button */}
                        <TouchableOpacity 
                            onPress={openStartTimePicker}
                            className="bg-gray-200 rounded-xl px-4 py-3 flex-row items-center"
                            style={{ minWidth: 130 }}
                        >
                            <Clock size={20} color="#BF1D1B" />
                            <Text className="ml-2 font-medium text-black">
                                {starttimeValue || 'Select start time'}
                            </Text>
                        </TouchableOpacity>
                        
                        <Text className='text-3xl font-semibold text-gray-500'> - </Text>
                        
                        {/* End Time Button */}
                        <TouchableOpacity 
                            onPress={openEndTimePicker}
                            className="bg-gray-200 rounded-xl px-4 py-3 flex-row items-center"
                            style={{ minWidth: 130 }}
                        >
                            <Clock size={20} color="#BF1D1B" />
                            <Text className="ml-2 font-medium text-black">
                                {endtimeValue || 'Select end time'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View className="mb-4">
                    <Text className="mb-1 font-semibold text-gray-500">Location</Text>
                    <TextInput
                        value={locationValue}
                        onChangeText={setLocationValue}
                        placeholder="Enter location"
                        className="border border-gray-300 p-4 rounded-2xl bg-slate-200/65 pl-6 font-semibold"
                        onFocus={() => {
                            setKeyboardFocused(true);
                            setDayOpen(false);
                            setOpenNotification(false);
                            setOpenPriority(false);
                        }}
                        onBlur={() => setKeyboardFocused(false)}
                    />
                </View> 
                
                <View className='mb-4' style={{ zIndex: openNotification ? Z.highest : Z.low,  position: "relative" }}>
                    <Text className="mb-1 font-semibold text-gray-500">Notification</Text>
                    <DropDownPicker
                        open={openNotification}
                        value={NotificationValue}
                        items={NotificationItems}
                        setOpen={setOpenNotification}
                        setValue={setNotificationValue}
                        setItems={setNotificationItems}
                        placeholder="Select notification time"
                        listMode="SCROLLVIEW"
                        onOpen={() => {
                        // Dismiss keyboard when dropdown opens
                        if (keyboardfocused) { 
                            inputRef.current?.blur();
                            Keyboard.dismiss();
                            setKeyboardFocused(false);
                        }
                        setDayOpen(false);
                        setOpenPriority(false);
                        }}
                        onClose={() => {
                            // Optional: handle close
                        }}
                        style={{
                            backgroundColor: "rgba(229, 231, 235)",
                            borderColor: "transparent",
                            borderRadius: 12,
                            paddingVertical: 12,
                        }}
                        dropDownContainerStyle={{
                            backgroundColor: "rgba(229, 231, 235)",
                            borderColor: "transparent",
                            borderRadius: 12,
                        }}
                        textStyle={{
                            fontSize: 15,
                            fontWeight: "500",
                            color: "#000",
                            paddingLeft: 6,
                        }}
                        labelStyle={{
                            color: "#000",
                            fontWeight: "500",
                            fontSize: 15,
                            paddingLeft: 6,
                        }}
                        dropDownDirection='TOP'
                    />
                </View>

                <View className='mb-4' style={{ zIndex: openPriority ? Z.highest : Z.low,  position: "relative" }}>
                    <Text className="mb-1 font-semibold text-gray-500">Priority Level</Text>
                    <DropDownPicker
                        open={openPriority}
                        value={PriorityValue}
                        items={PriorityItems}
                        setOpen={setOpenPriority}
                        setValue={setPriorityValue}
                        setItems={setPriorityItems}
                        placeholder="Select Priority Level"
                        listMode="SCROLLVIEW"
                        onOpen={() => {
                        // Dismiss keyboard when dropdown opens
                        if (keyboardfocused) {
                            Keyboard.dismiss();
                            setKeyboardFocused(false);
                            inputRef.current?.blur();  
                        }
                        setDayOpen(false);
                        setOpenNotification(false);
                        }}
                        onClose={() => {
                            // Optional: handle close
                        }}
                        style={{
                            backgroundColor: "rgba(229, 231, 235)",
                            borderColor: "transparent",
                            borderRadius: 12,
                            paddingVertical: 12,
                        }}
                        dropDownContainerStyle={{
                            backgroundColor: "rgba(229, 231, 235)",
                            borderColor: "transparent",
                            borderRadius: 12,
                        }}
                        textStyle={{
                            fontSize: 15,
                            fontWeight: "500",
                            color: "#000",
                            paddingLeft: 6,
                        }}
                        labelStyle={{
                            color: "#000",
                            fontWeight: "500",
                            fontSize: 15,
                            paddingLeft: 6,
                        }}
                        dropDownDirection='TOP'
                    />
                </View>
            </ScrollView>

            <View className=" bg-white px-4 py-3 flex-row justify-between items-center">
            <TouchableOpacity
                onPress={handleCancel}
                className="flex-1 mr-2 border-primary-600 border py-3 px-6 rounded-lg active:bg-gray-200">
                <Text className="text-primary-700 font-semibold text-center text-base">Cancel Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
                onPress={handleSave}
                className="flex-1 ml-2 bg-primary-600 py-3 px-6 rounded-lg active:bg-primary-700">
                <Text className="text-white font-semibold text-center text-base">Save Schedule</Text>
            </TouchableOpacity>
            </View>

            {/* Time Picker Modal */}
            <Modal
                visible={showStartTimePicker || showEndTimePicker}
                transparent={true}
                animationType="fade"
                onRequestClose={() => {
                    setShowStartTimePicker(false);
                    setShowEndTimePicker(false);
                }}
            >
                <View className="flex-1 justify-center items-center bg-black/50">
                    <View className="bg-white rounded-2xl p-6 mx-4 w-80">
                        <Text className="text-xl font-bold text-center mb-4">
                            {showStartTimePicker ? 'Select Start Time' : 'Select End Time'}
                        </Text>
                        
                        <View className="flex-row justify-center items-center mb-6">
                            {/* Hour Picker */}
                            <View className="items-center mx-2">
                                <Text className="text-gray-500 mb-2 font-medium">Hour</Text>
                                <ScrollView 
                                    className="h-32 w-16" 
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={{ paddingVertical: 40 }}
                                >
                                    {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((hour) => (
                                        <TouchableOpacity 
                                            key={hour}
                                            onPress={() => setTempHour(hour)}
                                            className={`py-2 px-4 rounded-lg mb-1 ${tempHour === hour ? 'bg-primary-600' : 'bg-gray-100'}`}
                                        >
                                            <Text className={`text-center text-lg font-semibold ${tempHour === hour ? 'text-white' : 'text-black'}`}>
                                                {hour}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                            
                            <Text className="text-2xl font-bold">:</Text>
                            
                            {/* Minute Picker */}
                            <View className="items-center mx-2">
                                <Text className="text-gray-500 mb-2 font-medium">Minute</Text>
                                <ScrollView 
                                    className="h-32 w-16" 
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={{ paddingVertical: 40 }}
                                >
                                    {Array.from({ length: 60 }, (_, i) => i).map((minute) => (
                                        <TouchableOpacity 
                                            key={minute}
                                            onPress={() => setTempMinute(minute)}
                                            className={`py-2 px-4 rounded-lg mb-1 ${tempMinute === minute ? 'bg-primary-600' : 'bg-gray-100'}`}
                                        >
                                            <Text className={`text-center text-lg font-semibold ${tempMinute === minute ? 'text-white' : 'text-black'}`}>
                                                {minute.toString().padStart(2, '0')}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                            
                            {/* AM/PM Picker */}
                            <View className="items-center mx-2">
                                <Text className="text-gray-500 mb-2 font-medium">Period</Text>
                                <View className="h-32 justify-center">
                                    <TouchableOpacity 
                                        onPress={() => setTempPeriod('AM')}
                                        className={`py-3 px-4 rounded-lg mb-2 ${tempPeriod === 'AM' ? 'bg-primary-600' : 'bg-gray-100'}`}
                                    >
                                        <Text className={`text-center text-lg font-semibold ${tempPeriod === 'AM' ? 'text-white' : 'text-black'}`}>
                                            AM
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        onPress={() => setTempPeriod('PM')}
                                        className={`py-3 px-4 rounded-lg ${tempPeriod === 'PM' ? 'bg-primary-600' : 'bg-gray-100'}`}
                                    >
                                        <Text className={`text-center text-lg font-semibold ${tempPeriod === 'PM' ? 'text-white' : 'text-black'}`}>
                                            PM
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                        
                        {/* Preview */}
                        <View className="bg-gray-100 rounded-xl py-3 mb-4">
                            <Text className="text-center text-2xl font-bold text-primary-600">
                                {formatTime(tempHour, tempMinute, tempPeriod)}
                            </Text>
                        </View>
                        
                        {/* Buttons */}
                        <View className="flex-row justify-between">
                            <TouchableOpacity 
                                onPress={() => {
                                    setShowStartTimePicker(false);
                                    setShowEndTimePicker(false);
                                }}
                                className="flex-1 mr-2 border border-gray-300 py-3 rounded-lg"
                            >
                                <Text className="text-center font-semibold text-gray-600">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={showStartTimePicker ? confirmStartTime : confirmEndTime}
                                className="flex-1 ml-2 bg-primary-600 py-3 rounded-lg"
                            >
                                <Text className="text-center font-semibold text-white">Confirm</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
};

export default EditRemindersScreen;
