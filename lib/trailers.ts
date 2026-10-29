import { Linking } from 'react-native';

const searchUrl = (query: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

const year = (date?: string | null) => (date ? ` ${date.slice(0, 4)}` : '');

export function showTrailerUrl(show: { name: string; premiered?: string | null }) {
  return searchUrl(`${show.name}${year(show.premiered)} official trailer`);
}

export function seasonTrailerUrl(showName: string, season: number) {
  return searchUrl(`${showName} season ${season} official trailer`);
}

/** Networks usually publish "promos" for individual episodes rather than trailers. */
export function episodeTrailerUrl(showName: string, ep: { season: number; number: number | null; name: string }) {
  return searchUrl(`${showName} ${ep.season}x${String(ep.number ?? '').padStart(2, '0')} "${ep.name}" promo`);
}

export function openTrailer(url: string) {
  Linking.openURL(url).catch(() => {});
}
