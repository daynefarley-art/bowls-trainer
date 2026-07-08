
-- ============ TABLES ============

CREATE TABLE public.squad_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(from_user_id, to_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_invites TO authenticated;
GRANT ALL ON public.squad_invites TO service_role;
ALTER TABLE public.squad_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own invites read" ON public.squad_invites FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE TABLE public.squad_members (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, member_user_id),
  CHECK (user_id <> member_user_id)
);
GRANT SELECT ON public.squad_members TO authenticated;
GRANT ALL ON public.squad_members TO service_role;
ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own squad read" ON public.squad_members FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.squad_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT ON public.squad_blocks TO authenticated;
GRANT ALL ON public.squad_blocks TO service_role;
ALTER TABLE public.squad_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own blocks read" ON public.squad_blocks FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);

CREATE TABLE public.squad_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  related_user_id uuid,
  related_challenge_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.squad_notifications TO authenticated;
GRANT ALL ON public.squad_notifications TO service_role;
ALTER TABLE public.squad_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifs read" ON public.squad_notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "own notifs update" ON public.squad_notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX squad_invites_to_status_idx ON public.squad_invites(to_user_id, status);
CREATE INDEX squad_invites_from_status_idx ON public.squad_invites(from_user_id, status);
CREATE INDEX squad_notifications_user_idx ON public.squad_notifications(user_id, created_at DESC);

-- ============ RPCs ============

