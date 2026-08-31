import { View, Text, ScrollView, RefreshControl, StyleSheet, ActivityIndicator, Pressable, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { FontAwesome6 } from '@expo/vector-icons';

import { Card, Badge, NewsCard } from '../../src/components/ui';
import { RiverAlert } from '../../src/components/RiverAlert';
import { useLocation, useWaterLevel, useWeather, useNews, useDevicePing } from '../../src/hooks';
import { NEWS_PAGE_URL } from '../../src/services/api/newsApi';
import { calculateFishingCondition } from '../../src/services/api/riverApi';
import { FEATURES } from '../../src/config/features';
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES } from '../../src/config/theme';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function HomeScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { nearestStation, latitude, longitude, loading: locationLoading } = useLocation();

  useDevicePing();

  const { data: waterLevel, isLoading: levelLoading, refetch: refetchLevel } =
    useWaterLevel(nearestStation?.id || '');

  const { data: weather, isLoading: weatherLoading, refetch: refetchWeather } =
    useWeather(nearestStation?.latitude || latitude, nearestStation?.longitude || longitude);

  const { data: news, isLoading: newsLoading, refetch: refetchNews } = useNews();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchLevel(), refetchWeather(), refetchNews()]);
    setRefreshing(false);
  }, [refetchLevel, refetchWeather, refetchNews]);

  const fishingCondition = waterLevel ? calculateFishingCondition(waterLevel) : null;

  const conditionConfig = {
    optimal: { label: 'Optimo para pescar', variant: 'success' as const },
    good: { label: 'Buenas condiciones', variant: 'info' as const },
    regular: { label: 'Condiciones regulares', variant: 'warning' as const },
    poor: { label: 'No recomendado', variant: 'error' as const },
  };

  if (locationLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.river} />
        <Text style={styles.loadingText}>Obteniendo ubicacion...</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.river}
            colors={[COLORS.river]}
          />
        }
      >
      {/* Estado de pesca */}
      {FEATURES.FISHING_ENABLED && fishingCondition && (
        <Card style={styles.conditionCard}>
          <View style={styles.conditionHeader}>
            <Text style={styles.conditionLabel}>Condiciones actuales</Text>
            <Badge
              label={conditionConfig[fishingCondition].label}
              variant={conditionConfig[fishingCondition].variant}
            />
          </View>
        </Card>
      )}

      {/* Estacion mas cercana */}
      {nearestStation && (
        <Card onPress={() => router.push(`/river/${nearestStation.id}`)}>
          <Text style={styles.sectionTitle}>Estacion mas cercana</Text>
          <View style={styles.stationRow}>
            <View>
              <Text style={styles.stationName}>{nearestStation.name}</Text>
              <Text style={styles.stationProvince}>{nearestStation.province}</Text>
            </View>
            {levelLoading ? (
              <ActivityIndicator size="small" color={COLORS.river} />
            ) : waterLevel ? (
              <View style={styles.levelContainer}>
                <Text style={styles.levelValue}>{waterLevel.level.toFixed(2)}</Text>
                <Text style={styles.levelUnit}>m</Text>
                <FontAwesome6
                  name={waterLevel.trend === 'rising' ? 'arrow-trend-up' :
                        waterLevel.trend === 'falling' ? 'arrow-trend-down' : 'minus'}
                  size={16}
                  color={waterLevel.trend === 'rising' ? COLORS.river :
                         waterLevel.trend === 'falling' ? COLORS.warning : COLORS.earthLight}
                  style={styles.trendIcon}
                />
              </View>
            ) : (
              <Text style={styles.noData}>Sin datos</Text>
            )}
          </View>
          {waterLevel && <RiverAlert level={waterLevel} />}
        </Card>
      )}

      {/* Clima */}
      <Card>
        <Text style={styles.sectionTitle}>Clima</Text>
        {weatherLoading ? (
          <ActivityIndicator size="small" color={COLORS.river} />
        ) : weather ? (
          <View style={styles.weatherRow}>
            <View style={styles.weatherMain}>
              <FontAwesome6 name={weather.current.icon} size={36} color={COLORS.river} />
              <View style={styles.weatherTemp}>
                <Text style={styles.tempValue}>{weather.current.temperature}°</Text>
                <Text style={styles.weatherDesc}>{weather.current.description}</Text>
              </View>
            </View>
            <View style={styles.weatherDetails}>
              <View style={styles.weatherDetail}>
                <FontAwesome6 name="wind" size={14} color={COLORS.earthLight} />
                <Text style={styles.detailText}>{weather.current.windSpeed} km/h</Text>
              </View>
              <View style={styles.weatherDetail}>
                <FontAwesome6 name="droplet" size={14} color={COLORS.earthLight} />
                <Text style={styles.detailText}>{weather.current.humidity}%</Text>
              </View>
            </View>
          </View>
        ) : (
          <Text style={styles.noData}>Sin datos de clima</Text>
        )}
      </Card>

      {/* Pronostico */}
      {weather && (
        <Card>
          <Text style={styles.sectionTitle}>Pronostico 7 dias</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {weather.daily.map((day, index) => (
              <View key={index} style={styles.forecastDay}>
                <Text style={styles.forecastDayName}>
                  {index === 0 ? 'Hoy' : format(day.date, 'EEE', { locale: es })}
                </Text>
                <FontAwesome6 name={day.icon} size={20} color={COLORS.river} />
                <Text style={styles.forecastTemp}>{day.tempMax}°</Text>
                <Text style={styles.forecastTempMin}>{day.tempMin}°</Text>
              </View>
            ))}
          </ScrollView>
        </Card>
      )}

      {/* Noticias Prefectura Naval */}
      <Card>
        <Text style={styles.sectionTitle}>Noticias Prefectura Naval</Text>
        <Pressable onPress={() => Linking.openURL(NEWS_PAGE_URL)}>
          <Text style={styles.newsSource}>
            Fuente oficial: Argentina.gob.ar (Prefectura Naval)
          </Text>
        </Pressable>
        {newsLoading ? (
          <ActivityIndicator size="small" color={COLORS.river} />
        ) : news && news.length > 0 ? (
          <View>
            {news.slice(0, 4).map((item) => (
              <NewsCard key={item.id} news={item} />
            ))}
            <Pressable
              style={styles.moreNewsButton}
              onPress={() => Linking.openURL(NEWS_PAGE_URL)}
            >
              <Text style={styles.moreNewsText}>Ver mas noticias</Text>
              <FontAwesome6 name="arrow-right" size={12} color={COLORS.river} />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => Linking.openURL(NEWS_PAGE_URL)}>
            <Text style={styles.noData}>Visita el sitio de Prefectura Naval</Text>
          </Pressable>
        )}
      </Card>
      </ScrollView>

      {/* Boton Emergencia Prefectura - sticky en la parte inferior */}
      <View style={styles.stickyButtonContainer}>
        <Pressable
          style={styles.emergencyButton}
          onPress={() => Linking.openURL('tel:106')}
        >
          <View style={styles.emergencyContent}>
            <FontAwesome6 name="phone" size={24} color={COLORS.white} />
            <View style={styles.emergencyText}>
              <Text style={styles.emergencyTitle}>EMERGENCIA NAUTICA</Text>
              <Text style={styles.emergencySubtitle}>Prefectura Naval Argentina - 106</Text>
            </View>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: COLORS.sandLight },
  container: { flex: 1 },
  content: { padding: SPACING.base, paddingBottom: SPACING.xl },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.sandLight },
  loadingText: { marginTop: SPACING.md, color: COLORS.earth, fontFamily: 'Nunito_400Regular' },
  stickyButtonContainer: {
    padding: SPACING.base,
    paddingTop: SPACING.sm,
    backgroundColor: COLORS.sandLight,
    borderTopWidth: 1,
    borderTopColor: COLORS.sand,
  },
  emergencyButton: {
    backgroundColor: COLORS.emergency,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.base,
    shadowColor: COLORS.earthDark,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  emergencyContent: { flexDirection: 'row', alignItems: 'center' },
  emergencyText: { marginLeft: SPACING.base, flex: 1 },
  emergencyTitle: { color: COLORS.white, fontSize: FONT_SIZES.md, fontFamily: 'Nunito_700Bold' },
  emergencySubtitle: { color: COLORS.emergencyLight, fontSize: FONT_SIZES.base, marginTop: 2, fontFamily: 'Nunito_400Regular' },
  conditionCard: { backgroundColor: COLORS.river },
  conditionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  conditionLabel: { color: COLORS.cream, fontSize: FONT_SIZES.base, fontFamily: 'Nunito_600SemiBold' },
  sectionTitle: { fontSize: FONT_SIZES.base, color: COLORS.earthLight, marginBottom: SPACING.sm, fontFamily: 'Nunito_600SemiBold' },
  stationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stationName: { fontSize: FONT_SIZES.lg, color: COLORS.earthDark, fontFamily: 'Nunito_700Bold' },
  stationProvince: { fontSize: FONT_SIZES.base, color: COLORS.earth, fontFamily: 'Nunito_400Regular' },
  levelContainer: { flexDirection: 'row', alignItems: 'baseline' },
  levelValue: { fontSize: FONT_SIZES['3xl'], color: COLORS.river, fontFamily: 'Nunito_700Bold' },
  levelUnit: { fontSize: FONT_SIZES.base, color: COLORS.earthLight, marginLeft: 4, fontFamily: 'Nunito_400Regular' },
  trendIcon: { marginLeft: SPACING.sm },
  noData: { color: COLORS.earthLight, fontFamily: 'Nunito_400Regular' },
  weatherRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weatherMain: { flexDirection: 'row', alignItems: 'center' },
  weatherTemp: { marginLeft: SPACING.md },
  tempValue: { fontSize: FONT_SIZES['4xl'], color: COLORS.earthDark, fontFamily: 'Nunito_700Bold' },
  weatherDesc: { fontSize: FONT_SIZES.base, color: COLORS.earth, fontFamily: 'Nunito_400Regular' },
  weatherDetails: { alignItems: 'flex-end' },
  weatherDetail: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detailText: { marginLeft: 6, fontSize: FONT_SIZES.base, color: COLORS.earth, fontFamily: 'Nunito_400Regular' },
  forecastDay: { alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  forecastDayName: { fontSize: FONT_SIZES.xs, color: COLORS.earthLight, marginBottom: 4, textTransform: 'capitalize', fontFamily: 'Nunito_600SemiBold' },
  forecastTemp: { fontSize: FONT_SIZES.base, color: COLORS.earthDark, marginTop: 4, fontFamily: 'Nunito_700Bold' },
  forecastTempMin: { fontSize: FONT_SIZES.xs, color: COLORS.earthLight, fontFamily: 'Nunito_400Regular' },
  moreNewsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  moreNewsText: {
    fontSize: FONT_SIZES.base,
    color: COLORS.river,
    fontFamily: 'Nunito_600SemiBold',
    marginRight: SPACING.sm,
  },
  newsSource: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.earthLight,
    fontFamily: 'Nunito_400Regular',
    marginBottom: SPACING.sm,
    textDecorationLine: 'underline',
  },
});
