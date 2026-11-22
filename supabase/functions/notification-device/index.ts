import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = { 'Content-Type': 'application/json' };
const table = 'notification_devices';

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function isFollowedShow(value: unknown): value is { id: number; name: string; addedAt: number } {
  if (!value || typeof value !== 'object') return false;
  const show = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(show.id) &&
    Number(show.id) > 0 &&
    typeof show.name === 'string' &&
    show.name.length <= 300 &&
    typeof show.addedAt === 'number' &&
    Number.isFinite(show.addedAt)
  );
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return respond({ error: 'A signed-in device session is required.' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) {
    console.error('Notification device function is missing Supabase environment variables.');
    return respond({ error: 'Notification service is not configured.' }, 500);
  }

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return respond({ error: 'The device session is invalid.' }, 401);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return respond({ error: 'Invalid JSON body.' }, 400);
  }

  const action = input.action;
  const deviceId = input.deviceId;
  if (
    typeof deviceId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)
  ) {
    return respond({ error: 'Invalid device ID.' }, 400);
  }
  if (!['sync', 'open', 'background', 'heartbeat', 'dismiss', 'disable'].includes(String(action))) {
    return respond({ error: 'Invalid device action.' }, 400);
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const { data: existing, error: lookupError } = await admin
    .from(table)
    .select('user_id')
    .eq('device_id', deviceId)
    .maybeSingle();
  if (lookupError) {
    console.error('Could not load notification device:', lookupError.message);
    return respond({ error: 'Could not load notification device.' }, 500);
  }

  const now = new Date().toISOString();
  if (action === 'sync') {
    if (input.platform !== 'ios' && input.platform !== 'android') return respond({ error: 'Invalid platform.' }, 400);
    if (typeof input.pushToken !== 'string' || !/^Expo(nent)?PushToken\[[^\]]+\]$/.test(input.pushToken)) {
      return respond({ error: 'Invalid Expo push token.' }, 400);
    }
    if (typeof input.timeZone !== 'string' || input.timeZone.length > 100) {
      return respond({ error: 'Invalid time zone.' }, 400);
    }
    if (!Array.isArray(input.shows) || input.shows.length > 500) {
      return respond({ error: 'Invalid followed shows.' }, 400);
    }
    if (!Array.isArray(input.watchedEpisodeIds) || input.watchedEpisodeIds.length > 20000) {
      return respond({ error: 'Invalid watched episodes.' }, 400);
    }

    const shows = input.shows.filter(isFollowedShow);
    if (shows.length !== input.shows.length) return respond({ error: 'A followed show is invalid.' }, 400);
    if (!input.watchedEpisodeIds.every((id) => Number.isSafeInteger(id) && Number(id) > 0)) {
      return respond({ error: 'A watched episode ID is invalid.' }, 400);
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: input.timeZone });
    } catch {
      return respond({ error: 'Invalid time zone.' }, 400);
    }

    const userChanged = existing && existing.user_id !== authData.user.id;
    const row = {
      device_id: deviceId,
      user_id: authData.user.id,
      expo_push_token: input.pushToken,
      platform: input.platform,
      time_zone: input.timeZone,
      followed_shows: shows,
      watched_episode_ids: input.watchedEpisodeIds,
      app_active: input.appActive === true,
      app_state_updated_at: now,
      enabled: true,
      updated_at: now,
      ...(!existing || userChanged
        ? { pending_episodes: [], last_notified_episode_ids: [], last_scanned_at: now }
        : {}),
      ...(input.appActive === true ? { pending_episodes: [], last_notified_episode_ids: [], last_scanned_at: now } : {}),
    };
    const { error } = await admin.from(table).upsert(row, { onConflict: 'device_id' });
    if (error) {
      console.error('Could not save notification device:', error.message);
      return respond({ error: 'Could not save notification device.' }, 500);
    }
    return respond({ ok: true });
  }

  if (action === 'disable' && !existing) return respond({ ok: true });
  if (!existing || existing.user_id !== authData.user.id) return respond({ error: 'Notification device not found.' }, 404);

  if (action === 'disable') {
    const { error } = await admin
      .from(table)
      .update({
        enabled: false,
        expo_push_token: null,
        pending_episodes: [],
        last_notified_episode_ids: [],
        app_active: false,
        app_state_updated_at: now,
        updated_at: now,
      })
      .eq('device_id', deviceId)
      .eq('user_id', authData.user.id);
    if (error) {
      console.error('Could not disable notifications:', error.message);
      return respond({ error: 'Could not disable notifications.' }, 500);
    }
    return respond({ ok: true });
  }

  if (action === 'open' || action === 'dismiss') {
    const { error } = await admin
      .from(table)
      .update({
        pending_episodes: [],
        last_notified_episode_ids: [],
        app_active: action === 'open',
        app_state_updated_at: now,
        last_scanned_at: now,
        updated_at: now,
      })
      .eq('device_id', deviceId)
      .eq('user_id', authData.user.id);
    if (error) {
      console.error('Could not acknowledge notification:', error.message);
      return respond({ error: 'Could not acknowledge notification.' }, 500);
    }
  } else if (action === 'background') {
    const { error } = await admin
      .from(table)
      .update({ app_active: false, app_state_updated_at: now, updated_at: now })
      .eq('device_id', deviceId)
      .eq('user_id', authData.user.id);
    if (error) {
      console.error('Could not update notification device state:', error.message);
      return respond({ error: 'Could not update notification device state.' }, 500);
    }
  } else if (action === 'heartbeat') {
    const { error } = await admin
      .from(table)
      .update({
        pending_episodes: [],
        last_notified_episode_ids: [],
        app_active: true,
        app_state_updated_at: now,
        last_scanned_at: now,
        updated_at: now,
      })
      .eq('device_id', deviceId)
      .eq('user_id', authData.user.id);
    if (error) {
      console.error('Could not update notification device heartbeat:', error.message);
      return respond({ error: 'Could not update notification device heartbeat.' }, 500);
    }
  }

  return respond({ ok: true });
});
