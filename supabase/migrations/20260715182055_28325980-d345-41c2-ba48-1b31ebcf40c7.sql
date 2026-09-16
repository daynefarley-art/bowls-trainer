
-- Status enum for a practice activity
DO $$ BEGIN
  CREATE TYPE public.practice_activity_status AS ENUM ('active','paused','completed','discarded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.practice_activity_kind AS ENUM ('drill','challenge');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. CREATE TABLE
CREATE TABLE IF NOT EXISTS public.practice_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.practice_activity_kind NOT NULL,
  drill_id uuid REFERENCES public.drills(id) ON DELETE SET NULL,
  challenge_id uuid REFERENCES public.challenges(id) ON DELETE SET NULL,
  slug text,
  title text,
  status public.practice_activity_status NOT NULL DEFAULT 'active',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  bowls_delivered integer NOT NULL DEFAULT 0,
  active_seconds integer NOT NULL DEFAULT 0,
  active_since timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  discarded_at timestamptz,
  discard_kept_stats boolean,
  result_id uuid REFERENCES public.results(id) ON DELETE SET NULL,
  challenge_result_id uuid REFERENCES public.challenge_results(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_activities_user_status_idx
  ON public.practice_activities (user_id, status, last_active_at DESC);

CREATE INDEX IF NOT EXISTS practice_activities_user_last_active_idx
  ON public.practice_activities (user_id, last_active_at DESC);

-- 2. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_activities TO authenticated;
GRANT ALL ON public.practice_activities TO service_role;

-- 3. RLS
ALTER TABLE public.practice_activities ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES
DROP POLICY IF EXISTS "own_select" ON public.practice_activities;
CREATE POLICY "own_select" ON public.practice_activities
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_insert" ON public.practice_activities;
CREATE POLICY "own_insert" ON public.practice_activities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_update" ON public.practice_activities;
CREATE POLICY "own_update" ON public.practice_activities
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_delete" ON public.practice_activities;
CREATE POLICY "own_delete" ON public.practice_activities
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS practice_activities_updated_at ON public.practice_activities;
CREATE TRIGGER practice_activities_updated_at
  BEFORE UPDATE ON public.practice_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- allow_pause flag on challenges (default true)
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS allow_pause boolean NOT NULL DEFAULT true;
