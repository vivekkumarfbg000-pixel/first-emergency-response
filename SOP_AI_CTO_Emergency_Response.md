# Standard Operating Procedure (SOP) for AI CTO
## Project: First Emergency Response (Sehat Point)

This SOP is a mandatory reference for the AI CTO (Agent) before performing any debugging, code modifications, or feature additions to the "First Emergency Response" project. Follow these steps strictly to maintain system integrity and prevent regression.

> [!IMPORTANT]
> This project follows **"Clinical-Grade"** standards for medical data. Accuracy, privacy (RLS), and offline resilience are paramount.



---

## 1. Pre-Analysis & Context Gathering
Before touching any code, the AI CTO MUST:
1. **Identify the Component**: Determine if the issue is Frontend (HTML/JS/CSS) or Backend (Supabase/PostgreSQL).
2. **Review Project State**: Check the current `PROJECT_SUMMARY.md` to understand the architecture and recent changes.
3. **Verify Dependencies**: Ensure all required libraries (Tailwind, Lucide, QRCode.js, Leaflet.js) are properly referenced in the HTML files.

---

## 2. Debugging Protocol
### 2.1 Frontend Debugging
- **Browser Console**: Always check for JavaScript errors or failed network requests (401 Unauthorized, 404 Not Found).
- **LocalStorage Audit**: Check `localStorage` for cached medical data, as the app uses an "offline-first" approach (`js/storage.js`).
- **JWT Session**: Verify if the user is authenticated via `supabase.auth.getSession()`.

### 2.2 Backend/Database Debugging
- **RLS Check**: If a query returns no data but the record exists, it is likely a Row Level Security (RLS) issue.
- **Trigger Logs**: Check for errors in SQL triggers (e.g., cascading deletes or alert generation).
- **Schema Validation**: Compare the current database state with `supabase_canonical_migration.sql`.

---

## 3. Code Modification Rules (Anti-Regression)
To fix or add code without creating new errors, follow these "Zero-Error" rules:

### 3.1 Research Before Replacement
- **Single Source of Truth**: All data fetching MUST go through `js/storage.js`. Never write ad-hoc fetch calls in UI files.
- **Trace Usage**: Before deleting a function or variable, use `grep_search` to find all its references across the project.
- **Data Mapping**: When modifying patient fields, ensure they are updated in `mapToDB`, `mapFromDB`, and `encodeForQR` within `js/storage.js`.

### 3.2 Syntax Error & Logic Prevention
To ensure "No New Errors":
- **Bracket Matching**: For every `{`, ensure a matching `}` exists. Use a linter or manual scan of indentation levels.
- **Semicolon Strictness**: In Vanilla JS, always end statements with `;` to avoid ASI (Automatic Semicolon Insertion) bugs.
- **Await Consistency**: Any function using `this.db()` or `Auth` MUST be `async`, and calls to them MUST be `await`-ed.
- **Precise Replacements**: Use `replace_file_content` only with verified `StartLine` and `EndLine`. If unsure, use `multi_replace_file_content` with smaller chunks.

### 3.3 Database Integrity
- **Migrations First**: Any schema change must be documented in a new `.sql` file in the `supabase/` directory.
- **Security Hardening**: After ANY database change, run `final_security_harden.sql`. This is non-negotiable for RLS stability.

### 3.4 AI Hub & Edge Functions (Deno/TypeScript)
When modifying Edge Functions (e.g., `generate-medical-summary`):
- **CORS Consistency**: Always include `corsHeaders` in responses to prevent frontend "Signal Severed" errors.
- **Deterministic AI**: Maintain `temperature: 0.1` and `response_format: { type: "json_object" }` for medical summaries to ensure paramedics receive reliable data.
- **Fallback Logic**: Every AI-driven function MUST have a deterministic TypeScript fallback (e.g., `generateFallbackSummary`) for when `GROQ_API_KEY` is missing or the API is unreachable.
- **Secret Management**: Never hardcode API keys. Use `Deno.env.get('GROQ_API_KEY')` and ensure keys are set via `supabase secrets set`.
- **Deployment**: After any change to `supabase/functions/`, run `supabase functions deploy [function-name]`.



---

## 4. Feature Addition Workflow
When adding a new feature (e.g., "AI Triage" or "IoT Integration"):
1. **Plan**: Write a design doc in the implementation plan.
2. **Schema**: Create necessary PostgreSQL tables/columns first.
3. **Storage Layer**: Update `js/storage.js` to handle the new data.
4. **UI**: Add components to the relevant HTML files using Tailwind CSS for consistency.
5. **Realtime**: If the feature requires live updates, ensure `supabase.channel()` is properly configured.

---

## 5. Verification Checklist
Before declaring a task "Complete", the AI CTO must pass this checklist:
- [ ] **Linting**: No syntax errors in JS or CSS.
- [ ] **Cross-Page Consistency**: Check if changes in `dashboard.html` broke `admin.html`.
- [ ] **Security**: Ensure RLS is active (test with a non-owner user).
- [ ] **Responsive Design**: Verify that the "Emergency UI" still works on mobile (high contrast, large buttons).
- [ ] **Offline Resilience**: Verify that the app still loads/functions if the Supabase connection is simulated as offline.

---

## 6. Emergency Reversal
If a change causes a critical failure (e.g., app won't load):
1. **Rollback**: Immediately revert the last file change.
2. **Logs**: Re-examine the browser console for the specific error that triggered the failure.
3. **Re-Plan**: Do not attempt the same fix twice without a new strategy.

---
**Version**: 1.2.0
**Role**: AI CTO Standard Operating Procedure
**Strict Compliance Required**
