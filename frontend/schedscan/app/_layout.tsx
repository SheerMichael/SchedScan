import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import './global.css';
import { AuthProvider } from '../context/AuthContext';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function prepare() {
      try {
        // Add any async initialization here (fonts, etc.)
        // Small delay to ensure everything is ready
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.warn('App preparation error:', e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    if (appIsReady) {
      // Hide the splash screen once we're ready
      SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  useEffect(() => {
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any>;

      if (data?.type !== 'extraction_job') {
        return;
      }

      // Scanner has its own in-flight polling completion logic.
      if (pathname === '/Home/scanner') {
        return;
      }

      if (data?.status === 'done') {
        router.push('/Home/schedules');
      }
    });

    return () => {
      responseSub.remove();
    };
  }, [pathname, router]);

  if (!appIsReady) {
    return null;
  }

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="intro/intro" />
        <Stack.Screen name="intro/getstarted" />
        <Stack.Screen name="intro/login" />
        <Stack.Screen name="intro/signup" />
        <Stack.Screen name="Home" options={{ gestureEnabled: false, animation: 'none' }} />
        <Stack.Screen name="Parent" options={{ gestureEnabled: false, animation: 'none' }} />
        <Stack.Screen name="profile" options={{ gestureEnabled: false }} />
        <Stack.Screen name="payment" options={{ gestureEnabled: false }} />
      </Stack>
    </AuthProvider>
  );
}
