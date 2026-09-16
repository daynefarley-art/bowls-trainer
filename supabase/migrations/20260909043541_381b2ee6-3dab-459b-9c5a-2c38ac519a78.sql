ALTER TABLE public.practice_activities
  ADD COLUMN IF NOT EXISTS active_seconds_original integer,
  ADD COLUMN IF NOT EXISTS timing_repaired_at timestamptz;