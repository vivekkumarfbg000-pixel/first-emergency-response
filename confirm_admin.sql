-- ============================================================
-- SEHAT POINT — Confirm Master Admin Account
-- PURPOSE: Marks firstemergencycall4@gmail.com / firstemergencycall@gmail.com / firstemergencyresponse4@gmail.com
--          as confirmed and assigns them the 'admin' role in the database.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. Confirm the email of the admin account in auth.users
UPDATE auth.users
SET email_confirmed_at = now(),
    updated_at = now()
WHERE email = 'firstemergencyresponse4@gmail.com';

-- 2. Assign the 'admin' role in public.user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'firstemergencyresponse4@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- 3. Also do it for other potential admin emails just in case
UPDATE auth.users
SET email_confirmed_at = now(),
    updated_at = now()
WHERE email = 'firstemergencycall@gmail.com';

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'firstemergencycall@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
