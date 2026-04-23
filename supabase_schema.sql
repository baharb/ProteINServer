-- ═══════════════════════════════════════════════════════
--  ProteIN AI — Supabase Database Schema
--  Run this in: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════

-- ── Profiles ────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  age             int,
  weight_kg       float,
  height_cm       float,
  gender          text,
  activity        text,
  goals           text[],           -- e.g. ['lose','muscle']
  goal_calories   int,
  goal_protein    int,
  goal_carbs      int,
  goal_fat        int,
  weight_unit     text default 'kg',
  height_unit     text default 'cm',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Meals ───────────────────────────────────────────────
create table if not exists public.meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  date        date not null,          -- 'YYYY-MM-DD'
  slot        int default 0,          -- 0=breakfast 1=lunch 2=dinner 3=snack
  calories    int default 0,
  protein     int default 0,
  carbs       int default 0,
  fat         int default 0,
  created_at  timestamptz default now()
);

-- ── Weight Log ──────────────────────────────────────────
create table if not exists public.weight_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  weight_kg   float not null,
  logged_at   timestamptz default now()
);

-- ── Row Level Security (RLS) ────────────────────────────
-- Users can only read/write their own data

alter table public.profiles   enable row level security;
alter table public.meals      enable row level security;
alter table public.weight_log enable row level security;

-- Profiles
create policy "Users can manage own profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Meals
create policy "Users can manage own meals"
  on public.meals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Weight log
create policy "Users can manage own weight log"
  on public.weight_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Indexes for performance ─────────────────────────────
create index if not exists meals_user_date      on public.meals(user_id, date);
create index if not exists weight_log_user_date on public.weight_log(user_id, logged_at);

-- ═══════════════════════════════════════════════════════
-- Done! Now go to Authentication → Settings and set:
--   Site URL: exp://localhost:19000  (for dev)
-- ═══════════════════════════════════════════════════════

-- Run these to upgrade from previous version:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create avatars storage bucket
-- Go to Supabase Dashboard → Storage → New Bucket → name: avatars → Public: ON
-- Then run these policies:
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY IF NOT EXISTS "Upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY IF NOT EXISTS "View avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY IF NOT EXISTS "Update own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
