import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';
import { FontAwesome6 } from '@expo/vector-icons';

import { Card } from './ui';
import { useRiverHistory } from '../hooks';
import { CHART_DAYS, dayChange, lastDays, sparkPath, trendSummary } from '../services/riverTrend';
import { COLORS, SPACING, FONT_SIZES } from '../config/theme';

// Where the river has been over the last week, and what it did since yesterday.
// Renders nothing at all until there are two readings to join: Prefectura
// publishes about twice a day, so a new station has an empty history for its
// first day and a single dot is not a trend.

const HEIGHT = 120;
const PADDING = 10;

interface Props {
  stationId: string;
}

export function RiverTrend({ stationId }: Props) {
  const { data } = useRiverHistory(stationId);
  // Measured rather than assumed: the card width varies with the device, and a
  // curve drawn for the wrong width is worse than none.
  const [width, setWidth] = useState(0);

  const now = new Date();
  const points = useMemo(() => lastDays(data ?? [], CHART_DAYS, now), [data]);
  const line = width > 0 ? sparkPath(points, { width, height: HEIGHT, padding: PADDING }) : null;
  const day = dayChange(points, now);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Decided before anything is measured, so a station with no history yet shows
  // no card at all rather than an empty one with a heading in it. Prefectura
  // publishes about twice a day, so that is the state on a station's first day.
  if (points.length < 2) return null;

  const levels = points.map((p) => p.level);
  const min = Math.min(...levels);
  const max = Math.max(...levels);

  const poly = line ? line.points.map((p) => `${p.x},${p.y}`).join(' ') : '';
  const area = line
    ? `M${line.points[0].x},${HEIGHT} ` +
      line.points.map((p) => `L${p.x},${p.y}`).join(' ') +
      ` L${line.points[line.points.length - 1].x},${HEIGHT} Z`
    : '';

  const rising = day ? day.cm > 0 : false;
  const dayColor = day && day.cm === 0 ? COLORS.earthLight : rising ? COLORS.river : COLORS.earth;

  return (
    <Card>
      <Text style={styles.title}>Cómo viene el río</Text>
      <View onLayout={onLayout}>
      {day && (
        <View style={styles.dayRow}>
          <FontAwesome6
            name={day.cm === 0 ? 'minus' : rising ? 'arrow-up' : 'arrow-down'}
            size={16}
            color={dayColor}
          />
          <Text style={[styles.dayText, { color: dayColor }]}>
            {day.cm === 0 ? 'Sin cambios' : `${rising ? 'Subió' : 'Bajó'} ${Math.abs(day.cm)} cm`}
          </Text>
          <Text style={styles.dayDetail}>en las últimas {day.hours} h</Text>
        </View>
      )}

      <Text style={styles.summary}>{trendSummary(line)}</Text>

      {/* The first pass has no width yet: the card is already useful without
          the curve, so the badge and the sentence do not wait for it. */}
      {line && (
      <Svg width={width} height={HEIGHT} style={styles.chart}>
        {/* Filled to the baseline: the shape reads as a water level, where a
            bare stroke reads as an abstract squiggle. */}
        <Path d={area} fill={COLORS.infoLight} />
        <Polyline
          points={poly}
          fill="none"
          stroke={COLORS.river}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
      )}

      <Text style={styles.scale}>
        Mínima {min.toFixed(2)} m · máxima {max.toFixed(2)} m ·{' '}
        {points.length} {points.length === 1 ? 'medición' : 'mediciones'}
      </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.earthLight,
    marginBottom: SPACING.sm,
    fontFamily: 'Nunito_600SemiBold',
  },
  dayRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: SPACING.sm },
  dayText: { fontSize: FONT_SIZES.xl, marginLeft: 6, fontFamily: 'Nunito_700Bold' },
  dayDetail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.earthLight,
    marginLeft: 6,
    fontFamily: 'Nunito_400Regular',
  },
  summary: { fontSize: FONT_SIZES.base, color: COLORS.earth, fontFamily: 'Nunito_400Regular' },
  chart: { marginTop: SPACING.md },
  scale: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.earthLight,
    marginTop: SPACING.sm,
    fontFamily: 'Nunito_400Regular',
  },
});
