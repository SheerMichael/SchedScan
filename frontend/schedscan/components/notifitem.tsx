import { View, Text, TouchableOpacity } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

type Props = {
  title: string;
  time: string;
  message: string;
  date: string;
  onDelete: () => void;
};

export default function NotificationItem({ title, time, message, date, onDelete }: Props) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const height = useSharedValue(112); // Approximate height of the notification

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Only allow left swipe (negative translation)
      if (event.translationX < 0) {
        translateX.value = event.translationX;
      }
    })
    .onEnd((event) => {
      // If swiped more than 100px to the left, delete
      if (event.translationX < -100) {
        translateX.value = withTiming(-500, { duration: 300 });
        opacity.value = withTiming(0, { duration: 300 });
        height.value = withTiming(0, { duration: 300 }, () => {
          runOnJS(onDelete)();
        });
      } else {
        // Spring back to original position
        translateX.value = withTiming(0, { duration: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
    height: height.value,
  }));

  const deleteButtonStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -50 ? 1 : 0,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <View className="relative overflow-hidden">
        {/* Delete button that appears behind */}
        <Animated.View 
          style={deleteButtonStyle}
          className="absolute right-0 top-4 bottom-0 w-20 bg-red-500 justify-center items-center rounded-r-lg"
        >
          <Text className="text-white font-bold">Delete</Text>
        </Animated.View>

        {/* Main notification content */}
        <GestureDetector gesture={panGesture}>
          <Animated.View className="bg-white">
            <View className="flex-row justify-start items-start pt-4">
              <View className="bg-primary-500 w-2 h-28 rounded-full" />

              <View className="flex-col justify-start items-start pl-6">
                <Text className="font-bold text-xl pb-2">{title}</Text>
                <Text>{time}</Text>
                <Text>{message}</Text>
                <Text className="text-gray-500 pt-2">{date}</Text>
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}