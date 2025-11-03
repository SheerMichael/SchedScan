import { Stack } from "expo-router";
import './global.css';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="intro/intro" />
        <Stack.Screen name="intro/getstarted" />
        <Stack.Screen name="intro/login" />
        <Stack.Screen name="intro/signup" />
      </Stack>
    </AuthProvider>
  );
}
