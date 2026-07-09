import { View, Text, StyleSheet } from 'react-native';
import { COLORS, BORDER_RADIUS } from '../../config/theme';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const colors: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: COLORS.successLight, text: COLORS.success },
  warning: { bg: COLORS.warningLight, text: COLORS.warning },
  error: { bg: COLORS.emergencyLight, text: COLORS.emergency },
  info: { bg: COLORS.infoLight, text: COLORS.river },
};

export function Badge({ label, variant = 'info' }: BadgeProps) {
  const { bg, text } = colors[variant];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
  },
  text: {
    fontSize: 12,
    fontFamily: 'Nunito_600SemiBold',
  },
});
