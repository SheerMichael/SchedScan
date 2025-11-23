import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Keyboard } from 'react-native';
import { router } from "expo-router";
import Svg, { Path, Circle } from 'react-native-svg';
import DropDownPicker from "react-native-dropdown-picker";
import { Search, Clock, PencilLine } from "lucide-react-native";
import ScheduleItem from "../../components/reminderschedule";
import DayHeader from "../../components/reminderdayheader";

const RemindersScreen = () => {

  const [hasSchedules, setHasSchedules] = useState(true); // Set this to true or false to see different outputs
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

  const scheduleData = [
  {
    day: "Monday",
    color: "bg-primary-500",
    items: [
      { id: 1, 
        subject: "Software Engineering 1", 
        start_time: "7:00 AM",
        end_time: "8:30 AM",
        location: "LR1",
      },
    ],
  },
  {
    day: "Tuesday",
    color: "bg-primary-500",
    items: [
      { id: 2, 
        subject: "Software Engineering 1",         
        start_time: "12:00 AM",
        end_time: "9:30 AM",
        location: "LR1",
      },
      { id: 3, 
        subject: "Software Engineering 1",        
        start_time: "7:00 AM",
        end_time: "8:30 AM",
        location: "LR1",  
      },
    ],
  },
  {
    day: "Thursday",
    color: "bg-blue-800",
    items: [
      { id: 4, 
        subject: "Software Engineering 1",         
        start_time: "7:00 AM",
        end_time: "8:30 AM",
        location: "LR1", 
      },
    ],
  },
];

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
          <Text>No schedule, yet!</Text>
          <Text>Scan your schedule now</Text>
        </View>
        )}

    </>
  );
};

export default RemindersScreen;