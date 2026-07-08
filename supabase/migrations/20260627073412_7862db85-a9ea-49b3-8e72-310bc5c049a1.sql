ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS club text,
  ADD COLUMN IF NOT EXISTS green text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_club text,
  ADD COLUMN IF NOT EXISTS default_green text,
  ADD COLUMN IF NOT EXISTS default_green_type text;