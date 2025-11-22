import { Slot, usePathname } from "expo-router";
import Footer from "./Footer";
import {SafeAreaView} from 'react-native-safe-area-context';
import { KeyboardAvoidingView, Platform } from "react-native";

export default function HomeLayout() {
  const pathname = usePathname();

  const hideFooterOn = [
    "/Home/notification",
    "/Home/scanner",
    "/Home/Schedules/faculty",
    "/Home/Schedules/student",
    "/Home/Reminders/edit_reminders",
  ];

  const shouldHideFooter = hideFooterOn.includes(pathname);

  return (
    <SafeAreaView className="flex-1 bg-white">
        <KeyboardAvoidingView className="flex-1 "behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}>
        <Slot />
        </KeyboardAvoidingView>
        {!shouldHideFooter && <Footer />}
    </SafeAreaView>
  );
}