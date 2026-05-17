# ARCHITECTURAL CONTRACT: ELIMINATION OF LOAD-TIME REDIRECT HIJACKING (AUTO-LOGOUT)
> **CRITICAL NOTICE TO EXECUTING AGENTS:** This document is immutable law. Any code modification that violates the boundaries, data shapes, or security guardrails defined below will cause an immediate system rejection and code revert.

## 1. COMPONENT & REPOSITORY BOUNDARIES
*   **TARGET_FILES_TO_EDIT:**
    *   `js/admin.js` -> Inject initialization flag tracker inside `onAuthStateChange` to ignore the first synchronous observer call on register.
    *   `js/dashboard.js` -> Inject identical initialization flag tracker inside `onAuthStateChange` to ignore the first synchronous observer call on register.
*   **FORBIDDEN_FILES (NO-FLY ZONES):**
    *   `tech-team/` -> Maintained as read-only.
    *   `js/auth.js` -> The core SaaS authentication helper is highly stable; the synchronous event bypass must be handled locally in the reactive UI watchers.

## 2. DATA CONTRACT & TYPE INTEGRITY
*   **INCOMING_DATA_SHAPE (INPUTS):**
    *   The `onAuthStateChange` listener yields standard Supabase Auth events: `(event, session)`.
    *   Failing events: synchronous transient `SIGNED_OUT` emitted during observer registration while localStorage is resolving.
*   **OUTGOING_DATA_SHAPE (OUTPUTS):**
    *   Must preserve native `SIGNED_OUT` evacuation redirection only for real, subsequent state transitions (explicit signout, external session termination).

## 3. SECURITY & POLICY ENVIRONMENT
*   **ENVIRONMENT_VARIABLES_REQUIRED:** None.
*   **ACCESS_CONTROL_CONSTRAINTS:**
    *   Must ensure that unauthenticated users attempting to access `admin.html` or `dashboard.html` are still successfully intercepted by the async authentication gates (`Auth.init()`, `Auth.getSession()`).

## 4. VERIFICATION METRICS (THE DEFENSIVE PASS CRITERIA)
*   The system is considered functional if and only if:
    1. **Authentication Observer Resilience**: Page refresh on `admin.html` and `dashboard.html` retains the active user session without triggering a false-positive redirect.
    2. **Graceful Unauthorized Evacuation**: Entering `admin.html` in an unauthenticated incognito window still redirects to `admin-login.html` once the asynchronous check concludes.
    3. **Explicit Logout Execution**: Clicking the "Logout" interactive control immediately terminates the session and redirects to `index.html`.
