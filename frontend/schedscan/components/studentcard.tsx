import React from 'react';
import { View, Text, TouchableOpacity, Image, ImageSourcePropType } from 'react-native';
import { Download } from "lucide-react-native";

interface ScheduleCardProps {
  imageSource: ImageSourcePropType;
  onApplyReminders: () => void;
  onDownload: () => void;
}

const ScheduleCard: React.FC<ScheduleCardProps> = ({ 
  imageSource, 
  onApplyReminders, 
  onDownload 
}) => {
  return (
    <View className="flex-col items-center justify-center border border-gray-300 w-11/12 h-80 mb-4">
      <View className="flex-row justify-between w-11/12 px-2 pt-2 pb-2">
        <Text className="text-3xl font-semibold text-red-500">Student</Text>
        <TouchableOpacity onPress={onDownload}>
          <Download size={30} color="#ffffff" fill="#ffffff" stroke="#990100"/>
        </TouchableOpacity>
      </View>
      <Image 
        source={imageSource}
        style={{ width: 268, height: 180 }}
        className="pt-4"
      />
      <View className="flex-row justify-end w-11/12 px-2 pt-2">
        <TouchableOpacity 
          className="bg-primary-800 p-2 px-4 rounded-full"
          onPress={onApplyReminders}
        >
          <Text className="font-semibold text-white text-sm">Apply Reminders</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ScheduleCard;