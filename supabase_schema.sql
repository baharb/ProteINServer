-- ProteIN AI v2 — Supabase Schema
-- Run in: Supabase Dashboard → SQL Editor → Run

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text,
  age             integer,
  gender          text,
  weight_kg       numeric,
  height_cm       numeric,
  activity        text,
  goals           text[],
  goal_calories   integer,
  goal_protein    integer,
  goal_carbs      integer,
  goal_fat        integer,
  weight_unit     text DEFAULT 'kg',
  height_unit     text DEFAULT 'cm',
  avatar_path     text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Meals table
CREATE TABLE IF NOT EXISTS meals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  date        date NOT NULL,
  slot        integer DEFAULT 0,
  calories    integer DEFAULT 0,
  protein     integer DEFAULT 0,
  carbs       integer DEFAULT 0,
  fat         integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Weight log
CREATE TABLE IF NOT EXISTS weight_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  weight_kg   numeric NOT NULL,
  logged_at   timestamptz DEFAULT now()
);

-- Row Level Security
ALTER TABLE profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_log ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Meals policies
CREATE POLICY "Users can view own meals"   ON meals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own meals" ON meals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meals" ON meals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own meals" ON meals FOR DELETE USING (auth.uid() = user_id);

-- Weight log policies
CREATE POLICY "Users can view own weight"   ON weight_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own weight" ON weight_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own weight" ON weight_log FOR DELETE USING (auth.uid() = user_id);

-- Avatar storage bucket (run separately if bucket doesn't exist)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (PRIVATE bucket — signed URLs only)
CREATE POLICY "Upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Read own avatar" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
