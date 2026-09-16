CREATE OR REPLACE FUNCTION public.squad_championship_leaderboard()
 RETURNS TABLE(user_id uuid, full_name text, club text, badge_points integer, pb_points integer, cow_wins integer, total_points integer, is_self boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT (cs.start_date)::timestamptz, (cs.end_date + 1)::timestamptz INTO v_start, v_end FROM public.current_season() cs;

  RETURN QUERY
  WITH scope AS (
    SELECT v_uid AS uid
    UNION
    SELECT sm.member_user_id FROM public.squad_members sm WHERE sm.user_id = v_uid
  ),
  season_results AS (
    SELECT cr.user_id AS uid, cr.challenge_id AS cid, cr.score::numeric AS score, cr.played_at, c.slug
    FROM public.challenge_results cr
    JOIN public.challenges c ON c.id = cr.challenge_id
    JOIN scope s ON s.uid = cr.user_id
    WHERE cr.played_at >= v_start AND cr.played_at < v_end
  ),
  best_per_challenge AS (
    SELECT sr.uid, sr.cid, sr.slug, MAX(sr.score) AS best
    FROM season_results sr GROUP BY sr.uid, sr.cid, sr.slug
  ),
  badge_pts AS (
    SELECT bpc.uid, SUM(public.badge_points_for(bpc.slug, bpc.best))::int AS pts
    FROM best_per_challenge bpc GROUP BY bpc.uid
  ),
  pb_pts AS (
    SELECT bpc.uid, COUNT(*)::int AS pts FROM best_per_challenge bpc WHERE bpc.best > 0 GROUP BY bpc.uid
  ),
  cow_weeks AS (
    SELECT cow.week_start AS ws, cow.challenge_id AS cid,
      (cow.week_start)::timestamptz AS w_start,
      (cow.week_start + 7)::timestamptz AS w_end
    FROM public.challenge_of_the_week cow
    WHERE cow.week_start >= (SELECT cs.start_date FROM public.current_season() cs)
      AND cow.week_start <= (SELECT cs.end_date FROM public.current_season() cs)
      AND cow.week_start < date_trunc('week', now())::date
  ),
  cow_scores AS (
    SELECT cw.ws, cr.user_id AS uid, MAX(cr.score::numeric) AS best
    FROM cow_weeks cw
    JOIN public.challenge_results cr ON cr.challenge_id = cw.cid
      AND cr.played_at >= cw.w_start AND cr.played_at < cw.w_end
    JOIN scope s ON s.uid = cr.user_id
    GROUP BY cw.ws, cr.user_id
  ),
  cow_winners AS (
    SELECT DISTINCT ON (cs2.ws) cs2.ws, cs2.uid
    FROM cow_scores cs2 ORDER BY cs2.ws, cs2.best DESC
  ),
  cow_pts AS (
    SELECT cwn.uid, COUNT(*)::int * 3 AS pts FROM cow_winners cwn GROUP BY cwn.uid
  ),
  cow_wins_cnt AS (
    SELECT cwn.uid, COUNT(*)::int AS wins FROM cow_winners cwn GROUP BY cwn.uid
  )
  SELECT
    s.uid,
    p.full_name,
    p.club,
    COALESCE(b.pts, 0),
    COALESCE(pb.pts, 0),
    COALESCE(cw.wins, 0),
    COALESCE(b.pts, 0) + COALESCE(pb.pts, 0) + COALESCE(cp.pts, 0),
    (s.uid = v_uid)
  FROM scope s
  LEFT JOIN public.profiles p ON p.id = s.uid
  LEFT JOIN badge_pts b ON b.uid = s.uid
  LEFT JOIN pb_pts pb ON pb.uid = s.uid
  LEFT JOIN cow_pts cp ON cp.uid = s.uid
  LEFT JOIN cow_wins_cnt cw ON cw.uid = s.uid
  ORDER BY 7 DESC, p.full_name NULLS LAST;
END $function$;

CREATE OR REPLACE FUNCTION public.squad_records()
 RETURNS TABLE(challenge_id uuid, challenge_slug text, challenge_name text, holder_user_id uuid, holder_name text, best_score numeric, date_achieved timestamp with time zone, is_self boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  WITH scope AS (
    SELECT sm.member_user_id AS uid FROM public.squad_members sm WHERE sm.user_id = v_uid
    UNION SELECT v_uid
  ),
  best AS (
    SELECT cr.challenge_id AS cid, cr.user_id AS uid, MAX(cr.score) AS score
    FROM public.challenge_results cr
    JOIN scope s ON s.uid = cr.user_id
    GROUP BY cr.challenge_id, cr.user_id
  ),
  top AS (
    SELECT DISTINCT ON (b.cid) b.cid, b.uid, b.score
    FROM best b ORDER BY b.cid, b.score DESC NULLS LAST
  )
  SELECT c.id, c.slug, c.name, t.uid, p.full_name, t.score::numeric,
    (SELECT MAX(cr2.played_at) FROM public.challenge_results cr2
       WHERE cr2.user_id = t.uid AND cr2.challenge_id = c.id AND cr2.score = t.score),
    (t.uid = v_uid)
  FROM public.challenges c
  LEFT JOIN top t ON t.cid = c.id
  LEFT JOIN public.profiles p ON p.id = t.uid
  ORDER BY c.sort_order NULLS LAST, c.name;
END $function$;