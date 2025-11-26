import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, User, CircleCheckBig, Crown } from 'lucide-react-native';

export default function MyplansScreen() {
    const [freeplan, setFreeplan] = useState(true); 
    const [paidplan, setPaidplan] = useState(false);

    const activatePremium = () => {
        router.push('../payment/pay');
        setFreeplan(false);
        setPaidplan(true);
    };

    const returnToBasic = () => {
        setFreeplan(true);
        setPaidplan(false);
    };

    return (
        <View className="flex-1 bg-white mx-4 mt-2 rounded-xl p-5">

            {/* Header */}
            <View className="flex-row items-center justify-between mb-8">
                <TouchableOpacity onPress={() => router.back()} className="w-4">
                    <ArrowLeft size={25} color="#000000" />
                </TouchableOpacity>
                
                <Text className="text-2xl font-semibold text-gray-900">
                    My plans
                </Text>

                <View />
            </View>

            <View className='flex flex-row border-primary-700 border rounded-lg p-4 items-center justify-start bg-primary-300/30 h-1/4 mb-6'>
                
                <View className='mr-10 flex-col items-center justify-center gap-2 ml-4'>
                    {freeplan && (
                        <View className='bg-primary-900 rounded-full px-2 py-1 border-gray-500 border mb-8'>
                            <Text className='text-white'>Current Plan</Text>
                        </View>
                    )}

                    <User size={50} color="#FFBB33" fill="#FFBB33"/>
                    <Text className='font-semibold text-lg'>Basic</Text>
                </View>

                <View className='mt-2'>
                    <Text className='font-semibold text-4xl mb-2 ml-2'>₱0 
                        <Text className='text-2xl text-gray-500/85'>/Month</Text>
                    </Text>

                    <View className="flex-col">
                        <Feature text="5 Free COR Scan" />
                        <Feature text="Auto Timetable" />
                        <Feature text="Basic Reminders" />
                        <Feature text="Weekly View" />
                        <Feature text="View-Only Calendar" />
                        <Feature text="Basic Themes" />
                    </View>

                    {paidplan && (
                        <TouchableOpacity className='ml-32' onPress={returnToBasic}>
                            <Text className='font-semibold text-red-600'>
                                Return to Basic {'>'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <View className='flex flex-row border-primary-700 border rounded-lg p-4 items-center justify-start bg-primary-300/30 h-1/4'>
                
                <View className='mr-10 flex-col items-center justify-center gap-2 ml-4'>
                    {paidplan && (
                        <View className='bg-primary-900 rounded-full px-2 py-1 border-gray-500 border mb-2'>
                            <Text className='text-white'>Current Plan</Text>
                        </View>
                    )}

                    <Crown size={50} color="#FFBB33" fill="#FFBB33"/>
                    <Text className='font-semibold text-lg'>Premium</Text>
                </View>

                <View className='mt-2'>
                    <Text className='font-semibold text-primary-500 text-4xl mb-2 ml-2'>₱49 
                        <Text className='text-2xl text-gray-500/85'>/Month</Text>
                    </Text>

                    <View className="flex-col"> 
                        <Feature text="Unlimited Scans" />
                        <Feature text="Add Custom Events" />
                        <Feature text="Custom Templates" />
                        <Feature text="Cloud Backup" />
                        <Feature text="Export Schedule" />
                        <Feature text="Custom Themes" />
                    </View>

                    {!paidplan && (
                        <TouchableOpacity className='ml-32' onPress={activatePremium}>
                            <Text className='font-semibold text-primary-500'>Choose Plan {'>'}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

        </View>
    );
}

function Feature({ text }: { text: string }) {
    return (
        <View className="flex-row items-center">
            <CircleCheckBig size={16} color="#009045" fill="#B0EF8F"/>
            <Text className="ml-2 font-semibold">{text}</Text>
        </View>
    );
}
