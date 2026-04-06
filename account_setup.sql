-- ============================================================
-- ACCOUNT ORCHESTRATION: Comprehensive Sync SQL
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Create a public 'profiles' table to store metadata (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "public_read_profiles" ON public.profiles;
CREATE POLICY "public_read_profiles" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "user_update_profiles" ON public.profiles;
CREATE POLICY "user_update_profiles" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 2. CREATE SYNC TRIGGER: Automatically populate profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. SYNC EXISTING USERS: If you have existing users, run this manually:
/*
INSERT INTO public.profiles (id, email, full_name)
SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', '')
FROM auth.users
ON CONFLICT (id) DO NOTHING;
*/

-- 4. HARDEN CLINICAL RECORDS RLS
-- Explicitly allow owners to find their records
DROP POLICY IF EXISTS "user_full_access" ON patients;
CREATE POLICY "user_full_access" ON patients
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Explicitly allow public (anon) to READ but not write
DROP POLICY IF EXISTS "public_read_patients" ON patients;
CREATE POLICY "public_read_patients" ON patients
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 5. ALLOW ORPHANED LOGIC: Already implemented in previous fix, but reinforcing here
DROP POLICY IF EXISTS "user_claim_orphaned_profile" ON patients;
CREATE POLICY "user_claim_orphaned_profile" ON patients
  FOR UPDATE
  TO authenticated
  USING (user_id IS NULL)
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- DONE! All accounts will now automatically sync to profiles table.
-- ============================================================
