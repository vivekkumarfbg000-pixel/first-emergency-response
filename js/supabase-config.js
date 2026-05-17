/* ============================================================
   supabase-config.js — v1.0 Supabase Client Initialization
   ============================================================ */

const SUPABASE_URL = 'https://ykrqpxbbyfipjqhpaszf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcnFweGJieWZpcGpxaHBhc3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MTEwNjEsImV4cCI6MjA4MjA4NzA2MX0.rWuk98xZ1wpJwK9agtZCeie3C9xQDb43UZK8FutCGss';

// ─── Deployed Site URL (used for QR code generation) ───
// IMPORTANT: QR codes MUST use this URL so phones can scan them.
// Update this if you deploy to a custom domain.
const SITE_BASE_URL = 'https://first-emergency-response.vercel.app/';
window.SITE_BASE_URL = SITE_BASE_URL;

// Use a global supabase instance (with safety check for offline/CDN failure)
if (typeof supabase !== 'undefined') {
    const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
    window.supabaseClient = _supabase;
    console.log('[Supabase Config] Client initialized successfully.');
} else {
    console.warn('[Supabase Config] Supabase JS not loaded. Cloud features will be unavailable.');
    window.supabaseClient = null;
}
