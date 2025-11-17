import { View, Text } from 'react-native';

type Props = {
  title: string;
  time: string;
  message: string;
  date: string;
};

export default function NotificationItem({ title, time, message, date }: Props) {
  return (
    <View className="flex-row justify-start items-start pt-4">
      <View className="bg-primary-500 w-2 h-28 rounded-full" />

      <View className="flex-col justify-start items-start pl-6">
        <Text className="font-bold text-xl pb-2">{title}</Text>
        <Text>{time}</Text>
        <Text>{message}</Text>
        <Text className="text-gray-500 pt-2">{date}</Text>
      </View>
    </View>
  );
}
