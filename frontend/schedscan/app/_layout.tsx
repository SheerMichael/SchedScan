import { Stack } from "expo-router";
import './global.css';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>

    </Stack>
  );
}
