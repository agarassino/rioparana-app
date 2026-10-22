import { useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import guide from '../content/guides/el-nino.json';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../src/config/theme';

export default function ElNinoGuide() {
  const router = useRouter();
  const [linkError, setLinkError] = useState(false);
  const openSource = async (url: string) => {
    setLinkError(false);
    try { await Linking.openURL(url); }
    catch { setLinkError(true); }
  };
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: guide.title, headerBackTitle: 'Volver' }} />
      <View style={styles.article}>
        <Text style={styles.meta}>{guide.readingTime}</Text>
        <Text accessibilityRole="header" style={styles.title}>{guide.title}</Text>
        <Text style={styles.body}>{guide.description}</Text>
        {guide.sections.map((section) => <View key={section.title}>
          <Text accessibilityRole="header" style={styles.heading}>{section.title}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>)}
        <Text style={[styles.body, styles.notice]}>{guide.notice}</Text>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push('/(tabs)/stations')}>
          <Text style={styles.actionText}>{guide.heightLabel}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.heading}>Fuentes oficiales</Text>
        <Text style={styles.meta}>{`Revisión editorial: ${new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(guide.reviewedAt))}`}</Text>
        {guide.sources.map((source) => <Pressable key={source.url} accessibilityRole="link"
          accessibilityLabel={source.label} accessibilityHint="Abre el sitio oficial en el navegador"
          style={styles.linkTarget} onPress={() => void openSource(source.url)}>
          <Text style={styles.link}>{source.label}</Text>
        </Pressable>)}
        {linkError ? <Text accessibilityRole="alert" style={styles.body}>No se pudo abrir el enlace. Revisá tu conexión e intentá nuevamente.</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.sandLight },
  content: { padding: SPACING.base },
  article: { backgroundColor: COLORS.cream, padding: SPACING.lg, borderRadius: BORDER_RADIUS.lg, maxWidth: 720, width: '100%', alignSelf: 'center' },
  title: { fontFamily: FONTS.bold, fontSize: 28, lineHeight: 34, color: COLORS.earthDark, marginVertical: SPACING.md },
  heading: { fontFamily: FONTS.bold, fontSize: 19, color: COLORS.earthDark, marginTop: SPACING.xl, marginBottom: SPACING.sm },
  body: { fontFamily: FONTS.regular, fontSize: 16, lineHeight: 26, color: COLORS.earthDark },
  meta: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.earth },
  notice: { borderLeftWidth: 3, borderLeftColor: COLORS.riverDark, paddingLeft: SPACING.md, marginVertical: SPACING.xl },
  action: { backgroundColor: COLORS.riverDark, padding: SPACING.base, borderRadius: BORDER_RADIUS.md, minHeight: 48 },
  actionText: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.white, textAlign: 'center' },
  linkTarget: { minHeight: 48, justifyContent: 'center', paddingVertical: SPACING.sm },
  link: { fontFamily: FONTS.semiBold, color: COLORS.riverDark, fontSize: 16, textDecorationLine: 'underline' },
});
