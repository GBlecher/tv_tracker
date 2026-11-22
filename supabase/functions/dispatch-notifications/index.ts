import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const table = 'notification_devices';
const dailyLimit = 3;
const episodeCache = new Map<number, Promise<TvMazeEpisode[]>>();

interface TvMazeEpisode {
  id: number;
  name: string;
  season: number;
  number: number | null;
  airdate: string;
  airstamp: string | null;
}

interface FollowedShow {
  id: number;
  name: string;
  addedAt: number;
}

interface PendingEpisode {
  episodeId: number;
  showId: number;
  showName: string;
  episodeName: string;
  season: number;
  number: number;
  airstamp: string;
}

interface DeviceRow {
  device_id: string;
  expo_push_token: string | null;
  platform: 'ios' | 'android';
  time_zone: string;
  followed_shows: FollowedShow[];
  watched_episode_ids: number[];
  pending_episodes: PendingEpisode[];
  last_notified_episode_ids: number[];
  last_scanned_at: string;
  app_active: boolean;
  app_state_updated_at: string;
  daily_date: string | null;
  daily_count: number;
}

function localDate(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function episodeTime(episode: TvMazeEpisode) {
  if (episode.airstamp) return new Date(episode.airstamp).getTime();
  return episode.airdate ? new Date(`${episode.airdate}T23:59:59Z`).getTime() : Number.NaN;
}

function fetchEpisodes(showId: number): Promise<TvMazeEpisode[]> {
  const hit = episodeCache.get(showId);
  if (hit) return hit;
  const promise = fetch(`https://api.tvmaze.com/shows/${showId}/episodes`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`TVmaze returned ${response.status} for show ${showId}.`);
      return (await response.json()) as TvMazeEpisode[];
    })
    .then((episodes) => episodes.filter((episode) => episode.number !== null));
  const cached = promise.catch((error) => {
    episodeCache.delete(showId);
    throw error;
  });
  episodeCache.set(showId, cached);
  return cached;
}

async function loadShowEpisodes(showIds: number[]) {
  const result = new Map<number, TvMazeEpisode[]>();
  const queue = [...new Set(showIds)];
  for (let i = 0; i < queue.length; i += 4) {
    const batch = queue.slice(i, i + 4);
    const responses = await Promise.all(batch.map((id) => fetchEpisodes(id)));
    batch.forEach((id, index) => result.set(id, responses[index]));
  }
  return result;
}

function notificationContent(row: DeviceRow, pending: PendingEpisode[], episodesByShow: Map<number, TvMazeEpisode[]>, now: number) {
  const showIds = [...new Set(pending.map((episode) => episode.showId))];
  const watched = new Set(row.watched_episode_ids);
  const unwatchedShowCount = row.followed_shows.filter((show) =>
    (episodesByShow.get(show.id) ?? []).some((episode) => {
      const airedAt = episodeTime(episode);
      return Number.isFinite(airedAt) && airedAt <= now && !watched.has(episode.id);
    })
  ).length;
  let title: string;
  let body: string;
  let path: string;
  let categoryId: string;

  if (showIds.length > 1 || unwatchedShowCount > 1) {
    title = 'Time to catch up';
    body = 'You have some episodes to catch up on.';
    path = '/(tabs)';
    categoryId = 'tvtracker-shows';
  } else {
    const showId = showIds[0];
    const showName = pending[0].showName;
    const outstanding = (episodesByShow.get(showId) ?? []).filter((episode) => {
      const airedAt = episodeTime(episode);
      return Number.isFinite(airedAt) && airedAt <= now && !watched.has(episode.id);
    });

    if (pending.length === 1) {
      title = 'New episode';
      body = `A new episode of ${showName} is out. Catch up now.`;
      path = outstanding.length === 1 ? `/episode/${pending[0].episodeId}` : `/show/${showId}`;
    } else {
      title = 'New episodes';
      body = `Some new episodes of ${showName} are out. Catch up now.`;
      path = `/show/${showId}`;
    }
    categoryId = path.startsWith('/episode/') ? 'tvtracker-episode' : 'tvtracker-show';
  }

  return {
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: 'episodes',
    categoryId,
    collapseId: `tvtracker-${row.device_id}`,
    tag: `tvtracker-${row.device_id}`,
    threadId: `tvtracker-${row.device_id}`,
    data: { kind: 'tv-tracker-catchup', path },
  };
}

