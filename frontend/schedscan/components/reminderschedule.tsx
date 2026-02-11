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
    <View className="flex-row bg-white rounded-2xl p-4 mb-3 shadow-sm border border-gray-100 items-center justify-between">
      
      <View className="flex-1 gap-2">
        <Text className="text-gray-900 font-bold text-lg tracking-tight">
          {subject}
        </Text>

        <View className="flex-row items-center self-start bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
          <Clock size={14} color="#6B7280" strokeWidth={2.5} />
          <Text className="text-gray-600 text-xs font-semibold ml-2">
            {start_time} - {end_time}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onEdit}
        activeOpacity={0.7}
        className="h-10 w-10 bg-gray-50 rounded-full items-center justify-center border border-gray-100 ml-3"
      >
        <PencilLine size={18} color="#374151" />
      </TouchableOpacity>

    </View>
  );
}