// app/contacto/[threadId].tsx
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { MessageBubble } from '../../src/components/feedback/MessageBubble';
import { useFeedbackThread, useReplyToThread } from '../../src/hooks';
import { canSend, FAILURE_COPY, THREAD_GONE } from '../../src/services/feedbackText';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../src/config/theme';

export default function ThreadScreen() {
  const { threadId = '' } = useLocalSearchParams<{ threadId: string }>();
  const { data, isLoading, refetch } = useFeedbackThread(threadId);
  const reply = useReplyToThread(threadId);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const sendable = canSend(text) && !reply.isPending;

  const onSend = async () => {
    if (!sendable || sending.current) return;
    sending.current = true;
    setError(null);
    try {
      const result = await reply.mutateAsync(text.trim());
      if (result.ok) setText('');
      else setError(FAILURE_COPY[result.reason]);
    } finally {
      sending.current = false;
    }
  };

  const header = <Stack.Screen options={{ title: 'Conversación' }} />;

  if (isLoading) {
    return (<>{header}<View style={styles.centre}><ActivityIndicator size="small" color={COLORS.river} /></View></>);
  }

  if (!data || !data.ok) {
    const reason = data && !data.ok ? data.reason : 'unavailable';
    return (
      <>
        {header}
        <View style={styles.centre}>
          <Text style={styles.notice}>{reason === 'not_found' ? THREAD_GONE : FAILURE_COPY[reason]}</Text>
          {reason !== 'not_found' && (
            <Pressable accessibilityRole="button" onPress={() => refetch()} style={styles.button}>
              <Text style={styles.buttonText}>Reintentar</Text>
            </Pressable>
          )}
        </View>
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {data.data.messages.map((m) => <MessageBubble key={m.id} message={m} />)}

        <TextInput
          testID="thread-reply-input"
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Escribí tu mensaje"
          placeholderTextColor={COLORS.earthLight}
          multiline
          textAlignVertical="top"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          testID="thread-reply-send"
          accessibilityRole="button"
          disabled={!sendable}
          onPress={onSend}
          style={[styles.button, !sendable && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{error ? 'Reintentar' : 'Enviar'}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.sandLight },
  content: { padding: SPACING.base },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, backgroundColor: COLORS.sandLight },
  notice: { fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.md, color: COLORS.earth, textAlign: 'center' },
  input: { minHeight: 80, marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.sand, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, fontFamily: 'Nunito_400Regular', fontSize: FONT_SIZES.base, color: COLORS.earthDark, backgroundColor: COLORS.white },
  error: { marginTop: SPACING.sm, color: COLORS.emergency, fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.sm },
  button: { marginTop: SPACING.md, backgroundColor: COLORS.river, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: COLORS.white, fontFamily: 'Nunito_700Bold', fontSize: FONT_SIZES.md },
});
