// src/components/feedback/MessageBubble.tsx
import { StyleSheet, Text, View } from 'react-native';
import { format } from 'date-fns';

import type { FeedbackMessage } from '../../services/api/feedbackApi';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../config/theme';

export function MessageBubble({ message }: { message: FeedbackMessage }) {
  const fromOwner = message.author === 'admin';
  return (
    <View style={[styles.bubble, fromOwner ? styles.owner : styles.mine]}>
      <Text style={styles.body}>{message.body}</Text>
      <View style={styles.meta}>
        <Text style={styles.signature}>{fromOwner ? 'Paraná Info' : 'Vos'}</Text>
        <Text style={styles.time}>{format(new Date(message.createdAt), 'd/M HH:mm')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  mine: { alignSelf: 'flex-end', backgroundColor: COLORS.white },
  owner: { alignSelf: 'flex-start', backgroundColor: COLORS.infoLight },
  body: { fontFamily: 'Nunito_400Regular', fontSize: FONT_SIZES.base, color: COLORS.earthDark, lineHeight: 20 },
  meta: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  signature: { fontFamily: 'Nunito_700Bold', fontSize: FONT_SIZES.xs, color: COLORS.riverDark },
  time: { fontFamily: 'Nunito_400Regular', fontSize: FONT_SIZES.xs, color: COLORS.earthLight },
});
