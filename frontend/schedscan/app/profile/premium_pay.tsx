import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { X, CircleCheckBig, CircleDot, Crown } from "lucide-react-native";
import { router } from "expo-router";

export default function GetPremiumScreen() {
    const [selectedPlan, setSelectedPlan] = useState("monthly");

    return (
        <>    
            <View className="px-8 h-full">
                <View className="flex-row justify-end mb-4">
                    <TouchableOpacity onPress={() => router.back()}>
                        <X size={26} color="black" />
                    </TouchableOpacity>
                </View>

                {/* Illustration */}
                <View className="items-center mb-6">
                    <Image
                        source={require("../../assets/images/girlwithcalendar.png")}
                        className="w-80 h-80"
                        resizeMode="contain"
                    />
                </View>

                {/* Title */}
                <View className="items-center mb-6">
                    <View className="flex-row items-center">
                        <Text className="text-5xl font-semibold text-gray-900 mr-2">
                            Get Premium
                        </Text>
                        <Crown size={32} color="#fbbf24" strokeWidth={2.5} />
                    </View>
                    <Text className="text-gray-500 text-xl mt-2">
                        Unlock all features
                    </Text>
                </View>

                {/* Features */}
                <View className="mb-16 flex justify-center items-start">
                    <View className="flex-row items-center mb-3">
                        <CircleCheckBig size={20} color="#00A859" fill="#B0EF8F"/>
                        <Text className="ml-3 text-gray-800 text-base">
                            Unlimited scans with premium themes
                        </Text>
                    </View>

                    <View className="flex-row items-center mb-3">
                        <CircleCheckBig size={20} color="#00A859" fill="#B0EF8F"/>
                        <Text className="ml-3 text-gray-800 text-base">
                            Export option, calendar sync
                        </Text>
                    </View>

                    <View className="flex-row items-center mb-3">
                        <CircleCheckBig size={20} color="#00A859" fill="#B0EF8F"/>
                        <Text className="ml-3 text-gray-800 text-base">
                            Smart reminders
                        </Text>
                    </View>
                </View>

                {/* Plan Selection */}
                <TouchableOpacity
                    onPress={() => setSelectedPlan("monthly")}
                    className={`border rounded-xl p-4 mb-8 flex-row items-center justify-between ${
                        selectedPlan === "monthly"
                            ? "border-primary-500 bg-white"
                            : "border-gray-300"
                    }`}
                >
                    <Text className="text-base text-gray-900 font-semibold">
                        Monthly Plan only 49.00
                    </Text>

                    <CircleDot
                        size={22}
                        color={selectedPlan === "monthly" ? "#990100" : "gray"}
                        fill={selectedPlan === "monthly" ? "#990100" : "white"}
                    />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.replace('./payment/pay')}
                    className="bg-primary-900 rounded-full px-20 py-6 flex-row justify-center items-center">
                        <Text className="text-white font-semibold">Subscribe</Text>
                </TouchableOpacity>
            </View>
        </>
    );
}
