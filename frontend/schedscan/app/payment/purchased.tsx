import { router } from "expo-router";
import { View, Text, TouchableOpacity, Image, ScrollView } from "react-native";

export default function PurchasedScreen() {
    return (
        <>
            <View className="flex justify-center items-center h-full">
                <Image
                    source={require("../../assets/images/bastacheck.png")}
                    className="w-48 h-48 mt-6 mb-6"/>
                <Text className="text-2xl text-primary-900 font-bold mb-20">Payment Successful!</Text>

                <TouchableOpacity onPress={() => router.replace('/Home/home')}
                    className="bg-primary-900 rounded-xl px-20 py-3">
                        <Text className="text-white font-semibold">Continue</Text>
                </TouchableOpacity>
            </View>
        </>
    );
}