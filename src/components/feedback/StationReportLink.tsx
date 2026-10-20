// src/components/feedback/StationReportLink.tsx
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { COLORS, FONT_SIZES, SPACING } from '../../config/theme';

export function StationReportLink({ stationId }: { stationId: string }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      style={styles.link}
      onPress={() => router.push({ pathname: '/contacto', params: { kind: 'bug', stationId } })}
    >
      <Text style={styles.text}>¿Ves algo mal en este dato? Avisanos →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { paddingVertical: SPACING.sm, marginBottom: SPACING.base, alignSelf: 'flex-start' },
  text: { fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.sm, color: COLORS.river },
});
