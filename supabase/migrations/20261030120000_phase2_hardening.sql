-- Phase 2: hardening, new tables, and payment/premium scaffolding.
-- Safe to run on an existing database with rows.
-- Deliberately does NOT drop the `sermons` table yet (Phase 3 removes it).

-- 1. Rate limiting (used by submit-form)
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INT NOT NULL DEFAULT 1 CHECK (count >= 0),
    UNIQUE (bucket_key, window_start)
);

CREATE OR REPLACE FUNCTION public.bump_rate_limit(p_key TEXT, p_window TIMESTAMPTZ)
RETURNS INT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
    INSERT INTO public.rate_limits (bucket_key, window_start, count)
    VALUES (p_key, p_window, 1)
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
    RETURNING count;
$$;
REVOKE ALL ON FUNCTION public.bump_rate_limit(TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(TEXT, TIMESTAMPTZ) TO service_role;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- no policies: only the service role can read/write.

-- 2. Ministry applications
CREATE TABLE IF NOT EXISTS public.ministry_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    age INT,
    baptism_year INT,
    ministry TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done')),
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    handled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.ministry_applications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    ALTER TABLE public.ministry_applications
        ADD CONSTRAINT ministry_apps_name_len CHECK (char_length(name) <= 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE public.ministry_applications
        ADD CONSTRAINT ministry_apps_notes_len CHECK (notes IS NULL OR char_length(notes) <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Newsletter subscribers
CREATE TABLE IF NOT EXISTS public.subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL DEFAULT 'site',
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at TIMESTAMPTZ,
    unsubscribed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    ALTER TABLE public.subscribers
        ADD CONSTRAINT subscribers_email_len CHECK (char_length(email) <= 254);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Premium resources + access grants (Phase 5 wires these)
CREATE TABLE IF NOT EXISTS public.premium_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contentful_entry_id TEXT NOT NULL UNIQUE,
    storage_path TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.premium_resources ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES public.mpesa_payments(id) ON DELETE CASCADE,
    resource_id UUID REFERENCES public.premium_resources(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

-- 5. Audit log
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 6. mpesa_payments hardening
ALTER TABLE public.mpesa_payments ADD COLUMN IF NOT EXISTS raw_callback JSONB;
ALTER TABLE public.mpesa_payments ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES public.premium_resources(id) ON DELETE SET NULL;
ALTER TABLE public.mpesa_payments ADD COLUMN IF NOT EXISTS reconciled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS mpesa_payments_receipt_unique
    ON public.mpesa_payments (mpesa_receipt_number)
    WHERE mpesa_receipt_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS mpesa_payments_status_idx
    ON public.mpesa_payments (status, created_at DESC);

-- 7. contact_inquiries workflow
ALTER TABLE public.contact_inquiries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE public.contact_inquiries ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.contact_inquiries ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ;

DO $$ BEGIN
    ALTER TABLE public.contact_inquiries
        ADD CONSTRAINT contact_status_values CHECK (status IN ('new', 'in_progress', 'done'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8. prayer_requests: private flag + length checks
ALTER TABLE public.prayer_requests ADD COLUMN IF NOT EXISTS private BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
    ALTER TABLE public.prayer_requests
        ADD CONSTRAINT prayer_text_len CHECK (char_length(request_text) <= 1000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE public.prayer_requests
        ADD CONSTRAINT prayer_name_len CHECK (char_length(display_name) <= 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 9. Revoke anon inserts on contact_inquiries (submit-form uses service role)
REVOKE INSERT ON public.contact_inquiries FROM anon;
-- Keep the INSERT policy for defense-in-depth (harmless with no grant).
DROP POLICY IF EXISTS "Public can submit contact inquiries" ON public.contact_inquiries;

-- 10. Tighten public reads on prayer_requests to exclude private
DROP POLICY IF EXISTS "Public can read approved prayers" ON public.prayer_requests;
CREATE POLICY "Public can read approved prayers" ON public.prayer_requests
    FOR SELECT TO anon, authenticated
    USING ((is_approved = TRUE AND private = FALSE) OR (SELECT public.is_admin()));

-- 11. Rewrite admin policies with `(SELECT public.is_admin())`
DROP POLICY IF EXISTS "Admins can manage sermons" ON public.sermons;
CREATE POLICY "Admins can manage sermons" ON public.sermons
    FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Public can view published sermons" ON public.sermons;
CREATE POLICY "Public can view published sermons" ON public.sermons
    FOR SELECT TO anon, authenticated USING (is_published = TRUE OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage contact inquiries" ON public.contact_inquiries;
CREATE POLICY "Admins can manage contact inquiries" ON public.contact_inquiries
    FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage payments" ON public.mpesa_payments;
CREATE POLICY "Admins can manage payments" ON public.mpesa_payments
    FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage prayer requests" ON public.prayer_requests;
CREATE POLICY "Admins can manage prayer requests" ON public.prayer_requests
    FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT TO authenticated USING (id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- 12. New admin policies for the Phase 2 tables
DROP POLICY IF EXISTS "Admins can manage ministry applications" ON public.ministry_applications;
CREATE POLICY "Admins can manage ministry applications" ON public.ministry_applications
    FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage subscribers" ON public.subscribers;
CREATE POLICY "Admins can manage subscribers" ON public.subscribers
    FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage premium resources" ON public.premium_resources;
CREATE POLICY "Admins can manage premium resources" ON public.premium_resources
    FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can read audit log" ON public.audit_log;
CREATE POLICY "Admins can read audit log" ON public.audit_log
    FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- 13. Table grants for authenticated admins
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ministry_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscribers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.premium_resources TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

-- 14. Realtime: only prayer_requests (prayer wall). Never payments.
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prayer_requests;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

-- 15. Storage bucket for premium resources
INSERT INTO storage.buckets (id, name, public)
VALUES ('premium-resources', 'premium-resources', false)
ON CONFLICT (id) DO NOTHING;

-- 16. Cleanup of stale rate-limit rows (invoked by a scheduled function in Phase 5)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
    DELETE FROM public.rate_limits WHERE window_start < NOW() - INTERVAL '1 day';
$$;
REVOKE ALL ON FUNCTION public.cleanup_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;