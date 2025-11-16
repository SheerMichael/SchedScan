import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { router } from "expo-router";

const notificationscreen = () => {

    const [hasnotif, setnotif] = useState(false);

    const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
    );

    return (
    <>
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
            <TouchableOpacity className=" bg-orange-600 p-2 pr-4 pl-4 rounded-full">
                <Text className="text-white">Clear</Text>
            </TouchableOpacity>
        </View>
    </View>
    
    {hasnotif ? (
    <ScrollView>
        
    </ScrollView>
    ) : 
    <View className='flex-1 justify-center items-center'>
        <Text>No schedule, yet!</Text>
        <Text>Scan your schedule now</Text>
    </View>
    }
    </>
    );
};

export default notificationscreen;