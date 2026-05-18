-- ============================================================
-- SEHAT POINT — Master Admin Reset & Diagnostic Utility
-- PURPOSE: 1. Diagnoses existing auth users in your database
--          2. Forces password to 'Admin123!' & confirms the email
--          3. Grants the 'admin' role in public.user_roles
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1: SEE ALL REGISTERED USERS in your database
-- (Check the Results pane below after running this query)
-- ------------------------------------------------------------
SELECT 
    id as user_id, 
    email, 
    email_confirmed_at,
    (SELECT role FROM public.user_roles WHERE user_id = auth.users.id) as current_role
FROM auth.users;

-- ------------------------------------------------------------
-- STEP 2: FORCE RESET PASSWORD & CONFIRM EMAIL
-- Change the email below to your exact "fixed" email address
-- ------------------------------------------------------------
UPDATE auth.users
SET encrypted_password = crypt('Admin123!', gen_salt('bf')),
    email_confirmed_at = now(),
    updated_at = now()
WHERE email = 'firstemergencyresponse4@gmail.com'; -- <-- REPLACE WITH YOUR EXACT EMAIL IF DIFFERENT

-- ------------------------------------------------------------
-- STEP 3: ELEVATE USER TO ADMIN ROLE
-- Change the email below to your exact "fixed" email address
-- ------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'firstemergencyresponse4@gmail.com' -- <-- REPLACE WITH YOUR EXACT EMAIL IF DIFFERENT
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
