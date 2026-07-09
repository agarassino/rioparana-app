import { View, Text, ScrollView, StyleSheet, Pressable, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';

import { Card } from '../../src/components/ui';
import { STATIONS_BY_REGION } from '../../src/config/stations';
import { useLocation } from '../../src/hooks';
import { Station } from '../../src/types';
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES } from '../../src/config/theme';

export default function StationsScreen() {
  const router = useRouter();
  const { nearestStation } = useLocation();

  const openInMaps = (station: Station) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${station.latitude},${station.longitude}`;
    Linking.openURL(url);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.infoCard}>
        <View style={styles.infoRow}>
          <FontAwesome6 name="circle-info" size={16} color={COLORS.river} />
          <Text style={styles.infoText}>
            Toca una estacion para ver detalles o el icono de mapa para abrir en Google Maps.
          </Text>
        </View>
      </Card>

      {Object.entries(STATIONS_BY_REGION).map(([region, stations]) => (
        <View key={region} style={styles.region}>
          <Text style={styles.regionTitle}>{region}</Text>
          {stations.map((station) => (
            <Card key={station.id}>
              <View style={styles.stationRow}>
                <Pressable
                  style={styles.stationInfo}
                  onPress={() => router.push(`/river/${station.id}`)}
                >
                  <View style={[
                    styles.stationIcon,
                    station.id === nearestStation?.id && styles.nearestIcon
                  ]}>
                    <FontAwesome6
                      name="water"
                      size={16}
                      color={station.id === nearestStation?.id ? COLORS.cream : COLORS.earthLight}
                    />
                  </View>
                  <View style={styles.stationText}>
                    <View style={styles.stationNameRow}>
                      <Text style={styles.stationName}>{station.name}</Text>
                      {station.id === nearestStation?.id && (
                        <View style={styles.nearestBadge}>
                          <Text style={styles.nearestText}>Cercana</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.stationProvince}>{station.province}</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={styles.mapButton}
                  onPress={() => openInMaps(station)}
                >
                  <FontAwesome6 name="map-location-dot" size={20} color={COLORS.river} />
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.sandLight },
  content: { padding: SPACING.base },
  infoCard: { backgroundColor: COLORS.infoLight },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  infoText: { flex: 1, marginLeft: SPACING.sm, fontSize: FONT_SIZES.sm, color: COLORS.riverDark, fontFamily: 'Nunito_400Regular' },
  region: { marginBottom: SPACING.sm },
  regionTitle: { fontSize: FONT_SIZES.md, color: COLORS.earthDark, marginBottom: SPACING.sm, marginTop: SPACING.sm, fontFamily: 'Nunito_700Bold' },
  stationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stationInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stationIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.sand, justifyContent: 'center', alignItems: 'center'
  },
  nearestIcon: { backgroundColor: COLORS.river },
  stationText: { marginLeft: SPACING.md, flex: 1 },
  stationNameRow: { flexDirection: 'row', alignItems: 'center' },
  stationName: { fontSize: FONT_SIZES.md, color: COLORS.earthDark, fontFamily: 'Nunito_600SemiBold' },
  nearestBadge: {
    marginLeft: SPACING.sm, backgroundColor: COLORS.infoLight,
    paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.sm
  },
  nearestText: { fontSize: FONT_SIZES.xs, color: COLORS.riverDark, fontFamily: 'Nunito_600SemiBold' },
  stationProvince: { fontSize: FONT_SIZES.sm, color: COLORS.earth, fontFamily: 'Nunito_400Regular' },
  mapButton: { padding: SPACING.sm },
});
