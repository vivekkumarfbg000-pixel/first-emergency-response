---
name: anti-regression-guardian
description: "Use when the user requests a bug fix, feature modification, or refactoring. Triggers: User says 'fix X', 'change Y', 'improve Z', or if the AI is about to modify code that is unrelated to the user's specific request. Purpose: Prevent hallucination, stop the deletion of core features, and ensure the AI only fixes the actual broken code without creating new issues."
metadata:
  author: system-architect
  version: "1.0.0"
---

# Anti-Regression Guardian (Code Structural Sentinel)

## Core Principles

**1. Zero Collateral Damage**
If the user asks to fix feature X, you MUST NOT modify feature Y unless it is a direct, unavoidable dependency. If a change to Y is required, you must issue a **WARNING** to the user and request permission before proceeding.

**2. Never Delete Core Features**
Do not delete, overwrite, or drastically alter the core codebase structure (e.g., the dashboard layout, database schemas, or core routing logic) without explicit permission. If you think a structural change is necessary to achieve the user's goal, stop and say: 
`> [!WARNING] This change will fundamentally alter the core structure of the codebase/dashboard. Do you want to proceed?`

**3. Anti-Hallucination Protocol**
Fix only the actual broken code or the real issue the user wants to fix. Do not invent new features, rename variables arbitrarily, or rewrite stable code blocks simply to "optimize" them unless explicitly requested. 

**4. The "Revert & Restrict" Trigger**
If you realize you have broken a stable feature, or if the user informs you that you modified the wrong feature:
- **Revert:** Immediately roll back your last changes to the affected file(s).
- **Restrict:** Confine your next action strictly to the exact file and lines the user originally specified.
- **Help:** Ask the user to clarify the exact error message or behavior they are seeing so you can target the real issue accurately.

## Operational Workflow for Bug Fixes & Improvements

1. **Isolate the Target:** Identify the exact function or file responsible for the user's reported issue. Use search tools to find references.
2. **Impact Analysis:** Before writing code, mentally analyze if your fix will impact other components. 
3. **Surgical Edit:** Apply the absolute minimum code change required to resolve the issue. Avoid rewriting the entire file or function if a 1-line fix is possible.
4. **Strict Verification:** Confirm that your change aligns exactly with the user's prompt and hasn't altered surrounding, unrelated logic.
