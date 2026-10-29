import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Episode } from '@/lib/tvmaze';
import { emptyData, mergeData, normalizeData, ShowLike, TrackedShow, TrackerData } from '@/lib/trackerData';

export type { ShowLike, TrackedShow, WatchedEpisode, TrackerData } from '@/lib/trackerData';

const STORAGE_KEY = 'tvtracker:v1';

interface TrackerValue {
  shows: TrackerData['shows'];
  watched: TrackerData['watched'];
  /** Full state including removal history; used for backup and cloud sync. */
  data: TrackerData;
  ready: boolean;
  isFollowing: (showId: number) => boolean;
  isWatched: (episodeId: number) => boolean;
  follow: (show: ShowLike) => void;
  unfollow: (showId: number) => void;
  setWatched: (show: ShowLike, episodes: Pick<Episode, 'id' | 'runtime'>[], watched: boolean) => void;
  watchedCountForShow: (showId: number) => number;
  stats: { shows: number; episodes: number; minutes: number };
  reset: () => void;
  /** Merges another copy of the data (from a backup or the cloud) into this device's data. */
  mergeIn: (other: TrackerData) => void;
}

const TrackerContext = createContext<TrackerValue | null>(null);

// Strictly increasing timestamps so an add and a remove in the same millisecond still have an order.
let lastStamp = 0;
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

const toTracked = (show: ShowLike): TrackedShow => ({
  id: show.id,
  name: show.name,
  image: show.image,
  status: show.status,
  runtime: show.runtime,
  averageRuntime: show.averageRuntime,
  addedAt: stamp(),
});

export function TrackerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TrackerData>(emptyData);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState(normalizeData(JSON.parse(raw)));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const follow = useCallback((show: ShowLike) => {
    setState((s) => (s.shows[show.id] ? s : { ...s, shows: { ...s.shows, [show.id]: toTracked(show) } }));
  }, []);

  const unfollow = useCallback((showId: number) => {
    setState((s) => {
      const at = stamp();
      const shows = { ...s.shows };
      delete shows[showId];
      const removed = { shows: { ...s.removed.shows, [showId]: at }, watched: { ...s.removed.watched } };
      const watched: TrackerData['watched'] = {};
      for (const [id, w] of Object.entries(s.watched)) {
        if (w.showId !== showId) watched[Number(id)] = w;
        else removed.watched[Number(id)] = at;
      }
      return { shows, watched, removed };
    });
  }, []);

  const setWatched = useCallback(
    (show: ShowLike, episodes: Pick<Episode, 'id' | 'runtime'>[], value: boolean) => {
      setState((s) => {
        const watched = { ...s.watched };
        const removedWatched = { ...s.removed.watched };
        for (const ep of episodes) {
          if (value) {
            watched[ep.id] ??= {
              showId: show.id,
              runtime: ep.runtime ?? show.averageRuntime ?? show.runtime ?? 0,
              at: stamp(),
            };
          } else if (watched[ep.id]) {
            delete watched[ep.id];
            removedWatched[ep.id] = stamp();
          }
        }
        // Like TV Time, watching an episode automatically adds the show to your list.
        const shows = value && !s.shows[show.id] ? { ...s.shows, [show.id]: toTracked(show) } : s.shows;
        return { shows, watched, removed: { ...s.removed, watched: removedWatched } };
      });
    },
    []
  );

  const reset = useCallback(() => {
    setState((s) => {
      const at = stamp();
      const removed = { shows: { ...s.removed.shows }, watched: { ...s.removed.watched } };
      for (const id of Object.keys(s.shows)) removed.shows[Number(id)] = at;
      for (const id of Object.keys(s.watched)) removed.watched[Number(id)] = at;
      return { shows: {}, watched: {}, removed };
    });
  }, []);

  const mergeIn = useCallback((other: TrackerData) => {
    setState((s) => mergeData(s, normalizeData(other)));
  }, []);

  const value = useMemo<TrackerValue>(() => {
    const watchedList = Object.values(state.watched);
    const perShow = new Map<number, number>();
    for (const w of watchedList) perShow.set(w.showId, (perShow.get(w.showId) ?? 0) + 1);
    return {
      shows: state.shows,
      watched: state.watched,
      data: state,
      ready,
      isFollowing: (id) => !!state.shows[id],
      isWatched: (id) => !!state.watched[id],
      follow,
      unfollow,
      setWatched,
      watchedCountForShow: (id) => perShow.get(id) ?? 0,
      stats: {
        shows: Object.keys(state.shows).length,
        episodes: watchedList.length,
        minutes: watchedList.reduce((sum, w) => sum + (w.runtime || 0), 0),
      },
      reset,
      mergeIn,
    };
  }, [state, ready, follow, unfollow, setWatched, reset, mergeIn]);

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error('useTracker must be used inside TrackerProvider');
  return ctx;
}
