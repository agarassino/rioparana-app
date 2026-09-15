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
import { usePushRegistration } from '../src/hooks';

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
function useNotificationTaps(): void {
  const router = useRouter();

  useEffect(() => {
    const open = (data: unknown) => {
      if ((data as { screen?: string } | null)?.screen === 'notifications') {
        router.push('/notificaciones');
      }
    };

    // Cold start: the tap that launched the app is waiting here rather than
    // arriving as an event.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => open(r?.notification.request.content.data))
      .catch(() => undefined);

    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification.request.content.data),
    );

    return () => sub.remove();
  }, [router]);
}

export default function RootLayout() {
  usePushRegistration();
  useNotificationTaps();

  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

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
