import { Tabs } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { FEATURES } from '../../src/config/features';
import { COLORS } from '../../src/config/theme';

export default function TabLayout() {
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