async function sendPush(token: string, content: ReturnType<typeof notificationContent>) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: token, ...content }),
  });
  const result = (await response.json()) as {
    data?: { status?: string; message?: string; details?: { error?: string } };
  };
  if (!response.ok || result.data?.status === 'error') {
    throw new Error(result.data?.message ?? result.data?.details?.error ?? `Expo Push returned ${response.status}.`);
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405 });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    console.error('Notification dispatcher is missing Supabase environment variables.');
    return new Response('Notification service is not configured.', { status: 500 });
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const devices: DeviceRow[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin
      .from(table)
      .select(
        'device_id, expo_push_token, platform, time_zone, followed_shows, watched_episode_ids, pending_episodes, last_notified_episode_ids, last_scanned_at, app_active, app_state_updated_at, daily_date, daily_count'
      )
      .eq('enabled', true)
      .range(from, from + 499);
    if (error) {
      console.error('Could not load notification devices:', error.message);
      return new Response('Could not load notification devices.', { status: 500 });
    }
    devices.push(...(data as DeviceRow[]));
    if (data.length < 500) break;
  }

  const showIds = devices.flatMap((device) =>
    Array.isArray(device.followed_shows) ? device.followed_shows.map((show) => show.id) : []
  );
  let episodesByShow: Map<number, TvMazeEpisode[]>;
  try {
    episodesByShow = await loadShowEpisodes(showIds);
  } catch (error) {
    console.error('Could not load episode schedules:', error);
    return new Response('Could not load episode schedules.', { status: 502 });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const errors: string[] = [];

  for (const device of devices) {
    if (!device.expo_push_token) continue;
    const shows = Array.isArray(device.followed_shows) ? device.followed_shows : [];
    const followedIds = new Set(shows.map((show) => show.id));
    const watched = new Set(device.watched_episode_ids ?? []);
    const pending = Array.isArray(device.pending_episodes)
      ? device.pending_episodes.filter((episode) => followedIds.has(episode.showId) && !watched.has(episode.episodeId))
      : [];
    const pendingIds = new Set(pending.map((episode) => episode.episodeId));
    const lastNotifiedIds = new Set(device.last_notified_episode_ids ?? []);
    for (const id of lastNotifiedIds) {
      if (!pendingIds.has(id)) lastNotifiedIds.delete(id);
    }
    const previousScan = new Date(device.last_scanned_at).getTime();

    for (const show of shows) {
      const followedAt = Number.isFinite(show.addedAt) ? show.addedAt : 0;
      for (const episode of episodesByShow.get(show.id) ?? []) {
        const airedAt = episodeTime(episode);
        if (
          !Number.isFinite(airedAt) ||
          airedAt <= previousScan ||
          airedAt > now ||
          airedAt <= followedAt ||
          watched.has(episode.id) ||
          pendingIds.has(episode.id)
        ) {
          continue;
        }
        pending.push({
          episodeId: episode.id,
          showId: show.id,
          showName: show.name,
          episodeName: episode.name,
          season: episode.season,
          number: episode.number!,
          airstamp: episode.airstamp ?? episode.airdate,
        });
        pendingIds.add(episode.id);
      }
    }

    const appStateUpdatedAt = new Date(device.app_state_updated_at).getTime();
    if (device.app_active && now - appStateUpdatedAt < 8 * 60 * 1000) {
      const { error } = await admin
        .from(table)
        .update({
          pending_episodes: [],
          last_notified_episode_ids: [],
          last_scanned_at: nowIso,
          updated_at: nowIso,
        })
        .eq('device_id', device.device_id);
      if (error) errors.push(`${device.device_id}: ${error.message}`);
      continue;
    }

    const { error: saveError } = await admin
      .from(table)
      .update({
        pending_episodes: pending,
        last_notified_episode_ids: [...lastNotifiedIds],
        last_scanned_at: nowIso,
        updated_at: nowIso,
      })
      .eq('device_id', device.device_id);
    if (saveError) {
      errors.push(`${device.device_id}: ${saveError.message}`);
      continue;
    }
    if (pending.length === 0) continue;
    if (pending.every((episode) => lastNotifiedIds.has(episode.episodeId))) continue;

    let today: string;
    try {
      today = localDate(device.time_zone);
    } catch {
      today = localDate('UTC');
    }
    const dailyCount = device.daily_date === today ? device.daily_count : 0;
    if (dailyCount >= dailyLimit) continue;

    try {
      const content = notificationContent(device, pending, episodesByShow, now);
      await sendPush(device.expo_push_token, content);
      const { error } = await admin
        .from(table)
        .update({
          daily_date: today,
          daily_count: dailyCount + 1,
          last_notified_episode_ids: pending.map((episode) => episode.episodeId),
          updated_at: nowIso,
        })
        .eq('device_id', device.device_id);
      if (error) errors.push(`${device.device_id}: notification sent but daily cap could not be saved: ${error.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Could not send episode notification to ${device.device_id}:`, message);
      errors.push(`${device.device_id}: ${message}`);
    }
  }

  episodeCache.clear();
  return Response.json({ devices: devices.length, errors }, { status: errors.length ? 207 : 200 });
});
