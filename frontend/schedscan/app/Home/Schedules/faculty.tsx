import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Keyboard } from 'react-native';
import { router } from "expo-router";
import Svg, { Path, Circle } from 'react-native-svg';
import ScheduleCard from '../../../components/facultycard';


const FacultySchedule = () => {

  const [FacultySchedule, setFacultySchedules] = useState([
      {
        id: 1,
        imageSource: require('../../../assets/images/faculty_schedule.png'),
      },
      {
        id: 2,
        imageSource: require('../../../assets/images/faculty_schedule.png'),
      },
      {
        id: 3,
        imageSource: require('../../../assets/images/faculty_schedule.png'),
      }
    ]);

  const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
  );

    const handleApplyReminders = (studentid: number) => {
      console.log(`Applying reminders for ${studentid}`);
      router.push({
        pathname: '/Home/reminders',
      })
    };
  
    const handleDownload = (studentidd: number) => {
      console.log(`Downloading schedule for ${studentidd}`);
      // Add your download logic here
    };

  return (
    <>
      <View className="w-full h-14 bg-white border-b-2 border-b-gray-200 justify-between items-center flex-row">
        <View className='pl-8 flex-row justify-center items-center'>
          <TouchableOpacity onPress={() => router.push('/Home/schedules')}>
            <LeftPointingArrow size={30} color="#000000" />
          </TouchableOpacity>
        </View>
        <View className='flex-row justify-center items-center mr-4'>
          <Text className='font-bold text-2xl'>Faculty Schedules</Text>
        </View>
        <View>
        </View>
      </View>

        {FacultySchedule.length > 0 ? (
        <ScrollView className="flex-1 px-6 pt-4">
          {FacultySchedule.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              imageSource={schedule.imageSource}
              onApplyReminders={() => handleApplyReminders(schedule.id)}
              onDownload={() => handleDownload(schedule.id)}
            />
          ))} 
        </ScrollView>
        ) : (
        <View className='flex-1 justify-center items-center'>
          <Image source={require('../../../assets/images/Reminders.png')}
          style={{ width: 268, height: 168 }}
          />
          <Text>No schedule, yet!</Text>
          <Text>Scan your schedule now</Text>
        </View>
        )}

    </>
  );
};

export default FacultySchedule;