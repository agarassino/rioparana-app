import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES } from '../../config/theme';
import { NewsItem } from '../../types';

interface NewsCardProps {
  news: NewsItem;
}

export function NewsCard({ news }: NewsCardProps) {
  const handlePress = () => {
    Linking.openURL(news.url);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.iconContainer}>
        <FontAwesome6 name="newspaper" size={16} color={COLORS.river} />
      </View>
      <View style={styles.content}>
        {news.date ? (
          <Text style={styles.date}>{news.date}</Text>
        ) : null}
        <Text style={styles.title} numberOfLines={2}>
          {news.title}
        </Text>
      </View>
      <FontAwesome6 name="chevron-right" size={12} color={COLORS.earthLight} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.sand,
  },
  pressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.infoLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  content: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  date: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.earthLight,
    fontFamily: 'Nunito_600SemiBold',
    marginBottom: 2,
  },
  title: {
    fontSize: FONT_SIZES.base,
    color: COLORS.earthDark,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 20,
  },
});
