import { Tabs, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { FEATURES } from '../../src/config/features';
import { COLORS } from '../../src/config/theme';

export default function TabLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.river,
        tabBarInactiveTintColor: COLORS.earthLight,
        tabBarStyle: {
          backgroundColor: COLORS.cream,
          borderTopColor: COLORS.sand,
          borderTopWidth: 1,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontFamily: 'Nunito_600SemiBold',
          fontSize: 11,
        },
        headerStyle: {
          backgroundColor: COLORS.riverDark,
        },
        headerTintColor: COLORS.cream,
        headerTitleStyle: {
          fontFamily: 'Nunito_700Bold',
          fontSize: 18,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          headerTitle: 'PARANA INFO',
          tabBarIcon: ({ color }) => <FontAwesome6 name="house" size={20} color={color} />,
          // The only way in other than tapping a notification, which is a dead
          // end for anyone wanting to read the ones they already dismissed.
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/notificaciones')}
              hitSlop={12}
              style={{ paddingHorizontal: 16 }}
              accessibilityRole="button"
              accessibilityLabel="Ver notificaciones"
            >
              <FontAwesome6 name="bell" size={18} color={COLORS.cream} />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="stations"
        options={{
          title: 'Estaciones',
          tabBarIcon: ({ color }) => <FontAwesome6 name="water" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="captures"
        options={{
          title: 'Capturas',
          href: FEATURES.FISHING_ENABLED ? undefined : null,
          tabBarIcon: ({ color }) => <FontAwesome6 name="fish" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <FontAwesome6 name="user" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
