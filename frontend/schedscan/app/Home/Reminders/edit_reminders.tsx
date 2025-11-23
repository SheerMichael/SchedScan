import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Keyboard, TextInput as RNTextInput } from 'react-native';
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Path } from 'react-native-svg';
import DropDownPicker from "react-native-dropdown-picker";
import { History } from 'lucide-react-native';

const EditRemindersScreen = () => {

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
    const [dayValue, setDayValue] = useState(String(day || ""));
    const [locationValue, setLocationValue] = useState(String(location || ""));
    const startTimeString = Array.isArray(start_time) ? start_time[0] : start_time;
    const endTimeString = Array.isArray(end_time) ? end_time[0] : end_time;

    const generateTimes = () => {
        const times: { label: string; value: string }[] = [];
        const periods = ["AM", "PM"];

        periods.forEach((period) => {
            [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].forEach((hour) => {
            ["00", "15", "30", "45"].forEach((minute) => {
                const timeString = `${hour}:${minute} ${period}`;
                times.push({ label: timeString, value: timeString });
            });
            });
        });
        
        return times;
        };

    const timeOptions = generateTimes();
    const [keyboardfocused, setKeyboardFocused] = useState(false);
    const inputRef = useRef<RNTextInput>(null);

    const [starttimeOpen, setStarttimeOpen] = useState(false);
    const [starttimeValue, setStarttimeValue] = useState<string | null>(startTimeString  || null);
    const [starttimeItems, setStarttimeItems] = useState<{label: string; value: string}[]>(timeOptions);
    
    const [endtimeOpen, setEndtimeOpen] = useState(false);
    const [endtimeValue, setEndtimeValue] = useState<string | null>(endTimeString  || null);
    const [endtimeItems, setEndtimeItems] = useState<{label: string; value: string}[]>(timeOptions);

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

    const handleCancel = () => {
        console.log('Cancel pressed');
    };

    const handleSave = () => {
        console.log('Save schedule pressed');
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

                <View className='bg-primary-600 w-full p-6 rounded-xl mb-4' style={{ height: "22.50%" }}>
                    <View className='flex flex-row w-full'>
                        <View className='flex-1 flex-col w-1/2 pb-2'>
                            <Text className="mb-1 font-semibold text-white/85">School Year</Text>
                            <TextInput
                                ref={inputRef}
                                value={dayValue}
                                onChangeText={setDayValue}
                                placeholder="Enter subject"
                                className="rounded-lg pb-2 w-full h-12 flex bg-gray-200/65 text-white font-semibold text-lg pl-4 "
                            />
                        </View>
                        <View className='flex-1 flex-col w-1/2 ml-4'>
                            <Text className="mb-1 font-semibold text-white/85">Semester</Text>
                            <TextInput
                                value={dayValue}
                                onChangeText={setDayValue}
                                placeholder="Enter subject"
                                className="rounded-lg pb-2 w-full h-12 bg-gray-200/65 text-white font-semibold text-lg pl-4"
                            />
                        </View>
                    </View>
                    
                    <View className='flex w-full'>
                        <Text className="mb-1 font-semibold text-white/85">Day</Text>
                        <View className='flex-1 flex-row'>
                            <TextInput
                                value={dayValue}
                                onChangeText={setDayValue}
                                placeholder="Enter subject"
                                className=" pb-2 rounded-lg w-full h-12 bg-gray-200/65 text-white font-semibold text-lg pl-4"
                            />
                        </View>
                    </View>
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
                            setStarttimeOpen(false);
                            setEndtimeOpen(false);
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
                        <View style={{ zIndex: starttimeOpen ? Z.highest : Z.low,  position: "relative" }}>
                            <DropDownPicker
                                open={starttimeOpen}
                                value={starttimeValue}
                                items={starttimeItems}
                                setOpen={setStarttimeOpen}
                                setValue={setStarttimeValue}
                                setItems={setStarttimeItems}
                                placeholder="Select start time"
                                listMode="SCROLLVIEW"
                                ArrowDownIconComponent={({ style }) => (
                                    <History size={20} color="#BF1D1B" />
                                )}
                                ArrowUpIconComponent={({ style }) => (
                                    <History size={20} color="#444" />
                                )}
                                onOpen={() => {
                                // Dismiss keyboard when dropdown opens
                                if (keyboardfocused) {
                                    inputRef.current?.blur();
                                    Keyboard.dismiss();
                                }
                                }}
                                onClose={() => {
                                // Optional: handle close
                                }}
                                style={{
                                    backgroundColor: "rgba(229, 231, 235)",
                                    borderColor: "transparent",
                                    borderRadius: 12,
                                    paddingVertical: 12,
                                    width: 130,
                                }}
                                dropDownContainerStyle={{
                                    backgroundColor: "rgba(229, 231, 235)",
                                    borderColor: "transparent",
                                    borderRadius: 12,
                                    width: 130,
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
                        <Text className='text-3xl font-semibold text-gray-500'> - </Text>
                        <View style={{ zIndex: endtimeOpen ? Z.highest : Z.low,  position: "relative" }}>
                            <DropDownPicker
                                open={endtimeOpen}
                                value={endtimeValue}
                                items={endtimeItems}
                                setOpen={setEndtimeOpen}
                                setValue={setEndtimeValue}
                                setItems={setEndtimeItems}
                                placeholder="Select end time"
                                listMode="SCROLLVIEW"
                                ArrowDownIconComponent={({ style }) => (
                                    <History size={20} color="#BF1D1B" />
                                )}
                                ArrowUpIconComponent={({ style }) => (
                                    <History size={20} color="#444" />
                                )}
                                onOpen={() => {
                                // Dismiss keyboard when dropdown opens
                                if (keyboardfocused) {
                                    setKeyboardFocused(false);
                                    inputRef.current?.blur();
                                    Keyboard.dismiss();
                                }
                                }}
                                onClose={() => {
                                // Optional: handle close
                                }}
                                style={{
                                    backgroundColor: "rgba(229, 231, 235)",
                                    borderColor: "transparent",
                                    borderRadius: 12,
                                    paddingVertical: 12,
                                    width: 130,
                                }}
                                dropDownContainerStyle={{
                                    backgroundColor: "rgba(229, 231, 235)",
                                    borderColor: "transparent",
                                    borderRadius: 12,
                                    width: 130,
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
                    </View>
                </View>

                <View className="mb-4">
                    <Text className="mb-1 font-semibold text-gray-500">Location</Text>
                    <TextInput
                        value={locationValue}
                        onChangeText={setLocationValue}
                        placeholder="Enter subject"
                        className="border border-gray-300 p-4 rounded-2xl bg-slate-200/65 pl-6 font-semibold"
                        onFocus={() => setKeyboardFocused(true)}
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
        </>
    );
};

export default EditRemindersScreen;
