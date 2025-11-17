import { View, Text } from "react-native";

type Props = {
  label: string;
  color: string;
};

export default function DayHeader({ label, color = "bg-primary-500" } : Props) {
  return (
    <View className="flex-row justify-start items-center mb-4">
      <View className={`${color} w-2 h-8 pr-2 mr-2 rounded-full`}></View>
      <Text className="text-3xl font-extrabold">{label}</Text>
    </View>
  );
}
