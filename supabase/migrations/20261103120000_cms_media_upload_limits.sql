-- Align the CMS media bucket with cms-upload's enforced per-file limits.
-- Sermon PDFs can be up to 15 MB and audio recordings up to 60 MB.
UPDATE storage.buckets
SET file_size_limit = 62914560,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf', 'audio/mpeg', 'audio/mp4'
    ]
WHERE id = 'cms-media';

-- Existing sermon PDF/audio columns store the public Storage URL. Keep the
-- upload URLs in these established fields so Contentful and the website use
-- the same media reference.
ALTER TABLE public.cms_sermons
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_image_url TEXT;
