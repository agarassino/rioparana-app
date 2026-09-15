import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card } from '../src/components/ui';
import { useNotificationHistory } from '../src/hooks';
import { COLORS, SPACING, FONT_SIZES } from '../src/config/theme';
import type { StoredNotification } from '../src/services/api/backend';

// What the app has sent. Read from the server rather than collected on the
// device, so the list survives a reinstall and says what was really sent
// instead of what happened to arrive while the app was open.

function whenLabel(iso: string): string {
  const at = new Date(iso);
  if (isToday(at)) return `Hoy ${format(at, 'HH:mm')}`;
  if (isYesterday(at)) return `Ayer ${format(at, 'HH:mm')}`;

  return format(at, "d 'de' MMMM, HH:mm", { locale: es });
}

export default function NotificationsScreen() {
  const { data, isLoading, refetch, isRefetching } = useNotificationHistory();
  const router = useRouter();

  const renderItem = ({ item }: { item: StoredNotification }) => (
    <Card>
      <Text style={styles.when}>{whenLabel(item.sentAt)}</Text>
      <Text
        style={styles.title}
        onPress={() => router.push(`/river/${item.stationId}`)}
        accessibilityRole="link"
      >
        {item.title}
      </Text>
      <Text style={styles.body}>{item.body}</Text>
    </Card>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Notificaciones' }} />

      {isLoading ? (
        <View style={styles.centre}>
          <ActivityIndicator size="small" color={COLORS.river} />
        </View>
      ) : (
        <FlatList
          style={styles.container}
          contentContainerStyle={styles.content}
          data={data ?? []}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.river} />
          }
          ListEmptyComponent={
            // Said plainly, because an empty list here is the normal state for
            // a new install rather than a failure.
            <View style={styles.centre}>
              <FontAwesome6 name="bell" size={28} color={COLORS.earthLight} />
              <Text style={styles.emptyTitle}>Todavía no hay notificaciones</Text>
              <Text style={styles.emptyBody}>
                Cada mañana vas a recibir la altura del río en la estación que más consultás.
              </Text>
            </View>
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.sandLight },
  content: { padding: SPACING.base, flexGrow: 1 },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.sandLight,
  },
  when: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.earthLight,
    fontFamily: 'Nunito_400Regular',
    marginBottom: 2,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.earthDark,
    fontFamily: 'Nunito_700Bold',
  },
  body: {
    fontSize: FONT_SIZES.base,
    color: COLORS.earth,
    marginTop: 4,
    lineHeight: 20,
    fontFamily: 'Nunito_400Regular',
  },
  emptyTitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.earth,
    fontFamily: 'Nunito_700Bold',
    marginTop: SPACING.md,
  },
  emptyBody: {
    fontSize: FONT_SIZES.base,
    color: COLORS.earthLight,
    fontFamily: 'Nunito_400Regular',
    textAlign: 'center',
    marginTop: SPACING.xs,
    lineHeight: 20,
  },
});
