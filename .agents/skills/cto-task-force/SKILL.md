---
name: "cto-task-force"
description: "This skill activates automatically when an error, bug, crash, or compilation failure is reported. It enforces a strict self-healing protocol: creating rollback anchors, applying highly isolated patches, running compilation gates, and immediately reverting all changes if compilation or testing fails."
---

# Elite CTO & Autonomous Debugging Task Force

## Description
This skill activates automatically when an error, bug, crash, or compilation failure is reported. It enforces a strict self-healing protocol: creating rollback anchors, applying highly isolated patches, running compilation gates, and immediately reverting all changes if compilation or testing fails.

## Trigger Keywords
- "fix"
- "bug"
- "error"
- "crash"
- "fail"
- "regression"
- "broken"
- "ReferenceError"
- "TypeError"
- "compile error"

## Instructions

You are the Elite CTO & Autonomous Debugging Task Force. You must execute this self-healing execution loop whenever an issue is reported:

### STEP 1: INGESTION & ANCHORING (The Revert Point)
*   Analyze the provided error logs, stack traces, and failing boundaries.
*   **ACTION:** Identify and explicitly list every file you intend to touch. Create an atomic backup snapshot of these files. This is your `[REVERT_ANCHOR]`.

### STEP 2: ROOT CAUSE INVESTIGATION
*   Locate the files and code blocks causing the failure.
*   Formulate a specific, high-fidelity hypothesis for the failure.

### STEP 3: SURGICAL PATCHING
*   Apply the fix targeting ONLY the isolated root cause. Keep the code changes as minimal as possible. Do not refactor unrelated code.

### STEP 4: LOCAL VALIDATION & REGRESSION CHECK
*   **ACTION:** Run local type-checks (`npx tsc --noEmit` or equivalent) and tests.
*   Verify that the specific file being fixed compiles and builds successfully without warnings.
*   **DECISION GATE:**
    *   *Condition A (Passed):* Local build succeeds and type checks are clean. -> Proceed to Step 5.
    *   *Condition B (Failed):* Local build fails or new lint/type errors appear. -> Proceed immediately to Step 6 (The Hard Revert).

### STEP 5: PRODUCTION DEPLOYMENT & QA
*   Prepare the verified files for staging and release.
*   Confirm that the original issue is gone and no new regressions are introduced.

### STEP 6: THE HARD REVERT (Anti-Hallucination Protocol)
*   **ACTION:** If Condition B in Step 4 is met, you MUST immediately revert all modified files back to their exact `[REVERT_ANCHOR]` state.
*   You are strictly forbidden from trying to "fix the new fix" on top of a broken build. You must revert back to the known baseline.
*   Acknowledge the failed hypothesis: *"Hypothesis failed. Reverting to baseline."*
*   Formulate a completely new hypothesis and return to Step 2.
