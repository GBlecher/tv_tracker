import type { Episode, Show } from './tvmaze';

export function stripHtml(html?: string | null) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export const pad = (n: number) => String(n).padStart(2, '0');

export const epCode = (ep: Pick<Episode, 'season' | 'number'>) =>
  ep.number == null ? `S${pad(ep.season)} Special` : `S${pad(ep.season)}E${pad(ep.number)}`;

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function parseDate(iso: string) {
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
}

export function epDate(ep: Pick<Episode, 'airstamp' | 'airdate'>): Date | null {
  if (ep.airstamp) return new Date(ep.airstamp);
  if (ep.airdate) return parseDate(ep.airdate);
  return null;
}

export function hasAired(ep: Pick<Episode, 'airstamp' | 'airdate'>, now = Date.now()) {
  const d = epDate(ep);
  return !!d && d.getTime() <= now;
}

/** The day (YYYY-MM-DD) an episode airs in the user's timezone. */
export function localDayKey(ep: Pick<Episode, 'airstamp' | 'airdate'>) {
  const d = epDate(ep);
  return d ? toISODate(d) : '';
}

/** Formats an episode's air date in the user's timezone. */
export function formatEpDate(ep: Pick<Episode, 'airstamp' | 'airdate'>, opts?: Intl.DateTimeFormatOptions) {
  const d = epDate(ep);
  if (!d) return 'TBA';
  return d.toLocaleDateString(undefined, opts ?? { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDate(iso?: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return 'TBA';
  return parseDate(iso).toLocaleDateString(undefined, opts ?? { month: 'short', day: 'numeric', year: 'numeric' });
}

export function dayLabel(date: Date) {
  const key = toISODate(date);
  const now = new Date();
  if (key === toISODate(now)) return 'Today';
  if (key === toISODate(addDays(now, 1))) return 'Tomorrow';
  if (key === toISODate(addDays(now, -1))) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export function formatAirTime(ep: Pick<Episode, 'airstamp' | 'airtime'>) {
  if (!ep.airstamp || !ep.airtime) return '';
  return new Date(ep.airstamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function splitMinutes(total: number) {
  const months = Math.floor(total / 43200);
  let rest = total % 43200;
  const days = Math.floor(rest / 1440);
  rest %= 1440;
  return { months, days, hours: Math.floor(rest / 60), minutes: rest % 60 };
}

export function yearRange(show: Pick<Show, 'premiered' | 'ended' | 'status'>) {
  const start = show.premiered?.slice(0, 4);
  if (!start) return '';
  if (show.ended) {
    const end = show.ended.slice(0, 4);
    return end === start ? start : `${start}–${end}`;
  }
  return show.status === 'Running' ? `${start}–` : start;
}

export const channelName = (show?: Pick<Show, 'network' | 'webChannel'> | null) =>
  show?.network?.name ?? show?.webChannel?.name ?? '';

export function age(birthday: string, deathday?: string | null) {
  const b = parseDate(birthday);
  const end = deathday ? parseDate(deathday) : new Date();
  let years = end.getFullYear() - b.getFullYear();
  if (end.getMonth() < b.getMonth() || (end.getMonth() === b.getMonth() && end.getDate() < b.getDate())) years--;
  return years;
}

export function uniqueBy<T>(items: T[], key: (t: T) => string | number) {
  const seen = new Set<string | number>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
