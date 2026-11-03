-- Preserve the contact form's subject and preferred follow-up choice.
ALTER TABLE public.contact_inquiries
    ADD COLUMN IF NOT EXISTS subject TEXT,
    ADD COLUMN IF NOT EXISTS follow_up TEXT;

DO $$ BEGIN
    ALTER TABLE public.contact_inquiries
        ADD CONSTRAINT contact_inquiries_subject_len CHECK (subject IS NULL OR char_length(subject) <= 180);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.contact_inquiries
        ADD CONSTRAINT contact_inquiries_follow_up_check CHECK (follow_up IS NULL OR follow_up IN ('Yes', 'No', 'Not specified'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
