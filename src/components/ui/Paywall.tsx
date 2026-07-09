import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { usePurchases } from '../../hooks';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../config/theme';

interface PaywallProps {
  onClose?: () => void;
  onPurchaseComplete?: () => void;
}

/**
 * Componente que muestra el Paywall de RevenueCat
 * Usa la UI nativa de RevenueCat si está disponible, sino muestra un fallback
 */
export function Paywall({ onClose, onPurchaseComplete }: PaywallProps) {
  const { isLoading, monthlyPackage, purchase, restore, error } = usePurchases();
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePurchase = async () => {
    if (!monthlyPackage) {
      Alert.alert('Error', 'No hay productos disponibles');
      return;
    }

    setIsProcessing(true);
    const success = await purchase(monthlyPackage);
    setIsProcessing(false);

    if (success) {
      Alert.alert('Exito', 'Ahora sos usuario Pro!', [
        { text: 'OK', onPress: onPurchaseComplete },
      ]);
    }
  };

  const handleRestore = async () => {
    setIsProcessing(true);
    const success = await restore();
    setIsProcessing(false);

    if (success) {
      Alert.alert('Restaurado', 'Tu suscripcion fue restaurada!', [
        { text: 'OK', onPress: onPurchaseComplete },
      ]);
    } else {
      Alert.alert('Sin compras', 'No se encontraron compras previas');
    }
  };

  if (isLoading || isProcessing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.river} />
        <Text style={styles.loadingText}>
          {isProcessing ? 'Procesando...' : 'Cargando...'}
        </Text>
      </View>
    );
  }

  const price = monthlyPackage?.product.priceString || '$2.99';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <FontAwesome6 name="crown" size={48} color={COLORS.warning} />
        <Text style={styles.title}>Rio Parana Pro</Text>
        <Text style={styles.subtitle}>Desbloquea todas las funciones</Text>
      </View>

      {/* Features */}
      <View style={styles.features}>
        <FeatureItem icon="fish" text="Registra tus capturas de pesca" />
        <FeatureItem icon="chart-line" text="Estadisticas detalladas" />
        <FeatureItem icon="bell" text="Alertas personalizadas" />
        <FeatureItem icon="star" text="Favoritos ilimitados" />
        <FeatureItem icon="rectangle-ad" text="Sin publicidad" crossed />
      </View>

      {/* Price */}
      <View style={styles.priceContainer}>
        <Text style={styles.price}>{price}</Text>
        <Text style={styles.priceLabel}>/mes</Text>
      </View>

      {/* Error */}
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      {/* Buttons */}
      <Pressable style={styles.purchaseButton} onPress={handlePurchase}>
        <Text style={styles.purchaseButtonText}>Suscribirse</Text>
      </Pressable>

      <Pressable style={styles.restoreButton} onPress={handleRestore}>
        <Text style={styles.restoreButtonText}>Restaurar compras</Text>
      </Pressable>

      {/* Terms */}
      <Text style={styles.terms}>
        La suscripcion se renueva automaticamente. Podes cancelar en cualquier momento desde la configuracion de tu cuenta.
      </Text>

      {/* Close button */}
      {onClose && (
        <Pressable style={styles.closeButton} onPress={onClose}>
          <FontAwesome6 name="xmark" size={20} color={COLORS.earthLight} />
        </Pressable>
      )}
    </View>
  );
}

interface FeatureItemProps {
  icon: string;
  text: string;
  crossed?: boolean;
}

function FeatureItem({ icon, text, crossed }: FeatureItemProps) {
  return (
    <View style={styles.featureItem}>
      <FontAwesome6
        name={crossed ? 'circle-xmark' : 'circle-check'}
        size={20}
        color={crossed ? COLORS.emergency : COLORS.success}
      />
      <Text style={[styles.featureText, crossed && styles.featureTextCrossed]}>
        {text}
      </Text>
    </View>
  );
}

// Placeholder para presentPaywall - usar PaywallModal en su lugar
export async function presentPaywall(): Promise<boolean> {
  // Esta función ya no usa el UI nativo de RevenueCat
  // Usar el componente PaywallModal en su lugar
  console.log('Use PaywallModal component instead of presentPaywall()');
  return false;
}

// Placeholder para presentPaywallIfNeeded
export async function presentPaywallIfNeeded(): Promise<boolean> {
  console.log('Use PaywallModal component instead of presentPaywallIfNeeded()');
  return false;
}

/**
 * Modal wrapper para mostrar el Paywall como modal
 */
interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseComplete?: () => void;
}

export function PaywallModal({ visible, onClose, onPurchaseComplete }: PaywallModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <Paywall onClose={onClose} onPurchaseComplete={onPurchaseComplete} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.sandLight,
    padding: SPACING.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.sandLight,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.base,
    color: COLORS.earth,
    fontFamily: 'Nunito_400Regular',
  },
  header: {
    alignItems: 'center',
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES['3xl'],
    fontFamily: 'Nunito_700Bold',
    color: COLORS.earthDark,
    marginTop: SPACING.md,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    fontFamily: 'Nunito_400Regular',
    color: COLORS.earth,
    marginTop: SPACING.xs,
  },
  features: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginVertical: SPACING.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.sm,
  },
  featureText: {
    fontSize: FONT_SIZES.base,
    fontFamily: 'Nunito_400Regular',
    color: COLORS.earthDark,
    marginLeft: SPACING.md,
  },
  featureTextCrossed: {
    textDecorationLine: 'line-through',
    color: COLORS.earthLight,
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    marginVertical: SPACING.md,
  },
  price: {
    fontSize: FONT_SIZES['4xl'],
    fontFamily: 'Nunito_700Bold',
    color: COLORS.river,
  },
  priceLabel: {
    fontSize: FONT_SIZES.lg,
    fontFamily: 'Nunito_400Regular',
    color: COLORS.earth,
    marginLeft: SPACING.xs,
  },
  errorText: {
    color: COLORS.emergency,
    textAlign: 'center',
    marginBottom: SPACING.md,
    fontFamily: 'Nunito_400Regular',
  },
  purchaseButton: {
    backgroundColor: COLORS.river,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.base,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  purchaseButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontFamily: 'Nunito_700Bold',
  },
  restoreButton: {
    padding: SPACING.base,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  restoreButtonText: {
    color: COLORS.river,
    fontSize: FONT_SIZES.base,
    fontFamily: 'Nunito_600SemiBold',
  },
  terms: {
    fontSize: FONT_SIZES.xs,
    fontFamily: 'Nunito_400Regular',
    color: COLORS.earthLight,
    textAlign: 'center',
    marginTop: SPACING.lg,
    lineHeight: 18,
  },
  closeButton: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
    padding: SPACING.sm,
  },
});
