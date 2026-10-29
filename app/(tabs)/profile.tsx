import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, PosterCard, ProgressBar, SectionHeader } from '@/components/ui';
import { colors, radius } from '@/constants/theme';
import { useMyShows } from '@/lib/useMyShows';
import { splitMinutes } from '@/lib/utils';
import { useTracker } from '@/store/tracker';

function confirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function ProfileScreen() {
  const { stats, reset } = useTracker();
  const { progress } = useMyShows();
  const time = splitMinutes(stats.minutes);
  const sorted = [...progress].sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
  const completed = progress.filter((p) => p.aired.length > 0 && p.watchedCount === p.aired.length).length;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.timeCard}>
        <Text style={styles.timeLabel}>TV TIME</Text>
        <View style={styles.timeRow}>
          <TimeUnit value={time.months} label="months" />
          <TimeUnit value={time.days} label="days" />
          <TimeUnit value={time.hours} label="hours" />
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat value={stats.episodes} label="Episodes watched" />
        <Stat value={stats.shows} label="Shows" />
        <Stat value={completed} label="Caught up" />
      </View>

      <SectionHeader title="My shows" />
      {sorted.length === 0 ? (
        <Text style={[styles.muted, { paddingHorizontal: 16 }]}>Shows you add will appear here.</Text>
      ) : (
        <View style={styles.grid}>
          {sorted.map((p) => (
            <View key={p.show.id} style={{ width: 104 }}>
              <PosterCard
                id={p.show.id}
                name={p.show.name}
                image={p.show.image}
                width={104}
                subtitle={`${p.watchedCount}/${p.aired.length} watched`}
              />
              <ProgressBar
                value={p.aired.length ? p.watchedCount / p.aired.length : 0}
                style={{ marginTop: 4 }}
              />
            </View>
          ))}
        </View>
      )}

      <View style={{ padding: 16, gap: 12, marginTop: 24 }}>
        <Button title="Account, sync & backup" icon="cloud-upload-outline" onPress={() => router.push('/account')} />
        <Button
          title="Reset all data"
          icon="trash-outline"
          variant="secondary"
          onPress={() =>
            confirm(
              'Reset all data?',
              'This removes every show and watched episode from this device (and from your other devices if you are signed in to sync).',
              reset
            )
          }
        />
        <Text style={[styles.muted, { textAlign: 'center' }]}>
          Show data from{' '}
          <Text style={styles.link} onPress={() => WebBrowser.openBrowserAsync('https://www.tvmaze.com')}>
            TVmaze
          </Text>{' '}
          · Bios from{' '}
          <Text style={styles.link} onPress={() => WebBrowser.openBrowserAsync('https://www.wikipedia.org')}>
            Wikipedia
          </Text>
        </Text>
      </View>
    </ScrollView>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={styles.timeValue}>{value}</Text>
      <Text style={styles.timeUnit}>{label}</Text>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  timeCard: {
    margin: 16,
    padding: 20,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    gap: 12,
  },
  timeLabel: { color: colors.onAccent, fontWeight: '900', letterSpacing: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' },
  timeValue: { color: colors.onAccent, fontSize: 40, fontWeight: '900' },
  timeUnit: { color: colors.onAccent, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  stat: { flex: 1, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, gap: 4 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '900' },
  muted: { color: colors.muted, fontSize: 12 },
  link: { color: colors.accent, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
});
