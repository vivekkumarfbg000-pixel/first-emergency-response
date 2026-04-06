-- ============================================================
-- SEHAT POINT — Identity Linkage Security Patch
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Correct the 'user_update_own' policy to allow claiming
-- We must allow users to update if (they are the owner) OR (the record has no owner)
-- The 'WITH CHECK' clause ensures they can only assign it to THEMSELVES.

DROP POLICY IF EXISTS "user_update_own" ON patients;

CREATE POLICY "user_claim_and_update" ON patients
  FOR UPDATE
  TO authenticated
  USING (
    user_id IS NULL OR user_id = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- 2. Ensure case-insensitive email search index
CREATE INDEX IF NOT EXISTS idx_patients_email_lower ON patients (LOWER(email));

-- ============================================================
-- PATCH COMPLETE. Medical profiles can now be linked to accounts.
-- ============================================================
