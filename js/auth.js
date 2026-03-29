/* ============================================================
   auth.js — Supabase Auth Helper for SaaS
   ============================================================ */

const Auth = {
    // ────── SESSION GETTER ──────
    async getSession() {
        if (!window.supabaseClient) return null;
        try {
            const { data: { session }, error } = await window.supabaseClient.auth.getSession();
            if (error) { console.error('[Auth] getSession Error:', error); return null; }
            return session;
        } catch (e) {
            console.error('[Auth] getSession Exception:', e);
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
                data: { full_name: fullName }
            }
        });

        if (error) {
            console.error('[Auth] SignUp error:', error);
            throw error;
        }
        
        console.log('[Auth] SignUp success:', data);
        return data; // returns { user, session }
    },

    // ────── SIGN IN ──────
    async signIn(email, password) {
        if (!window.supabaseClient) throw new Error('Supabase client not initialized');

        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            console.error('[Auth] SignIn error:', error);
            // Handle common Supabase errors more gracefully
            if (error.message.includes('Email not confirmed')) {
                throw new Error('Please confirm your email address before signing in.');
            }
            if (error.message.includes('Invalid login credentials')) {
                throw new Error('Invalid email or password. Please try again.');
            }
            throw error;
        }

        console.log('[Auth] SignIn success, user:', data?.user?.id);
        return data;
    },

    // ────── SIGN OUT ──────
    async signOut() {
        if (!window.supabaseClient) return;
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) console.error('[Auth] Sign Out Error:', error);
        localStorage.removeItem('current_patient_id');
        window.location.href = 'index.html';
    },

    // ────── REQUIRE AUTH ──────
    async requireAuth() {
        const user = await this.getUser();
        if (!user) {
            const currentPath = window.location.pathname;
            if (!currentPath.includes('login.html') && !currentPath.includes('signup.html')) {
                console.warn('[Auth] No session found, redirecting to login...');
                window.location.href = 'login.html';
            }
        }
        return user;
    },

    // ────── IS ADMIN ──────
    async isAdmin() {
        const user = await this.getUser();
        if (!user) return false;

        try {
            const { data, error } = await window.supabaseClient
                .from('user_roles')
                .select('role')
                .eq('user_id', user.id)
                .single();

            if (error) return false;
            return data && data.role === 'admin';
        } catch (e) {
            return false;
        }
    }
};

window.Auth = Auth;
