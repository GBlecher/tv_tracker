import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip, EmptyState, ErrorView, Loading, Poster, Segmented, WatchToggle } from '@/components/ui';
import { useMarkWatched, useUnmarkWatched } from '@/components/WatchPrompt';
import { colors, radius } from '@/constants/theme';
import { getSchedule, getWebSchedule, type Episode } from '@/lib/tvmaze';
import { useAsync } from '@/lib/useAsync';
import { useMyShows } from '@/lib/useMyShows';
import { addDays, dayLabel, epCode, epDate, formatAirTime, hasAired, localDayKey, toISODate, uniqueBy } from '@/lib/utils';
import { useTracker, type ShowLike } from '@/store/tracker';

type Mode = 'mine' | 'all';

export default function CalendarScreen() {
  const [mode, setMode] = useState<Mode>('mine');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'mine', label: 'My shows' },
          { value: 'all', label: 'TV guide' },
        ]}
      />
      {mode === 'mine' ? <MyCalendar /> : <TvGuide />}
    </View>
  );
}

type Row =
  | { type: 'header'; key: string; title: string; today: boolean }
  | { type: 'episode'; key: string; episode: Episode; show: ShowLike }
  | { type: 'empty'; key: string };

const HEADER_H = 40;
const ROW_H = 80;
const ROW_GAP = 8;

function MyCalendar() {
  const { progress, loading, refreshing, error, reload } = useMyShows();
  const { stats } = useTracker();
  const listRef = useRef<FlatList<Row>>(null);
  const scrolledToToday = useRef(false);
  const [todayDirection, setTodayDirection] = useState<'up' | 'down' | null>(null);

  const { rows, todayIndex, stickyIndices } = useMemo(() => {
    const todayKey = toISODate(new Date());
    const days = new Map<string, { episode: Episode; show: ShowLike }[]>();
    for (const p of progress) {
      for (const e of p.episodes) {
        const d = epDate(e);
        if (!d) continue;
        const key = toISODate(d);
        if (!days.has(key)) days.set(key, []);
        days.get(key)!.push({ episode: e, show: p.show });
      }
    }
    // Always include today so the list has an anchor to open at.
    if (!days.has(todayKey)) days.set(todayKey, []);

    const rows: Row[] = [];
    let todayIndex = 0;
    const stickyIndices: number[] = [];
    for (const key of [...days.keys()].sort()) {
      const items = days.get(key)!.sort((a, b) => epDate(a.episode)!.getTime() - epDate(b.episode)!.getTime());
      if (key === todayKey) todayIndex = rows.length;
      stickyIndices.push(rows.length);
      rows.push({ type: 'header', key: `h-${key}`, title: dayLabel(new Date(`${key}T12:00:00`)), today: key === todayKey });
      if (items.length === 0) rows.push({ type: 'empty', key: `empty-${key}` });
      for (const it of items) rows.push({ type: 'episode', key: `e-${it.episode.id}`, ...it });
    }
    return { rows, todayIndex, stickyIndices };
  }, [progress]);

  const layouts = useMemo(() => {
    let offset = 0;
    return rows.map((r) => {
      const length = r.type === 'header' ? HEADER_H : ROW_H + ROW_GAP;
      const l = { length, offset };
      offset += length;
      return l;
    });
  }, [rows]);

  if (loading) return <Loading />;
  if (error) return <ErrorView error={error} onRetry={reload} />;
  if (stats.shows === 0)
    return <EmptyState icon="calendar-outline" title="No shows yet" message="Add shows to see when new episodes air." />;

  const scrollToToday = (animated: boolean) => {
    const target = layouts[todayIndex];
    if (target) listRef.current?.scrollToOffset({ offset: target.offset, animated });
  };
  const todayOffset = layouts[todayIndex]?.offset ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        ref={listRef}
        initialScrollIndex={todayIndex}
        getItemLayout={(_, index) => ({ ...layouts[index], index })}
        onContentSizeChange={() => {
          // initialScrollIndex is ignored on web, so jump to today once explicitly.
          if (scrolledToToday.current || !layouts[todayIndex]) return;
          scrolledToToday.current = true;
          scrollToToday(false);
        }}
        onScroll={(ev) => {
          const { contentOffset, layoutMeasurement } = ev.nativeEvent;
          const top = contentOffset.y;
          const bottom = top + layoutMeasurement.height;
          // Only offer the button while the "Today" header is off screen.
          const next = todayOffset + HEADER_H <= top ? 'up' : todayOffset >= bottom - 60 ? 'down' : null;
          if (next !== todayDirection) setTodayDirection(next);
        }}
        scrollEventThrottle={100}
        stickyHeaderIndices={stickyIndices}
        contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.accent} />}
        renderItem={({ item }) => {
          if (item.type === 'header')
            return (
              <View style={styles.dayHeader}>
                <Text style={[styles.dayHeaderText, item.today && { color: colors.accent }]}>{item.title}</Text>
              </View>
            );
          if (item.type === 'empty')
            return (
              <View style={[styles.row, styles.emptyRow]}>
                <Text style={styles.muted}>No episodes of your shows today</Text>
              </View>
            );
          return <EpisodeRow episode={item.episode} show={item.show} trackable />;
        }}
      />
      {todayDirection && (
        <Pressable
          style={({ pressed }) => [styles.todayButton, pressed && { opacity: 0.8 }]}
          onPress={() => scrollToToday(true)}
          accessibilityRole="button"
          accessibilityLabel="Scroll to today">
          <Ionicons name={todayDirection === 'up' ? 'arrow-up' : 'arrow-down'} size={16} color={colors.onAccent} />
          <Text style={styles.todayButtonText}>Today</Text>
        </Pressable>
      )}
    </View>
  );
}

