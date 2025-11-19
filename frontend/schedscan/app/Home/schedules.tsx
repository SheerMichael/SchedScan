import { View, Text, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import { router } from "expo-router";
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { FolderClosed, ChevronRight } from "lucide-react-native";

const RemindersScreen = () => {
  const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
  );
 
  return (
    <>
      <View className="w-full h-14 bg-white border-b-2 border-gray-200 justify-between items-center flex-row">
        <View className='pl-8 flex-row justify-center items-center'>
          <TouchableOpacity onPress={() => router.push('/Home/home')}>
            <LeftPointingArrow size={30} color="#000000" />
          </TouchableOpacity>
        </View>
          <View className='flex-row justify-center items-center mr-4'>
            <Text className='font-bold text-2xl'>Schedules</Text>
          </View>
        <View>
        </View>
      </View>

        <ScrollView>
          <View className='flex items-center justify-center mt-8 pt-4'>
            <TouchableOpacity className='flex-row justify-between items-center bg-primary-900 w-11/12 rounded-xl h-20' onPress={() => router.push('/Home/Schedules/faculty')}>
                <View className='flex-row justify-evenly items-center ml-4'>
                    <FolderClosed size={40} color="#ffffff" fill="#ffffff" stroke="#990100"/>
                    <Text className='text-white text-2xl font-semibold'>Faculty</Text>
                </View>
                <View className='flex mr-4'>
                    <ChevronRight size={34} color="#ffffff"/>
                </View>
            </TouchableOpacity>
          </View>

          <View className='flex items-center justify-center pt-4'>
            <TouchableOpacity className='flex-row justify-between items-center bg-primary-900 w-11/12 rounded-xl h-20' onPress={() => router.push('/Home/Schedules/student')}>
                <View className='flex-row justify-evenly items-center ml-4'>
                    <FolderClosed size={40} color="#ffffff" fill="#ffffff" stroke="#990100"/>
                    <Text className='text-white text-2xl font-semibold'>Student</Text>
                </View>
                <View className='flex mr-4'>
                    <ChevronRight size={34} color="#ffffff"/>
                </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
    </>
  );
};

export default RemindersScreen;