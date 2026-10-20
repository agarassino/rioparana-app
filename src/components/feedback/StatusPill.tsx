// src/components/feedback/StatusPill.tsx
import { StyleSheet, Text, View } from 'react-native';

import type { ThreadStatus } from '../../services/api/feedbackApi';
import { STATUS_LABELS } from '../../services/feedbackText';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../config/theme';

const TONES: Record<ThreadStatus, { bg: string; fg: string }> = {
  open: { bg: COLORS.infoLight, fg: COLORS.riverDark },
  answered: { bg: COLORS.successLight, fg: COLORS.success },
  archived: { bg: COLORS.sandLight, fg: COLORS.earthLight },
};

export function StatusPill({ status, unread }: { status: ThreadStatus; unread: boolean }) {
  const tone = TONES[status];
  return (
    <View style={styles.row}>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.text, { color: tone.fg }]}>{STATUS_LABELS[status]}</Text>
      </View>
      {unread && <View style={styles.dot} accessibilityLabel="Respuesta sin leer" accessible />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  pill: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.full },
  text: { fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.emergency },
});
