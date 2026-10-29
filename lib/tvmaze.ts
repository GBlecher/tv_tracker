// TVmaze public API — free, no API key, updated continuously. https://www.tvmaze.com/api
const BASE = 'https://api.tvmaze.com';
const TTL = 10 * 60 * 1000;
const MAX_CONCURRENT = 4;

export type TvImage = { medium: string; original: string } | null;

export interface Channel {
  id: number;
  name: string;
  country: { name: string; code: string; timezone: string } | null;
  officialSite?: string | null;
}

export interface Show {
  id: number;
  url: string;
  name: string;
  type: string;
  language: string | null;
  genres: string[];
  status: string;
  runtime: number | null;
  averageRuntime: number | null;
  premiered: string | null;
  ended: string | null;
  officialSite: string | null;
  schedule: { time: string; days: string[] };
  rating: { average: number | null };
  weight: number;
  network: Channel | null;
  webChannel: Channel | null;
  externals: { imdb: string | null; thetvdb: number | null; tvrage: number | null };
  image: TvImage;
  summary: string | null;
  _embedded?: {
    cast?: CastMember[];
    crew?: CrewMember[];
    seasons?: Season[];
    nextepisode?: Episode;
    previousepisode?: Episode;
  };
}

export interface Episode {
  id: number;
  url: string;
  name: string;
  season: number;
  number: number | null;
  type: string;
  airdate: string;
  airtime: string;
  airstamp: string | null;
  runtime: number | null;
  rating: { average: number | null };
  image: TvImage;
  summary: string | null;
  show?: Show;
  _embedded?: {
    show?: Show;
    guestcast?: CastMember[];
    guestcrew?: CrewMember[];
  };
}

export interface Season {
  id: number;
  number: number;
  name: string;
  episodeOrder: number | null;
  premiereDate: string | null;
  endDate: string | null;
  image: TvImage;
  summary: string | null;
}

export interface Person {
  id: number;
  url: string;
  name: string;
  country: { name: string; code: string } | null;
  birthday: string | null;
  deathday: string | null;
  gender: string | null;
  image: TvImage;
}

export interface Character {
  id: number;
  name: string;
  image: TvImage;
}

export interface CastMember {
  person: Person;
  character: Character;
  self: boolean;
  voice: boolean;
}

export interface CrewMember {
  type: string;
  person: Person;
}

export interface CastCredit {
  self: boolean;
  voice: boolean;
  _embedded: { show: Show; character: Character };
}

export class NotFoundError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Small concurrency limiter so screens that fan out (premieres, watch list) stay under TVmaze's rate limit.
let active = 0;
const waiting: (() => void)[] = [];
async function acquire() {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else active--;
}

async function request<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await acquire();
    let res: Response;
    try {
      res = await fetch(BASE + path);
    } finally {
      release();
    }
    if (res.status === 429 && attempt < 5) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (res.status === 404) throw new NotFoundError('Not found');
    if (!res.ok) throw new Error(`TVmaze request failed (${res.status})`);
    return res.json() as Promise<T>;
  }
}

const cache = new Map<string, { time: number; promise: Promise<unknown> }>();

function get<T>(path: string, ttl = TTL): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.time < ttl) return hit.promise as Promise<T>;
  const promise = request<T>(path);
  cache.set(path, { time: Date.now(), promise });
  promise.catch(() => cache.delete(path));
  return promise;
}

export function clearCache() {
  cache.clear();
}

const withShow = (ep: Episode): Episode => ({ ...ep, show: ep.show ?? ep._embedded?.show });

export async function searchShows(query: string) {
  const res = await get<{ score: number; show: Show }[]>(`/search/shows?q=${encodeURIComponent(query)}`);
  return res.map((r) => r.show);
}

export async function searchPeople(query: string) {
  const res = await get<{ score: number; person: Person }[]>(`/search/people?q=${encodeURIComponent(query)}`);
  return res.map((r) => r.person);
}

export function getShow(id: number | string) {
  return get<Show>(
    `/shows/${id}?embed[]=cast&embed[]=crew&embed[]=seasons&embed[]=nextepisode&embed[]=previousepisode`
  );
}

/** Regular (numbered) episodes only, in airing order. */
export async function getEpisodes(showId: number | string) {
  const eps = await get<Episode[]>(`/shows/${showId}/episodes`);
  return eps.filter((e) => e.number != null);
}

export async function getEpisode(id: number | string) {
  const ep = await get<Episode>(`/episodes/${id}?embed[]=show&embed[]=guestcast&embed[]=guestcrew`);
  // Guest crew uses `guestCrewType` instead of the `type` field show crew uses.
  if (ep._embedded?.guestcrew) {
    ep._embedded.guestcrew = ep._embedded.guestcrew.map((c) => ({
      ...c,
      type: c.type ?? (c as CrewMember & { guestCrewType?: string }).guestCrewType ?? '',
    }));
  }
  return withShow(ep);
}

export function getPerson(id: number | string) {
  return get<Person>(`/people/${id}`);
}

export function getPersonCredits(id: number | string) {
  return get<CastCredit[]>(`/people/${id}/castcredits?embed[]=show&embed[]=character`);
}

/** Broadcast TV schedule for a country (ISO 3166-1 code) on a date (YYYY-MM-DD). */
export async function getSchedule(date: string, country = 'US') {
  const eps = await get<Episode[]>(`/schedule?country=${country}&date=${date}`);
  return eps.map(withShow);
}

/** Streaming (Netflix, Disney+, Apple TV+, ...) schedule for a date. */
export async function getWebSchedule(date: string) {
  const eps = await get<Episode[]>(`/schedule/web?date=${date}`);
  return eps.map(withShow);
}
