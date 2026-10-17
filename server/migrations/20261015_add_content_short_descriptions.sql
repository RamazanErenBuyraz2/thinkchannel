BEGIN;

ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS short_description text;

GRANT UPDATE (short_description) ON public.contents TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
