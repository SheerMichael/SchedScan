import React, {useState} from "react";
import { View, Text, TouchableOpacity, ScrollView, Switch, Modal} from "react-native";
import { ArrowLeft, Crown, X } from "lucide-react-native";
import { router } from "expo-router";

export default function RemindersSettingScreen() {
    const [syncHolidays, setSyncHolidays] = useState(false);
    const [syncSuspensions, setSyncSuspensions] = useState(false);
    const [modalReminders, setModalReminders] = useState(false);
    const [modalSnoozed, setModalSnoozed] = useState(false);
    const [selectedReminder, setSelectedReminder] = useState("Mobile push notification");
    const [selectedSnooze, setSelectedSnooze] = useState("5 minutes");

    const handleReminders = (option: string) => {
        setSelectedReminder(option);
        setModalReminders(false);
    }
    const handleSnoozed = (option: string) => {
        setSelectedSnooze(option);
        setModalSnoozed(false);
    }

    return (
        <>
            <ScrollView className="flex-1 bg-white px-5">

                <View className="flex-row items-center mb-6">
                    <TouchableOpacity onPress={() => router.back()}>
                        <ArrowLeft size={26} color="black" strokeWidth={2} />
                    </TouchableOpacity>

                    <Text className="text-2xl font-semibold ml-3 text-gray-900">
                        Reminders Setting
                    </Text>
                </View>

                <View className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-8">
                    <View className="flex-row items-start">
                        <View className="flex justify-center items-center">
                            <Crown size={30} color="#fbbf24" strokeWidth={2} />
                            
                            <View className="bg-red-400 rounded-full p-1 px-2 self-start mt-3">
                                <Text className="text-white font-semibold">PRO</Text>
                            </View>
                        </View>
                        <View className="ml-3 flex-1">
                            <Text className="font-semibold text-gray-900">
                                Your schedule, your settings.
                            </Text>
                            <Text className="text-gray-600 mt-1">
                                Take control of your SchedScan experience. Manage your reminders, choose your timetable template, and personalize how your schedule looks and feels.
                            </Text>

                        </View>
                    </View>
                </View>

                <Text className="text-red-500 font-semibold mb-6">
                    Preferences
                </Text>

                <TouchableOpacity className="py-3" onPress={() => setModalReminders(true)}>
                    <Text className="font-medium text-gray-900">Remind me via</Text>
                    <Text className="text-gray-500 text-sm mt-1">{selectedReminder}</Text>
                </TouchableOpacity>

                <TouchableOpacity className="border-t border-gray-300 py-3" onPress={() => setModalSnoozed(true)}>
                    <Text className="font-medium text-gray-900">When ignored...</Text>
                    <Text className="text-gray-500 text-sm mt-1">{selectedSnooze}</Text>
                </TouchableOpacity>

                <TouchableOpacity className="border-t border-gray-300 py-3">
                    <Text className="font-medium text-gray-900">Send automatic reminders…</Text>
                    <Text className="text-gray-500 text-sm mt-1">At time of tasks</Text>
                </TouchableOpacity>

                <View className="border-t border-gray-300 py-3 flex-row justify-between items-center">
                    <View>
                        <Text className="font-medium text-gray-900">Sync national holidays</Text>
                        <Text className="text-gray-500 text-sm mt-1">Turned Off</Text>
                    </View>

                    <Switch
                        value={syncHolidays}
                        onValueChange={setSyncHolidays}
                        trackColor={{ false: "#d6d6d6", true: "#CB2222" }}
                        thumbColor={syncHolidays ? "#d6d6d6" : "#f4f3f4"}
                    />
                </View>

                <View className="border-t border-gray-300 py-3 flex-row justify-between items-center">
                    <View>
                        <Text className="font-medium text-gray-900">Sync local suspensions</Text>
                        <Text className="text-gray-500 text-sm mt-1">Turned Off</Text>
                    </View>

                    <Switch
                        value={syncSuspensions}
                        onValueChange={setSyncSuspensions}
                        trackColor={{ false: "#d6d6d6", true: "#CB2222" }}
                        thumbColor={syncSuspensions ? "#d6d6d6" : "#f4f3f4"}
                    />
                </View>

                <View className="border-t border-gray-300 py-3 flex-row justify-between items-center">
                    <View>
                        <Text className="font-medium text-gray-900">Sync to</Text>
                        <Text className="text-gray-500 text-sm mt-1">None</Text>
                    </View>

                    <View className="bg-red-400 rounded-full p-1 px-2 ml-auto">
                        <Text className="text-white font-semibold">PRO</Text>
                    </View>
                </View>

                <View className="h-12" />

                <Modal 
                    animationType="fade"
                    transparent={true}
                    visible={modalReminders}
                    onRequestClose={() => setModalReminders(false)}>

                    <View className="flex-1 bg-black/50 justify-center items-center">
                        <View className="bg-white rounded-xl p-6 w-4/5   max-w-sm shadow-lg">
                            <View className="mb-6 flex-row justify-between items-center">
                                <Text className="text-lg font-semibold text-gray-900">
                                    Remind me via
                                </Text>
                                <TouchableOpacity>
                                <X 
                                    size={24} 
                                    color="black" 
                                    strokeWidth={2} 
                                    onPress={() => setModalReminders(false)}
                                />
                            </TouchableOpacity>
                            </View>

                            <TouchableOpacity 
                                className="flex-row items-center mb-4"
                                onPress={() => handleReminders("Mobile push notification")}
                            >
                                <View className="w-5 h-5 rounded-full border-2 border-gray-400 items-center justify-center mr-3">
                                    {selectedReminder === "Mobile push notification" && (
                                        <View className="w-3 h-3 rounded-full bg-black" />
                                    )}
                                </View>
                                <Text className="text-base text-gray-900">
                                    Mobile Push notification
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                className="flex-row items-center"
                                onPress={() => handleReminders("Turn off notification")}
                            >
                                <View className="w-5 h-5 rounded-full border-2 border-gray-400 items-center justify-center mr-3">
                                    {selectedReminder === "Turn off notification" && (
                                        <View className="w-3 h-3 rounded-full bg-black" />
                                    )}
                                </View>
                                <Text className="text-base text-gray-900">
                                    Turn off notification
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                <Modal 
                    animationType="fade"
                    transparent={true}
                    visible={modalSnoozed}
                    onRequestClose={() => setModalSnoozed(false)}>

                    <View className="flex-1 bg-black/50 justify-center items-center">
                        <View className="bg-white rounded-xl p-6 w-4/5 max-w-sm shadow-lg">
                        <View className="mb-6 flex-row justify-between items-center">
                            <Text className="text-lg font-semibold text-gray-900">
                                When ignored...
                            </Text>
                            <TouchableOpacity>
                                <X 
                                    size={24} 
                                    color="black" 
                                    strokeWidth={2} 
                                    onPress={() => setModalSnoozed(false)}
                                />
                            </TouchableOpacity>
                        </View>

                            {["5 minutes", "10 minutes", "30 minutes", "Turn Off"].map((option) => (
                                <TouchableOpacity 
                                    key={option}
                                    className="flex-row items-center mb-4"
                                    onPress={() => handleSnoozed(option)}
                                >
                                    <View className="w-5 h-5 rounded-full border-2 border-gray-400 items-center justify-center mr-3">
                                        {selectedSnooze === option && (
                                            <View className="w-3 h-3 rounded-full bg-black" />
                                        )}
                                    </View>
                                    <Text className="text-base text-gray-900">
                                        {option}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </Modal>
            </ScrollView>
        </>
    );
}