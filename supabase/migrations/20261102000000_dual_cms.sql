-- Add the editorial CMS without dropping the legacy sermons table or its data.
-- Existing published sermons are copied once and remain available to legacy
-- payment relations while the site transitions to cms_sermons.

CREATE TABLE IF NOT EXISTS public.cms_sermons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'supabase' CHECK (source IN ('supabase', 'contentful')),
    contentful_id TEXT UNIQUE,
    slug TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    publish_at TIMESTAMPTZ,
    unpublish_at TIMESTAMPTZ,
    sort_order INT NOT NULL DEFAULT 0,
    locally_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 250),
    preacher TEXT NOT NULL CHECK (char_length(preacher) BETWEEN 1 AND 160),
    ministry_title TEXT CHECK (ministry_title IS NULL OR char_length(ministry_title) <= 120),
    scripture_reference TEXT CHECK (scripture_reference IS NULL OR char_length(scripture_reference) <= 240),
    series TEXT CHECK (series IS NULL OR char_length(series) <= 160),
    sermon_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT CHECK (description IS NULL OR char_length(description) <= 10000),
    preview_image_url TEXT CHECK (preview_image_url IS NULL OR char_length(preview_image_url) <= 2048),
    pdf_url TEXT CHECK (pdf_url IS NULL OR char_length(pdf_url) <= 2048),
    files JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(files) = 'array'),
    audio_url TEXT CHECK (audio_url IS NULL OR char_length(audio_url) <= 2048),
    video_url TEXT CHECK (video_url IS NULL OR char_length(video_url) <= 2048),
    tags TEXT[] NOT NULL DEFAULT '{}',
    featured BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.cms_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'supabase' CHECK (source IN ('supabase', 'contentful')),
    contentful_id TEXT UNIQUE,
    slug TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    publish_at TIMESTAMPTZ,
    unpublish_at TIMESTAMPTZ,
    sort_order INT NOT NULL DEFAULT 0,
    locally_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 250),
    event_date DATE NOT NULL,
    end_date DATE,
    event_time TEXT CHECK (event_time IS NULL OR char_length(event_time) <= 120),
    location TEXT CHECK (location IS NULL OR char_length(location) <= 240),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 10000),
    flyer_url TEXT CHECK (flyer_url IS NULL OR char_length(flyer_url) <= 2048),
    flyer_alt TEXT CHECK (flyer_alt IS NULL OR char_length(flyer_alt) <= 240),
    registration_url TEXT CHECK (registration_url IS NULL OR char_length(registration_url) <= 2048),
    category TEXT CHECK (category IS NULL OR char_length(category) <= 100),
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.cms_leadership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'supabase' CHECK (source IN ('supabase', 'contentful')),
    contentful_id TEXT UNIQUE,
    slug TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    publish_at TIMESTAMPTZ,
    unpublish_at TIMESTAMPTZ,
    sort_order INT NOT NULL DEFAULT 0,
    locally_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    group_name TEXT NOT NULL CHECK (group_name IN ('lcc', 'women', 'pastoral')),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
    role TEXT CHECK (role IS NULL OR char_length(role) <= 160),
    bio TEXT CHECK (bio IS NULL OR char_length(bio) <= 5000),
    message TEXT CHECK (message IS NULL OR char_length(message) <= 10000),
    photo_url TEXT CHECK (photo_url IS NULL OR char_length(photo_url) <= 2048),
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.cms_gallery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'supabase' CHECK (source IN ('supabase', 'contentful')),
    contentful_id TEXT UNIQUE,
    slug TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    publish_at TIMESTAMPTZ,
    unpublish_at TIMESTAMPTZ,
    sort_order INT NOT NULL DEFAULT 0,
    locally_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    image_url TEXT NOT NULL CHECK (char_length(image_url) <= 2048),
    alt TEXT NOT NULL DEFAULT '' CHECK (char_length(alt) <= 240),
    caption TEXT CHECK (caption IS NULL OR char_length(caption) <= 500)
);

