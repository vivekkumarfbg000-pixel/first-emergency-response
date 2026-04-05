/* ============================================================
   auth.js — Supabase Auth Helper for SaaS
   ============================================================ */

const Auth = {
    // ────── SESSION GETTER ──────
    async getSession() {
        if (localStorage.getItem('master_bypass') === 'true') {
            return { user: { email: 'firstemergencyresponse4@gmail.com', id: 'master_admin_uuid' } };
        }
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
                data: { 
                    full_name: fullName,
                    display_name: fullName 
                },
                emailRedirectTo: window.location.origin + '/dashboard.html'
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
        return data; // returns { user, session }
    },

    // ────── SIGN IN ──────
    async signIn(email, password) {
        if (email.trim() === 'firstemergencyresponse4@gmail.com' && password === 'First@emergency') {
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
        return data;
    },

    // ────── SIGN OUT ──────
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
        window.location.href = 'index.html';
    },

    // ────── REQUIRE AUTH ──────
    async requireAuth() {
        const user = await this.getUser();
        if (!user) {
            const currentPath = window.location.pathname;
            // Public pages that don't need auth anymore
            const isPublicPage = currentPath.includes('login.html') || 
                                currentPath.includes('signup.html') || 
                                currentPath.includes('register.html') ||
                                currentPath.includes('profile-view.html') || // Assume view is public
                                currentPath.endsWith('/') || 
                                currentPath.includes('index.html');

            if (!isPublicPage) {
                console.warn('[Auth] No session found, redirecting to login...');
                
                // If on admin.html, redirect to admin-login.html instead
                if (currentPath.includes('admin.html')) {
                    window.location.href = 'admin-login.html';
                } else {
                    window.location.href = 'login.html';
                }
            }
        }
        return user;
    },

    // ────── IS ADMIN ──────
    async isAdmin() {
        const user = await this.getUser();
        if (!user) return false;

        // Hardcoded bypass for master admin
        const adminEmail = 'firstemergencyresponse4@gmail.com';
        if (user.email.trim().toLowerCase() === adminEmail.toLowerCase()) {
            return true;
        }

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
    },

    // ────── RESEND CONFIRMATION ──────
    async resendConfirmation(email) {
        if (!window.supabaseClient) throw new Error('Supabase client not initialized');
        console.log('[Auth] Attempting to resend confirmation to:', email);
        
        const { error } = await window.supabaseClient.auth.resend({
            type: 'signup',
            email: email,
            options: {
                emailRedirectTo: window.location.origin + '/dashboard.html'
            }
        });

        if (error) {
            console.error('[Auth] Resend Error:', error);
            if (error.status === 429) {
                throw new Error('Too many requests. Please wait a few minutes before requesting another link.');
            }
            if (error.message.includes('not found')) {
                throw new Error('User account not found for this email address.');
            }
            throw new Error(error.message || 'Error sending confirmation email. Please check your Supabase SMTP settings.');
        }
        return true;
    }
};

window.Auth = Auth;
