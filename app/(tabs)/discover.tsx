import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ShowRow } from '@/components/ShowRow';
import { EmptyState, ErrorView, Loading, Poster, PosterCard, SectionHeader } from '@/components/ui';
import { colors, radius } from '@/constants/theme';
import { getSchedule, getWebSchedule, searchPeople, searchShows, type Episode, type Show } from '@/lib/tvmaze';
import { useAsync } from '@/lib/useAsync';
import { addDays, epDate, formatAirTime, formatDate, localDayKey, toISODate, uniqueBy } from '@/lib/utils';

const PAST_DAYS = 3;
const FUTURE_DAYS = 10;

const isEnglish = (s?: Show) => !!s && s.language === 'English' && !!s.image;

async function loadDiscover() {
  const today = new Date();
  const dates = Array.from({ length: PAST_DAYS + FUTURE_DAYS + 1 }, (_, i) => toISODate(addDays(today, i - PAST_DAYS)));
  const todayKey = toISODate(today);
  const days = await Promise.all(
    dates.map(async (date) => {
      const [tv, web] = await Promise.allSettled([getSchedule(date, 'US'), getWebSchedule(date)]);
      return {
        date,
        tv: tv.status === 'fulfilled' ? tv.value : [],
        web: web.status === 'fulfilled' ? web.value : [],
      };
    })
  );
  const all = days.flatMap((d) => [...d.tv, ...d.web]).filter((e) => isEnglish(e.show));
  // "Today" is the user's local day, which can span two of TVmaze's (US-dated) schedule days.
  const airsToday = (e: Episode) => localDayKey(e) === todayKey;
  const todayTv = days.flatMap((d) => d.tv).filter(airsToday);
  const todayWeb = days.flatMap((d) => d.web).filter(airsToday);

  const trending = uniqueBy(
    days
      .filter((d) => d.date <= todayKey)
      .flatMap((d) => [...d.tv, ...d.web])
      .map((e) => e.show!)
      .filter(isEnglish),
    (s) => s.id
  )
    .sort((a, b) => b.weight - a.weight || (b.rating.average ?? 0) - (a.rating.average ?? 0))
    .slice(0, 20);

  const premieres = uniqueBy(
    all.filter((e) => e.number === 1),
    (e) => `${e.show!.id}-${e.season}`
  ).sort((a, b) => (epDate(a)?.getTime() ?? 0) - (epDate(b)?.getTime() ?? 0));

  const nowMs = Date.now();
  const justPremiered = premieres.filter((e) => (epDate(e)?.getTime() ?? 0) <= nowMs).reverse();
  const comingSoon = premieres.filter((e) => (epDate(e)?.getTime() ?? 0) > nowMs);

  const tonight = uniqueBy(
    todayTv.filter((e) => isEnglish(e.show)),
    (e) => e.show!.id
  ).sort((a, b) => b.show!.weight - a.show!.weight);

  const streaming = uniqueBy(
    todayWeb.filter((e) => isEnglish(e.show)),
    (e) => e.show!.id
  ).sort((a, b) => b.show!.weight - a.show!.weight);

  return { trending, justPremiered, comingSoon, tonight, streaming };
}

export default function DiscoverScreen() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search shows and people"
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {debounced ? <SearchResults query={debounced} /> : <Browse />}
    </View>
  );
}

function SearchResults({ query }: { query: string }) {
  const { data, error, loading, reload } = useAsync(
    async () => {
      const [shows, people] = await Promise.all([searchShows(query), searchPeople(query).catch(() => [])]);
      return { shows, people };
    },
    [query]
  );

  if (loading && !data) return <Loading />;
  if (error) return <ErrorView error={error} onRetry={reload} />;
  if (!data || (data.shows.length === 0 && data.people.length === 0))
    return <EmptyState icon="search" title="No results" message={`Nothing found for “${query}”.`} />;

  return (
    <FlatList
      data={data.shows}
      keyExtractor={(s) => String(s.id)}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 32 }}
      ListHeaderComponent={
        data.people.length > 0 ? (
          <View>
            <SectionHeader title="People" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {data.people.map((p) => (
                <Link key={p.id} href={`/person/${p.id}`} asChild>
                  <Pressable style={{ width: 84, alignItems: 'center' }}>
                    <Poster image={p.image} width={72} height={72} rounded={36} icon="person" />
                    <Text style={styles.personName} numberOfLines={2}>
                      {p.name}
                    </Text>
                  </Pressable>
                </Link>
              ))}
            </ScrollView>
            {data.shows.length > 0 && <SectionHeader title="Shows" />}
          </View>
        ) : (
          <SectionHeader title="Shows" />
        )
      }
      renderItem={({ item }) => <ShowRow show={item} />}
    />
  );
}

function Browse() {
  const { data, error, loading, reload } = useAsync(loadDiscover, []);

  if (loading && !data) return <Loading label="Loading what's on…" />;
  if (error || !data) return <ErrorView error={error ?? new Error('No data')} onRetry={reload} />;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Rail title="Trending now">
        {data.trending.map((s) => (
          <PosterCard key={s.id} id={s.id} name={s.name} image={s.image} subtitle={s.network?.name ?? s.webChannel?.name} />
        ))}
      </Rail>

      <Rail title="Coming soon" empty="No premieres scheduled in the next few days.">
        {data.comingSoon.map((e) => (
          <PremiereCard key={e.id} episode={e} />
        ))}
      </Rail>

      <Rail title="Just premiered" empty="No recent premieres.">
        {data.justPremiered.map((e) => (
          <PremiereCard key={e.id} episode={e} />
        ))}
      </Rail>

      <Rail title="Streaming today" empty="Nothing new on streaming today.">
        {data.streaming.map((e) => (
          <PosterCard
            key={e.id}
            id={e.show!.id}
            name={e.show!.name}
            image={e.show!.image}
            subtitle={`${e.show!.webChannel?.name ?? ''} · S${e.season}E${e.number}`}
          />
        ))}
      </Rail>

      <SectionHeader title="On TV tonight" />
      {data.tonight.length === 0 && <Text style={[styles.muted, { paddingHorizontal: 16 }]}>Nothing scheduled.</Text>}
      {data.tonight.slice(0, 25).map((e) => (
        <ShowRow
          key={e.id}
          show={e.show!}
          meta={`${formatAirTime(e) || 'Today'} · S${e.season}E${e.number}${e.name ? ` · ${e.name}` : ''}`}
        />
      ))}
    </ScrollView>
  );
}

function Rail({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode[] }) {
  return (
    <View>
      <SectionHeader title={title} />
      {children.length === 0 ? (
        <Text style={[styles.muted, { paddingHorizontal: 16 }]}>{empty}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
          {children}
        </ScrollView>
      )}
    </View>
  );
}

function PremiereCard({ episode: e }: { episode: Episode }) {
  const label = e.season === 1 ? 'Series premiere' : `Season ${e.season}`;
  const date = useMemo(
    () => formatDate(e.airstamp ?? e.airdate, { weekday: 'short', month: 'short', day: 'numeric' }),
    [e.airstamp, e.airdate]
  );
  return (
    <View>
      <PosterCard id={e.show!.id} name={e.show!.name} image={e.show!.image} subtitle={`${label} · ${date}`} />
      {e.season === 1 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>NEW</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 12 },
  hList: { paddingHorizontal: 16, gap: 12 },
  personName: { color: colors.text, fontSize: 12, textAlign: 'center', marginTop: 6 },
  muted: { color: colors.muted },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: colors.onAccent, fontWeight: '900', fontSize: 10 },
});
