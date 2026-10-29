import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PersonRow } from '@/components/PersonRow';
import { Button, Dropdown, ErrorView, Loading, Poster, ProgressBar, Segmented, WatchToggle } from '@/components/ui';
import { useMarkWatched, useUnmarkWatched } from '@/components/WatchPrompt';
import { colors, radius } from '@/constants/theme';
import { getEpisodes, getShow, type Episode, type Show } from '@/lib/tvmaze';
import { useAsync } from '@/lib/useAsync';
import { openTrailer, seasonTrailerUrl, showTrailerUrl } from '@/lib/trailers';
import { channelName, epCode, formatAirTime, formatDate, formatEpDate, hasAired, stripHtml, yearRange } from '@/lib/utils';
import { useTracker } from '@/store/tracker';

type Tab = 'episodes' | 'about' | 'cast';

export default function ShowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('episodes');
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([getShow(id), getEpisodes(id)]).then(([show, episodes]) => ({ show, episodes })),
    [id]
  );

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorView error={error ?? new Error('Show not found')} onRetry={reload} />;
  const { show, episodes } = data;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 48 }}>
      <Stack.Screen options={{ title: show.name }} />
      <Hero show={show} episodes={episodes} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'episodes', label: 'Episodes' },
          { value: 'about', label: 'About' },
          { value: 'cast', label: 'Cast & Crew' },
        ]}
      />
      {tab === 'episodes' && <Seasons show={show} episodes={episodes} />}
      {tab === 'about' && <About show={show} />}
      {tab === 'cast' && <Cast show={show} />}
    </ScrollView>
  );
}

