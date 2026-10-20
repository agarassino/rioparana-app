import { routeForNotification } from '../src/services/notificationRoute';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from '@expo-google-fonts/nunito';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { COLORS } from '../src/config/theme';
import { useDeviceRegistration, usePushRegistration } from '../src/hooks';

// Mantener splash screen visible mientras cargan las fuentes
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
    },
  },
});

// A tapped notification carries { screen: 'notifications' }, set by the server
// when it composed the message. Handled at the root so it works whether the app
// was cold, backgrounded, or already open.
// A tapped notification says where it leads: the daily one to the list, a
// reply to its thread. Handled at the root so it works whether the app was
// cold, backgrounded, or already open.
function useNotificationTaps(enabled: boolean): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const open = (data: unknown) => {
      const route = routeForNotification(data);
      if (active && route) router.push(route);
    };

    // Cold start: the tap that launched the app is waiting here rather than
    // arriving as an event.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => open(r?.notification.request.content.data))
      .catch(() => undefined);

    const tapped = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification.request.content.data),
    );

    // A reply arriving while the app is open refreshes the list and its dot.
    const received = Notifications.addNotificationReceivedListener((n) => {
      if ((n.request.content.data as { type?: unknown } | null)?.type === 'feedback_reply') {
        void queryClient.invalidateQueries({ queryKey: ['feedback'] });
      }
    });

    return () => {
      active = false;
      tapped.remove();
      received.remove();
    };
  }, [router, enabled]);
}

export default function RootLayout() {
  useDeviceRegistration();
  usePushRegistration();

  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  useNotificationTaps(fontsLoaded);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.riverDark }}>
        <ActivityIndicator size="large" color={COLORS.cream} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.riverDark },
            headerTintColor: COLORS.cream,
            headerTitleStyle: { fontFamily: 'Nunito_700Bold' },
          }}
        >
          <Stack.Screen name="contacto/index" options={{ title: 'Contacto y sugerencias', headerBackTitle: 'Volver' }} />
          <Stack.Screen name="contacto/[threadId]" options={{ title: 'Conversación', headerBackTitle: 'Volver' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="river/[stationId]"
            options={{
              title: 'Estacion',
              headerBackTitle: 'Volver',
            }}
          />
          <Stack.Screen
            name="notificaciones"
            options={{ title: 'Notificaciones', headerBackTitle: 'Volver' }}
          />
        </Stack>
    </QueryClientProvider>
  );
}
