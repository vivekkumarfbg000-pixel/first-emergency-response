/* ============================================================
   auth.js — Supabase Auth Helper for SaaS
   ============================================================ */

const Auth = {
    // ────── SESSION GETTER ──────
    async getUser() {
        if (!window.supabaseClient) return null;
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();
        if (error) {
            console.error('Session Error:', error);
            return null;
        }
        return session ? session.user : null;
    },

    // ────── SIGN UP ──────
    async signUp(email, password, fullName) {
        if (!window.supabaseClient) throw new Error('Supabase client not initialized');
        
        const { data, error } = await window.supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });

        if (error) throw error;
        return data;
    },

    // ────── SIGN IN ──────
    async signIn(email, password) {
        if (!window.supabaseClient) throw new Error('Supabase client not initialized');

        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    },

    // ────── SIGN OUT ──────
    async signOut() {
        if (!window.supabaseClient) return;
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) console.error('Sign Out Error:', error);
        window.location.href = 'index.html';
    },

    // ────── REQUIRE AUTH ──────
    async requireAuth() {
        const user = await this.getUser();
        if (!user) {
            const currentPath = window.location.pathname;
            if (!currentPath.includes('login.html') && !currentPath.includes('signup.html')) {
                window.location.href = 'login.html';
            }
        }
        return user;
    },

    // ────── IS ADMIN ──────
    async isAdmin() {
        const user = await this.getUser();
        if (!user) return false;

        const { data, error } = await window.supabaseClient
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single();
        
        if (error) return false;
        return data && data.role === 'admin';
    }
};

window.Auth = Auth;
