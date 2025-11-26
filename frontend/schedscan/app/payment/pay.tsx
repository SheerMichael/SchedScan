import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, ScrollView } from "react-native";
import { ArrowLeft, Crown, CircleDot } from "lucide-react-native";
import { router } from "expo-router";

export default function CheckoutScreen() {
    const [paymentMethod, setPaymentMethod] = useState("gcash");

    const handlePayment = () => {
        /* Handle payment logic based on selected method */
        router.push('./payment/purchased');
    }
    return (
        <>
            <ScrollView className="flex-1 bg-white px-5 pt-3">
                
                {/* Header */}
                <View className="flex-row items-center mb-6">
                    <TouchableOpacity onPress={() => router.back()}>
                        <ArrowLeft size={26} color="black" />
                    </TouchableOpacity>
                    <Text className="ml-4 text-2xl font-semibold text-gray-900">
                        Checkout
                    </Text>
                </View>

                {/* Plan Summary */}
                <View className="border border-gray-200 rounded-xl p-4 mb-6">
                    <View className="flex-row justify-between items-center">
                        <View className="flex-row items-center">
                            <Crown size={26} color="#e7b00f" fill="#e7b00f" />
                            <Text className="ml-2 text-lg font-semibold">Life Plan</Text>
                        </View>
                        <View className="items-end">
                            <Text className="text-lg font-semibold">49.00</Text>
                            <Text className="text-xs text-gray-500">For 3 months</Text>
                        </View>
                    </View>

                    <View className="border-t border-gray-300 my-4" />

                    <View>
                        <View className="flex-row items-start mb-2">
                            <CircleDot size={16} color="black" />
                            <Text className="ml-2 text-gray-900">
                                <Text className="font-semibold">Today:</Text> Life plan for 49.00
                            </Text>
                        </View>

                        <View className="flex-row items-start">
                            <CircleDot size={16} color="gray" />
                            <Text className="ml-2 text-gray-600">
                                Starting in August 15, 2025 {/* Change date to whatever is 1 or 3 months from current date */}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Payment Method */}
                <Text className="text-lg font-semibold mb-2">Payment Method</Text>

                {/* GCash Option */}
                <TouchableOpacity
                    onPress={() => setPaymentMethod("gcash")}
                    className={`border rounded-xl p-4 mb-3 ${
                        paymentMethod === "gcash" ? "border-blue-600 bg-blue-50" : "border-gray-300"
                    }`}
                >
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center">
                            <Image
                                source={require('../../assets/images/gcash.png')}
                                className="w-10 h-10 rounded-md"
                            />
                            <Text className="ml-3 text-lg font-semibold text-gray-800">
                                GCASH
                            </Text>
                        </View>
                        <CircleDot
                            size={22}
                            color={paymentMethod === "gcash" ? "#2563eb" : "#9ca3af"}
                            fill={paymentMethod === "gcash" ? "#2563eb" : "white"}
                        />
                    </View>
                </TouchableOpacity>

                {/* Credit/Debit Card Option */}
                <TouchableOpacity
                    onPress={() => setPaymentMethod("card")}
                    className={`border rounded-xl p-4 mb-4 ${
                        paymentMethod === "card" ? "border-blue-600 bg-blue-50" : "border-gray-300"
                    }`}
                >
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center">
                            <Text className="ml-1 text-lg font-semibold text-gray-800">
                                Credit or Debit card
                            </Text>
                        </View>
                        <CircleDot
                            size={22}
                            color={paymentMethod === "card" ? "#2563eb" : "#9ca3af"}
                            fill={paymentMethod === "card" ? "#2563eb" : "white"}
                        />
                    </View>
                    <Image
                        source={require('../../assets/images/creditanddebit.png')}
                        className="w-24 h-5 mt-3 opacity-80"
                        resizeMode="contain"
                    />
                </TouchableOpacity>

                {/* Summary Section */}
                <Text className="text-lg font-semibold mb-2">Summary</Text>

                <View className="bg-red-100 p-4 rounded-xl mb-4">
                    <Text className="font-semibold text-gray-700">Items</Text>

                    <View className="flex-row items-center mt-3">
                        <Crown size={22} color="#e7b00f" fill="#e7b00f" />
                        <Text className="ml-2 text-base font-semibold text-gray-700">
                            Premium
                        </Text>
                    </View>

                    <View className="flex-row items-start mt-3">
                        <CircleDot size={16} color="black" />
                        <Text className="ml-2 text-gray-800">
                            <Text className="font-semibold">Today:</Text> 3 months for 49.00 {/* Change this to  1 or 3 months from (depende na sayo kuya)*/}
                        </Text>
                    </View>

                    <View className="flex-row items-start mt-2">
                        <CircleDot size={16} color="gray" />
                        <Text className="ml-2 text-gray-600">Starting in August 15, 2025</Text> {/* Change date to whatever is 1 or 3 months from current date */}
                    </View>

                    <View className="flex-row justify-between mt-4 pt-3 border-t border-gray-300">
                        <Text className="font-semibold text-gray-800">Total now</Text>
                        <Text className="font-semibold text-gray-900 text-xl">49.00</Text>
                    </View>
                </View>

                {/* Terms */}
                <Text className="text-xs text-gray-600 text-center px-4 mb-6 leading-5">
                    By subscribing, you allow SchedScan to charge your chosen payment method each cycle until you cancel.
                    You can manage or cancel anytime in your account settings. No partial refunds. Terms apply.
                </Text>

                {/* Payment Button */}
                <View className="items-center mb-10">
                    <View className="bg-white w-full border border-gray-300 rounded-xl p-5 items-center">
                        <Image
                            source={require('../../assets/images/gcash.png')}
                            className="w-24 h-16"
                        />
                        <Text className="text-gray-600 text-sm mt-2">
                            You'll be redirected to GCash to complete your purchase.
                        </Text>

                        <TouchableOpacity className="bg-red-500 mt-4 px-6 py-3 rounded-xl" onPress={handlePayment}>
                            <Text className="text-white font-semibold text-lg">
                                Complete Purchase
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

            </ScrollView>
        </>
    );
}
