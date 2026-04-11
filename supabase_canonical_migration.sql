-- ============================================================
-- SEHAT POINT — CANONICAL PRODUCTION MIGRATION (v2.0)
-- Consolidates all previous migrations into a single, hardened script.
-- Run: Supabase Dashboard → SQL Editor → New Query → Paste & Run
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- STEP 1: SCHEMA — Ensure all required columns exist
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS contact1_email TEXT DEFAULT '';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS "emergencyContact" TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS conditions TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medications TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS "bloodGroup" TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS "fullName" TEXT;

ALTER TABLE scans ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE scans ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT FALSE;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS patient_name TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS device TEXT;

-- Emergency Alerts Table
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
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- STEP 2: ROLE MANAGEMENT
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_own_role" ON public.user_roles;
CREATE POLICY "user_read_own_role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- STEP 3: ADMIN HELPER FUNCTION (Used by RLS policies)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- STEP 4: DROP ALL EXISTING POLICIES (Clean Slate)
-- ═══════════════════════════════════════════════════════════════

-- Patients
DROP POLICY IF EXISTS "allow_anon_insert" ON patients;
DROP POLICY IF EXISTS "allow_public_read" ON patients;
DROP POLICY IF EXISTS "admin_full_access" ON patients;
DROP POLICY IF EXISTS "user_update_own" ON patients;
DROP POLICY IF EXISTS "Enable insert for all users" ON patients;
DROP POLICY IF EXISTS "Enable read access for all users" ON patients;
DROP POLICY IF EXISTS "Users can insert their own profile." ON patients;
DROP POLICY IF EXISTS "Users can view their own data." ON patients;
DROP POLICY IF EXISTS "admin_delete_all" ON patients;
DROP POLICY IF EXISTS "admin_emergency_access" ON patients;
DROP POLICY IF EXISTS "user_full_access" ON patients;
DROP POLICY IF EXISTS "public_read_patients" ON patients;
DROP POLICY IF EXISTS "owner_full_access" ON patients;
DROP POLICY IF EXISTS "user_delete_own" ON patients;
DROP POLICY IF EXISTS "responder_read_access" ON patients;
DROP POLICY IF EXISTS "owner_manage_access" ON patients;
DROP POLICY IF EXISTS "admin_manage_all" ON patients;
DROP POLICY IF EXISTS "public_insert_access" ON patients;
DROP POLICY IF EXISTS "responder_read_access" ON patients;
DROP POLICY IF EXISTS "owner_delete_access" ON patients;

-- Scans
DROP POLICY IF EXISTS "allow_anon_scan_insert" ON scans;
DROP POLICY IF EXISTS "allow_public_scan_read" ON scans;
DROP POLICY IF EXISTS "allow_scan_update" ON scans;
DROP POLICY IF EXISTS "admin_read_scans" ON scans;
DROP POLICY IF EXISTS "user_read_scans" ON scans;
DROP POLICY IF EXISTS "admin_scan_access" ON scans;
DROP POLICY IF EXISTS "user_scan_access" ON scans;
DROP POLICY IF EXISTS "public_log_scan" ON scans;

-- Emergency Alerts
DROP POLICY IF EXISTS "allow_anon_alert_insert" ON emergency_alerts;
DROP POLICY IF EXISTS "allow_admin_alert_read" ON emergency_alerts;
DROP POLICY IF EXISTS "alert_admin_manage" ON emergency_alerts;
DROP POLICY IF EXISTS "alert_public_insert" ON emergency_alerts;
DROP POLICY IF EXISTS "alert_auth_read" ON emergency_alerts;
DROP POLICY IF EXISTS "alert_admin_read" ON emergency_alerts;

-- ═══════════════════════════════════════════════════════════════
-- STEP 5: ENABLE RLS ON ALL TABLES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_alerts ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- STEP 6: HARDENED RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

-- ── PATIENTS ──
-- A. Rescuers/Anonymous can READ profiles (for emergency response)
-- SECURITY NOTE: This allows row-level access during scans.
CREATE POLICY "responder_read_access" ON patients
  FOR SELECT TO anon, authenticated
  USING (true);

-- B. Anyone can create a new profile (self-registration + admin creation)
CREATE POLICY "public_insert_access" ON patients
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- C. Owners can UPDATE/DELETE their own data
CREATE POLICY "owner_manage_access" ON patients
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_delete_access" ON patients
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- D. Admin has FULL access to everything
CREATE POLICY "admin_manage_all" ON patients
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── SCANS ──
-- A. Anyone can log a scan (emergency scans don't require login)
CREATE POLICY "public_log_scan" ON scans
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- B. Admin can see all scans
CREATE POLICY "admin_scan_access" ON scans
  FOR ALL TO authenticated
  USING (public.is_admin());

-- C. Users can see scans of their owned patients
CREATE POLICY "user_scan_access" ON scans
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM patients 
    WHERE patients.patient_id = scans.patient_id 
    AND patients.user_id = auth.uid()
  ));

-- ── EMERGENCY ALERTS ──
-- A. Anyone can create an alert (triggered by QR scan)
CREATE POLICY "alert_public_insert" ON emergency_alerts
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- B. Only admins can read alerts (Prevent regular users from seeing other people's emergencies)
CREATE POLICY "alert_admin_read" ON emergency_alerts
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- C. Admin can manage (acknowledge, update) alerts
CREATE POLICY "alert_admin_manage" ON emergency_alerts
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ═══════════════════════════════════════════════════════════════
-- STEP 7: ENABLE REALTIME
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.emergency_alerts REPLICA IDENTITY FULL;
ALTER TABLE public.scans REPLICA IDENTITY FULL;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'emergency_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_alerts;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- STEP 8: REFERENTIAL INTEGRITY — Auto-cleanup on patient delete
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_orphaned_scans()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.scans WHERE patient_id = OLD.patient_id;
  DELETE FROM public.emergency_alerts WHERE patient_id = OLD.patient_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_patient_deleted ON patients;
CREATE TRIGGER on_patient_deleted
  AFTER DELETE ON patients
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_orphaned_scans();

-- ═══════════════════════════════════════════════════════════════
-- STEP 9: REGISTER MASTER ADMIN
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  SELECT id, 'admin' FROM auth.users WHERE email = 'firstemergencyresponse4@gmail.com'
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
END $$;

-- ═══════════════════════════════════════════════════════════════
-- STEP 10: VERIFY SETUP
-- ═══════════════════════════════════════════════════════════════

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'patients'
ORDER BY ordinal_position;

-- ============================================================
-- DONE! System is hardened for production use.
-- ============================================================
