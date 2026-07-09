import { Stack } from 'expo-router';
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
import { COLORS } from '../src/config/theme';
import { PurchaseProvider } from '../src/context/PurchaseContext';

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

export default function RootLayout() {
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
      <PurchaseProvider>
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
        </Stack>
      </PurchaseProvider>
    </QueryClientProvider>
  );
}
