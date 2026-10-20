// src/components/feedback/KindChips.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FeedbackKind } from '../../services/api/feedbackApi';
import { KIND_OPTIONS } from '../../services/feedbackText';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../config/theme';

export function KindChips({ value, onChange }: { value: FeedbackKind; onChange: (k: FeedbackKind) => void }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {KIND_OPTIONS.map(({ kind, label }) => {
        const selected = kind === value;
        return (
          <Pressable
            key={kind}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(kind)}
            style={[styles.chip, selected && styles.selected]}
          >
            <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.cream, borderWidth: 1, borderColor: COLORS.sand },
  selected: { backgroundColor: COLORS.river, borderColor: COLORS.river },
  text: { fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.sm, color: COLORS.earth },
  selectedText: { color: COLORS.white },
});
