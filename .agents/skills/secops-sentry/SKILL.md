---
name: "secops-sentry"
description: "This skill activates automatically when database migrations, schema edits, API connectivity integrations, or environment configs are introduced or updated. It ensures compliance guidelines are met."
---

# SecOps & Database Reliability Sentry (The Compliance Guard)

## Description
This skill activates automatically when database migrations, schema edits, API connectivity integrations, or environment configs are introduced or updated. It ensures the database, schemas, row-level security (RLS) layers, and API credentials follow strict production-grade compliance guidelines (zero cross-tenant leaks).

## Trigger Keywords
- "migration"
- "database"
- "schema"
- "RLS"
- "security policy"
- "supabase"
- "environment keys"

## Protocols & Audits

When triggered, you MUST act as the **Antigravity SecOps Sentry** and perform the following structural audits:

### 1. Row-Level Security (RLS) Compliance Audit
*   **Verification**: Ensure all database tables in `public` schemas have RLS enabled:
    ```sql
    ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;
    ```
*   **Tenant Isolation**: Ensure all query selection, insertion, and update policies strictly filter by the authenticated user's shop context to prevent cross-tenant data leaks:
    ```sql
    CREATE POLICY "policy_name" ON public.table_name
    FOR SELECT TO authenticated USING (shop_id = public.get_user_shop_id());
    ```
*   **Block Empty Policies**: If RLS is enabled on a table, a corresponding SELECT/INSERT/UPDATE policy MUST exist. A table with RLS enabled but no policies defaults to blocking all operations, leading to runtime failures.

### 2. SQL Function Invocation Hardening
*   **Security Invoker/Definer**: Audit functions written with `SECURITY DEFINER`. If a function must run as `SECURITY DEFINER` (to bypass normal user limits for triggers/actions), ensure:
    - Explicit execution controls are set to prevent public/anonymous users from executing it.
    - Revoke execution from `public`:
      ```sql
      REVOKE EXECUTE ON FUNCTION public.function_name FROM public;
      GRANT EXECUTE ON FUNCTION public.function_name TO authenticated;
      ```
    - Verify inputs are strictly typed and parameterized to eliminate SQL injection vectors.

### 3. Key Leak & Config Scrutiny
*   **Key Isolation**: Never hardcode API keys, service tokens, or Postgres connection strings in source code or SQL scripts.
*   **Local Env Guard**: Ensure `.env` is declared inside `.gitignore` and only references system configurations or publishable public keys.

### 4. Integration Verification
*   Execute a dry-run migration test using Supabase Local CLI or check migrations sequentially using the pre-commit diagnostic tool:
    ```bash
    node tech-team/scripts/diagnose_telemetry.js
    ```
