import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Share,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';

import { Card, Badge } from '../../src/components/ui';
import { RiverAlert } from '../../src/components/RiverAlert';
import { RiverGauge } from '../../src/components/RiverGauge';
import { RiverTrend } from '../../src/components/RiverTrend';
import { useWaterLevel, useWeather, useDevicePing, useRiverHistory } from '../../src/hooks';
import { CHART_DAYS, dayChange, lastDays } from '../../src/services/riverTrend';
import { shareMessage } from '../../src/services/riverShare';
import { localitySlugFor } from '../../src/config/localityPages';
import { getStationById } from '../../src/config/stations';
import { calculateFishingCondition } from '../../src/services/api/riverApi';
import { FEATURES } from '../../src/config/features';
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES } from '../../src/config/theme';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function StationDetailScreen() {
  const { stationId } = useLocalSearchParams<{ stationId: string }>();
  const station = getStationById(stationId || '');

  const { data: waterLevel, isLoading: levelLoading } = useWaterLevel(stationId || '');
  useDevicePing(stationId || undefined);
  const { data: weather, isLoading: weatherLoading } = useWeather(
    station?.latitude || 0,
    station?.longitude || 0
  );
  // Read here as well as inside RiverTrend so the shared message can carry what
  // the river did since yesterday. React Query serves both from one request.
  const { data: history } = useRiverHistory(stationId || '');

  const onShare = async () => {
    if (!station || !waterLevel) return;
    const day = dayChange(lastDays(history ?? [], CHART_DAYS, new Date()), new Date());
    try {
      await Share.share({
        message: shareMessage(station.name, waterLevel, day, localitySlugFor(station.id)),
      });
    } catch {
      // A share the reader dismissed, or a sheet that would not open. Neither
      // is worth interrupting the screen for.
    }
  };

  if (!station) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Estacion no encontrada</Text>
      </View>
    );
  }

  const fishingCondition = waterLevel ? calculateFishingCondition(waterLevel) : null;

  const conditionConfig = {
    optimal: { label: 'Optimo', variant: 'success' as const },
    good: { label: 'Bueno', variant: 'info' as const },
    regular: { label: 'Regular', variant: 'warning' as const },
    poor: { label: 'Malo', variant: 'error' as const },
  };

  return (
    <>
      <Stack.Screen options={{ title: station.name }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Info de la estacion */}
        <Card>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.stationName}>{station.name}</Text>
              <Text style={styles.stationProvince}>{station.province}</Text>
            </View>
            {FEATURES.FISHING_ENABLED && fishingCondition && (
              <Badge
                label={conditionConfig[fishingCondition].label}
                variant={conditionConfig[fishingCondition].variant}
              />
            )}
          </View>
          <View style={styles.coordsRow}>
            <FontAwesome6 name="location-dot" size={12} color={COLORS.earthLight} />
            <Text style={styles.coords}>
              {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
            </Text>
          </View>
        </Card>

        {/* Nivel actual */}
        <Card>
          <Text style={styles.sectionTitle}>Nivel actual</Text>
          {levelLoading ? (
            <ActivityIndicator size="small" color={COLORS.river} />
          ) : waterLevel ? (
            <>
              <View style={styles.levelRow}>
                <Text style={styles.levelValue}>{waterLevel.level.toFixed(2)}</Text>
                <Text style={styles.levelUnit}>metros</Text>
              </View>
              <View style={styles.trendRow}>
                <View style={[
                  styles.trendBadge,
                  { backgroundColor: waterLevel.trend === 'rising' ? COLORS.infoLight :
                                     waterLevel.trend === 'falling' ? COLORS.warningLight : COLORS.sand }
                ]}>
                  <FontAwesome6
                    name={waterLevel.trend === 'rising' ? 'arrow-trend-up' :
                          waterLevel.trend === 'falling' ? 'arrow-trend-down' : 'minus'}
                    size={14}
                    color={waterLevel.trend === 'rising' ? COLORS.river :
                           waterLevel.trend === 'falling' ? COLORS.warning : COLORS.earthLight}
                  />
                  <Text style={[
                    styles.trendText,
                    { color: waterLevel.trend === 'rising' ? COLORS.river :
                             waterLevel.trend === 'falling' ? COLORS.warning : COLORS.earthLight }
                  ]}>
                    {waterLevel.trend === 'rising' ? 'Subiendo' :
                     waterLevel.trend === 'falling' ? 'Bajando' : 'Estable'}
                    {waterLevel.changeRate !== 0 && ` (${Math.abs(waterLevel.changeRate).toFixed(1)} cm/h)`}
                  </Text>
                </View>
              </View>
              {/* The number alone cannot say whether 2.42 m is a lot. The bar
                  answers that against the heights Prefectura publishes. */}
              <RiverGauge level={waterLevel} />
              <RiverAlert level={waterLevel} />
              <Text style={styles.timestamp}>
                Actualizado: {format(waterLevel.timestamp, "d 'de' MMMM, HH:mm", { locale: es })}
              </Text>
              <Pressable
                onPress={onShare}
                style={({ pressed }) => [styles.shareBtn, pressed && styles.shareBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Compartir la altura del río en ${station.name}`}
              >
                <FontAwesome6 name="share-nodes" size={14} color={COLORS.river} />
                <Text style={styles.shareText}>Compartir</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.noData}>Sin datos disponibles</Text>
          )}
        </Card>

        {/* Renders nothing at all until there are two readings to join, so a
            station with no history yet looks as it did before this existed. */}
        <RiverTrend stationId={station.id} />

        {/* Clima */}
        <Card>
          <Text style={styles.sectionTitle}>Clima en {station.name}</Text>
          {weatherLoading ? (
            <ActivityIndicator size="small" color={COLORS.river} />
          ) : weather ? (
            <>
              <View style={styles.weatherRow}>
                <FontAwesome6 name={weather.current.icon} size={36} color={COLORS.river} />
                <View style={styles.weatherInfo}>
                  <Text style={styles.tempValue}>{weather.current.temperature}°</Text>
                  <Text style={styles.weatherDesc}>{weather.current.description}</Text>
                </View>
                <View style={styles.weatherDetails}>
                  <View style={styles.weatherDetail}>
                    <FontAwesome6 name="wind" size={12} color={COLORS.earthLight} />
                    <Text style={styles.detailText}>{weather.current.windSpeed} km/h</Text>
                  </View>
                  <View style={styles.weatherDetail}>
                    <FontAwesome6 name="droplet" size={12} color={COLORS.earthLight} />
                    <Text style={styles.detailText}>{weather.current.humidity}%</Text>
                  </View>
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.noData}>Sin datos de clima</Text>
          )}
        </Card>

        {/* Consejo de pesca */}
        {FEATURES.FISHING_ENABLED && (
          <Card>
            <View style={styles.tipRow}>
              <FontAwesome6 name="lightbulb" size={18} color={COLORS.warning} />
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>Consejo de pesca</Text>
                <Text style={styles.tipText}>
                  {fishingCondition === 'optimal'
                    ? 'Condiciones ideales. El nivel del rio esta estable, es un buen momento para pescar.'
                    : fishingCondition === 'good'
                    ? 'Buenas condiciones generales. Busca zonas con corriente moderada.'
                    : fishingCondition === 'regular'
                    ? 'Condiciones regulares. La paciencia sera clave hoy.'
                    : 'No es el mejor momento. Considera esperar mejores condiciones.'}
                </Text>
              </View>
            </View>
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.sandLight },
  content: { padding: SPACING.base },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.sandLight },
  loadingText: { color: COLORS.earth, fontFamily: 'Nunito_400Regular' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  stationName: { fontSize: FONT_SIZES.xl, color: COLORS.earthDark, fontFamily: 'Nunito_700Bold' },
  stationProvince: { fontSize: FONT_SIZES.base, color: COLORS.earth, marginTop: 2, fontFamily: 'Nunito_400Regular' },
  coordsRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md },
  coords: { fontSize: FONT_SIZES.xs, color: COLORS.earthLight, marginLeft: 6, fontFamily: 'Nunito_400Regular' },
  sectionTitle: { fontSize: FONT_SIZES.sm, color: COLORS.earthLight, marginBottom: SPACING.sm, fontFamily: 'Nunito_600SemiBold' },
  levelRow: { flexDirection: 'row', alignItems: 'baseline' },
  levelValue: { fontSize: FONT_SIZES['5xl'], color: COLORS.river, fontFamily: 'Nunito_700Bold' },
  levelUnit: { fontSize: FONT_SIZES.md, color: COLORS.earthLight, marginLeft: SPACING.sm, fontFamily: 'Nunito_400Regular' },
  trendRow: { marginTop: SPACING.md },
  trendBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: BORDER_RADIUS.lg, alignSelf: 'flex-start' },
  trendText: { marginLeft: 6, fontSize: FONT_SIZES.base, fontFamily: 'Nunito_600SemiBold' },
  timestamp: { fontSize: FONT_SIZES.xs, color: COLORS.earthLight, marginTop: SPACING.md, fontFamily: 'Nunito_400Regular' },
  noData: { color: COLORS.earthLight, fontFamily: 'Nunito_400Regular' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.river,
  },
  shareBtnPressed: { backgroundColor: COLORS.infoLight },
  shareText: {
    marginLeft: 8,
    fontSize: FONT_SIZES.base,
    color: COLORS.river,
    fontFamily: 'Nunito_600SemiBold',
  },
  weatherRow: { flexDirection: 'row', alignItems: 'center' },
  weatherInfo: { marginLeft: SPACING.md, flex: 1 },
  tempValue: { fontSize: FONT_SIZES['3xl'], color: COLORS.earthDark, fontFamily: 'Nunito_700Bold' },
  weatherDesc: { fontSize: FONT_SIZES.base, color: COLORS.earth, fontFamily: 'Nunito_400Regular' },
  weatherDetails: { alignItems: 'flex-end' },
  weatherDetail: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detailText: { marginLeft: 6, fontSize: FONT_SIZES.sm, color: COLORS.earth, fontFamily: 'Nunito_400Regular' },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start' },
  tipContent: { flex: 1, marginLeft: SPACING.md },
  tipTitle: { fontSize: FONT_SIZES.base, color: COLORS.earthDark, fontFamily: 'Nunito_700Bold' },
  tipText: { fontSize: FONT_SIZES.sm, color: COLORS.earth, marginTop: 4, lineHeight: 20, fontFamily: 'Nunito_400Regular' },
});
