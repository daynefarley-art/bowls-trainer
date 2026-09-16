-- ─────────────────────────────────────────────────────────────────────────
-- Canonical training-program architecture.
-- Additive only: no existing table, column, policy or function is changed.
-- Drills, challenges, results, BSI and practice timing stay canonical and are
-- referenced, never duplicated.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.training_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_type text NOT NULL DEFAULT 'COACH_CUSTOM',
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  start_date date,
  end_date date,
  notes text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_programs_status_chk
    CHECK (status IN ('draft','active','completed','archived'))
);
CREATE INDEX training_programs_owner_idx ON public.training_programs(owner_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_programs TO authenticated;
GRANT ALL ON public.training_programs TO service_role;

CREATE TABLE public.program_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, player_id),
  CONSTRAINT program_assignments_status_chk
    CHECK (status IN ('active','completed','archived'))
);
CREATE INDEX program_assignments_player_idx ON public.program_assignments(player_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_assignments TO authenticated;
GRANT ALL ON public.program_assignments TO service_role;

CREATE TABLE public.program_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  objective text,
  phase text,
  week_number integer,
  scheduled_date date,
  coach_note text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX program_sessions_program_idx ON public.program_sessions(program_id, sequence);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_sessions TO authenticated;
GRANT ALL ON public.program_sessions TO service_role;

CREATE TABLE public.program_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.program_sessions(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 1,
  kind text NOT NULL,
  drill_id uuid REFERENCES public.drills(id) ON DELETE CASCADE,
  challenge_id uuid REFERENCES public.challenges(id) ON DELETE CASCADE,
  required_completions integer NOT NULL DEFAULT 1,
  target_score numeric,
  focus text,
  coach_note text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_activities_kind_chk CHECK (kind IN ('drill','challenge')),
  CONSTRAINT program_activities_ref_chk CHECK (
    (kind = 'drill' AND drill_id IS NOT NULL) OR
    (kind = 'challenge' AND challenge_id IS NOT NULL)
  )
);
CREATE INDEX program_activities_session_idx ON public.program_activities(session_id, sequence);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_activities TO authenticated;
GRANT ALL ON public.program_activities TO service_role;

CREATE TABLE public.program_activity_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.program_activities(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started',
  completions integer NOT NULL DEFAULT 0,
  launched_at timestamptz,
  completed_at timestamptz,
  result_id uuid REFERENCES public.results(id) ON DELETE SET NULL,
  challenge_result_id uuid REFERENCES public.challenge_results(id) ON DELETE SET NULL,
  player_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, player_id),
  CONSTRAINT program_activity_progress_status_chk
    CHECK (status IN ('not_started','in_progress','completed'))
);
CREATE INDEX program_activity_progress_player_idx
  ON public.program_activity_progress(player_id, program_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_activity_progress TO authenticated;
GRANT ALL ON public.program_activity_progress TO service_role;

-- ── helper functions (security definer, avoid policy recursion) ───────────

CREATE OR REPLACE FUNCTION public.program_owner(_program_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_id FROM public.training_programs WHERE id = _program_id
$$;

CREATE OR REPLACE FUNCTION public.is_program_player(_program_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.program_assignments
    WHERE program_id = _program_id AND player_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_program(_program_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.program_owner(_program_id) = _user_id
      OR public.is_program_player(_program_id, _user_id)
      OR public.has_role(_user_id, 'admin')
$$;

REVOKE ALL ON FUNCTION public.program_owner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_program_player(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_view_program(uuid, uuid) FROM anon;

-- ── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or assigned programs" ON public.training_programs
FOR SELECT TO authenticated
USING (owner_id = auth.uid()
       OR public.is_program_player(id, auth.uid())
       OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Create own programs" ON public.training_programs
FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner updates own programs" ON public.training_programs
FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner deletes own programs" ON public.training_programs
FOR DELETE TO authenticated USING (owner_id = auth.uid());

ALTER TABLE public.program_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View relevant assignments" ON public.program_assignments
FOR SELECT TO authenticated
USING (player_id = auth.uid()
       OR public.program_owner(program_id) = auth.uid()
       OR public.has_role(auth.uid(), 'admin'));

-- A program owner may assign it to themselves, or to a player who has
-- accepted them as a coach. Nothing else.
CREATE POLICY "Owner assigns authorised players" ON public.program_assignments
FOR INSERT TO authenticated
WITH CHECK (
  public.program_owner(program_id) = auth.uid()
  AND (player_id = auth.uid() OR public.has_accepted_access(auth.uid(), player_id))
);

CREATE POLICY "Owner or player updates assignment status" ON public.program_assignments
FOR UPDATE TO authenticated
USING (public.program_owner(program_id) = auth.uid() OR player_id = auth.uid())
WITH CHECK (public.program_owner(program_id) = auth.uid() OR player_id = auth.uid());

CREATE POLICY "Owner removes assignment" ON public.program_assignments
FOR DELETE TO authenticated USING (public.program_owner(program_id) = auth.uid());

ALTER TABLE public.program_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View sessions of visible programs" ON public.program_sessions
FOR SELECT TO authenticated USING (public.can_view_program(program_id, auth.uid()));

CREATE POLICY "Owner writes sessions" ON public.program_sessions
FOR INSERT TO authenticated WITH CHECK (public.program_owner(program_id) = auth.uid());

CREATE POLICY "Owner updates sessions" ON public.program_sessions
FOR UPDATE TO authenticated
USING (public.program_owner(program_id) = auth.uid())
WITH CHECK (public.program_owner(program_id) = auth.uid());

CREATE POLICY "Owner deletes sessions" ON public.program_sessions
FOR DELETE TO authenticated USING (public.program_owner(program_id) = auth.uid());

ALTER TABLE public.program_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View activities of visible programs" ON public.program_activities
FOR SELECT TO authenticated USING (public.can_view_program(program_id, auth.uid()));

CREATE POLICY "Owner writes activities" ON public.program_activities
FOR INSERT TO authenticated WITH CHECK (public.program_owner(program_id) = auth.uid());

CREATE POLICY "Owner updates activities" ON public.program_activities
FOR UPDATE TO authenticated
USING (public.program_owner(program_id) = auth.uid())
WITH CHECK (public.program_owner(program_id) = auth.uid());

CREATE POLICY "Owner deletes activities" ON public.program_activities
FOR DELETE TO authenticated USING (public.program_owner(program_id) = auth.uid());

ALTER TABLE public.program_activity_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Player or program owner views progress" ON public.program_activity_progress
FOR SELECT TO authenticated
USING (player_id = auth.uid()
       OR public.program_owner(program_id) = auth.uid()
       OR public.has_role(auth.uid(), 'admin'));

-- Only the player themselves ever writes their own progress.
CREATE POLICY "Player records own progress" ON public.program_activity_progress
FOR INSERT TO authenticated
WITH CHECK (player_id = auth.uid() AND public.is_program_player(program_id, auth.uid()));

CREATE POLICY "Player updates own progress" ON public.program_activity_progress
FOR UPDATE TO authenticated
USING (player_id = auth.uid()) WITH CHECK (player_id = auth.uid());

-- ── updated_at triggers (reuse canonical function) ───────────────────────

CREATE TRIGGER training_programs_updated_at BEFORE UPDATE ON public.training_programs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER program_assignments_updated_at BEFORE UPDATE ON public.program_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER program_sessions_updated_at BEFORE UPDATE ON public.program_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER program_activities_updated_at BEFORE UPDATE ON public.program_activities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER program_activity_progress_updated_at BEFORE UPDATE ON public.program_activity_progress
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();