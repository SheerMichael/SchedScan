import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import './global.css';
import { AuthProvider } from '../context/AuthContext';
import api from '../services/api';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const handledExtractionJobIdsRef = useRef<Set<string>>(new Set());

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
    const handleExtractionNotification = async (rawData: unknown) => {
      const data = (rawData ?? {}) as Record<string, any>;
      const jobId = typeof data?.job_id === 'string' ? data.job_id : '';

      if (data?.type !== 'extraction_job') {
        return;
      }

      if (jobId && handledExtractionJobIdsRef.current.has(jobId)) {
        return;
      }

      // Scanner owns active extraction UX and polling lifecycle.
      if (pathname === '/Home/scanner') {
        return;
      }

      if (data?.status === 'failed' && jobId) {
        handledExtractionJobIdsRef.current.add(jobId);
        try {
          const response = await api.get(`/extraction-jobs/${jobId}/`, {
            timeout: 20000,
          });
          const failureCategory = String(response.data?.failure_category || '').toLowerCase();
          const alertTitle = failureCategory === 'ownership_mismatch'
            ? 'COR Ownership Check Failed'
            : 'Extraction Failed';
          const failureMessage =
            response.data?.message ||
            "We couldn't read your schedule. Please try re-uploading.";

          Alert.alert(
            alertTitle,
            failureMessage,
            [
              {
                text: 'Open Scanner',
                onPress: () => router.push('/Home/scanner'),
              },
              {
                text: 'Dismiss',
                style: 'cancel',
              },
            ]
          );
        } catch {
          Alert.alert(
            'Extraction Failed',
            "We couldn't read your schedule. Please try re-uploading.",
            [
              {
                text: 'Open Scanner',
                onPress: () => router.push('/Home/scanner'),
              },
              {
                text: 'Dismiss',
                style: 'cancel',
              },
            ]
          );
        }
        return;
      }

      if (data?.status === 'done') {
        if (jobId) {
          handledExtractionJobIdsRef.current.add(jobId);
        }
        router.push('/Home/schedules');
      }
    };

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      handleExtractionNotification(notification.request.content.data).catch((error) => {
        console.warn('Failed to handle extraction notification:', error);
      });
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleExtractionNotification(response.notification.request.content.data).catch((error) => {
        console.warn('Failed to handle extraction notification response:', error);
      });
    });

    return () => {
      receivedSub.remove();
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
