import { View, Text, TouchableOpacity } from "react-native";
import { router, usePathname } from "expo-router";
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

      const Home = ({ size = 24, color = '#4D4D4D' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF" stroke={color} strokeWidth="2">
          <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        </Svg>
      );
      
      const Scan = ({ size = 24, color = '#4D4D4D' }) => (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill="#FFFFFF" stroke="#000000" strokeWidth="2">
          <Path d="M0.5 5V2.5C0.5 1.39543 1.39543 0.5 2.5 0.5H5M10 0.5H12.5C13.6046 0.5 14.5 1.39543 14.5 2.5V5M0.5 10V12.5C0.5 13.6046 1.39543 14.5 2.5 14.5H5M14.5 10V12.5C14.5 13.6046 13.6046 14.5 12.5 14.5H10M2 7.5H13"/>
        </Svg>
      );
      
      const Reminders = ({ size = 24, color = '#4D4D4D' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF" stroke={color} strokeWidth="2">
          <Path d="M12 2a10 10 0 1 0 10 10H12V2zM21.18 8.02c-1-2.3-2.85-4.17-5.16-5.18"/>
        </Svg>
      );
      
      const Schedules = ({ size = 32, color = '#CB2222' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} >
          <Path
            d="M9 2a1 1 0 0 1 1 1v1h4V3a1 1 0 1 1 2 0v1h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V3a1 1 0 0 1 1-1zM8 6H5v3h14V6h-3v1a1 1 0 1 1-2 0V6h-4v1a1 1 0 0 1-2 0V6zm11 5H5v8h14v-8z"/>
        </Svg>
      );
      
      const Account = ({ size = 24, color = '#4D4D4D' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF" stroke={color} strokeWidth="2">
          <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <Circle cx={12} cy={7} r={4}></Circle>
        </Svg>
      );
    
export default function Footer() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;

  return (
<View className="w-full h-16 bg-white border-t-2 border-gray-200 justify-evenly items-center flex-row">

    <TouchableOpacity
        className="flex-col justify-center items-center"
        onPress={() => router.push({ pathname: "/Home/home" })}
    >
        <Home size={24} color={isActive("/Home/home") ? "#CC0000" : "#4D4D4D"} />
        <Text className={isActive("/Home/home") ? "text-primary-600" : "text-gray-500"}>
        Home
        </Text>
    </TouchableOpacity>

    <TouchableOpacity
        className="flex-col justify-center items-center"
        onPress={() => router.push({ pathname: "/Home/reminders" })}
    >
        <Reminders size={24} color={isActive("/Home/reminders") ? "#CC0000" : "#4D4D4D"} />
        <Text className={isActive("/Home/reminders") ? "text-primary-600" : "text-gray-500"}>
        Reminders
        </Text>
    </TouchableOpacity>

    <TouchableOpacity className="w-20 h-20 rounded-full flex-col border border-gray-500 bg-white -mt-8 justify-center items-center"
    onPress={() => router.push({ pathname: "/Home/scanner" })}>
        <Scan size={40}/>
    </TouchableOpacity>

    <TouchableOpacity
        className="flex-col justify-center items-center"
        onPress={() => router.push({ pathname: "/Home/schedules" })}
    >
        <Schedules size={24} color={isActive("/Home/schedules") ? "#CC0000" : "#4D4D4D"} />
        <Text className={isActive("/Home/schedules") ? "text-primary-600" : "text-gray-500"}>
        Schedules
        </Text>
    </TouchableOpacity>

    <TouchableOpacity
        className="flex-col justify-center items-center"
        onPress={() => router.push({ pathname: "/Home/account" as any })}
    >
        <Account size={24} color={isActive("/Home/account") ? "#CC0000" : "#4D4D4D"} />
        <Text className={isActive("/Home/account") ? "text-primary-600" : "text-gray-500"}>
        Account
        </Text>
    </TouchableOpacity>
</View>
  );
}