-- Keep ministry category and joining guidance in the CMS record.
ALTER TABLE public.cms_ministries
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS joining_information TEXT;

DO $$ BEGIN
    ALTER TABLE public.cms_ministries
        ADD CONSTRAINT cms_ministries_category_len
        CHECK (category IS NULL OR char_length(category) <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.cms_ministries
        ADD CONSTRAINT cms_ministries_joining_information_len
        CHECK (joining_information IS NULL OR char_length(joining_information) <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
