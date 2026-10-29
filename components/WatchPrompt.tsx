import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { Button } from '@/components/ui';
import { colors, radius } from '@/constants/theme';
import { getEpisodes, type Episode } from '@/lib/tvmaze';
import { epCode, hasAired } from '@/lib/utils';
import { useTracker, type ShowLike } from '@/store/tracker';

type Ep = Pick<Episode, 'id' | 'runtime' | 'season' | 'number' | 'airdate' | 'airstamp'>;
/** `target` is a single episode or a batch (e.g. a whole season). */
type Action = (show: ShowLike, target: Ep | Ep[], allEpisodes?: Ep[]) => Promise<void>;
type Pending = { mode: 'mark' | 'unmark'; show: ShowLike; episodes: Ep[]; others: Ep[] };

const WatchPromptContext = createContext<{ mark: Action; unmark: Action } | null>(null);

const isBefore = (a: Ep, b: Ep) => a.season < b.season || (a.season === b.season && (a.number ?? 0) < (b.number ?? 0));
const earliest = (eps: Ep[]) => eps.reduce((a, b) => (isBefore(b, a) ? b : a));
const latest = (eps: Ep[]) => eps.reduce((a, b) => (isBefore(a, b) ? b : a));

export function WatchPromptProvider({ children }: { children: ReactNode }) {
  const { isWatched, setWatched } = useTracker();
  const [pending, setPending] = useState<Pending | null>(null);

  const run = useCallback(
    async (mode: Pending['mode'], show: ShowLike, target: Ep | Ep[], allEpisodes?: Ep[]) => {
      const episodes = Array.isArray(target) ? target : [target];
      if (episodes.length === 0) return;
      const ids = new Set(episodes.map((e) => e.id));
      const all = allEpisodes ?? (await getEpisodes(show.id).catch(() => []));
      const others =
        mode === 'mark'
          ? // Earlier aired episodes that are still unwatched.
            all.filter((e) => !ids.has(e.id) && isBefore(e, earliest(episodes)) && hasAired(e) && !isWatched(e.id))
          : // Later episodes that are still marked watched.
            all.filter((e) => !ids.has(e.id) && isBefore(latest(episodes), e) && isWatched(e.id));
      if (others.length === 0) setWatched(show, episodes, mode === 'mark');
      else setPending({ mode, show, episodes, others });
    },
    [isWatched, setWatched]
  );

  const value = useMemo(
    () => ({
      mark: (show: ShowLike, target: Ep | Ep[], all?: Ep[]) => run('mark', show, target, all),
      unmark: (show: ShowLike, target: Ep | Ep[], all?: Ep[]) => run('unmark', show, target, all),
    }),
    [run]
  );

  const close = () => setPending(null);
  const mark = pending?.mode === 'mark';
  const n = pending?.others.length ?? 0;
  const s = n === 1 ? '' : 's';
  const batch = pending?.episodes ?? [];
  const isSeason = batch.length > 1 && batch.every((e) => e.season === batch[0].season);
  const season = batch[0]?.season;

  const allTitle = !pending
    ? ''
    : mark
      ? isSeason
        ? `Mark all up to end of Season ${season}`
        : `Mark all up to ${epCode(latest(batch))}`
      : isSeason
        ? `Unmark Season ${season} and later`
        : `Unmark ${epCode(earliest(batch))} and later`;
  const justTitle = isSeason ? 'Just this season' : batch.length > 1 ? 'Just these' : 'Just this one';

  return (
    <WatchPromptContext.Provider value={value}>
      {children}
      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>{mark ? 'Mark previous episodes?' : 'Unmark later episodes?'}</Text>
            <Text style={styles.message}>
              {mark
                ? `You haven't watched ${n} earlier episode${s} of ${pending?.show.name}. Do you want to mark ${n === 1 ? 'it' : 'them'} as watched too?`
                : `You've marked ${n} later episode${s} of ${pending?.show.name} as watched. Do you want to unmark ${n === 1 ? 'it' : 'them'} too?`}
            </Text>
            <Button
              title={allTitle}
              icon={mark ? 'checkmark-done' : 'close-circle-outline'}
              onPress={() => {
                if (pending) setWatched(pending.show, [...pending.others, ...pending.episodes], mark);
                close();
              }}
            />
            <Button
              title={justTitle}
              icon={mark ? 'checkmark' : 'close'}
              variant="secondary"
              onPress={() => {
                if (pending) setWatched(pending.show, pending.episodes, mark);
                close();
              }}
            />
            <Pressable onPress={close} style={styles.cancel} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </WatchPromptContext.Provider>
  );
}

function useWatchPrompt() {
  const ctx = useContext(WatchPromptContext);
  if (!ctx) throw new Error('useWatchPrompt must be used inside WatchPromptProvider');
  return ctx;
}

/** Marks episodes watched, asking first if earlier aired episodes are still unwatched. */
export const useMarkWatched = () => useWatchPrompt().mark;

/** Unmarks episodes, asking first if later episodes are still marked watched. */
export const useUnmarkWatched = () => useWatchPrompt().unmark;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 20,
    gap: 10,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  message: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 6 },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: colors.muted, fontWeight: '700', fontSize: 15 },
});
