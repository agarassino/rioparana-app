import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { usePurchases } from '../../src/hooks';
import { PaywallModal } from '../../src/components/ui';
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES } from '../../src/config/theme';

export default function ProfileScreen() {
  const { isPremium, isLoading, customerInfo, restore } = usePurchases();
  const [showPaywall, setShowPaywall] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleUpgrade = () => {
    setShowPaywall(true);
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    await restore();
    setIsRestoring(false);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.river} />
      </View>
    );
  }

  // Usuario Premium
  if (isPremium) {
    const expirationDate = customerInfo?.entitlements.active['Rio Parana Pro']?.expirationDate;
    const formattedDate = expirationDate
      ? new Date(expirationDate).toLocaleDateString('es-AR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.premiumHeader}>
          <View style={styles.crownBadge}>
            <FontAwesome6 name="crown" size={32} color={COLORS.warning} />
          </View>
          <Text style={styles.premiumTitle}>Rio Parana Pro</Text>
          <Text style={styles.premiumSubtitle}>Gracias por tu apoyo!</Text>
        </View>

        <View style={styles.subscriptionInfo}>
          <Text style={styles.infoLabel}>Estado de suscripcion</Text>
          <View style={styles.statusBadge}>
            <FontAwesome6 name="circle-check" size={14} color={COLORS.success} />
            <Text style={styles.statusText}>Activa</Text>
          </View>

          {formattedDate && (
            <>
              <Text style={styles.infoLabel}>Proxima renovacion</Text>
              <Text style={styles.infoValue}>{formattedDate}</Text>
            </>
          )}
        </View>

        <View style={styles.features}>
          <Text style={styles.featuresTitle}>Funciones desbloqueadas</Text>

          <FeatureRow icon="fish" text="Registro de capturas" unlocked />
          <FeatureRow icon="chart-line" text="Estadisticas de pesca" unlocked />
          <FeatureRow icon="bell" text="Alertas personalizadas" unlocked />
          <FeatureRow icon="star" text="Favoritos ilimitados" unlocked />
          <FeatureRow icon="rectangle-ad" text="Sin publicidad" unlocked />
        </View>

        <Text style={styles.manageText}>
          Podes administrar tu suscripcion desde la configuracion de Google Play
        </Text>

        <DataSourcesSection />
      </ScrollView>
    );
  }

  // Usuario Free
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <FontAwesome6 name="user-circle" size={80} color={COLORS.sand} />
        <Text style={styles.title}>Bienvenido a Rio Parana</Text>
        <Text style={styles.subtitle}>
          Actualizate a Pro para desbloquear todas las funciones
        </Text>
      </View>

      {/* Upgrade Card */}
      <Pressable style={styles.upgradeCard} onPress={handleUpgrade}>
        <View style={styles.upgradeHeader}>
          <FontAwesome6 name="crown" size={24} color={COLORS.warning} />
          <Text style={styles.upgradeTitle}>Rio Parana Pro</Text>
        </View>
        <Text style={styles.upgradeDescription}>
          Desbloquea capturas, estadisticas, alertas y mas
        </Text>
        <View style={styles.upgradeButton}>
          <Text style={styles.upgradeButtonText}>Ver planes</Text>
          <FontAwesome6 name="arrow-right" size={14} color={COLORS.white} />
        </View>
      </Pressable>

      {/* Features comparison */}
      <View style={styles.features}>
        <Text style={styles.featuresTitle}>Funciones Pro</Text>

        <FeatureRow icon="fish" text="Registro de capturas" />
        <FeatureRow icon="chart-line" text="Estadisticas de pesca" />
        <FeatureRow icon="bell" text="Alertas personalizadas" />
        <FeatureRow icon="star" text="Favoritos ilimitados" />
        <FeatureRow icon="rectangle-ad" text="Sin publicidad" />
      </View>

      {/* Restore */}
      <Pressable
        style={styles.restoreButton}
        onPress={handleRestore}
        disabled={isRestoring}
      >
        {isRestoring ? (
          <ActivityIndicator size="small" color={COLORS.river} />
        ) : (
          <Text style={styles.restoreText}>Restaurar compras</Text>
        )}
      </Pressable>

      <DataSourcesSection />

      {/* Paywall Modal (fallback) */}
      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchaseComplete={() => setShowPaywall(false)}
      />
    </ScrollView>
  );
}

interface FeatureRowProps {
  icon: string;
  text: string;
  unlocked?: boolean;
}

function FeatureRow({ icon, text, unlocked }: FeatureRowProps) {
  return (
    <View style={styles.featureRow}>
      <FontAwesome6
        name={icon as any}
        size={16}
        color={unlocked ? COLORS.river : COLORS.earthLight}
      />
      <Text style={[styles.featureText, !unlocked && styles.featureTextLocked]}>
        {text}
      </Text>
      {unlocked ? (
        <FontAwesome6 name="circle-check" size={16} color={COLORS.success} />
      ) : (
        <FontAwesome6 name="lock" size={14} color={COLORS.earthLight} />
      )}
    </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.sandLight,
  },

  // Header (Free)
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

  // Premium Header
  premiumHeader: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  crownBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.warning + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumTitle: {
    fontSize: FONT_SIZES['2xl'],
    color: COLORS.earthDark,
    marginTop: SPACING.md,
    fontFamily: 'Nunito_700Bold',
  },
  premiumSubtitle: {
    fontSize: FONT_SIZES.base,
    color: COLORS.earth,
    marginTop: SPACING.xs,
    fontFamily: 'Nunito_400Regular',
  },

  // Subscription Info
  subscriptionInfo: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  infoLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.earthLight,
    fontFamily: 'Nunito_600SemiBold',
    marginTop: SPACING.sm,
  },
  infoValue: {
    fontSize: FONT_SIZES.base,
    color: COLORS.earthDark,
    fontFamily: 'Nunito_400Regular',
    marginTop: SPACING.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  statusText: {
    fontSize: FONT_SIZES.base,
    color: COLORS.success,
    fontFamily: 'Nunito_600SemiBold',
    marginLeft: SPACING.xs,
  },

  // Upgrade Card
  upgradeCard: {
    backgroundColor: COLORS.riverDark,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upgradeTitle: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.white,
    fontFamily: 'Nunito_700Bold',
    marginLeft: SPACING.sm,
  },
  upgradeDescription: {
    fontSize: FONT_SIZES.base,
    color: COLORS.cream,
    fontFamily: 'Nunito_400Regular',
    marginTop: SPACING.sm,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.river,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
    alignSelf: 'flex-start',
  },
  upgradeButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.base,
    fontFamily: 'Nunito_600SemiBold',
    marginRight: SPACING.sm,
  },

  // Features
  features: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  featuresTitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.earthLight,
    fontFamily: 'Nunito_600SemiBold',
    marginBottom: SPACING.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  featureText: {
    flex: 1,
    marginLeft: SPACING.md,
    fontSize: FONT_SIZES.base,
    color: COLORS.earthDark,
    fontFamily: 'Nunito_400Regular',
  },
  featureTextLocked: {
    color: COLORS.earthLight,
  },

  // Restore
  restoreButton: {
    alignItems: 'center',
    padding: SPACING.md,
  },
  restoreText: {
    color: COLORS.river,
    fontSize: FONT_SIZES.base,
    fontFamily: 'Nunito_600SemiBold',
  },

  // Manage
  manageText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.earthLight,
    textAlign: 'center',
    fontFamily: 'Nunito_400Regular',
    marginTop: SPACING.md,
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
