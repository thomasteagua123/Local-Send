import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "connection";

export async function initializeNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(
      CHANNEL_ID,
      {
        name: "Conexiones",
        importance:
          Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
      }
    );
  }

  const permissions =
    await Notifications.getPermissionsAsync();

  if (
    permissions.status !==
    Notifications.PermissionStatus.GRANTED
  ) {
    await Notifications.requestPermissionsAsync();
  }
}

export async function showConnectionNotification(
  deviceName: string
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "LocalSend",

        body: `Conexión establecida con ${deviceName}`,

        sound: "default",
      },

      trigger: null,
    });
  } catch (error) {
    console.error(
      "Error mostrando notificación:",
      error
    );
  }
}