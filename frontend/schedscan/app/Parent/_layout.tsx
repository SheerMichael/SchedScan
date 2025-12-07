import { Slot, usePathname } from "expo-router";
import {SafeAreaView} from 'react-native-safe-area-context';
import { KeyboardAvoidingView, Platform } from "react-native";

export default function HomeLayout() {
  return (
    <SafeAreaView className="flex-1 bg-white">
        <KeyboardAvoidingView className="flex-1 "behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}>
        <Slot />
        </KeyboardAvoidingView>
    </SafeAreaView>
  );
}