-- Keep an application profile for each Supabase Auth account. New users remain
-- regular members until an operator explicitly promotes them to admin.
CREATE OR REPLACE FUNCTION public.create_profile_for_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, role)
    VALUES (NEW.id, 'member')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_profile_for_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_auth_user();

-- Also cover accounts that existed before this migration was applied.
INSERT INTO public.profiles (id, role)
SELECT id, 'member'
FROM auth.users
ON CONFLICT (id) DO NOTHING;
