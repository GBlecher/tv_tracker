import { useMemo } from 'react';

import { getEpisodes, type Episode } from '@/lib/tvmaze';
import { useAsync } from '@/lib/useAsync';
import { hasAired } from '@/lib/utils';
import { useTracker, type TrackedShow } from '@/store/tracker';

export interface ShowProgress {
  show: TrackedShow;
  episodes: Episode[];
  aired: Episode[];
  watchedCount: number;
  /** First aired episode not yet watched. */
  next?: Episode;
  /** Next episode that hasn't aired yet. */
  upcoming?: Episode;
  lastWatchedAt: number;
}

export function useMyShows() {
  const { shows, watched, ready } = useTracker();
  const ids = useMemo(
    () =>
      Object.keys(shows)
        .map(Number)
        .sort((a, b) => a - b),
    [shows]
  );
  const key = ids.join(',');

  const { data, error, loading, reload } = useAsync(async () => {
    const results = await Promise.allSettled(ids.map((id) => getEpisodes(id)));
    const map: Record<number, Episode[]> = {};
    ids.forEach((id, i) => {
      const r = results[i];
      map[id] = r.status === 'fulfilled' ? r.value : [];
    });
    return { key, map };
  }, [key]);

  const progress = useMemo<ShowProgress[]>(() => {
    if (!data) return [];
    const map = data.map;
    const now = Date.now();
    return ids
      .filter((id) => shows[id])
      .map((id) => {
        const episodes = map[id] ?? [];
        const aired = episodes.filter((e) => hasAired(e, now));
        const watchedEps = aired.filter((e) => watched[e.id]);
        return {
          show: shows[id],
          episodes,
          aired,
          watchedCount: watchedEps.length,
          next: aired.find((e) => !watched[e.id]),
          upcoming: episodes.find((e) => !hasAired(e, now)),
          lastWatchedAt: Math.max(shows[id].addedAt, ...watchedEps.map((e) => watched[e.id].at)),
        };
      });
  }, [data, ids, shows, watched]);

  // Data loaded before saved shows were restored (empty list) doesn't count; keep showing the loader.
  const hasData = ready && !!data && (data.key === key || data.key !== '');
  return { progress, error, loading: !hasData, refreshing: loading && hasData, reload };
}
