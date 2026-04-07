-- ============================================================
-- CREATE EMERGENCY ALERTS TABLE (For Live Feed)
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS emergency_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id TEXT NOT NULL,
    patient_name TEXT,
    type TEXT DEFAULT 'emergency_scan',
    location TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status TEXT DEFAULT 'active',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE emergency_alerts ENABLE ROW LEVEL SECURITY;

-- 3. Policies
CREATE POLICY "public_read_alerts" ON emergency_alerts FOR SELECT TO anon, authenticated USING (true);

-- 4. Enable Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'emergency_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_alerts;
  END IF;
END $$;
