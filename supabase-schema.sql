-- Run this in the Supabase SQL Editor (https://app.supabase.com → SQL Editor)
-- after creating your free project. Safe to re-run — uses IF NOT EXISTS / OR REPLACE.

create table if not exists public.favorites (
  id         bigserial primary key,
  user_id    uuid references auth.users not null,
  mal_id     integer not null,
  data       jsonb not null,
  saved_at   timestamptz default now(),
  constraint favorites_user_mal unique (user_id, mal_id)
);
alter table public.favorites enable row level security;
drop policy if exists "own_favorites" on public.favorites;
create policy "own_favorites" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.history (
  id         bigserial primary key,
  user_id    uuid references auth.users not null,
  anime_id   text not null,
  data       jsonb not null,
  updated_at timestamptz default now(),
  constraint history_user_anime unique (user_id, anime_id)
);
alter table public.history enable row level security;
drop policy if exists "own_history" on public.history;
create policy "own_history" on public.history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.user_settings (
  id         bigserial primary key,
  user_id    uuid references auth.users not null,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  constraint user_settings_user unique (user_id)
);
alter table public.user_settings enable row level security;
drop policy if exists "own_settings" on public.user_settings;
create policy "own_settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Optional: enable Google OAuth in Supabase dashboard under
-- Authentication → Providers → Google (requires a Google Cloud OAuth app).
