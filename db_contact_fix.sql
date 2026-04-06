-- ============================================================
-- EMERGENCY CONTACT SYNC FIX
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Ensure the emergencyContact column exists in the patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS "emergencyContact" TEXT DEFAULT '';

-- 2. (Optional) If you want to sync existing data from contact1_phone to emergencyContact
UPDATE patients 
SET "emergencyContact" = contact1_phone 
WHERE ("emergencyContact" IS NULL OR "emergencyContact" = '') 
  AND (contact1_phone IS NOT NULL AND contact1_phone <> '');

-- 3. Verify the column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'patients' AND column_name = 'emergencyContact';
