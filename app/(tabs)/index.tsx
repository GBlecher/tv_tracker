import { Link, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, ErrorView, Loading, Poster, ProgressBar, SectionHeader, WatchToggle } from '@/components/ui';
import { colors, radius } from '@/constants/theme';
import { useMyShows, type ShowProgress } from '@/lib/useMyShows';
import { epCode, formatDate } from '@/lib/utils';
import { useTracker } from '@/store/tracker';

export default function ShowsScreen() {
  const { stats, ready } = useTracker();
  const { progress, loading, refreshing, error, reload } = useMyShows();

  const { watchNext, notStarted, upToDate } = useMemo(() => {
    const watchNext: ShowProgress[] = [];
    const notStarted: ShowProgress[] = [];
    const upToDate: ShowProgress[] = [];
    for (const p of progress) {
      if (p.next && p.watchedCount > 0) watchNext.push(p);
      else if (p.next) notStarted.push(p);
      else upToDate.push(p);
    }
    watchNext.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
    notStarted.sort((a, b) => b.show.addedAt - a.show.addedAt);
    upToDate.sort((a, b) => (a.upcoming?.airstamp ?? '9').localeCompare(b.upcoming?.airstamp ?? '9'));
    return { watchNext, notStarted, upToDate };
  }, [progress]);

  if (!ready || loading) return <Loading />;
  if (error) return <ErrorView error={error} onRetry={reload} />;

  if (stats.shows === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <EmptyState
          icon="tv-outline"
          title="Your watch list is empty"
          message="Find shows you love and track every episode you watch."
          action={<Button title="Discover shows" icon="compass" onPress={() => router.navigate('/discover')} />}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.accent} />}>
      {watchNext.length > 0 && (
        <>
          <SectionHeader title="Watch next" />
          {watchNext.map((p) => (
            <WatchNextCard key={p.show.id} progress={p} />
          ))}
        </>
      )}

      {notStarted.length > 0 && (
        <>
          <SectionHeader title="Haven't started" />
          {notStarted.map((p) => (
            <WatchNextCard key={p.show.id} progress={p} />
          ))}
        </>
      )}

      {upToDate.length > 0 && (
        <>
          <SectionHeader title="Up to date" />
          {upToDate.map((p) => (
            <Link key={p.show.id} href={`/show/${p.show.id}`} asChild>
              <Pressable style={styles.card}>
                <Poster image={p.show.image} width={56} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.showName}>{p.show.name}</Text>
                  <Text style={styles.muted}>
                    {p.upcoming
                      ? `${epCode(p.upcoming)} airs ${formatDate(p.upcoming.airstamp ?? p.upcoming.airdate, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}`
                      : p.aired.length === 0
                        ? 'No episodes yet'
                        : 'All caught up · no upcoming episodes'}
                  </Text>
                </View>
              </Pressable>
            </Link>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function WatchNextCard({ progress: p }: { progress: ShowProgress }) {
  const { setWatched } = useTracker();
  const next = p.next!;
  const left = p.aired.length - p.watchedCount;

  return (
    <View style={styles.card}>
      <Link href={`/show/${p.show.id}`} asChild>
        <Pressable>
          <Poster image={p.show.image} width={72} />
        </Pressable>
      </Link>
      <Link href={`/episode/${next.id}`} asChild>
        <Pressable style={{ flex: 1, gap: 4 }}>
          <Text style={styles.showName} numberOfLines={1}>
            {p.show.name}
          </Text>
          <Text style={styles.code}>{epCode(next)}</Text>
          <Text style={styles.epName} numberOfLines={1}>
            {next.name}
          </Text>
          <ProgressBar value={p.aired.length ? p.watchedCount / p.aired.length : 0} style={{ marginTop: 6 }} />
          <Text style={styles.muted}>
            {left} episode{left === 1 ? '' : 's'} left
          </Text>
        </Pressable>
      </Link>
      <WatchToggle watched={false} size={38} onPress={() => setWatched(p.show, [next], true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  showName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  code: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  epName: { color: colors.text, fontSize: 14 },
  muted: { color: colors.muted, fontSize: 12 },
});
