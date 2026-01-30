import { useState, useEffect, useRef, useCallback } from "react";

import * as Device from "expo-device";
import * as Notification from "expo-notifications";

import Constants from "expo-constants";

import { Platform } from "react-native";
import { registerPushToken } from "./services/pushNotificationService";

export interface PushNotificationState {
    notification?: Notification.Notification;
    expoPushToken?: Notification.ExpoPushToken;
    isRegisteredWithBackend: boolean;
    registerTokenWithBackend: () => Promise<boolean>;
}

export const usePushNotification = (): PushNotificationState => {
    Notification.setNotificationHandler({
        handleNotification: async () => ({
            shouldPlaySound: false,
            shouldShowAlert: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
        }),
    });

    const [expoPushToken, setExpoPushToken] = useState<
        Notification.ExpoPushToken | undefined
    >();

    const [notification, setNotification] = useState<
        Notification.Notification | undefined
    >();

    const [isRegisteredWithBackend, setIsRegisteredWithBackend] = useState(false);

    const notificationListener = useRef<Notification.Subscription | null>(null);
    const responseListener = useRef<Notification.Subscription | null>(null);

    async function registerForPushNotificationsAsync() {
        let token;

        if (Device.isDevice) {
            const { status: existingStatus } =
                await Notification.getPermissionsAsync();

            let finalStatus = existingStatus;

            if (existingStatus !== "granted") {
                const { status } = await Notification.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== "granted") {
                alert("Failed to get push token for push notification!");
            }

            token = await Notification.getExpoPushTokenAsync({
                projectId: Constants.expoConfig?.extra?.eas.projectId,
            })

            if (Platform.OS === "android") {
                Notification.setNotificationChannelAsync("default", {
                    name: "default",
                    importance: Notification.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: "#FF231F7C",
                });
            }

            return token;
        } else {
            console.log("Must use physical device for Push Notifications");
            return;
        }
    }

    /**
     * Register the current push token with the backend.
     * Call this after user is authenticated.
     * Returns true if successful, false otherwise.
     */
    const registerTokenWithBackend = useCallback(async (): Promise<boolean> => {
        if (!expoPushToken?.data) {
            console.log("No push token available to register");
            return false;
        }

        try {
            await registerPushToken(expoPushToken.data);
            setIsRegisteredWithBackend(true);
            console.log("Push token registered with backend successfully");
            return true;
        } catch (error) {
            console.error("Failed to register push token with backend:", error);
            return false;
        }
    }, [expoPushToken]);

    useEffect(() => {
        registerForPushNotificationsAsync().then((token) => {
            setExpoPushToken(token);
        });

        notificationListener.current =
            Notification.addNotificationReceivedListener((notification) => {
                setNotification(notification);
            });

        responseListener.current =
            Notification.addNotificationResponseReceivedListener((response) => {
                console.log(response);
            });

        return () => {
            notificationListener.current?.remove();
            responseListener.current?.remove();
        };

    }, []);

    return {
        notification,
        expoPushToken,
        isRegisteredWithBackend,
        registerTokenWithBackend
    };
};