
-- 1. Extend app_role enum with 'coach'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coach';

-- 2. Add subscription/placeholder flags to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_premium_player BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_coach_plan_active BOOLEAN NOT NULL DEFAULT false;

-- 3. coach_access
CREATE TABLE IF NOT EXISTS public.coach_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_email TEXT NOT NULL,
  coach_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, coach_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_access TO authenticated;
GRANT ALL ON public.coach_access TO service_role;
ALTER TABLE public.coach_access ENABLE ROW LEVEL SECURITY;

-- Player can see their own records
CREATE POLICY "Player views own access" ON public.coach_access
  FOR SELECT TO authenticated
  USING (auth.uid() = player_id);

-- Coach can see records where they are the coach
CREATE POLICY "Coach views own access" ON public.coach_access
  FOR SELECT TO authenticated
  USING (auth.uid() = coach_id);

-- Admin can see all
CREATE POLICY "Admin views all access" ON public.coach_access
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Player creates request for themselves
CREATE POLICY "Player creates own request" ON public.coach_access
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player_id);

-- Player updates own (e.g. revoke)
CREATE POLICY "Player updates own access" ON public.coach_access
  FOR UPDATE TO authenticated
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

-- Coach updates own (accept/decline)
CREATE POLICY "Coach updates own access" ON public.coach_access
  FOR UPDATE TO authenticated
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

-- Admin can update/delete
CREATE POLICY "Admin manages access" ON public.coach_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Player can delete own
CREATE POLICY "Player deletes own access" ON public.coach_access
  FOR DELETE TO authenticated
  USING (auth.uid() = player_id);

CREATE TRIGGER update_coach_access_updated_at
  BEFORE UPDATE ON public.coach_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. coach_notes
CREATE TABLE IF NOT EXISTS public.coach_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_notes TO authenticated;
GRANT ALL ON public.coach_notes TO service_role;
ALTER TABLE public.coach_notes ENABLE ROW LEVEL SECURITY;

-- Helper: is there an accepted access between coach and player?
CREATE OR REPLACE FUNCTION public.has_accepted_access(_coach UUID, _player UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_access
    WHERE coach_id = _coach AND player_id = _player AND status = 'accepted'
  )
$$;

-- Coach reads own notes for accepted players
CREATE POLICY "Coach reads own notes" ON public.coach_notes
  FOR SELECT TO authenticated
  USING (auth.uid() = coach_id AND public.has_accepted_access(coach_id, player_id));

-- Player reads shared notes addressed to them
CREATE POLICY "Player reads shared notes" ON public.coach_notes
  FOR SELECT TO authenticated
  USING (auth.uid() = player_id AND visibility = 'shared');

-- Admin reads all
CREATE POLICY "Admin reads notes" ON public.coach_notes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Coach creates note for accepted player
CREATE POLICY "Coach creates note" ON public.coach_notes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = coach_id AND public.has_accepted_access(coach_id, player_id));

-- Coach updates/deletes own note
CREATE POLICY "Coach updates own note" ON public.coach_notes
  FOR UPDATE TO authenticated
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coach deletes own note" ON public.coach_notes
  FOR DELETE TO authenticated
  USING (auth.uid() = coach_id);

CREATE TRIGGER update_coach_notes_updated_at
  BEFORE UPDATE ON public.coach_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RPC: find_coach_by_email — lets players resolve a coach without browsing
CREATE OR REPLACE FUNCTION public.find_coach_by_email(_email TEXT)
RETURNS TABLE(coach_id UUID, coach_email TEXT, full_name TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email::text, p.full_name
  FROM auth.users u
  JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'coach'
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) = lower(_email)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_coach_by_email(TEXT) TO authenticated;

-- 6. RPC: request_coach_access (player-side) — bundles lookup + insert
CREATE OR REPLACE FUNCTION public.request_coach_access(_coach_email TEXT)
RETURNS public.coach_access
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID := auth.uid();
  v_player_email TEXT;
  v_coach_id UUID;
  v_result public.coach_access;
BEGIN
  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_player_email FROM auth.users WHERE id = v_player_id;

  SELECT u.id INTO v_coach_id
  FROM auth.users u
  JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'coach'
  WHERE lower(u.email) = lower(_coach_email)
  LIMIT 1;

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'No registered coach was found with that email address.';
  END IF;

  INSERT INTO public.coach_access (player_id, coach_id, player_email, coach_email, status)
  VALUES (v_player_id, v_coach_id, v_player_email, lower(_coach_email), 'pending')
  ON CONFLICT (player_id, coach_id)
  DO UPDATE SET status = 'pending', requested_at = now(), revoked_at = NULL, declined_at = NULL, updated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_coach_access(TEXT) TO authenticated;

-- 7. RPC: coach_list_players — returns minimal player profile for accepted players
CREATE OR REPLACE FUNCTION public.coach_list_players()
RETURNS TABLE(player_id UUID, player_email TEXT, full_name TEXT, club TEXT, accepted_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'coach') AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT ca.player_id, ca.player_email, p.full_name, p.club, ca.accepted_at
  FROM public.coach_access ca
  LEFT JOIN public.profiles p ON p.id = ca.player_id
  WHERE ca.coach_id = auth.uid() AND ca.status = 'accepted'
  ORDER BY ca.accepted_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.coach_list_players() TO authenticated;

-- 8. RPC: coach_get_player_results — RLS-safe fetch
CREATE OR REPLACE FUNCTION public.coach_get_player_results(_player_id UUID)
RETURNS SETOF public.results
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_accepted_access(auth.uid(), _player_id) AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.results WHERE user_id = _player_id ORDER BY played_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.coach_get_player_results(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.coach_get_player_challenge_results(_player_id UUID)
RETURNS SETOF public.challenge_results
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_accepted_access(auth.uid(), _player_id) AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.challenge_results WHERE user_id = _player_id ORDER BY played_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.coach_get_player_challenge_results(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.coach_get_player_sessions(_player_id UUID)
RETURNS SETOF public.training_sessions
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_accepted_access(auth.uid(), _player_id) AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.training_sessions WHERE user_id = _player_id ORDER BY started_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.coach_get_player_sessions(UUID) TO authenticated;

-- 9. Admin RPC: set_user_role
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id UUID, _role public.app_role)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_remove_user_role(_user_id UUID, _role public.app_role)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_remove_user_role(UUID, public.app_role) TO authenticated;
