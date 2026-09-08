import { View, Text, StyleSheet } from 'react-native';

import { WaterLevel } from '../types';
import { gaugeGeometry } from '../services/riverGauge';
import { COLORS, SPACING, FONT_SIZES } from '../config/theme';

// The height as a bar rather than a sentence. Plain views, no SVG: a track with
// a fill and two marks is what View and flexbox already are, and the chart is
// the only thing here that needs a drawing surface.

const TRACK_H = 12;

// Past this point on the track a centred label runs off the right edge, so it
// is anchored to its mark instead.
const END_ZONE = 70;

interface Props {
  level: WaterLevel;
}

export function RiverGauge({ level }: Props) {
  const g = gaugeGeometry(level);
  // Without an alert height there is no scale, and a bar from zero to nowhere
  // says less than the number above it.
  if (!g) return null;

  const danger = g.status !== 'normal';
  const fillColor = danger ? COLORS.emergency : COLORS.river;

  const mark = (at: number, label: string, color: string, below: boolean) => (
    <View style={[styles.mark, { left: `${at}%` }]} key={label}>
      <View style={[styles.markLine, { backgroundColor: color }]} />
      <Text
        style={[
          styles.markLabel,
          below ? styles.markLabelBelow : styles.markLabelAbove,
          { color },
          at > END_ZONE ? styles.markLabelEnd : styles.markLabelCentred,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        `Nivel ${level.level.toFixed(2)} metros. ` +
        `Alerta a ${level.alertLevel?.toFixed(2)} metros` +
        (level.evacuationLevel === undefined
          ? '.'
          : `, evacuación a ${level.evacuationLevel.toFixed(2)} metros.`)
      }
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${g.fill}%`, backgroundColor: fillColor }]} />
        {level.alertLevel !== undefined &&
          mark(g.alertAt, `Alerta ${level.alertLevel.toFixed(2)}`, COLORS.earthLight, false)}
        {g.evacAt !== null && level.evacuationLevel !== undefined &&
          mark(g.evacAt, `Evac. ${level.evacuationLevel.toFixed(2)}`, COLORS.emergency, true)}
      </View>
      {g.belowZero && (
        // The bar is empty at zero and stays empty below it, so the only way to
        // tell -0.40 m from 0.00 m is to say so.
        <Text style={styles.belowZero}>Por debajo del cero del hidrómetro</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Room above and below the track for the two labels, which sit on opposite
  // sides because alert and evacuation are only centimetres apart.
  wrap: { marginTop: SPACING.lg, marginBottom: SPACING.xl },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: COLORS.sand,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: TRACK_H / 2 },
  mark: { position: 'absolute', top: -4, bottom: -4 },
  markLine: { width: 2, flex: 1, opacity: 0.65 },
  markLabel: {
    position: 'absolute',
    fontSize: FONT_SIZES.xs,
    fontFamily: 'Nunito_600SemiBold',
    width: 110,
  },
  markLabelAbove: { bottom: TRACK_H + 10 },
  markLabelBelow: { top: TRACK_H + 10 },
  markLabelCentred: { left: -55, textAlign: 'center' },
  markLabelEnd: { right: 4, textAlign: 'right' },
  belowZero: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.earthLight,
    fontFamily: 'Nunito_400Regular',
  },
});
