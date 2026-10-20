// app/contacto/index.tsx
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';

import { Card } from '../../src/components/ui';
import { KindChips } from '../../src/components/feedback/KindChips';
import { StatusPill } from '../../src/components/feedback/StatusPill';
import { useFeedbackThreads, useSendFeedback } from '../../src/hooks';
import { getStationById } from '../../src/config/stations';
import type { FeedbackKind } from '../../src/services/api/feedbackApi';
import {
  canSend, countChars, COUNTER_FROM, FAILURE_COPY, isKind, KIND_OPTIONS, MAX_BODY_CHARS,
} from '../../src/services/feedbackText';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../src/config/theme';

export default function ContactScreen() {
  const params = useLocalSearchParams<{ kind?: string; stationId?: string }>();
  const router = useRouter();
  const [kind, setKind] = useState<FeedbackKind>(isKind(params.kind) ? params.kind : 'suggestion');
  const [stationId, setStationId] = useState<string | null>(
    params.stationId && getStationById(params.stationId) ? params.stationId : null,
  );
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The second tap of a double tap arrives before isPending re-renders.
  const sending = useRef(false);
  const send = useSendFeedback();
  const { data: threads, isLoading: loadingThreads, error: threadsError, refetch: reloadThreads } = useFeedbackThreads();
  const listFailure = (threadsError as { reason?: string } | null)?.reason;
  const listErrorCopy = listFailure === 'offline'
    ? 'No pudimos cargar tus mensajes. Revisá tu conexión y probá de nuevo.'
    : FAILURE_COPY.unavailable;

  const station = stationId ? getStationById(stationId) : undefined;
  const chars = countChars(text.trim());
  const sendable = canSend(text) && !send.isPending;

  const onSend = async () => {
    if (!sendable || sending.current) return;
    sending.current = true;
    setError(null);
    try {
      const result = await send.mutateAsync({ kind, body: text.trim(), ...(stationId ? { stationId } : {}) });
      if (result.ok) {
        setText('');
        router.push(`/contacto/${result.data.id}`);
      } else {
        setError(FAILURE_COPY[result.reason]);
      }
    } finally {
      sending.current = false;
    }
  };

  const kindLabel = (k: FeedbackKind) => KIND_OPTIONS.find((o) => o.kind === k)?.label ?? '';

  return (
    <>
      <Stack.Screen options={{ title: 'Contacto y sugerencias' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <KindChips value={kind} onChange={setKind} />

          {station && (
            <View style={styles.stationChip}>
              <Text style={styles.stationText}>Sobre: {station.name}</Text>
              <Pressable accessibilityLabel="Quitar estación" onPress={() => setStationId(null)} hitSlop={8}>
                <FontAwesome6 name="xmark" size={12} color={COLORS.earth} />
              </Pressable>
            </View>
          )}

          <TextInput
            testID="feedback-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Contanos qué viste o qué te gustaría que tenga la app"
            placeholderTextColor={COLORS.earthLight}
            multiline
            textAlignVertical="top"
          />
          {chars >= COUNTER_FROM && (
            <Text style={[styles.counter, chars > MAX_BODY_CHARS && styles.counterOver]}>
              {chars}/{MAX_BODY_CHARS}
            </Text>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            testID="feedback-send"
            accessibilityRole="button"
            disabled={!sendable}
            onPress={onSend}
            style={[styles.button, !sendable && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>{error ? 'Reintentar' : 'Enviar'}</Text>
          </Pressable>

          <Text style={styles.privacy}>Te respondemos acá. No hace falta mail ni datos personales.</Text>
        </Card>

        {loadingThreads && <Text style={styles.privacy}>Cargando mensajes…</Text>}
        {threadsError && (
          <Card>
            <Text style={styles.error}>{listErrorCopy}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Reintentar cargar mensajes" onPress={() => { void reloadThreads(); }} style={styles.button}>
              <Text style={styles.buttonText}>Reintentar</Text>
            </Pressable>
          </Card>
        )}
        {threads && threads.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Mis mensajes</Text>
            {threads.map((t) => (
              <Pressable key={t.id} style={styles.threadRow} onPress={() => router.push(`/contacto/${t.id}`)}>
                <View style={styles.threadText}>
                  <Text style={styles.threadKind}>{kindLabel(t.kind)}</Text>
                  <Text style={styles.threadPreview} numberOfLines={2}>{t.preview}</Text>
                </View>
                <StatusPill status={t.status} unread={t.unread} />
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.sandLight },
  content: { padding: SPACING.base },
  stationChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: SPACING.sm, backgroundColor: COLORS.infoLight, borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 4, marginBottom: SPACING.md },
  stationText: { fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.sm, color: COLORS.riverDark },
  input: { minHeight: 120, borderWidth: 1, borderColor: COLORS.sand, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, fontFamily: 'Nunito_400Regular', fontSize: FONT_SIZES.base, color: COLORS.earthDark, backgroundColor: COLORS.white },
  counter: { alignSelf: 'flex-end', marginTop: SPACING.xs, fontSize: FONT_SIZES.xs, color: COLORS.earthLight, fontFamily: 'Nunito_400Regular' },
  counterOver: { color: COLORS.emergency },
  error: { marginTop: SPACING.sm, color: COLORS.emergency, fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.sm },
  button: { marginTop: SPACING.md, backgroundColor: COLORS.river, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: COLORS.white, fontFamily: 'Nunito_700Bold', fontSize: FONT_SIZES.md },
  privacy: { marginTop: SPACING.sm, fontSize: FONT_SIZES.sm, color: COLORS.earthLight, fontFamily: 'Nunito_400Regular', textAlign: 'center' },
  sectionTitle: { fontSize: FONT_SIZES.sm, color: COLORS.earthLight, marginBottom: SPACING.sm, fontFamily: 'Nunito_600SemiBold' },
  threadRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.sandLight, gap: SPACING.sm },
  threadText: { flex: 1 },
  threadKind: { fontFamily: 'Nunito_700Bold', fontSize: FONT_SIZES.sm, color: COLORS.earthDark },
  threadPreview: { fontFamily: 'Nunito_400Regular', fontSize: FONT_SIZES.sm, color: COLORS.earth },
});
