import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { getDeviceId } from '../services/deviceId';
import { registerPushToken } from '../services/api/backend';
import { resolvePushToken } from '../services/pushRegistration';

// Asks once, on app start, and tells the backend the answer either way —
// including "no", which is what clears a token after the reader turns
// notifications off in system settings.
export function usePushRegistration(): void {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (Platform.OS === 'android') {
        // Android needs a channel before any notification can be shown, and
        // creating it is what makes the app appear in system settings at all.
        await Notifications.setNotificationChannelAsync('river-daily', {
          name: 'Altura del río',
          importance: Notifications.AndroidImportance.DEFAULT,
        }).catch(() => undefined);
      }

      const token = await resolvePushToken({
        isDevice: Device.isDevice,
        getPermissions: () => Notifications.getPermissionsAsync(),
        requestPermissions: () => Notifications.requestPermissionsAsync(),
        getToken: () => Notifications.getExpoPushTokenAsync(),
      });

      if (cancelled) return;

      const deviceId = await getDeviceId();
      if (cancelled || !deviceId) return;

      // Sent even when the token is null: that is how a device that turned
      // notifications off stops being counted as reachable.
      await registerPushToken(deviceId, token);
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
