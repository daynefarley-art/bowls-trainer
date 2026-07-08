
CREATE TABLE public.training_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_ended_at TIMESTAMPTZ,
  total_duration_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','complete')),
  notes TEXT,
  total_activities INTEGER NOT NULL DEFAULT 0,
  drills_completed INTEGER NOT NULL DEFAULT 0,
  challenges_completed INTEGER NOT NULL DEFAULT 0,
  category_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_sessions TO authenticated;
GRANT ALL ON public.training_sessions TO service_role;

ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sessions" ON public.training_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sessions" ON public.training_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sessions" ON public.training_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own sessions" ON public.training_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_training_sessions_updated_at
  BEFORE UPDATE ON public.training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_training_sessions_user_status ON public.training_sessions(user_id, status);
CREATE INDEX idx_training_sessions_user_started ON public.training_sessions(user_id, session_started_at DESC);

ALTER TABLE public.results ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.training_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.challenge_results ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.training_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_results_session ON public.results(session_id);
CREATE INDEX IF NOT EXISTS idx_challenge_results_session ON public.challenge_results(session_id);