function Hero({ show, episodes }: { show: Show; episodes: Episode[] }) {
  const { isFollowing, follow, unfollow, isWatched } = useTracker();
  const following = isFollowing(show.id);
  const aired = episodes.filter((e) => hasAired(e));
  const watchedCount = aired.filter((e) => isWatched(e.id)).length;
  const next = show._embedded?.nextepisode;
  const meta = [yearRange(show), channelName(show), show.status].filter(Boolean).join(' · ');

  return (
    <View>
      <View style={styles.hero}>
        {show.image && (
          <Image source={{ uri: show.image.original }} style={StyleSheet.absoluteFill} blurRadius={30} contentFit="cover" />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,14,17,0.7)' }]} />
        <Poster image={show.image} width={120} original />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.title}>{show.name}</Text>
          <Text style={styles.meta}>{meta}</Text>
          {show.genres.length > 0 && <Text style={styles.meta}>{show.genres.join(', ')}</Text>}
          {show.rating.average != null && (
            <Text style={styles.rating}>
              <Ionicons name="star" size={14} color={colors.accent} /> {show.rating.average.toFixed(1)} / 10
            </Text>
          )}
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 12, marginTop: 12 }}>
        <Button
          title={following ? 'Following' : 'Add to my shows'}
          icon={following ? 'checkmark' : 'add'}
          variant={following ? 'secondary' : 'primary'}
          onPress={() => (following ? unfollow(show.id) : follow(show))}
        />
        <Button title="Watch trailer" icon="logo-youtube" variant="youtube" onPress={() => openTrailer(showTrailerUrl(show))} />
        {following && aired.length > 0 && (
          <View style={{ gap: 6 }}>
            <ProgressBar value={watchedCount / aired.length} />
            <Text style={styles.meta}>
              {watchedCount} of {aired.length} episodes watched
            </Text>
          </View>
        )}
        {next && (
          <Link href={`/episode/${next.id}`} asChild>
            <Pressable style={styles.nextCard}>
              <Ionicons name="time-outline" size={22} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nextLabel}>NEXT EPISODE</Text>
                <Text style={styles.nextTitle} numberOfLines={1}>
                  {epCode(next)} · {next.name}
                </Text>
                <Text style={styles.meta}>
                  {formatDate(next.airstamp ?? next.airdate, { weekday: 'long', month: 'long', day: 'numeric' })}
                  {formatAirTime(next) ? ` at ${formatAirTime(next)}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          </Link>
        )}
      </View>
    </View>
  );
}

function Seasons({ show, episodes }: { show: Show; episodes: Episode[] }) {
  const { isWatched, setWatched } = useTracker();
  const markWatched = useMarkWatched();
  const unmarkWatched = useUnmarkWatched();
  const seasons = useMemo(() => {
    const map = new Map<number, Episode[]>();
    for (const e of episodes) {
      if (!map.has(e.season)) map.set(e.season, []);
      map.get(e.season)!.push(e);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [episodes]);

  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    // Open the first season with something left to watch, otherwise the latest season.
    const firstUnwatched = seasons.find(([, eps]) => eps.some((e) => hasAired(e) && !isWatched(e.id)));
    setOpen(firstUnwatched?.[0] ?? seasons[seasons.length - 1]?.[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasons]);

  if (seasons.length === 0) return <Text style={[styles.meta, { padding: 16 }]}>No episodes announced yet.</Text>;

  return (
    <View style={{ paddingHorizontal: 16, gap: 10 }}>
      <Text style={styles.hint}>Tip: long-press a checkmark to mark every episode up to that one.</Text>
      {seasons.map(([num, eps]) => {
        const aired = eps.filter((e) => hasAired(e));
        const watched = aired.filter((e) => isWatched(e.id)).length;
        const allWatched = aired.length > 0 && watched === aired.length;
        const expanded = open === num;
        return (
          <View key={num} style={styles.season}>
            <Pressable style={styles.seasonHeader} onPress={() => setOpen(expanded ? null : num)}>
              <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.seasonTitle}>Season {num}</Text>
                <Text style={styles.meta}>
                  {watched}/{aired.length} watched{eps.length > aired.length ? ` · ${eps.length - aired.length} upcoming` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => openTrailer(seasonTrailerUrl(show.name, num))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Season ${num} trailer`}
                style={styles.trailerIcon}>
                <Ionicons name="logo-youtube" size={22} color={colors.youtube} />
              </Pressable>
              <WatchToggle
                watched={allWatched}
                disabled={aired.length === 0}
                onPress={() => (allWatched ? unmarkWatched(show, aired, episodes) : markWatched(show, aired, episodes))}
              />
            </Pressable>
            {expanded &&
              eps.map((e) => {
                const isAired = hasAired(e);
                const w = isWatched(e.id);
                return (
                  <View key={e.id} style={styles.episode}>
                    <Link href={`/episode/${e.id}`} asChild>
                      <Pressable style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        <Poster image={e.image} width={96} height={54} rounded={radius.sm} icon="film-outline" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.epCode}>{epCode(e)}</Text>
                          <Text style={styles.epName} numberOfLines={2}>
                            {e.name}
                          </Text>
                          <Text style={styles.meta}>
                            {isAired ? formatEpDate(e) : `Airs ${formatEpDate(e)}`}
                          </Text>
                        </View>
                      </Pressable>
                    </Link>
                    <WatchToggle
                      watched={w}
                      disabled={!isAired}
                      onPress={() => (w ? unmarkWatched(show, e, episodes) : markWatched(show, e, episodes))}
                      onLongPress={() => setWatched(show, episodes.slice(0, episodes.indexOf(e) + 1).filter((x) => hasAired(x)), true)}
                    />
                  </View>
                );
              })}
          </View>
        );
      })}
    </View>
  );
}

