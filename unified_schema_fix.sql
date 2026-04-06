-- ============================================================
-- UNIFIED SCHEMA FIX: Sehat Point Signup & Profile Flow
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Ensure 'patients' table has user_id column for ownership
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Ensure 'profiles' table exists (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Profile Policies
DROP POLICY IF EXISTS "public_read_profiles" ON public.profiles;
CREATE POLICY "public_read_profiles" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "user_update_profiles" ON public.profiles;
CREATE POLICY "user_update_profiles" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 5. NEW USER TRIGGER: Automatically populate profiles table
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. UNIFIED PATIENT POLICIES
-- Allow owners full access
DROP POLICY IF EXISTS "user_full_access" ON patients;
CREATE POLICY "user_full_access" ON patients
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow public to read for emergency view
DROP POLICY IF EXISTS "public_read_patients" ON patients;
CREATE POLICY "public_read_patients" ON patients
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow claiming orphaned profiles
DROP POLICY IF EXISTS "user_claim_orphaned_profile" ON patients;
CREATE POLICY "user_claim_orphaned_profile" ON patients
  FOR UPDATE
  TO authenticated
  USING (user_id IS NULL)
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- DONE! Run this to stabilize the Signup & Profile environment.
-- ============================================================
