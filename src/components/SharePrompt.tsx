import { Modal, View, Text, Pressable, StyleSheet, Share, Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { FontAwesome6 } from '@expo/vector-icons';

import { appShareMessage, PLAY_URL, type AppShareContext } from '../services/appShare';
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES } from '../config/theme';

// Asked after the app has been useful a few times, never on launch.
//
// The copy deliberately asks the reader nothing about their opinion. Google
// forbids putting a question like "do you like the app?" in front of the
// in-app review sheet, and a prompt that filters for happy users is exactly
// what that rule exists to stop. So this states a fact and offers two doors.

interface Props {
  visible: boolean;
  /** The reading on screen, so a recommendation can carry a real number. */
  context?: AppShareContext;
  /** Shared or rated — the subject is closed. */
  onActed: () => void;
  onDismiss: () => void;
}

export function SharePrompt({ visible, context, onActed, onDismiss }: Props) {
  const share = async () => {
    try {
      await Share.share({ message: appShareMessage(context) });
    } catch {
      // A dismissed sheet is not a failure worth interrupting anyone over.
    }
    onActed();
  };

  const rate = async () => {
    try {
      // Google's own sheet, shown in place. It has a quota and may not appear;
      // when it cannot, the listing is the honest fallback.
      if (await StoreReview.isAvailableAsync()) {
        await StoreReview.requestReview();
      } else {
        await Linking.openURL(PLAY_URL);
      }
    } catch {
      // Same: never take the screen down over this.
    }
    onActed();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.scrim} onPress={onDismiss} accessibilityLabel="Cerrar" />

      <View style={styles.sheet}>
        <View style={styles.grip} />

        <Text style={styles.title}>Pasale el dato a alguien más</Text>
        <Text style={styles.body}>
          Ya consultaste el río unas cuantas veces. Si conocés a alguien que
          navega o pesca, mandale la app.
        </Text>

        <Pressable
          onPress={share}
          style={({ pressed }) => [styles.btn, styles.btnShare, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <FontAwesome6 name="whatsapp" size={17} color={COLORS.white} />
          <Text style={styles.btnShareText}>Compartir la app</Text>
        </Pressable>

        <Pressable
          onPress={rate}
          style={({ pressed }) => [styles.btn, styles.btnRate, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.btnRateText}>Calificar la app</Text>
        </Pressable>

        <Pressable onPress={onDismiss} style={styles.later} accessibilityRole="button">
          <Text style={styles.laterText}>Ahora no</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(20,26,30,0.45)' },
  sheet: {
    backgroundColor: COLORS.cream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  grip: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.sand,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.earthDark,
    fontFamily: 'Nunito_700Bold',
    textAlign: 'center',
  },
  body: {
    fontSize: FONT_SIZES.base,
    color: COLORS.earth,
    fontFamily: 'Nunito_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  pressed: { opacity: 0.8 },
  btnShare: { backgroundColor: '#25D366' },
  btnShareText: { color: COLORS.white, fontSize: FONT_SIZES.md, fontFamily: 'Nunito_700Bold' },
  btnRate: { borderWidth: 1.5, borderColor: COLORS.river },
  btnRateText: { color: COLORS.river, fontSize: FONT_SIZES.md, fontFamily: 'Nunito_700Bold' },
  later: { alignSelf: 'center', padding: SPACING.sm },
  laterText: {
    color: COLORS.earthLight,
    fontSize: FONT_SIZES.base,
    fontFamily: 'Nunito_600SemiBold',
  },
});
