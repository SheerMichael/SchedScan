import { View, Text, TouchableOpacity } from "react-native";
import { Clock, PencilLine } from "lucide-react-native";

type Props = {
  subject: string;
  start_time: string;
  end_time: string;
  day: string;
  onEdit: () => void;
};

export default function ScheduleItem({ subject, start_time, end_time, day, onEdit } : Props) {
  return (
    <View className="flex-row border border-gray-200 rounded-md justify-between mb-6">
      <View className="flex-col pl-4 ml-2 mr-2 mt-4 mb-4 gap-1">
        <Text className="font-bold text-lg">{subject}</Text>

        <View className="flex-row pl-1">
          <Clock size={20} color="#7C7070" />
          <Text className="text-gray-400 pl-2">{start_time} - {end_time}</Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onEdit}
        className="flex justify-center items-center pr-6"
      >
        <PencilLine size={20} color="#000" />
      </TouchableOpacity>
    </View>
  );
}
