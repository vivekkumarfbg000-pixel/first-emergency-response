-- ============================================================
-- SEHAT POINT — Secure Direct Registration & Confirmation RPC
-- PURPOSE: Bypasses SMTP rate limits by allowing direct client-side
--          confirmed user account registration and automated role mapping.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.register_user_direct(
    user_email text,
    user_password text,
    user_fullname text
)
RETURNS jsonb
SECURITY DEFINER
AS $$
DECLARE
    new_user_id uuid;
    encrypted_pw text;
BEGIN
    -- 1. Normalize email input
    user_email := lower(trim(user_email));

    -- 2. Validate email length and structure
    IF position('@' in user_email) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid email address format.');
    END IF;

    IF length(user_password) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters long.');
    END IF;

    -- 3. Check if user already exists
    SELECT id INTO new_user_id FROM auth.users WHERE email = user_email;

    IF new_user_id IS NOT NULL THEN
        -- User exists. Check if they are unconfirmed
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = new_user_id AND email_confirmed_at IS NULL) THEN
            -- Update password and mark as confirmed
            encrypted_pw := crypt(user_password, gen_salt('bf'));
            
            UPDATE auth.users
            SET encrypted_password = encrypted_pw,
                email_confirmed_at = now(),
                confirmed_at = now(),
                last_sign_in_at = NULL,
                updated_at = now(),
                raw_user_meta_data = jsonb_build_object('full_name', user_fullname, 'display_name', user_fullname)
            WHERE id = new_user_id;

            -- Establish role assignment in public.user_roles
            IF user_email = 'firstemergencyresponse4@gmail.com' THEN
                INSERT INTO public.user_roles (user_id, role)
                VALUES (new_user_id, 'admin')
                ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
            ELSE
                INSERT INTO public.user_roles (user_id, role)
                VALUES (new_user_id, 'user')
                ON CONFLICT (user_id) DO NOTHING;
            END IF;

            RETURN jsonb_build_object('success', true, 'user_id', new_user_id, 'action', 'updated_unconfirmed');
        ELSE
            -- User exists and is already confirmed
            RETURN jsonb_build_object('success', false, 'error', 'Account already exists. Please Sign In instead.');
        END IF;
    END IF;

    -- 4. Create new user
    new_user_id := gen_random_uuid();
    encrypted_pw := crypt(user_password, gen_salt('bf'));

    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        confirmed_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        is_super_admin
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        user_email,
        encrypted_pw,
        now(),
        now(),
        NULL,
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object('full_name', user_fullname, 'display_name', user_fullname),
        now(),
        now(),
        false
    );

    -- Establish role assignment in public.user_roles
    IF user_email = 'firstemergencyresponse4@gmail.com' THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (new_user_id, 'admin')
        ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
    ELSE
        INSERT INTO public.user_roles (user_id, role)
        VALUES (new_user_id, 'user')
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object('success', true, 'user_id', new_user_id, 'action', 'inserted_new');
END;
$$ LANGUAGE plpgsql;
