-- ============================================================
-- SEHAT POINT — Account Provisioning Patch SQL
-- PURPOSE: Ensures the patients table supports admin-assigned
--          emails and login account linking.
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── STEP 1: Ensure Required Columns Exist ──────────────────
-- These are safe to run even if columns already exist.

-- email: stores the login email assigned by admin (or self-registered)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';

-- user_id: links the patient record to a Supabase Auth account
-- When NULL → no login account yet. When set → user can log in.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- dob: date of birth (was missing, caused a silent JS error on modal open)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS dob DATE;

-- ── STEP 2: Drop Conflicting RLS Policies (Clean Slate) ────
DROP POLICY IF EXISTS "allow_anon_insert"      ON patients;
DROP POLICY IF EXISTS "allow_public_read"       ON patients;
DROP POLICY IF EXISTS "admin_full_access"       ON patients;
DROP POLICY IF EXISTS "user_update_own"         ON patients;
DROP POLICY IF EXISTS "responder_read_access"   ON patients;
DROP POLICY IF EXISTS "public_insert_access"    ON patients;
DROP POLICY IF EXISTS "owner_manage_access"     ON patients;
DROP POLICY IF EXISTS "owner_delete_access"     ON patients;
DROP POLICY IF EXISTS "admin_manage_all"        ON patients;
DROP POLICY IF EXISTS "user_claim_orphaned_profile" ON patients;

-- ── STEP 3: Enable RLS ─────────────────────────────────────
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- ── STEP 4: Recreate Hardened RLS Policies ─────────────────

-- A. Emergency responders / anonymous people can READ profiles
--    (Required so QR scan shows medical info without login)
CREATE POLICY "responder_read_access" ON patients
  FOR SELECT TO anon, authenticated
  USING (true);

-- B. Anyone can INSERT a new profile
--    (Allows admin to create profiles + users to self-register)
CREATE POLICY "public_insert_access" ON patients
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- C. The profile owner can UPDATE their own record
CREATE POLICY "owner_manage_access" ON patients
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- D. The profile owner can DELETE their own record
CREATE POLICY "owner_delete_access" ON patients
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- E. Admin has FULL access to all records (UPDATE, DELETE, INSERT, SELECT)
--    This is what allows admin to set email/user_id on any patient.
CREATE POLICY "admin_manage_all" ON patients
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- F. Allow a newly-registered user to CLAIM an orphaned profile
--    (patient record that has no user_id yet — matches by email)
CREATE POLICY "user_claim_orphaned_profile" ON patients
  FOR UPDATE TO authenticated
  USING (user_id IS NULL)
  WITH CHECK (user_id = auth.uid());

-- ── STEP 5: Verify columns ─────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'patients'
  AND column_name IN ('email', 'user_id', 'dob', 'fullName', 'bloodGroup')
ORDER BY ordinal_position;

-- ============================================================
-- DONE! The database is now ready for admin account provisioning.
-- ============================================================
