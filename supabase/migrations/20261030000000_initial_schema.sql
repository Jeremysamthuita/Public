-- AIC Egerton Chapel: local and hosted Supabase schema.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sermons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    preacher TEXT NOT NULL,
    scripture_reference TEXT,
    series TEXT,
    sermon_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    audio_url TEXT,
    video_url TEXT,
    resource_pack_url TEXT,
    is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    premium_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tags TEXT[] NOT NULL DEFAULT '{}',
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sermons_search_idx ON public.sermons
USING gin (to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || COALESCE(scripture_reference, '') || ' ' || preacher));

CREATE TABLE IF NOT EXISTS public.contact_inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    message TEXT NOT NULL,
    category TEXT DEFAULT 'General Inquiry',
    sentiment TEXT DEFAULT 'Neutral',
    urgency_level TEXT DEFAULT 'Normal',
    assigned_department TEXT DEFAULT 'Pastoral Care',
    ai_summary TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mpesa_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_request_id TEXT,
    checkout_request_id TEXT UNIQUE NOT NULL,
    phone_number TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    purpose TEXT NOT NULL,
    sermon_id UUID REFERENCES public.sermons(id) ON DELETE SET NULL,
    mpesa_receipt_number TEXT,
    transaction_date TIMESTAMPTZ,
    result_code INT,
    result_desc TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    download_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prayer_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name TEXT NOT NULL DEFAULT 'Anonymous',
    category TEXT DEFAULT 'Other',
    request_text TEXT NOT NULL,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    prayed_count INT NOT NULL DEFAULT 0 CHECK (prayed_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role = 'admin'
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_prayed(prayer_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.prayer_requests
    SET prayed_count = prayed_count + 1
    WHERE id = prayer_id AND is_approved = TRUE;
$$;

REVOKE ALL ON FUNCTION public.increment_prayed(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_prayed(UUID) TO anon, authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sermons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpesa_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published sermons" ON public.sermons;
DROP POLICY IF EXISTS "Admins can manage sermons" ON public.sermons;
CREATE POLICY "Public can view published sermons" ON public.sermons
    FOR SELECT TO anon, authenticated USING (is_published = TRUE OR public.is_admin());
CREATE POLICY "Admins can manage sermons" ON public.sermons
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can submit contact inquiries" ON public.contact_inquiries;
DROP POLICY IF EXISTS "Admins can manage contact inquiries" ON public.contact_inquiries;
CREATE POLICY "Public can submit contact inquiries" ON public.contact_inquiries
    FOR INSERT TO anon, authenticated WITH CHECK (TRUE);
CREATE POLICY "Admins can manage contact inquiries" ON public.contact_inquiries
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can track payments" ON public.mpesa_payments;
DROP POLICY IF EXISTS "Admins can manage payments" ON public.mpesa_payments;
CREATE POLICY "Admins can manage payments" ON public.mpesa_payments
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can read approved prayers" ON public.prayer_requests;
DROP POLICY IF EXISTS "Public can submit prayers" ON public.prayer_requests;
DROP POLICY IF EXISTS "Admins can manage prayer requests" ON public.prayer_requests;
CREATE POLICY "Public can read approved prayers" ON public.prayer_requests
    FOR SELECT TO anon, authenticated USING (is_approved = TRUE OR public.is_admin());
CREATE POLICY "Public can submit prayers" ON public.prayer_requests
    FOR INSERT TO anon, authenticated WITH CHECK (is_approved = FALSE AND prayed_count = 0);
CREATE POLICY "Admins can manage prayer requests" ON public.prayer_requests
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT TO authenticated USING (id = (SELECT auth.uid()) OR public.is_admin());

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.sermons TO anon, authenticated;
GRANT INSERT ON public.contact_inquiries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_inquiries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mpesa_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prayer_requests TO authenticated;
GRANT SELECT, INSERT ON public.prayer_requests TO anon;
GRANT SELECT ON public.profiles TO authenticated;