function About({ show }: { show: Show }) {
  const rows: [string, string | null | undefined][] = [
    ['Status', show.status],
    ['Premiered', show.premiered && formatDate(show.premiered)],
    ['Ended', show.ended && formatDate(show.ended)],
    [
      'Schedule',
      show.schedule.days.length ? `${show.schedule.days.join(', ')}${show.schedule.time ? ` at ${show.schedule.time}` : ''}` : null,
    ],
    ['Runtime', (show.runtime ?? show.averageRuntime) ? `${show.runtime ?? show.averageRuntime} min` : null],
    ['Network', show.network?.name],
    ['Streaming', show.webChannel?.name],
    ['Country', show.network?.country?.name ?? show.webChannel?.country?.name],
    ['Language', show.language],
    ['Type', show.type],
    ['Genres', show.genres.join(', ')],
  ];
  const seasons = show._embedded?.seasons ?? [];

  return (
    <View style={{ paddingHorizontal: 16, gap: 16 }}>
      <Text style={styles.body}>{stripHtml(show.summary) || 'No summary available yet.'}</Text>

      <View style={styles.infoCard}>
        {rows
          .filter(([, v]) => !!v)
          .map(([k, v]) => (
            <View key={k} style={styles.infoRow}>
              <Text style={styles.infoKey}>{k}</Text>
              <Text style={styles.infoValue}>{v}</Text>
            </View>
          ))}
      </View>

      {seasons.length > 0 && (
        <View style={styles.infoCard}>
          {seasons.map((s) => (
            <View key={s.id} style={styles.infoRow}>
              <Text style={styles.infoKey}>Season {s.number}</Text>
              <Text style={styles.infoValue}>
                {[s.episodeOrder ? `${s.episodeOrder} episodes` : null, s.premiereDate ? formatDate(s.premiereDate) : 'TBA']
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {show.officialSite && (
          <Button title="Official site" icon="globe-outline" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(show.officialSite!)} />
        )}
        {show.externals.imdb && (
          <Button
            title="IMDb"
            icon="film-outline"
            variant="secondary"
            onPress={() => WebBrowser.openBrowserAsync(`https://www.imdb.com/title/${show.externals.imdb}`)}
          />
        )}
        <Button title="TVmaze" icon="open-outline" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(show.url)} />
      </View>
    </View>
  );
}

const KEY_CREW = ['Creator', 'Developer', 'Showrunner', 'Executive Producer'];

function Cast({ show }: { show: Show }) {
  const cast = show._embedded?.cast ?? [];
  const crew = (show._embedded?.crew ?? [])
    .filter((c) => KEY_CREW.includes(c.type))
    .sort((a, b) => KEY_CREW.indexOf(a.type) - KEY_CREW.indexOf(b.type))
    .slice(0, 8);

  return (
    <View style={{ paddingHorizontal: 16, gap: 10 }}>
      {cast.length === 0 && <Text style={styles.meta}>No cast information yet.</Text>}
      {cast.length > 0 && (
        <Dropdown title="Cast" count={cast.length}>
          {cast.map((c) => (
            <PersonRow
              key={`${c.person.id}-${c.character.id}`}
              id={c.person.id}
              name={c.person.name}
              image={c.person.image ?? c.character.image}
              role={`${c.self ? 'Self' : c.character.name}${c.voice ? ' (voice)' : ''}`}
            />
          ))}
        </Dropdown>
      )}
      {crew.length > 0 && (
        <Dropdown title="Crew" count={crew.length}>
          {crew.map((c) => (
            <PersonRow key={`${c.person.id}-${c.type}`} id={c.person.id} name={c.person.name} image={c.person.image} role={c.type} />
          ))}
        </Dropdown>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 16, padding: 16, alignItems: 'flex-end', overflow: 'hidden' },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 13 },
  rating: { color: colors.text, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 12, fontStyle: 'italic' },
  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nextLabel: { color: colors.accent, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  nextTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  season: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden' },
  seasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  trailerIcon: { padding: 4 },
  seasonTitle: { color: colors.text, fontWeight: '800', fontSize: 17 },
  episode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  epCode: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  epName: { color: colors.text, fontWeight: '600', fontSize: 15 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  infoCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 10 },
  infoRow: { flexDirection: 'row', gap: 12 },
  infoKey: { color: colors.muted, width: 96, fontSize: 14 },
  infoValue: { color: colors.text, flex: 1, fontSize: 14 },
});
