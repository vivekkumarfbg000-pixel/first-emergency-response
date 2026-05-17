# ARCHITECTURAL CONTRACT: SEHAT POINT STABILIZATION & DATABASE RECONCILIATION

> **CRITICAL NOTICE TO EXECUTING AGENTS:** This document is immutable law. Any code modification that violates the boundaries, data shapes, or security guardrails defined below will cause an immediate system rejection and code revert.

## 1. COMPONENT & REPOSITORY BOUNDARIES
*   **TARGET_FILES_TO_EDIT:**
    *   `supabase_canonical_migration.sql` -> Add `CREATE TABLE IF NOT EXISTS` blocks for `patients` and `scans` before `ALTER TABLE` operations to ensure the migration is completely self-contained.
    *   `js/supabase-config.js` -> Align Supabase client credentials with the correct production database instance (`ykrqpxbbyfipjqhpaszf.supabase.co`).
*   **FORBIDDEN_FILES (NO-FLY ZONES):**
    *   `tech-team/` -> Maintain static team role definition files and hooks as read-only.
    *   `js/storage.js` -> The client-side database mapping and local caching logic are highly optimized and stable. Do not modify unless structural defects are discovered.

## 2. DATA CONTRACT & TYPE INTEGRITY
*   **INCOMING_DATA_SHAPE (INPUTS):**
    *   `patients` table fields:
        ```sql
        id UUID DEFAULT gen_random_uuid(),
        patient_id TEXT UNIQUE,
        full_name TEXT,
        blood_group TEXT,
        age INTEGER,
        gender TEXT,
        email TEXT DEFAULT '',
        emergency_contact TEXT,
        contact1_name TEXT,
        contact1_relation TEXT,
        contact1_phone TEXT,
        contact1_email TEXT,
        contact2_name TEXT,
        contact2_relation TEXT,
        contact2_phone TEXT,
        conditions TEXT,
        allergies TEXT,
        medications TEXT,
        medical_notes TEXT,
        organ_donor BOOLEAN DEFAULT FALSE,
        user_id UUID REFERENCES auth.users(id),
        "fullName" TEXT,
        "bloodGroup" TEXT,
        "emergencyContact" TEXT
        ```
    *   `scans` table fields:
        ```sql
        id UUID DEFAULT gen_random_uuid(),
        patient_id TEXT,
        patient_name TEXT,
        type TEXT DEFAULT 'qr_scan',
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        location TEXT,
        device TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        is_emergency BOOLEAN DEFAULT FALSE
        ```
*   **OUTGOING_DATA_SHAPE (OUTPUTS):**
    *   All queries on `patients` and `scans` tables must match the local schema defined in `js/storage.js` for clean synchronization.

## 3. SECURITY & POLICY ENVIRONMENT
*   **ENVIRONMENT_VARIABLES_REQUIRED:** None. Static publishable Supabase configuration.
*   **ACCESS_CONTROL_CONSTRAINTS:**
    *   Row-Level Security (RLS) must be enabled on all newly created tables (`patients`, `scans`, `emergency_alerts`, `user_roles`).
    *   Read access policy `responder_read_access` allows anonymous responders to read medical cards.
    *   Only authorized `admin` roles are permitted to list all scans and acknowledge emergency alerts.

## 4. VERIFICATION METRICS (THE DEFENSIVE PASS CRITERIA)
*   The system is considered functional if and only if:
    1. **SQL Execution Integrity**: The canonical migration executes successfully on the Supabase instance using `mcp_supabase_apply_migration` without syntax errors.
    2. **Credentials Alignment**: The PWA successfully communicates with the authenticated production database, verified by testing app landing page and scanning interface behavior.
    3. **RLS Compliance**: SecOps Sentry confirmation of proper RLS policies across the `patients` and `scans` tables.
    4. **Offline Sync Core Validation**: Local storage functions and sync mechanisms do not throw references to missing/undefined columns.
