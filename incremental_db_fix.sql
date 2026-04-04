-- ============================================================
-- SEHAT POINT — Incremental DB Fix
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Ensure user_id and updated_at columns exist in patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Add updated_at column to scans if not exists
ALTER TABLE scans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Create a function to handle auto-updating the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Create triggers for patients and scans tables
DROP TRIGGER IF EXISTS tr_patients_updated_at ON patients;
CREATE TRIGGER tr_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_scans_updated_at ON scans;
CREATE TRIGGER tr_scans_updated_at
    BEFORE UPDATE ON scans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Verify the columns
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('patients', 'scans')
AND column_name IN ('user_id', 'updated_at');
