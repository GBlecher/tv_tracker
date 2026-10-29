import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PersonRow } from '@/components/PersonRow';
import { Button, Dropdown, ErrorView, Loading, Poster } from '@/components/ui';
import { useMarkWatched, useUnmarkWatched } from '@/components/WatchPrompt';
import { colors, radius } from '@/constants/theme';
import { getEpisode, getEpisodes, type Episode } from '@/lib/tvmaze';
import { useAsync } from '@/lib/useAsync';
import { episodeTrailerUrl, openTrailer } from '@/lib/trailers';
import { channelName, epCode, formatAirTime, formatDate, hasAired, stripHtml } from '@/lib/utils';
import { useTracker } from '@/store/tracker';

export default function EpisodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isWatched } = useTracker();
  const markWatched = useMarkWatched();
  const unmarkWatched = useUnmarkWatched();
  const { data, error, loading, reload } = useAsync(async () => {
    const episode = await getEpisode(id);
    const all = episode.show ? await getEpisodes(episode.show.id).catch(() => [] as Episode[]) : [];
    const idx = all.findIndex((e) => e.id === episode.id);
    return { episode, prev: idx > 0 ? all[idx - 1] : undefined, next: idx >= 0 ? all[idx + 1] : undefined };
  }, [id]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorView error={error ?? new Error('Episode not found')} onRetry={reload} />;

  const { episode: e, prev, next } = data;
  const show = e.show!;
  const aired = hasAired(e);
  const watched = isWatched(e.id);
  const guests = e._embedded?.guestcast ?? [];
  const crew = (e._embedded?.guestcrew ?? []).filter((c) => ['Director', 'Writer', 'Written by', 'Teleplay by', 'Story by'].includes(c.type));
  const when = [
    formatDate(e.airstamp ?? e.airdate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    formatAirTime(e),
    channelName(show),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 48 }}>
      <Stack.Screen options={{ title: epCode(e) }} />
      <Poster image={e.image ?? show.image} width="100%" height={220} rounded={0} original icon="film-outline" />

      <View style={{ padding: 16, gap: 10 }}>
        <Link href={`/show/${show.id}`} asChild>
          <Pressable>
            <Text style={styles.showName}>
              {show.name} <Ionicons name="chevron-forward" size={14} />
            </Text>
          </Pressable>
        </Link>
        <Text style={styles.code}>
          Season {e.season} · Episode {e.number}
        </Text>
        <Text style={styles.title}>{e.name}</Text>
        <Text style={styles.meta}>{when}</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {!!e.runtime && (
            <Text style={styles.meta}>
              <Ionicons name="time-outline" size={13} /> {e.runtime} min
            </Text>
          )}
          {e.rating.average != null && (
            <Text style={styles.meta}>
              <Ionicons name="star" size={13} color={colors.accent} /> {e.rating.average.toFixed(1)}
            </Text>
          )}
        </View>

        {aired ? (
          <Button
            title={watched ? 'Watched' : 'Mark as watched'}
            icon={watched ? 'checkmark-circle' : 'checkmark-circle-outline'}
            variant={watched ? 'secondary' : 'primary'}
            onPress={() => (watched ? unmarkWatched(show, e) : markWatched(show, e))}
            style={{ marginTop: 8 }}
          />
        ) : (
          <View style={styles.notice}>
            <Ionicons name="hourglass-outline" size={18} color={colors.accent} />
            <Text style={styles.noticeText}>This episode hasn't aired yet.</Text>
          </View>
        )}

        <Button
          title="Find episode promo"
          icon="logo-youtube"
          variant="youtube"
          onPress={() => openTrailer(episodeTrailerUrl(show.name, e))}
        />

        <Text style={styles.body}>{stripHtml(e.summary) || 'No synopsis available yet.'}</Text>

        {crew.length > 0 && (
          <Dropdown title="Crew" count={crew.length}>
            {crew.map((c) => (
              <PersonRow
                key={`${c.person.id}-${c.type}`}
                id={c.person.id}
                name={c.person.name}
                image={c.person.image}
                role={c.type}
              />
            ))}
          </Dropdown>
        )}

        {guests.length > 0 && (
          <Dropdown title="Guest stars" count={guests.length}>
            {guests.map((g) => (
              <PersonRow
                key={`${g.person.id}-${g.character.id}`}
                id={g.person.id}
                name={g.person.name}
                image={g.person.image ?? g.character.image}
                role={g.character.name}
              />
            ))}
          </Dropdown>
        )}

        <View style={styles.nav}>
          {prev ? <NavButton episode={prev} direction="prev" /> : <View style={{ flex: 1 }} />}
          {next ? <NavButton episode={next} direction="next" /> : <View style={{ flex: 1 }} />}
        </View>
      </View>
    </ScrollView>
  );
}

function NavButton({ episode, direction }: { episode: Episode; direction: 'prev' | 'next' }) {
  const isNext = direction === 'next';
  return (
    <Link href={`/episode/${episode.id}`} replace asChild>
      <Pressable style={StyleSheet.flatten([styles.navBtn, isNext && { alignItems: 'flex-end' as const }])}>
        <Text style={styles.meta}>{isNext ? 'Next' : 'Previous'}</Text>
        <Text style={styles.code}>{epCode(episode)}</Text>
        <Text style={styles.navTitle} numberOfLines={1}>
          {episode.name}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  showName: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  code: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  title: { color: colors.text, fontWeight: '900', fontSize: 24 },
  meta: { color: colors.muted, fontSize: 13 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22, marginTop: 8 },
  notice: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    marginTop: 8,
  },
  noticeText: { color: colors.text },
  nav: { flexDirection: 'row', gap: 10, marginTop: 24 },
  navBtn: { flex: 1, padding: 12, borderRadius: radius.lg, backgroundColor: colors.card, gap: 2 },
  navTitle: { color: colors.text, fontWeight: '600' },
});
