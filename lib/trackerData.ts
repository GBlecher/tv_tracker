import type { Show } from './tvmaze';

export type ShowLike = Pick<Show, 'id' | 'name' | 'image' | 'status' | 'runtime' | 'averageRuntime'>;
export type TrackedShow = ShowLike & { addedAt: number };
export type WatchedEpisode = { showId: number; runtime: number; at: number };

/**
 * Everything the app stores about the user. `removed` keeps a timestamp for every show/episode the
 * user removed so that merging two copies (backup restore, cloud sync) doesn't bring them back.
 */
export interface TrackerData {
  shows: Record<number, TrackedShow>;
  watched: Record<number, WatchedEpisode>;
  removed: { shows: Record<number, number>; watched: Record<number, number> };
}

export const emptyData = (): TrackerData => ({ shows: {}, watched: {}, removed: { shows: {}, watched: {} } });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Accepts data from storage, a backup file or the server and returns a well-formed TrackerData. */
export function normalizeData(input: unknown): TrackerData {
  const out = emptyData();
  if (!isObj(input)) return out;
  if (isObj(input.shows)) {
    for (const [k, v] of Object.entries(input.shows)) {
      const id = Number(k);
      if (!Number.isInteger(id) || !isObj(v) || typeof v.name !== 'string') continue;
      out.shows[id] = {
        id,
        name: v.name,
        image: (isObj(v.image) ? v.image : null) as TrackedShow['image'],
        status: typeof v.status === 'string' ? v.status : '',
        runtime: typeof v.runtime === 'number' ? v.runtime : null,
        averageRuntime: typeof v.averageRuntime === 'number' ? v.averageRuntime : null,
        addedAt: num(v.addedAt),
      };
    }
  }
  if (isObj(input.watched)) {
    for (const [k, v] of Object.entries(input.watched)) {
      const id = Number(k);
      if (!Number.isInteger(id) || !isObj(v) || typeof v.showId !== 'number') continue;
      out.watched[id] = { showId: v.showId, runtime: num(v.runtime), at: num(v.at) };
    }
  }
  const removed = isObj(input.removed) ? input.removed : {};
  for (const kind of ['shows', 'watched'] as const) {
    const src = removed[kind];
    if (!isObj(src)) continue;
    for (const [k, v] of Object.entries(src)) {
      const id = Number(k);
      if (Number.isInteger(id) && typeof v === 'number') out.removed[kind][id] = v;
    }
  }
  return out;
}

/**
 * Merges two copies of the user's data. For each show/episode the most recent action wins:
 * adding/watching (timestamped by `addedAt`/`at`) vs. removing (timestamped in `removed`).
 */
export function mergeData(a: TrackerData, b: TrackerData): TrackerData {
  const out = emptyData();

  const showIds = new Set([...Object.keys(a.shows), ...Object.keys(b.shows), ...Object.keys(a.removed.shows), ...Object.keys(b.removed.shows)]);
  for (const k of showIds) {
    const id = Number(k);
    const sa = a.shows[id];
    const sb = b.shows[id];
    const entry = sa && sb ? (sb.addedAt > sa.addedAt ? sb : sa) : (sa ?? sb);
    const removedAt = Math.max(a.removed.shows[id] ?? 0, b.removed.shows[id] ?? 0);
    if (entry && entry.addedAt > removedAt) out.shows[id] = entry;
    else if (removedAt) out.removed.shows[id] = removedAt;
  }

  const epIds = new Set([...Object.keys(a.watched), ...Object.keys(b.watched), ...Object.keys(a.removed.watched), ...Object.keys(b.removed.watched)]);
  for (const k of epIds) {
    const id = Number(k);
    const wa = a.watched[id];
    const wb = b.watched[id];
    const entry = wa && wb ? (wb.at > wa.at ? wb : wa) : (wa ?? wb);
    const removedAt = Math.max(a.removed.watched[id] ?? 0, b.removed.watched[id] ?? 0);
    if (entry && entry.at > removedAt) out.watched[id] = entry;
    else if (removedAt) out.removed.watched[id] = removedAt;
  }

  return out;
}

/** Stable JSON (sorted keys) so two equal copies always compare equal. */
export function canonical(data: TrackerData): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : isObj(v)
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
        : v;
  return JSON.stringify(sort(data));
}

export const sameData = (a: TrackerData, b: TrackerData) => canonical(a) === canonical(b);
