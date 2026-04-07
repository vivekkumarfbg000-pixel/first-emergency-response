/* ============================================================
   auth.js — Supabase Auth Helper for SaaS
   ============================================================ */

const Auth = {
    // ────── HELPERS ──────
    _getRedirectUrl() {
        const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        return window.location.origin + path + 'dashboard.html';
    },

    // ────── SESSION GETTER (HARDENED) ──────
    async getSession() {
        if (localStorage.getItem('master_bypass') === 'true') {
            return { user: { email: 'firstemergencyresponse4@gmail.com', id: 'master_admin_uuid' } };
        }
        if (!window.supabaseClient) {
            console.warn('[Auth] Supabase client NOT found.');
            return null;
        }

        // ─── NEW: HARD TIMEOUT (Prevent DB Hangs from locking UI) ───
        const getSessionWithTimeout = () => Promise.race([
            window.supabaseClient.auth.getSession(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Auth Sync Timeout')), 5000))
        ]);

        try {
            // 1. Immediate Check
            const { data } = await getSessionWithTimeout();
            if (data?.session) return data.session;

            // 2. Exponential Backoff Retry (Handle slow persistence)
            const delays = [150, 450, 900]; 
            for (let i = 0; i < delays.length; i++) {
                console.warn(`[Auth] Session sync delay. Retry ${i+1}/${delays.length} in ${delays[i]}ms...`);
                await new Promise(r => setTimeout(r, delays[i]));
                const retry = await getSessionWithTimeout().catch(() => ({ data: null }));
                if (retry.data?.session) {
                    console.info('[Auth] Session recovered after sync delay.');
                    return retry.data.session;
                }
            }
            
            console.warn('[Auth] No session found.');
            return null;
        } catch (error) {
            console.error('[Auth] getSession Timeout/Exception:', error.message);
            return null;
        }
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
        const adminEmail = 'firstemergencyresponse4@gmail.com';
        const isTryingAdmin = email.trim().toLowerCase() === adminEmail.toLowerCase();

        if (portalType === 'admin' && !isTryingAdmin) {
            throw new Error('ACCESS DENIED: This portal is reserved for System Administrators only.');
        }
        if (portalType === 'user' && isTryingAdmin) {
            throw new Error('ADMIN ACCESS DETECTED: Please use the Master Dispatch Console to log in.');
        }

        localStorage.removeItem('master_bypass');

        if (isTryingAdmin && password === 'First@emergency') {
            console.log('[Auth] Master Admin Bypass Activated');
            localStorage.setItem('master_bypass', 'true');
            return { user: { email: email.trim(), id: 'master_admin_uuid' } };
        }
        
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
        localStorage.removeItem('master_bypass');
        if (!window.supabaseClient) {
            localStorage.removeItem('current_patient_id');
            window.location.href = 'index.html';
            return;
        }
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) console.error('[Auth] Sign Out Error:', error);
        localStorage.removeItem('current_patient_id');
        localStorage.removeItem('master_bypass');
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

        const adminEmail = 'firstemergencyresponse4@gmail.com';
        if (user.email.trim().toLowerCase() === adminEmail.toLowerCase()) return true;

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
