CREATE OR REPLACE FUNCTION public.my_squad_stats()
 RETURNS TABLE(squad_size integer, my_rank integer, my_points integer, challenges_led integer, top3_finishes integer, cow_wins integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  WITH board AS (
    SELECT l.user_id, l.total_points, l.cow_wins,
      RANK() OVER (ORDER BY l.total_points DESC) AS rk
    FROM public.squad_championship_leaderboard() l
  ),
  records AS (
    SELECT sr.holder_user_id FROM public.squad_records() sr WHERE sr.holder_user_id IS NOT NULL
  ),
  lb_all AS (
    SELECT c.id AS challenge_id, sl.user_id,
      ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY sl.best_score DESC NULLS LAST) AS r
    FROM public.challenges c
    CROSS JOIN LATERAL public.challenge_squad_leaderboard(c.id) sl
  )
  SELECT
    (SELECT count(*)::int FROM public.squad_members sm WHERE sm.user_id = v_uid),
    COALESCE((SELECT b.rk::int FROM board b WHERE b.user_id = v_uid), 0),
    COALESCE((SELECT b.total_points FROM board b WHERE b.user_id = v_uid), 0),
    (SELECT count(*)::int FROM records rc WHERE rc.holder_user_id = v_uid),
    (SELECT count(*)::int FROM lb_all la WHERE la.user_id = v_uid AND la.r <= 3),
    COALESCE((SELECT b.cow_wins FROM board b WHERE b.user_id = v_uid), 0);
END $function$;