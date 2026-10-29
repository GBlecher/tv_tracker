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
