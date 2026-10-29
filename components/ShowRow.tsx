import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Poster } from '@/components/ui';
import { colors, radius } from '@/constants/theme';
import type { Show } from '@/lib/tvmaze';
import { channelName, yearRange } from '@/lib/utils';
import { useTracker } from '@/store/tracker';

export function ShowRow({ show, meta }: { show: Show; meta?: string }) {
  const { isFollowing, follow, unfollow } = useTracker();
  const following = isFollowing(show.id);
  const details = [yearRange(show), channelName(show), show.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ');

  return (
    <Link href={`/show/${show.id}`} asChild>
      <Pressable style={styles.row}>
        <Poster image={show.image} width={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title} numberOfLines={2}>
            {show.name}
          </Text>
          {!!details && (
            <Text style={styles.meta} numberOfLines={2}>
              {details}
            </Text>
          )}
          {!!meta && <Text style={styles.highlight}>{meta}</Text>}
          {show.rating.average != null && (
            <Text style={styles.meta}>
              <Ionicons name="star" color={colors.accent} size={12} /> {show.rating.average.toFixed(1)}
            </Text>
          )}
        </View>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={following ? `Remove ${show.name} from my shows` : `Add ${show.name} to my shows`}
          onPress={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (following) unfollow(show.id);
            else follow(show);
          }}
          style={StyleSheet.flatten([styles.add, following && { backgroundColor: colors.accent }])}>
          <Ionicons name={following ? 'checkmark' : 'add'} size={22} color={following ? colors.onAccent : colors.text} />
        </Pressable>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 13 },
  highlight: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  add: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
});
