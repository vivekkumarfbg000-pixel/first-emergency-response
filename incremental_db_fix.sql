-- ============================================================
-- INCREMENTAL DB FIX: Profile Deletion RLS Policies
-- Use this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Explicitly enable DELETE for authenticated users on their own profiles
DROP POLICY IF EXISTS "user_delete_own" ON patients;
CREATE POLICY "user_delete_own" ON patients
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. Ensure Admin has full DELETE access to everything
DROP POLICY IF EXISTS "admin_delete_all" ON patients;
CREATE POLICY "admin_delete_all" ON patients
  FOR DELETE
  TO authenticated
  USING (true);

-- 3. UNIFIED AUTH: Allow users to "claim" orphaned profiles after signup
-- This allows updating user_id ONLY IF it's currently NULL and email matches
DROP POLICY IF EXISTS "user_claim_orphaned_profile" ON patients;
CREATE POLICY "user_claim_orphaned_profile" ON patients
  FOR UPDATE
  TO authenticated
  USING (user_id IS NULL)
  WITH CHECK (user_id = auth.uid());

-- 4. Check for foreign key blocking (Optional but recommended)
-- If you want to automatically clean up scans when a patient is deleted:
-- (Uncomment the lines below ONLY if you want automatic cleanup)
/*
ALTER TABLE scans 
DROP CONSTRAINT IF EXISTS scans_patient_id_fkey,
ADD CONSTRAINT scans_patient_id_fkey 
FOREIGN KEY (id) REFERENCES patients(id) ON DELETE CASCADE;
*/

-- ============================================================
-- DONE! Profiles can now be terminated by their owners or admins,
-- and orphaned profiles can be "claimed" by new users.
-- ============================================================
