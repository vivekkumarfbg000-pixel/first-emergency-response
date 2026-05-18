-- ============================================================
-- SEHAT POINT — Seed Master Admin Account
-- PURPOSE: Directly provisions or resets the main administrative account
--          (firstemergencyresponse4@gmail.com) in auth.users with a
--          fully-confirmed status and associates it with the admin role.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. Enable pgcrypto extension for secure bcrypt password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Execute block to securely insert or update the admin account
DO $$
DECLARE
    new_user_id uuid := gen_random_uuid();
    admin_email text := 'firstemergencyresponse4@gmail.com';
    admin_password text := 'Admin123!'; -- <-- CHANGE THIS TO YOUR DESIRED MASTER PASSWORD
    encrypted_pw text;
BEGIN
    -- Normalize email
    admin_email := lower(trim(admin_email));
    
    -- Encrypt the password using standard bcrypt hashing algorithm
    encrypted_pw := crypt(admin_password, gen_salt('bf'));

    -- Check if user already exists in auth.users
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = admin_email) THEN
        -- User exists. Reset password and ensure they are confirmed
        -- Note: confirmed_at is a generated column and must not be set manually
        UPDATE auth.users
        SET encrypted_password = encrypted_pw,
            email_confirmed_at = now(),
            updated_at = now()
        WHERE email = admin_email
        RETURNING id INTO new_user_id;
        
        RAISE NOTICE 'Admin account existed. Successfully updated password and confirmed status.';
    ELSE
        -- User does not exist. Create a new pre-confirmed user record
        -- Note: confirmed_at is a generated column and must not be set manually
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
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
            admin_email,
            encrypted_pw,
            now(),
            '{"provider": "email", "providers": ["email"]}'::jsonb,
            '{"full_name": "Emergency Admin", "display_name": "Admin"}'::jsonb,
            now(),
            now(),
            false
        );
        
        RAISE NOTICE 'Successfully created new pre-confirmed admin user account.';
    END IF;

    -- 3. Link user record to public.user_roles with 'admin' privileges
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new_user_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

    RAISE NOTICE 'Admin role association linked successfully.';
END $$;