const SOURCES = [
  { value: 'US', label: 'US TV' },
  { value: 'GB', label: 'UK TV' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'WEB', label: 'Streaming' },
] as const;

function TvGuide() {
  const days = useMemo(() => Array.from({ length: 9 }, (_, i) => addDays(new Date(), i - 1)), []);
  const [day, setDay] = useState(toISODate(new Date()));
  const [source, setSource] = useState<(typeof SOURCES)[number]['value']>('US');

  const { data, error, loading, reload } = useAsync(async () => {
    // TVmaze schedules use the broadcaster's local date, so fetch the neighbouring days
    // and keep only what airs on the selected day in the user's timezone.
    const center = new Date(`${day}T12:00:00`);
    const dates = [-1, 0, 1].map((i) => toISODate(addDays(center, i)));
    const results = await Promise.allSettled(
      dates.map((d) => (source === 'WEB' ? getWebSchedule(d) : getSchedule(d, source)))
    );
    const eps = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (results.every((r) => r.status === 'rejected')) throw (results[1] as PromiseRejectedResult).reason;
    const filtered = eps.filter(
      (e) => e.show && localDayKey(e) === day && (source !== 'WEB' || e.show.language === 'English')
    );
    return uniqueBy(filtered, (e) => e.id).sort((a, b) => (epDate(a)?.getTime() ?? 0) - (epDate(b)?.getTime() ?? 0));
  }, [day, source]);

  return (
    <View style={{ flex: 1 }}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {days.map((d) => {
            const key = toISODate(d);
            const label = dayLabel(d);
            return (
              <Chip
                key={key}
                label={label.includes(',') ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) : label}
                active={key === day}
                onPress={() => setDay(key)}
              />
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SOURCES.map((s) => (
            <Chip key={s.value} label={s.label} active={s.value === source} onPress={() => setSource(s.value)} />
          ))}
        </ScrollView>
      </View>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32, opacity: loading ? 0.5 : 1 }}>
          {data!.length === 0 && <EmptyState icon="tv-outline" title="Nothing scheduled" />}
          {data!.map((e) => (
            <EpisodeRow key={e.id} episode={e} show={e.show!} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function EpisodeRow({ episode: e, show, trackable }: { episode: Episode; show: ShowLike; trackable?: boolean }) {
  const { isWatched } = useTracker();
  const markWatched = useMarkWatched();
  const unmarkWatched = useUnmarkWatched();
  const aired = hasAired(e);
  const watched = isWatched(e.id);
  const network = e.show?.network?.name ?? e.show?.webChannel?.name;
  return (
    <View style={[styles.row, watched && styles.watched]}>
      <Link href={`/show/${show.id}`} asChild>
        <Pressable>
          <Poster image={show.image} width={44} height={64} rounded={radius.sm} />
        </Pressable>
      </Link>
      <Link href={`/episode/${e.id}`} asChild>
        <Pressable style={{ flex: 1, gap: 2 }}>
          <Text style={styles.showName} numberOfLines={1}>
            {show.name}
          </Text>
          <Text style={styles.code} numberOfLines={1}>
            {epCode(e)} · {e.name}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {[formatAirTime(e), network].filter(Boolean).join(' · ') || 'Time TBA'}
          </Text>
        </Pressable>
      </Link>
      {trackable && (
        <WatchToggle watched={watched} disabled={!aired} onPress={() => (watched ? unmarkWatched(show, e) : markWatched(show, e))} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  todayButton: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  todayButtonText: { color: colors.onAccent, fontWeight: '800', fontSize: 14 },
  dayHeader: {
    height: HEADER_H,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
  },
  dayHeaderText: { color: colors.text, fontWeight: '800', fontSize: 15 },
  chips: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: ROW_H,
    marginHorizontal: 16,
    marginBottom: ROW_GAP,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  emptyRow: { justifyContent: 'center' },
  watched: { opacity: 0.4 },
  showName: { color: colors.text, fontWeight: '700', fontSize: 15 },
  code: { color: colors.text, fontSize: 13 },
  muted: { color: colors.muted, fontSize: 12 },
});
