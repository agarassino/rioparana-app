// src/components/feedback/FeedbackHomeCard.tsx
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';

import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../config/theme';

export function FeedbackHomeCard() {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" style={styles.card} onPress={() => router.push('/contacto')}>
      <FontAwesome6 name="comment-dots" size={18} color={COLORS.river} />
      <Text style={styles.text}>¿Una idea o un error? Escribinos: leemos todo y te respondemos acá en la app.</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.cream, borderRadius: BORDER_RADIUS.lg, padding: SPACING.base, marginBottom: SPACING.base },
  text: { flex: 1, fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.base, color: COLORS.earthDark, lineHeight: 20 },
});
