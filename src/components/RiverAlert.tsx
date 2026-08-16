import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';

import { WaterLevel } from '../types';
import { getAlertInfo, AlertStatus } from '../services/riverAlert';
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES } from '../config/theme';

const STYLE_BY_STATUS: Record<AlertStatus, { bg: string; fg: string; icon: string }> = {
  normal: { bg: COLORS.infoLight, fg: COLORS.river, icon: 'circle-check' },
  'near-alert': { bg: COLORS.warningLight, fg: COLORS.warning, icon: 'triangle-exclamation' },
  alert: { bg: COLORS.emergencyLight, fg: COLORS.emergency, icon: 'triangle-exclamation' },
  evacuation: { bg: COLORS.emergencyLight, fg: COLORS.emergency, icon: 'circle-exclamation' },
};

function describe(status: AlertStatus, metersToAlert: number, alertLevel: number): string {
  const away = Math.abs(metersToAlert).toFixed(2);
  switch (status) {
    case 'evacuation':
      return 'Supera el nivel de evacuación';
    case 'alert':
      return `Supera el nivel de alerta por ${away} m`;
    case 'near-alert':
      return `A ${away} m del nivel de alerta`;
    default:
      return `A ${away} m del nivel de alerta (${alertLevel.toFixed(2)} m)`;
  }
}

/**
 * Shows how much room is left before the river reaches the height at which
 * Prefectura declares alert. Renders nothing for stations without one.
 */
export function RiverAlert({ level }: { level: WaterLevel }) {
  const info = getAlertInfo(level);
  if (!info || level.alertLevel === undefined) return null;

  const palette = STYLE_BY_STATUS[info.status];

  return (
    <View style={[styles.row, { backgroundColor: palette.bg }]}>
      <FontAwesome6 name={palette.icon as never} size={13} color={palette.fg} />
      <Text style={[styles.text, { color: palette.fg }]}>
        {describe(info.status, info.metersToAlert, level.alertLevel)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    alignSelf: 'flex-start',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.sm,
  },
  text: {
    fontSize: FONT_SIZES.sm,
    fontFamily: 'Nunito_600SemiBold',
  },
});
