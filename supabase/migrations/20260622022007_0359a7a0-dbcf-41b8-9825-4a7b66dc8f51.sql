ALTER TABLE public.training_sessions DROP CONSTRAINT IF EXISTS training_sessions_status_check;
ALTER TABLE public.training_sessions ADD CONSTRAINT training_sessions_status_check CHECK (status IN ('active','paused','complete'));
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE public.training_sessions ADD COLUMN IF NOT EXISTS total_paused_seconds INTEGER NOT NULL DEFAULT 0;