CREATE TABLE IF NOT EXISTS public.cms_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'supabase' CHECK (source IN ('supabase', 'contentful')),
    contentful_id TEXT UNIQUE,
    slug TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    publish_at TIMESTAMPTZ,
    unpublish_at TIMESTAMPTZ,
    sort_order INT NOT NULL DEFAULT 0,
    locally_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    announcement_text TEXT NOT NULL CHECK (char_length(announcement_text) BETWEEN 1 AND 2000),
    link_url TEXT CHECK (link_url IS NULL OR char_length(link_url) <= 2048),
    link_label TEXT CHECK (link_label IS NULL OR char_length(link_label) <= 120),
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'urgent')),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.cms_ministries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'supabase' CHECK (source IN ('supabase', 'contentful')),
    contentful_id TEXT UNIQUE,
    slug TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    publish_at TIMESTAMPTZ,
    unpublish_at TIMESTAMPTZ,
    sort_order INT NOT NULL DEFAULT 0,
    locally_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 5000),
    leader TEXT CHECK (leader IS NULL OR char_length(leader) <= 160),
    meeting_time TEXT CHECK (meeting_time IS NULL OR char_length(meeting_time) <= 240),
    contact TEXT CHECK (contact IS NULL OR char_length(contact) <= 240),
    image_url TEXT CHECK (image_url IS NULL OR char_length(image_url) <= 2048),
    accepting_applications BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.cms_service_times (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'supabase' CHECK (source IN ('supabase', 'contentful')),
    contentful_id TEXT UNIQUE,
    slug TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    publish_at TIMESTAMPTZ,
    unpublish_at TIMESTAMPTZ,
    sort_order INT NOT NULL DEFAULT 0,
    locally_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
    day TEXT NOT NULL CHECK (char_length(day) <= 40),
    start_time TEXT CHECK (start_time IS NULL OR char_length(start_time) <= 40),
    end_time TEXT CHECK (end_time IS NULL OR char_length(end_time) <= 40),
    is_live BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.cms_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'supabase' CHECK (source IN ('supabase', 'contentful')),
    contentful_id TEXT UNIQUE,
    slug TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    publish_at TIMESTAMPTZ,
    unpublish_at TIMESTAMPTZ,
    sort_order INT NOT NULL DEFAULT 0,
    locally_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    setting_key TEXT NOT NULL UNIQUE CHECK (char_length(setting_key) BETWEEN 1 AND 120),
    setting_value JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE TABLE IF NOT EXISTS public.cms_sync_log (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('contentful', 'supabase')),
    content_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    message TEXT NOT NULL DEFAULT '',
    record_count INT NOT NULL DEFAULT 0 CHECK (record_count >= 0),
    created_by UUID REFERENCES auth.users(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cms_sermons_public_date_idx
    ON public.cms_sermons (is_published, sermon_date DESC);
CREATE INDEX IF NOT EXISTS cms_events_public_date_idx
    ON public.cms_events (is_published, event_date);
CREATE INDEX IF NOT EXISTS cms_sermons_slug_idx ON public.cms_sermons (slug);
CREATE INDEX IF NOT EXISTS cms_events_slug_idx ON public.cms_events (slug);
CREATE INDEX IF NOT EXISTS cms_leadership_slug_idx ON public.cms_leadership (slug);
CREATE INDEX IF NOT EXISTS cms_gallery_slug_idx ON public.cms_gallery (slug);
CREATE INDEX IF NOT EXISTS cms_announcements_slug_idx ON public.cms_announcements (slug);
CREATE INDEX IF NOT EXISTS cms_ministries_slug_idx ON public.cms_ministries (slug);
CREATE INDEX IF NOT EXISTS cms_service_times_slug_idx ON public.cms_service_times (slug);
CREATE INDEX IF NOT EXISTS cms_settings_slug_idx ON public.cms_settings (slug);

CREATE OR REPLACE FUNCTION public.set_cms_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_contentful_cms_rows()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.source = 'contentful'
       AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Contentful mirror rows may only be written by the sync service';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.source = 'contentful'
       AND COALESCE(auth.role(), '') <> 'service_role'
       AND (to_jsonb(NEW) - 'locally_hidden' - 'updated_at')
           IS DISTINCT FROM
           (to_jsonb(OLD) - 'locally_hidden' - 'updated_at') THEN
        RAISE EXCEPTION 'Contentful mirror rows are read-only; use locally_hidden to hide a row';
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    table_name TEXT;
    table_names TEXT[] := ARRAY[
        'cms_sermons', 'cms_events', 'cms_leadership', 'cms_gallery',
        'cms_announcements', 'cms_ministries', 'cms_service_times', 'cms_settings'
    ];
BEGIN
    FOREACH table_name IN ARRAY table_names LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', table_name);
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_cms_updated_at()',
            table_name
        );
        EXECUTE format('DROP TRIGGER IF EXISTS guard_contentful_rows ON public.%I', table_name);
        EXECUTE format(
            'CREATE TRIGGER guard_contentful_rows BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_contentful_cms_rows()',
            table_name
        );
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', table_name);
        EXECUTE format('GRANT INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', table_name);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
        EXECUTE format(
            'DROP POLICY IF EXISTS cms_public_read ON public.%I',
            table_name
        );
        EXECUTE format(
            'CREATE POLICY cms_public_read ON public.%I FOR SELECT TO anon, authenticated USING ((is_published AND (source = ''contentful'' OR NOT locally_hidden) AND (publish_at IS NULL OR publish_at <= NOW()) AND (unpublish_at IS NULL OR unpublish_at > NOW())) OR (SELECT public.is_admin()))',
            table_name
        );
        EXECUTE format('DROP POLICY IF EXISTS cms_admin_native_manage ON public.%I', table_name);
        EXECUTE format(
            'CREATE POLICY cms_admin_native_manage ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_admin()) AND source = ''supabase'') WITH CHECK ((SELECT public.is_admin()) AND source = ''supabase'')',
            table_name
        );
        EXECUTE format('DROP POLICY IF EXISTS cms_admin_hide_mirrored ON public.%I', table_name);
        EXECUTE format(
            'CREATE POLICY cms_admin_hide_mirrored ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.is_admin()) AND source = ''contentful'') WITH CHECK ((SELECT public.is_admin()) AND source = ''contentful'')',
            table_name
        );
    END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

ALTER TABLE public.cms_sync_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cms_sync_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cms_sync_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cms_sync_log TO service_role;
CREATE POLICY cms_sync_log_admin_read ON public.cms_sync_log
    FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
GRANT USAGE, SELECT ON SEQUENCE public.cms_sync_log_id_seq TO service_role;

INSERT INTO public.cms_sermons (
    id, source, slug, is_published, created_at, updated_at, title, preacher,
    scripture_reference, series, sermon_date, description, audio_url, video_url,
    pdf_url, files, tags
)
SELECT
    id, 'supabase', lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')),
    is_published, created_at, created_at, title, preacher,
    scripture_reference, series, sermon_date, description,
    CASE WHEN is_premium THEN NULL ELSE audio_url END,
    CASE WHEN is_premium THEN NULL ELSE video_url END,
    CASE WHEN NOT is_premium AND resource_pack_url ~* '\.pdf([?#]|$)' THEN resource_pack_url END,
    CASE
        WHEN NOT is_premium AND resource_pack_url IS NOT NULL
             AND resource_pack_url !~* '\.pdf([?#]|$)'
        THEN jsonb_build_array(jsonb_build_object('url', resource_pack_url, 'name', 'Sermon resources'))
        ELSE '[]'::JSONB
    END,
    tags
FROM public.sermons
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'cms-media',
    'cms-media',
    TRUE,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/mpeg', 'audio/mp4']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS cms_media_public_read ON storage.objects;
CREATE POLICY cms_media_public_read ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'cms-media');
DROP POLICY IF EXISTS cms_media_admin_insert ON storage.objects;
CREATE POLICY cms_media_admin_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'cms-media' AND (SELECT public.is_admin()));
DROP POLICY IF EXISTS cms_media_admin_update ON storage.objects;
CREATE POLICY cms_media_admin_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'cms-media' AND (SELECT public.is_admin()))
    WITH CHECK (bucket_id = 'cms-media' AND (SELECT public.is_admin()));
DROP POLICY IF EXISTS cms_media_admin_delete ON storage.objects;
CREATE POLICY cms_media_admin_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'cms-media' AND (SELECT public.is_admin()));
