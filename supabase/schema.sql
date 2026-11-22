-- Run this once in your Supabase project: Dashboard > SQL Editor > New query > paste > Run.
-- Each user gets one row holding their followed shows and watched episodes.

create table if not exists public.tracker_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tracker_state enable row level security;

-- Let signed-in users reach the table through the API (row level security below limits them to their own row).
grant select, insert, update on public.tracker_state to authenticated;

drop policy if exists "Users read own data" on public.tracker_state;
create policy "Users read own data" on public.tracker_state
  for select using (auth.uid() = user_id);

drop policy if exists "Users insert own data" on public.tracker_state;
create policy "Users insert own data" on public.tracker_state
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own data" on public.tracker_state;
create policy "Users update own data" on public.tracker_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Per-installation push subscriptions. Only the Edge Functions use this table;
-- device state is authenticated and written server-side, including for anonymous users.
create table if not exists public.notification_devices (
  device_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text,
  platform text not null check (platform in ('ios', 'android')),
  time_zone text not null default 'UTC',
  followed_shows jsonb not null default '[]'::jsonb,
  watched_episode_ids bigint[] not null default '{}',
  pending_episodes jsonb not null default '[]'::jsonb,
  last_notified_episode_ids bigint[] not null default '{}',
  last_scanned_at timestamptz not null default now(),
  app_active boolean not null default false,
  app_state_updated_at timestamptz not null default now(),
  daily_date text,
  daily_count integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_devices_push_token_key
  on public.notification_devices (expo_push_token)
  where expo_push_token is not null;

alter table public.notification_devices enable row level security;
revoke all on public.notification_devices from anon, authenticated;
grant all on public.notification_devices to service_role;
