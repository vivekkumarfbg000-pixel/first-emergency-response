-- ============================================================
-- SEHAT POINT — Full Supabase Migration Script
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── STEP 1: Add missing columns to patients table ──────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS contact1_email TEXT DEFAULT '';

-- ── STEP 2: Add missing columns to scans table ────────────
ALTER TABLE scans ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT FALSE;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- ── STEP 3: Drop any existing conflicting RLS policies ─────
DROP POLICY IF EXISTS "allow_anon_insert" ON patients;
DROP POLICY IF EXISTS "allow_public_read" ON patients;
DROP POLICY IF EXISTS "admin_full_access" ON patients;
DROP POLICY IF EXISTS "user_update_own" ON patients;
DROP POLICY IF EXISTS "allow_anon_scan_insert" ON scans;
DROP POLICY IF EXISTS "allow_public_scan_read" ON scans;
DROP POLICY IF EXISTS "Enable insert for all users" ON patients;
DROP POLICY IF EXISTS "Enable read access for all users" ON patients;
DROP POLICY IF EXISTS "Users can insert their own profile." ON patients;
DROP POLICY IF EXISTS "Users can view their own data." ON patients;

-- ── STEP 4: Enable RLS (safe to run even if already enabled) ─
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

-- ── STEP 5: Create open INSERT policies ────────────────────
-- CRITICAL: Allow anyone (including anonymous visitors) to create a profile
CREATE POLICY "allow_anon_insert" ON patients
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow anyone to read patient profiles (needed for QR scan emergency view)
CREATE POLICY "allow_public_read" ON patients
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow admin to update/delete everything
CREATE POLICY "admin_full_access" ON patients
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Scans: allow anonymous inserts (emergency scans don't require login)
CREATE POLICY "allow_anon_scan_insert" ON scans
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "allow_public_scan_read" ON scans
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "allow_scan_update" ON scans
  FOR UPDATE
  TO anon, authenticated
  USING (true);

-- ── STEP 6: Enable Realtime safely (skips if already a member) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'patients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE patients;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'scans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE scans;
  END IF;
END $$;

-- ── STEP 7: Create email alert table ───────────────────────
CREATE TABLE IF NOT EXISTS emergency_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL,
  patient_name TEXT,
  patient_blood TEXT,
  family_email TEXT,
  family_name TEXT,
  gps_lat DOUBLE PRECISION,
  gps_long DOUBLE PRECISION,
  google_maps_link TEXT,
  scan_time TIMESTAMPTZ DEFAULT NOW(),
  email_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE emergency_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_anon_alert_insert" ON emergency_alerts;
DROP POLICY IF EXISTS "allow_admin_alert_read" ON emergency_alerts;

CREATE POLICY "allow_anon_alert_insert" ON emergency_alerts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "allow_admin_alert_read" ON emergency_alerts
  FOR SELECT
  TO authenticated
  USING (true);

-- Enable realtime for emergency_alerts (safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'emergency_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_alerts;
  END IF;
END $$;

-- ── STEP 8: Verify setup ───────────────────────────────────
-- Run this SELECT to confirm columns exist:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'patients'
ORDER BY ordinal_position;

-- ============================================================
-- DONE! After running this, go back and proceed with the
-- code changes in the application.
-- ============================================================
