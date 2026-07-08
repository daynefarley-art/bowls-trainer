
-- Ghost target: name + best score for a specific user on a challenge
CREATE OR REPLACE FUNCTION public.ghost_target(_challenge_id uuid, _user_id uuid)
RETURNS TABLE(user_id uuid, full_name text, best_score numeric, is_survival boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  -- Must be self, squad member, or admin
  IF _user_id <> v_uid
     AND NOT EXISTS (SELECT 1 FROM public.squad_members WHERE user_id = v_uid AND member_user_id = _user_id)
     AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
  SELECT _user_id,
    (SELECT full_name FROM public.profiles WHERE id = _user_id),
    (SELECT MAX(score)::numeric FROM public.challenge_results
      WHERE challenge_id = _challenge_id AND user_id = _user_id),
    (SELECT slug = 'keep-it-up' FROM public.challenges WHERE id = _challenge_id);
END $$;
REVOKE ALL ON FUNCTION public.ghost_target(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ghost_target(uuid, uuid) TO authenticated;

-- Caller's current rank on a challenge ladder within their squad
CREATE OR REPLACE FUNCTION public.squad_rank_for(_challenge_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_rank int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  WITH scope AS (
    SELECT v_uid AS uid UNION
    SELECT sm.member_user_id FROM public.squad_members sm WHERE sm.user_id = v_uid
  ),
  bests AS (
    SELECT cr.user_id, MAX(cr.score) AS best
    FROM public.challenge_results cr JOIN scope s ON s.uid = cr.user_id
    WHERE cr.challenge_id = _challenge_id GROUP BY cr.user_id
  ),
  ranked AS (
    SELECT user_id, RANK() OVER (ORDER BY best DESC NULLS LAST) AS rk FROM bests
  )
  SELECT rk INTO v_rank FROM ranked WHERE user_id = v_uid;
  RETURN COALESCE(v_rank, 0);
END $$;
REVOKE ALL ON FUNCTION public.squad_rank_for(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.squad_rank_for(uuid) TO authenticated;

-- Head-to-head aggregate summary
CREATE OR REPLACE FUNCTION public.head_to_head_summary(_other uuid)
RETURNS TABLE(
  my_bsi numeric, other_bsi numeric,
  my_pb_count int, other_pb_count int,
  my_wins int, other_wins int,
  my_champ_position int, other_champ_position int,
  my_favourite text, other_favourite text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.squad_members WHERE user_id = v_uid AND member_user_id = _other) THEN
    RAISE EXCEPTION 'not_in_squad';
  END IF;
  RETURN QUERY
  WITH bests AS (
    SELECT user_id, challenge_id, MAX(score) AS best
    FROM public.challenge_results WHERE user_id IN (v_uid, _other)
    GROUP BY user_id, challenge_id
  ),
  wins AS (
    SELECT
      COUNT(*) FILTER (WHERE me.best > opp.best)::int AS my_wins,
      COUNT(*) FILTER (WHERE opp.best > me.best)::int AS other_wins
    FROM bests me
    JOIN bests opp ON opp.challenge_id = me.challenge_id AND opp.user_id = _other
    WHERE me.user_id = v_uid
  ),
  fav AS (
    SELECT user_id, challenge_id, cnt,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY cnt DESC) AS r
    FROM (
      SELECT user_id, challenge_id, COUNT(*) AS cnt
      FROM public.challenge_results WHERE user_id IN (v_uid, _other)
      GROUP BY user_id, challenge_id
    ) x
  ),
  champ AS (
    SELECT user_id, RANK() OVER (ORDER BY total_points DESC) AS rk
    FROM public.squad_championship_leaderboard()
  )
  SELECT
    (SELECT AVG(bsi)::numeric FROM public.results WHERE user_id = v_uid AND bsi IS NOT NULL AND played_at >= now() - interval '30 days'),
    (SELECT AVG(bsi)::numeric FROM public.results WHERE user_id = _other AND bsi IS NOT NULL AND played_at >= now() - interval '30 days'),
    (SELECT COUNT(*)::int FROM bests WHERE user_id = v_uid AND best > 0),
    (SELECT COUNT(*)::int FROM bests WHERE user_id = _other AND best > 0),
    (SELECT my_wins FROM wins),
    (SELECT other_wins FROM wins),
    COALESCE((SELECT rk::int FROM champ WHERE user_id = v_uid), 0),
    COALESCE((SELECT rk::int FROM champ WHERE user_id = _other), 0),
    (SELECT c.name FROM fav f JOIN public.challenges c ON c.id = f.challenge_id WHERE f.user_id = v_uid AND f.r = 1),
    (SELECT c.name FROM fav f JOIN public.challenges c ON c.id = f.challenge_id WHERE f.user_id = _other AND f.r = 1);
END $$;
REVOKE ALL ON FUNCTION public.head_to_head_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.head_to_head_summary(uuid) TO authenticated;

-- Squad-wide "extra" records (BSI, Platinum count, PB count, Most Improved)
CREATE OR REPLACE FUNCTION public.squad_extra_records()
RETURNS TABLE(
  category text, holder_user_id uuid, holder_name text, value numeric, meta text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  WITH scope AS (
    SELECT v_uid AS uid UNION
    SELECT sm.member_user_id FROM public.squad_members sm WHERE sm.user_id = v_uid
  ),
  bsi_top AS (
    SELECT r.user_id, MAX(r.bsi)::numeric AS v
    FROM public.results r JOIN scope s ON s.uid = r.user_id
    WHERE r.bsi IS NOT NULL GROUP BY r.user_id
    ORDER BY v DESC NULLS LAST LIMIT 1
  ),
  best_per AS (
    SELECT cr.user_id, cr.challenge_id, c.slug, MAX(cr.score)::numeric AS best
    FROM public.challenge_results cr
    JOIN scope s ON s.uid = cr.user_id
    JOIN public.challenges c ON c.id = cr.challenge_id
    GROUP BY cr.user_id, cr.challenge_id, c.slug
  ),
  plat AS (
    SELECT user_id, COUNT(*)::int AS cnt
    FROM best_per bp
    WHERE public.badge_points_for(bp.slug, bp.best) = 5
    GROUP BY user_id ORDER BY cnt DESC LIMIT 1
  ),
  pbs AS (
    SELECT user_id, COUNT(*)::int AS cnt FROM best_per WHERE best > 0
    GROUP BY user_id ORDER BY cnt DESC LIMIT 1
  ),
  improved AS (
    SELECT r.user_id,
      (AVG(r.bsi) FILTER (WHERE r.played_at >= now() - interval '30 days')
       - AVG(r.bsi) FILTER (WHERE r.played_at < now() - interval '30 days' AND r.played_at >= now() - interval '90 days'))::numeric AS v
    FROM public.results r JOIN scope s ON s.uid = r.user_id
    WHERE r.bsi IS NOT NULL GROUP BY r.user_id
    ORDER BY v DESC NULLS LAST LIMIT 1
  )
  SELECT 'highest_bsi'::text, b.user_id, p.full_name, b.v, NULL::text
  FROM bsi_top b LEFT JOIN public.profiles p ON p.id = b.user_id
  UNION ALL
  SELECT 'most_platinum', pl.user_id, p.full_name, pl.cnt::numeric, 'badges'
  FROM plat pl LEFT JOIN public.profiles p ON p.id = pl.user_id
  UNION ALL
  SELECT 'most_pbs', pb.user_id, p.full_name, pb.cnt::numeric, 'PBs'
  FROM pbs pb LEFT JOIN public.profiles p ON p.id = pb.user_id
  UNION ALL
  SELECT 'most_improved', im.user_id, p.full_name, im.v, 'BSI Δ 30d'
  FROM improved im LEFT JOIN public.profiles p ON p.id = im.user_id;
END $$;
REVOKE ALL ON FUNCTION public.squad_extra_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.squad_extra_records() TO authenticated;

-- Meaningful activity events (synthesized from data + notifications)
CREATE OR REPLACE FUNCTION public.squad_meaningful_activity(_limit int DEFAULT 20)
RETURNS TABLE(
  event_type text, user_id uuid, full_name text,
  challenge_id uuid, challenge_name text, score numeric, occurred_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  WITH scope AS (
    SELECT sm.member_user_id AS uid FROM public.squad_members sm WHERE sm.user_id = v_uid
    UNION SELECT v_uid
  ),
  pbs AS (
    SELECT DISTINCT ON (cr.user_id, cr.challenge_id)
      cr.user_id, cr.challenge_id, cr.score::numeric, cr.played_at, c.name AS challenge_name, c.slug
    FROM public.challenge_results cr
    JOIN scope s ON s.uid = cr.user_id
    JOIN public.challenges c ON c.id = cr.challenge_id
    ORDER BY cr.user_id, cr.challenge_id, cr.score DESC, cr.played_at DESC
  ),
  events AS (
    -- New Personal Bests (last 30 days)
    SELECT 'personal_best'::text AS event_type,
      p.user_id, pr.full_name, p.challenge_id, p.challenge_name, p.score, p.played_at AS occurred_at
    FROM pbs p LEFT JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.played_at >= now() - interval '30 days'
    UNION ALL
    -- Platinum earned
    SELECT 'platinum_earned', p.user_id, pr.full_name, p.challenge_id, p.challenge_name, p.score, p.played_at
    FROM pbs p LEFT JOIN public.profiles pr ON pr.id = p.user_id
    WHERE public.badge_points_for(p.slug, p.score) = 5
      AND p.played_at >= now() - interval '60 days'
  )
  SELECT * FROM events ORDER BY occurred_at DESC LIMIT GREATEST(1, LEAST(_limit, 100));
END $$;
REVOKE ALL ON FUNCTION public.squad_meaningful_activity(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.squad_meaningful_activity(int) TO authenticated;
