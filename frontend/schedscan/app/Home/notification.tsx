import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { router } from "expo-router";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import NotificationItem from "../../components/notifitem";

const notificationscreen = () => {
    const [notifications, setNotifications] = useState([
        {
            id: 1,
            title: "Software Engineering 1",
            time: "Mon 7:00 AM - 8:30 AM",
            message: "Upcoming class in 5 minutes!",
            date: "1d ago",
        },
        {
            id: 2,
            title: "IT Elective",
            time: "Tue 10:00 AM - 12:00 PM",
            message: "Class starts soon",
            date: "3h ago",
        }
    ]);

    const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <Path d="M19 12H6M12 5l-7 7 7 7" />
        </Svg>
    );

    const handleDeleteNotification = (id: number) => {
        setNotifications(prev => prev.filter(notif => notif.id !== id));
    };

    const handleClearAll = () => {
        setNotifications([]);
    };

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View className="w-full h-14 bg-white border-b-2 border-gray-200 justify-between items-center flex-row">
                <View className='pl-8 flex-row justify-center items-center'>
                    <TouchableOpacity onPress={() => router.push('/Home/home')}>
                        <LeftPointingArrow size={30} color="#000000" />
                    </TouchableOpacity>
                </View>

                <View className='flex-row justify-center items-center'>
                    <Text className='font-bold text-2xl'>Notifications</Text>
                </View>

                <View className="pr-4 flex items-center justify-center">
                    <TouchableOpacity 
                        className="bg-orange-600 p-2 pr-4 pl-4 rounded-full"
                        onPress={handleClearAll}
                    >
                        <Text className="text-white">Clear</Text>
                    </TouchableOpacity>
                </View>
            </View>
            
            {notifications.length > 0 ? (
                <ScrollView className="flex-1 px-6">
                    {notifications.map((item) => (
                        <NotificationItem
                            key={item.id}
                            title={item.title}
                            time={item.time}
                            message={item.message}
                            date={item.date}
                            onDelete={() => handleDeleteNotification(item.id)}
                        />
                    ))}
                </ScrollView>
            ) : 
                <View className='flex-1 justify-center items-center'>
                    <Text>No notifications!</Text>
                    <Text>You're all caught up</Text>
                </View>
            }
        </GestureHandlerRootView>
    );
};

export default notificationscreen;