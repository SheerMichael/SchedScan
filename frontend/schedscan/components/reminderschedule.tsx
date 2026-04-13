import { View, Text, TouchableOpacity } from "react-native";
import { Clock, PencilLine } from "lucide-react-native";

type Props = {
  subject: string;
  start_time: string;
  end_time: string;
  day: string;
  onEdit: () => void;
  editable?: boolean;
};

export default function ScheduleItem({ subject, start_time, end_time, day, onEdit, editable = true } : Props) {
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
        disabled={!editable}
        activeOpacity={editable ? 0.7 : 1}
        className={`h-10 w-10 rounded-full items-center justify-center border ml-3 ${editable ? 'bg-gray-50 border-gray-100' : 'bg-gray-100 border-gray-200'}`}
      >
        <PencilLine size={18} color={editable ? '#374151' : '#9CA3AF'} />
      </TouchableOpacity>

    </View>
  );
}