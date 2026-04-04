-- ============================================================
-- SEHAT POINT — Incremental Realtime & Permission Fix
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Ensure REALTIME is enabled for all key tables
-- If error "already exists", don't worry, these checks prevent duplicates.
DO $$
BEGIN
  -- Enable for emergency_alerts (primary for Dispatch)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'emergency_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_alerts;
  END IF;

  -- Enable for scans (primary for Activity Logs)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'scans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE scans;
  END IF;

  -- Enable for patients (to sync registry changes)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'patients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE patients;
  END IF;
END $$;

-- 2. Open up permissions for Emergency Triggers (Rescue flow)
-- Emergency inserts must work without being signed in (anon).
DROP POLICY IF EXISTS "allow_anon_alert_insert" ON emergency_alerts;
CREATE POLICY "allow_anon_alert_insert" ON emergency_alerts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "allow_anon_scan_insert" ON scans;
CREATE POLICY "allow_anon_scan_insert" ON scans
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 3. Ensure SELECT access for Authenticated Users (Admin view)
DROP POLICY IF EXISTS "allow_admin_alert_read" ON emergency_alerts;
CREATE POLICY "allow_admin_alert_read" ON emergency_alerts
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "allow_admin_scan_read" ON scans;
CREATE POLICY "allow_admin_scan_read" ON scans
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. Verify Realtime Status
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
