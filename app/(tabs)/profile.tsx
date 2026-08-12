import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES } from '../../src/config/theme';

export default function ProfileScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <FontAwesome6 name="user-circle" size={80} color={COLORS.sand} />
        <Text style={styles.title}>Paraná Info</Text>
        <Text style={styles.subtitle}>
          Nivel del río en tiempo real, clima, pronóstico y noticias de la Prefectura Naval Argentina.
        </Text>
      </View>

      <DataSourcesSection />
    </ScrollView>
  );
}

const PNA_SOURCE_URL = 'https://contenidosweb.prefecturanaval.gob.ar/alturas';
const WEATHER_SOURCE_URL = 'https://open-meteo.com';
const NEWS_SOURCE_URL = 'https://www.argentina.gob.ar/prefecturanaval/noticias-pna';

function DataSourcesSection() {
  return (
    <View style={styles.aboutSection}>
      <Text style={styles.aboutTitle}>Fuentes de datos</Text>

      <Pressable
        style={styles.sourceRow}
        onPress={() => Linking.openURL(PNA_SOURCE_URL)}
      >
        <FontAwesome6 name="water" size={16} color={COLORS.river} />
        <View style={styles.sourceTextContainer}>
          <Text style={styles.sourceLabel}>Altura del rio</Text>
          <Text style={styles.sourceLink}>Prefectura Naval Argentina</Text>
        </View>
        <FontAwesome6 name="arrow-up-right-from-square" size={12} color={COLORS.earthLight} />
      </Pressable>

      <Pressable
        style={styles.sourceRow}
        onPress={() => Linking.openURL(WEATHER_SOURCE_URL)}
      >
        <FontAwesome6 name="cloud-sun" size={16} color={COLORS.river} />
        <View style={styles.sourceTextContainer}>
          <Text style={styles.sourceLabel}>Clima</Text>
          <Text style={styles.sourceLink}>Open-Meteo</Text>
        </View>
        <FontAwesome6 name="arrow-up-right-from-square" size={12} color={COLORS.earthLight} />
      </Pressable>

      <Pressable
        style={styles.sourceRow}
        onPress={() => Linking.openURL(NEWS_SOURCE_URL)}
      >
        <FontAwesome6 name="newspaper" size={16} color={COLORS.river} />
        <View style={styles.sourceTextContainer}>
          <Text style={styles.sourceLabel}>Noticias</Text>
          <Text style={styles.sourceLink}>Argentina.gob.ar (Prefectura Naval)</Text>
        </View>
        <FontAwesome6 name="arrow-up-right-from-square" size={12} color={COLORS.earthLight} />
      </Pressable>

      <Text style={styles.disclaimerText}>
        Esta aplicacion es un desarrollo independiente y no representa ni esta
        asociada a la Prefectura Naval Argentina ni a ningun otro organismo
        publico. Los datos de altura del rio se obtienen de la fuente oficial de
        la Prefectura Naval Argentina, las noticias del portal oficial del
        Gobierno de Argentina (argentina.gob.ar) y la informacion meteorologica
        de Open-Meteo, con fines exclusivamente informativos.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.sandLight,
  },
  scrollContent: {
    padding: SPACING.lg,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES['2xl'],
    color: COLORS.earthDark,
    marginTop: SPACING.lg,
    textAlign: 'center',
    fontFamily: 'Nunito_700Bold',
  },
  subtitle: {
    fontSize: FONT_SIZES.base,
    color: COLORS.earth,
    textAlign: 'center',
    marginTop: SPACING.sm,
    fontFamily: 'Nunito_400Regular',
  },

  // About / Data sources
  aboutSection: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  aboutTitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.earthLight,
    fontFamily: 'Nunito_600SemiBold',
    marginBottom: SPACING.md,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sourceTextContainer: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  sourceLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.earthLight,
    fontFamily: 'Nunito_400Regular',
  },
  sourceLink: {
    fontSize: FONT_SIZES.base,
    color: COLORS.river,
    fontFamily: 'Nunito_600SemiBold',
  },
  disclaimerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.earth,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 18,
    marginTop: SPACING.sm,
  },
});