-- Search potential squad members by name; excludes self, existing squad, blocks
CREATE OR REPLACE FUNCTION public.search_squad_candidates(_query text)
RETURNS TABLE(user_id uuid, full_name text, club text, invite_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _query IS NULL OR length(trim(_query)) < 2 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.club,
    COALESCE(
      (SELECT si.status FROM public.squad_invites si
        WHERE (si.from_user_id = v_uid AND si.to_user_id = p.id)
           OR (si.from_user_id = p.id AND si.to_user_id = v_uid)
        ORDER BY si.created_at DESC LIMIT 1),
      CASE WHEN EXISTS (SELECT 1 FROM public.squad_members sm WHERE sm.user_id = v_uid AND sm.member_user_id = p.id)
           THEN 'member' ELSE 'none' END
    )
  FROM public.profiles p
  WHERE p.id <> v_uid
    AND COALESCE(p.status,'active') = 'active'
    AND p.full_name ILIKE '%' || trim(_query) || '%'
    AND NOT EXISTS (SELECT 1 FROM public.squad_blocks b
      WHERE (b.blocker_id = v_uid AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = v_uid))
  ORDER BY p.full_name
  LIMIT 20;
END $$;
REVOKE ALL ON FUNCTION public.search_squad_candidates(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_squad_candidates(text) TO authenticated;

-- Send invite
CREATE OR REPLACE FUNCTION public.send_squad_invite(_to_user uuid)
RETURNS public.squad_invites
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.squad_invites; v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_uid = _to_user THEN RAISE EXCEPTION 'cannot_invite_self'; END IF;
  IF EXISTS (SELECT 1 FROM public.squad_blocks
    WHERE (blocker_id = _to_user AND blocked_id = v_uid)
       OR (blocker_id = v_uid AND blocked_id = _to_user)) THEN
    RAISE EXCEPTION 'blocked';
  END IF;
  IF EXISTS (SELECT 1 FROM public.squad_members WHERE user_id = v_uid AND member_user_id = _to_user) THEN
    RAISE EXCEPTION 'already_squad_member';
  END IF;

  INSERT INTO public.squad_invites (from_user_id, to_user_id, status)
  VALUES (v_uid, _to_user, 'pending')
  ON CONFLICT (from_user_id, to_user_id) DO UPDATE
    SET status = 'pending', created_at = now(), responded_at = NULL
  RETURNING * INTO v_row;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.squad_notifications (user_id, type, message, related_user_id)
    VALUES (_to_user, 'invite_received', COALESCE(v_name,'Someone') || ' has invited you to join their Squad.', v_uid);

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.send_squad_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_squad_invite(uuid) TO authenticated;

-- Respond to invite
CREATE OR REPLACE FUNCTION public.respond_squad_invite(_invite_id uuid, _accept boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_inv public.squad_invites; v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_inv FROM public.squad_invites WHERE id = _invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF v_inv.to_user_id <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'invite_not_pending'; END IF;

  UPDATE public.squad_invites SET status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END,
    responded_at = now() WHERE id = _invite_id;

  IF _accept THEN
    INSERT INTO public.squad_members (user_id, member_user_id) VALUES (v_uid, v_inv.from_user_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.squad_members (user_id, member_user_id) VALUES (v_inv.from_user_id, v_uid) ON CONFLICT DO NOTHING;
    SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.squad_notifications (user_id, type, message, related_user_id)
      VALUES (v_inv.from_user_id, 'invite_accepted', COALESCE(v_name,'Someone') || ' accepted your Squad invite.', v_uid);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.respond_squad_invite(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_squad_invite(uuid, boolean) TO authenticated;

-- Cancel outgoing invite
CREATE OR REPLACE FUNCTION public.cancel_squad_invite(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.squad_invites WHERE id = _invite_id AND from_user_id = v_uid AND status = 'pending';
END $$;
REVOKE ALL ON FUNCTION public.cancel_squad_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_squad_invite(uuid) TO authenticated;

-- Remove squad member (both sides)
CREATE OR REPLACE FUNCTION public.remove_squad_member(_member uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.squad_members WHERE (user_id = v_uid AND member_user_id = _member)
    OR (user_id = _member AND member_user_id = v_uid);
  DELETE FROM public.squad_invites WHERE (from_user_id = v_uid AND to_user_id = _member)
    OR (from_user_id = _member AND to_user_id = v_uid);
END $$;
REVOKE ALL ON FUNCTION public.remove_squad_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_squad_member(uuid) TO authenticated;

-- Block user
CREATE OR REPLACE FUNCTION public.block_squad_user(_target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_uid = _target THEN RAISE EXCEPTION 'cannot_block_self'; END IF;
  INSERT INTO public.squad_blocks (blocker_id, blocked_id) VALUES (v_uid, _target) ON CONFLICT DO NOTHING;
  DELETE FROM public.squad_members WHERE (user_id = v_uid AND member_user_id = _target)
    OR (user_id = _target AND member_user_id = v_uid);
  DELETE FROM public.squad_invites WHERE (from_user_id = v_uid AND to_user_id = _target)
    OR (from_user_id = _target AND to_user_id = v_uid);
END $$;
REVOKE ALL ON FUNCTION public.block_squad_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_squad_user(uuid) TO authenticated;

-- Unblock
CREATE OR REPLACE FUNCTION public.unblock_squad_user(_target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.squad_blocks WHERE blocker_id = v_uid AND blocked_id = _target;
END $$;
REVOKE ALL ON FUNCTION public.unblock_squad_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unblock_squad_user(uuid) TO authenticated;

-- List squad members with derived stats
CREATE OR REPLACE FUNCTION public.list_my_squad()
RETURNS TABLE(
  member_user_id uuid,
  full_name text,
  club text,
  current_bsi numeric,
  last_active timestamptz,
  personal_best_count bigint,
  member_since timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  SELECT sm.member_user_id,
    p.full_name,
    p.club,
    (SELECT AVG(r.bsi)::numeric FROM public.results r
      WHERE r.user_id = sm.member_user_id AND r.bsi IS NOT NULL
        AND r.played_at >= now() - interval '30 days') AS current_bsi,
    GREATEST(
      COALESCE((SELECT MAX(played_at) FROM public.results WHERE user_id = sm.member_user_id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(played_at) FROM public.challenge_results WHERE user_id = sm.member_user_id), 'epoch'::timestamptz)
    ) AS last_active,
    (SELECT count(*) FROM (
      SELECT challenge_id, MAX(score) AS best FROM public.challenge_results
        WHERE user_id = sm.member_user_id GROUP BY challenge_id
    ) x)::bigint AS personal_best_count,
    sm.created_at AS member_since
  FROM public.squad_members sm
  LEFT JOIN public.profiles p ON p.id = sm.member_user_id
  WHERE sm.user_id = v_uid
  ORDER BY p.full_name NULLS LAST;
END $$;
REVOKE ALL ON FUNCTION public.list_my_squad() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_squad() TO authenticated;

-- List invites (incoming + outgoing)
CREATE OR REPLACE FUNCTION public.list_squad_invites()
RETURNS TABLE(
  id uuid,
  direction text,
  other_user_id uuid,
  other_name text,
  other_club text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  SELECT si.id,
    CASE WHEN si.to_user_id = v_uid THEN 'incoming' ELSE 'outgoing' END,
    CASE WHEN si.to_user_id = v_uid THEN si.from_user_id ELSE si.to_user_id END,
    p.full_name, p.club, si.status, si.created_at
  FROM public.squad_invites si
  LEFT JOIN public.profiles p ON p.id = CASE WHEN si.to_user_id = v_uid THEN si.from_user_id ELSE si.to_user_id END
  WHERE (si.to_user_id = v_uid OR si.from_user_id = v_uid)
    AND si.status = 'pending'
  ORDER BY si.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.list_squad_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_squad_invites() TO authenticated;

-- Challenge leaderboard scoped to the caller's squad (and self)
CREATE OR REPLACE FUNCTION public.challenge_squad_leaderboard(_challenge_id uuid)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  club text,
  best_score numeric,
  date_achieved timestamptz,
  is_self boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  WITH scope AS (
    SELECT v_uid AS uid
    UNION
    SELECT sm.member_user_id FROM public.squad_members sm WHERE sm.user_id = v_uid
  ),
  bests AS (
    SELECT cr.user_id, MAX(cr.score) AS best
    FROM public.challenge_results cr
    JOIN scope s ON s.uid = cr.user_id
    WHERE cr.challenge_id = _challenge_id
    GROUP BY cr.user_id
  )
  SELECT b.user_id,
    p.full_name,
    p.club,
    b.best::numeric,
    (SELECT MAX(cr2.played_at) FROM public.challenge_results cr2
      WHERE cr2.user_id = b.user_id AND cr2.challenge_id = _challenge_id AND cr2.score = b.best),
    (b.user_id = v_uid)
  FROM bests b
  LEFT JOIN public.profiles p ON p.id = b.user_id
  ORDER BY b.best DESC NULLS LAST, p.full_name;
END $$;
REVOKE ALL ON FUNCTION public.challenge_squad_leaderboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.challenge_squad_leaderboard(uuid) TO authenticated;
