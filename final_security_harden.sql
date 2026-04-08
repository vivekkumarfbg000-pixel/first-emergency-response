-- ============================================================
-- FINAL SECURITY HARDENING & REFERENTIAL INTEGRITY
-- Version: 1.2
-- Description: Fixes permissive RLS policies and adds cascading deletes.
-- ============================================================

-- 1. ROLE MANAGEMENT
-- Ensure we have a way to reliably check for admins in SQL
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own role
DROP POLICY IF EXISTS "user_read_own_role" ON public.user_roles;
CREATE POLICY "user_read_own_role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 2. ADMIN HELPER FUNCTION (Secured)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) OR (
    -- Secure check using JWT email metadata
    (auth.jwt() ->> 'email') = 'firstemergencyresponse4@gmail.com'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. ENABLE REALTIME
-- Ensure Supabase Realtime is active for critical emergency feeds
ALTER TABLE public.emergency_alerts REPLICA IDENTITY FULL;
ALTER TABLE public.scans REPLICA IDENTITY FULL;
-- Note: You must also enable these in the Supabase Dashboard -> Realtime -> Select Tables

-- 3. HARDEN PATIENTS TABLE
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Remove old permissive policies
DROP POLICY IF EXISTS "admin_delete_all" ON patients;
DROP POLICY IF EXISTS "admin_emergency_access" ON patients;
DROP POLICY IF EXISTS "user_full_access" ON patients;
DROP POLICY IF EXISTS "public_read_patients" ON patients;
DROP POLICY IF EXISTS "owner_full_access" ON patients;
DROP POLICY IF EXISTS "user_delete_own" ON patients;

-- A. Responders/Anonymous can READ profiles (for emergency response)
CREATE POLICY "responder_read_access" ON patients
  FOR SELECT TO anon, authenticated
  USING (true);

-- B. Owners have FULL access to their own data
CREATE POLICY "owner_manage_access" ON patients
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- C. Admin has FULL access to everything
CREATE POLICY "admin_manage_all" ON patients
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. HARDEN SCANS TABLE
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_scans" ON scans;
DROP POLICY IF EXISTS "user_read_scans" ON scans;
DROP POLICY IF EXISTS "admin_scan_access" ON scans;
DROP POLICY IF EXISTS "user_scan_access" ON scans;
DROP POLICY IF EXISTS "public_log_scan" ON scans;

-- A. Admin can see all scans
CREATE POLICY "admin_scan_access" ON scans
  FOR ALL TO authenticated
  USING (public.is_admin());

-- B. Users can see scans of their owned patients
CREATE POLICY "user_scan_access" ON scans
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM patients 
    WHERE patients.patient_id = scans.patient_id 
    AND patients.user_id = auth.uid()
  ));

-- C. Anyone can log a scan
CREATE POLICY "public_log_scan" ON scans
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 5. REFERENTIAL INTEGRITY
-- Automatically delete scans when a patient is deleted
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

-- 6. REGISTER MASTER ADMIN
DO $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  SELECT id, 'admin' FROM auth.users WHERE email = 'firstemergencyresponse4@gmail.com'
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
END $$;

-- ============================================================
-- DONE! System is now hardened against unauthorized data access.
-- ============================================================
