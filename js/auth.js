/* ============================================================
   auth.js — Supabase Auth Helper for SaaS
   ============================================================ */

const Auth = {
    // ────── HELPERS ──────
    _getRedirectUrl() {
        const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        return window.location.origin + path + 'dashboard.html';
    },

    // ────── INTERNAL STATE ──────
    _session: null,
    _initialized: false,
    _initPromise: null,

    /**
     * initializes the auth state listener.
     * Returns a promise that resolves when the initial session check is complete.
     */
    async init() {
        if (this._initPromise) return this._initPromise;

        this._initPromise = new Promise((resolve) => {
            if (!window.supabaseClient) {
                console.warn('[Auth] Supabase client NOT found during init.');
                this._initialized = true;
                resolve(null);
                return;
            }

            console.log('[Auth] Initializing session observer...');
            
            // Listen for auth state changes (including INITIAL_SESSION)
            const { data: { subscription } } = window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
                console.info(`[Auth] State Change: ${event}`, session?.user?.email || 'No Session');
                
                this._session = session;
                this._initialized = true;

                // Resolve the promise on key events that indicate state is "settled"
                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
                    resolve(session);
                }
            });

            // Failsafe: If no event fires in 3 seconds, try a manual getSession
            setTimeout(async () => {
                if (!this._initialized) {
                    console.warn('[Auth] Initialization timeout. Performing manual sync...');
                    try {
                        const { data } = await window.supabaseClient.auth.getSession();
                        this._session = data?.session || null;
                        this._initialized = true;
                        resolve(this._session);
                    } catch (e) {
                        this._initialized = true;
                        resolve(null);
                    }
                }
            }, 3000);
        });

        return this._initPromise;
    },

    // ────── SESSION GETTER (HARDENED) ──────
    async getSession() {
        // Ensure we are initialized first
        await this.init();
        return this._session;
    },

    async getUser() {
        const session = await this.getSession();
        if (!session) return null;
        return session.user || null;
    },

    // ────── SIGN UP ──────
    async signUp(email, password, fullName) {
        if (!window.supabaseClient) throw new Error('Supabase client not initialized');

        const { data, error } = await window.supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: { 
                    full_name: fullName,
                    display_name: fullName 
                },
                emailRedirectTo: this._getRedirectUrl()
            }
        });

        if (error) {
            console.error('[Auth] SignUp error:', error);
            if (error.message.includes('not configured')) {
                throw new Error('Supabase Email Server (SMTP) is not yet configured. Please contact the administrator OR check your Supabase Dashboard Auth settings.');
            }
            throw error;
        }
        
        console.log('[Auth] SignUp success:', data);
        
        // ─── NEW: Profile Claiming Logic ───
        if (data.session && window.AppStorage) {
            const pendingId = window.AppStorage.getPendingPatientId();
            if (pendingId) {
                console.log('[Auth] Claiming pending profile:', pendingId);
                try {
                    await window.AppStorage.claimProfile(pendingId);
                    window.AppStorage.clearPendingPatientId();
                } catch (e) {
                    console.error('[Auth] Claiming failed:', e);
                }
            }
            
            // NEW: Email Recovery (Hard-Link)
            console.log('[Auth] Triggering Email Recovery via signUp:', email);
            await window.AppStorage.claimProfilesByEmail(email).catch(console.error);
        }
        
        return data; 
    },

    async signIn(email, password, portalType = 'user') {
        // ✅ SECURITY FIX: No hardcoded credentials. All auth goes through Supabase.
        localStorage.removeItem('master_bypass');
        
        if (!window.supabaseClient) throw new Error('Supabase client not initialized');

        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            console.error('[Auth] SignIn error:', error);
            if (error.message.includes('Email not confirmed')) {
                throw new Error('Email verification required. Please check your inbox OR click the "Resend Link" button below to try again.');
            }
            if (error.status === 429) {
                throw new Error('Too many attempts. Please wait a few minutes before trying again.');
            }
            if (error.message.includes('Invalid login credentials')) {
                throw new Error('Invalid email or password. Please verify your credentials.');
            }
            throw new Error(error.message || 'Unable to sign in. Please try again.');
        }

        console.log('[Auth] SignIn success, user:', data?.user?.email);
        
        if (data.session && window.AppStorage) {
            const pendingId = window.AppStorage.getPendingPatientId();
            if (pendingId) {
                console.log('[Auth] Claiming pending profile during sign-in:', pendingId);
                await window.AppStorage.claimProfile(pendingId).catch(console.error);
                window.AppStorage.clearPendingPatientId();
            }
            console.log('[Auth] Triggering Email Recovery via signIn:', email);
            await window.AppStorage.claimProfilesByEmail(email).catch(console.error);
        }
        
        return data;
    },

    async signOut() {
        if (!window.supabaseClient) {
            localStorage.removeItem('current_patient_id');
            window.location.href = 'index.html';
            return;
        }
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) console.error('[Auth] Sign Out Error:', error);
        localStorage.removeItem('current_patient_id');
        window.location.href = 'index.html';
    },

    async requireAuth() {
        const user = await this.getUser();
        if (!user) {
            const currentPath = window.location.pathname;
            const isPublicPage = currentPath.includes('login.html') || 
                                currentPath.includes('signup.html') || 
                                currentPath.includes('register.html') ||
                                currentPath.endsWith('/') || 
                                currentPath.includes('index.html');

            if (!isPublicPage) {
                console.warn('[Auth] No session found, redirecting to login...');
                if (currentPath.includes('admin.html')) {
                    window.location.href = 'admin-login.html';
                } else {
                    window.location.href = 'login.html';
                }
            }
        }
        return user;
    },

    async isAdmin() {
        const user = await this.getUser();
        if (!user) return false;
        if (!window.supabaseClient) return false;

        // ✅ SECURITY FIX: Admin status determined solely by user_roles table + is_admin() DB function.
        // No hardcoded email checks in client-side code.
        try {
            const { data, error } = await window.supabaseClient
                .from('user_roles')
                .select('role')
                .eq('user_id', user.id)
                .single();

            if (error) return false;
            return data && data.role === 'admin';
        } catch (e) { return false; }
    },

    async resendConfirmation(email) {
        if (!window.supabaseClient) throw new Error('Supabase client not initialized');
        const { error } = await window.supabaseClient.auth.resend({
            type: 'signup',
            email: email,
            options: { emailRedirectTo: this._getRedirectUrl() }
        });
        if (error) throw error;
        return true;
    }
};

window.Auth = Auth;
