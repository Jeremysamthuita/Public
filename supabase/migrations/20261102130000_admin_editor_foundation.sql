-- Roles, permissions, protected publishing metadata, revisions and retry queue.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS can_moderate_prayers BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_view_inbox BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_view_payments BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'editor', 'member'));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role = 'admin' AND is_active
    );
$$;

CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role IN ('admin', 'editor') AND is_active
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_editor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(), public.is_editor() TO anon, authenticated;

DO $$
DECLARE table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'cms_sermons', 'cms_events', 'cms_leadership', 'cms_gallery',
        'cms_announcements', 'cms_ministries', 'cms_service_times', 'cms_settings'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS sync_state TEXT NOT NULL DEFAULT ''synced''', table_name);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS sync_attempts INT NOT NULL DEFAULT 0', table_name);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS last_error TEXT', table_name);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS content_hash TEXT', table_name);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1', table_name);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id)', table_name);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', table_name);
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', table_name, table_name || '_sync_state_check');
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (sync_state IN (''synced'',''pending_contentful'',''pending_supabase'',''failed''))', table_name, table_name || '_sync_state_check');
        -- Editors and admins write only through authenticated Netlify functions.
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', table_name);
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', table_name);
        EXECUTE format('GRANT SELECT ON public.%I TO anon', table_name);
        EXECUTE format('DROP POLICY IF EXISTS cms_admin_native_manage ON public.%I', table_name);
        EXECUTE format('DROP POLICY IF EXISTS cms_admin_hide_mirrored ON public.%I', table_name);
        EXECUTE format('DROP POLICY IF EXISTS cms_public_read ON public.%I', table_name);
        EXECUTE format('CREATE POLICY cms_public_read ON public.%I FOR SELECT TO anon, authenticated USING ((is_published AND deleted_at IS NULL AND (source = ''contentful'' OR NOT locally_hidden) AND (publish_at IS NULL OR publish_at <= NOW()) AND (unpublish_at IS NULL OR unpublish_at > NOW())) OR (SELECT public.is_editor()))', table_name);
    END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.cms_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type TEXT NOT NULL,
    record_id UUID NOT NULL,
    version INT NOT NULL,
    snapshot JSONB NOT NULL,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (content_type, record_id, version)
);

CREATE TABLE IF NOT EXISTS public.publish_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','failed','resolved')),
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cms_drafts (
    draft_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type TEXT NOT NULL,
    record_id UUID,
    data JSONB NOT NULL DEFAULT '{}'::JSONB,
    base_version INT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cms_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cms_revisions, public.publish_queue, public.idempotency_keys, public.cms_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_revisions, public.publish_queue, public.idempotency_keys, public.cms_drafts TO service_role;
CREATE POLICY cms_revisions_admin_read ON public.cms_revisions FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY publish_queue_admin_read ON public.publish_queue FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS cms_media_admin_insert ON storage.objects;
DROP POLICY IF EXISTS cms_media_admin_update ON storage.objects;
DROP POLICY IF EXISTS cms_media_admin_delete ON storage.objects;
CREATE POLICY cms_media_server_upload_only ON storage.objects FOR ALL TO service_role USING (bucket_id = 'cms-media') WITH CHECK (bucket_id = 'cms-media');

DROP POLICY IF EXISTS "Admins can read audit log" ON public.audit_log;
CREATE POLICY audit_log_admin_read ON public.audit_log FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
GRANT SELECT ON public.audit_log TO authenticated;
GRANT INSERT ON public.audit_log TO service_role;

DROP POLICY IF EXISTS "Admins can manage payments" ON public.mpesa_payments;
CREATE POLICY payments_permission_read ON public.mpesa_payments FOR SELECT TO authenticated USING (
    (SELECT public.is_admin()) OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.is_active AND p.can_view_payments
    )
);
REVOKE INSERT, UPDATE, DELETE ON public.mpesa_payments FROM anon, authenticated;

DROP POLICY IF EXISTS "Admins can manage contact inquiries" ON public.contact_inquiries;
CREATE POLICY inbox_permission_read ON public.contact_inquiries FOR SELECT TO authenticated USING (
    (SELECT public.is_admin()) OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.is_active AND p.can_view_inbox
    )
);
REVOKE INSERT, UPDATE, DELETE ON public.contact_inquiries FROM anon, authenticated;

DROP POLICY IF EXISTS "Admins can manage ministry applications" ON public.ministry_applications;
CREATE POLICY applications_permission_read ON public.ministry_applications FOR SELECT TO authenticated USING (
    (SELECT public.is_admin()) OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.is_active AND p.can_view_inbox
    )
);
REVOKE INSERT, UPDATE, DELETE ON public.ministry_applications FROM anon, authenticated;

DROP POLICY IF EXISTS "Admins can manage prayer requests" ON public.prayer_requests;
CREATE POLICY prayers_permission_manage ON public.prayer_requests FOR ALL TO authenticated USING (
    (SELECT public.is_admin()) OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.is_active AND p.can_moderate_prayers
    )
) WITH CHECK (
    (SELECT public.is_admin()) OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.is_active AND p.can_moderate_prayers
    )
);
REVOKE INSERT, UPDATE, DELETE ON public.prayer_requests FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS publish_queue_ready_idx ON public.publish_queue (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS cms_revisions_record_idx ON public.cms_revisions (content_type, record_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS cms_drafts_owner_record_idx ON public.cms_drafts
    (content_type, COALESCE(record_id, '00000000-0000-0000-0000-000000000000'::UUID), created_by);
