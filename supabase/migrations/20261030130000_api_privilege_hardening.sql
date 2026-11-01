-- Limit public access to the data paths intended for anonymous visitors.
-- Transactional and private form data is written only through service-role functions.

REVOKE ALL ON TABLE public.mpesa_payments FROM anon;
REVOKE ALL ON TABLE public.contact_inquiries FROM anon;
REVOKE ALL ON TABLE public.ministry_applications FROM anon;
REVOKE ALL ON TABLE public.subscribers FROM anon;
REVOKE ALL ON TABLE public.premium_resources FROM anon;
REVOKE ALL ON TABLE public.access_grants FROM anon;
REVOKE ALL ON TABLE public.audit_log FROM anon;

REVOKE ALL ON TABLE public.prayer_requests FROM anon;
GRANT SELECT ON TABLE public.prayer_requests TO anon;
GRANT INSERT (display_name, category, request_text)
    ON TABLE public.prayer_requests TO anon;

DROP POLICY IF EXISTS "Public can submit prayers" ON public.prayer_requests;
CREATE POLICY "Public can submit unapproved public prayers" ON public.prayer_requests
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        is_approved = FALSE
        AND prayed_count = 0
        AND private = FALSE
    );

DROP POLICY IF EXISTS "Public can read approved prayers" ON public.prayer_requests;
CREATE POLICY "Public can read approved prayers" ON public.prayer_requests
    FOR SELECT TO anon, authenticated
    USING (
        (is_approved = TRUE AND private = FALSE)
        OR (SELECT public.is_admin())
    );
