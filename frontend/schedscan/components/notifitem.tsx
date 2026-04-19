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
  category: string;
  message: string;
  date: string;
  isRead: boolean;
  notificationType: 'class_reminder' | 'faculty_task' | 'faculty_match' | 'faculty_remark' | 'faculty_verification' | 'general';
  onDelete: () => void;
};

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

const cleanText = (value: string): string => value.replace(EMOJI_REGEX, '').replace(/\s{2,}/g, ' ').trim();

const getAccentColor = (notificationType: Props['notificationType']): string => {
  if (notificationType === 'class_reminder') return '#2563EB';   // blue
  if (notificationType === 'faculty_task') return '#EA580C';     // orange
  if (notificationType === 'faculty_match') return '#7C3AED';   // violet
  if (notificationType === 'faculty_remark') return '#B45309';  // amber-dark
  if (notificationType === 'faculty_verification') return '#16A34A'; // green
  return '#475569'; // slate — general
};

const getTypeInitials = (notificationType: Props['notificationType']): string => {
  if (notificationType === 'class_reminder') return 'CR';
  if (notificationType === 'faculty_task') return 'FT';
  if (notificationType === 'faculty_match') return 'FM';
  if (notificationType === 'faculty_remark') return 'FR';
  if (notificationType === 'faculty_verification') return 'FV';
  return 'NT';
};

export default function NotificationItem({
  title,
  category,
  message,
  date,
  isRead,
  notificationType,
  onDelete,
}: Props) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const height = useSharedValue(136);
  const accentColor = getAccentColor(notificationType);

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
    <Animated.View style={[animatedStyle, { marginBottom: 12 }]}> 
      <View className="relative overflow-hidden rounded-2xl">
        {/* Delete button that appears behind */}
        <Animated.View 
          style={deleteButtonStyle}
          className="absolute right-0 top-0 bottom-0 w-24 bg-red-500 justify-center items-center rounded-r-2xl"
        >
          <Text className="text-white font-bold">Delete</Text>
        </Animated.View>

        {/* Main notification content */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            className="rounded-2xl border"
            style={{
              borderColor: '#E5E7EB',
              borderLeftWidth: 4,
              borderLeftColor: accentColor,
              backgroundColor: isRead ? '#FFFFFF' : '#FFF7ED',
            }}
          >
            <View className="flex-row items-start p-4">
              <View
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: `${accentColor}22` }}
              >
                <Text className="text-xs font-bold" style={{ color: accentColor }}>{getTypeInitials(notificationType)}</Text>
              </View>

              <View className="ml-3 flex-1">
                <View className="flex-row items-start justify-between">
                  <Text className="mr-2 flex-1 text-lg font-bold text-slate-900" numberOfLines={1}>
                    {cleanText(title)}
                  </Text>
                  <Text className="text-xs text-slate-500">{date}</Text>
                </View>

                <Text className="mt-0.5 text-xs font-semibold uppercase tracking-wide" style={{ color: accentColor }}>
                  {category}
                </Text>

                <Text className="mt-2 text-base leading-5 text-slate-700" numberOfLines={2}>
                  {cleanText(message)}
                </Text>

                {!isRead && (
                  <View className="mt-3 self-start rounded-full bg-orange-100 px-2.5 py-1">
                    <Text className="text-xs font-semibold text-orange-700">Unread</Text>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}