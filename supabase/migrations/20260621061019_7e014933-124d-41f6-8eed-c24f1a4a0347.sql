
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS drill_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drill_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_minutes INT;

CREATE INDEX IF NOT EXISTS results_duration_idx ON public.results (user_id, played_at) WHERE duration_minutes IS NOT NULL;
