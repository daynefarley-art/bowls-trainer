
CREATE OR REPLACE FUNCTION public.squad_recent_activity(_limit int DEFAULT 20)
RETURNS TABLE(
  user_id uuid, full_name text, activity_type text, activity_id uuid,
  title text, score numeric, bsi numeric, played_at timestamptz
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
  drill_rows AS (
    SELECT r.user_id, p.full_name, 'drill'::text AS activity_type, r.id AS activity_id,
      d.name AS title, r.percentage::numeric AS score, r.bsi::numeric AS bsi, r.played_at
    FROM public.results r
    JOIN scope s ON s.uid = r.user_id
    LEFT JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN public.drills d ON d.id = r.drill_id
  ),
  challenge_rows AS (
    SELECT cr.user_id, p.full_name, 'challenge'::text, cr.id,
      c.name, cr.score::numeric, NULL::numeric, cr.played_at
    FROM public.challenge_results cr
    JOIN scope s ON s.uid = cr.user_id
    LEFT JOIN public.profiles p ON p.id = cr.user_id
    LEFT JOIN public.challenges c ON c.id = cr.challenge_id
  )
  SELECT * FROM (SELECT * FROM drill_rows UNION ALL SELECT * FROM challenge_rows) x
  ORDER BY x.played_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 100));
END $$;

CREATE OR REPLACE FUNCTION public.list_squad_notifications(_limit int DEFAULT 30)
RETURNS SETOF public.squad_notifications
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY SELECT * FROM public.squad_notifications
    WHERE user_id = v_uid ORDER BY created_at DESC LIMIT _limit;
END $$;

CREATE OR REPLACE FUNCTION public.unread_squad_notifications_count()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(count(*),0)::int FROM public.squad_notifications
       WHERE user_id = auth.uid() AND read = false $$;

CREATE OR REPLACE FUNCTION public.mark_squad_notifications_read()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.squad_notifications SET read = true
    WHERE user_id = v_uid AND read = false;
END $$;

CREATE OR REPLACE FUNCTION public.head_to_head(_other uuid)
RETURNS TABLE(
  challenge_id uuid, challenge_slug text, challenge_name text,
  my_best numeric, other_best numeric, my_plays bigint, other_plays bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.squad_members
    WHERE user_id = v_uid AND member_user_id = _other) THEN
    RAISE EXCEPTION 'not_in_squad';
  END IF;
  RETURN QUERY
  SELECT c.id, c.slug, c.name,
    (SELECT MAX(score)::numeric FROM public.challenge_results WHERE user_id = v_uid AND challenge_id = c.id),
    (SELECT MAX(score)::numeric FROM public.challenge_results WHERE user_id = _other AND challenge_id = c.id),
    (SELECT count(*) FROM public.challenge_results WHERE user_id = v_uid AND challenge_id = c.id),
    (SELECT count(*) FROM public.challenge_results WHERE user_id = _other AND challenge_id = c.id)
  FROM public.challenges c
  ORDER BY c.sort_order NULLS LAST, c.name;
END $$;

CREATE OR REPLACE FUNCTION public.squad_records()
RETURNS TABLE(
  challenge_id uuid, challenge_slug text, challenge_name text,
  holder_user_id uuid, holder_name text, best_score numeric,
  date_achieved timestamptz, is_self boolean
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
  best AS (
    SELECT cr.challenge_id, cr.user_id, MAX(cr.score) AS score
    FROM public.challenge_results cr
    JOIN scope s ON s.uid = cr.user_id
    GROUP BY cr.challenge_id, cr.user_id
  ),
  top AS (
    SELECT DISTINCT ON (b.challenge_id) b.challenge_id, b.user_id, b.score
    FROM best b ORDER BY b.challenge_id, b.score DESC NULLS LAST
  )
  SELECT c.id, c.slug, c.name, t.user_id, p.full_name, t.score::numeric,
    (SELECT MAX(played_at) FROM public.challenge_results
       WHERE user_id = t.user_id AND challenge_id = c.id AND score = t.score),
    (t.user_id = v_uid)
  FROM public.challenges c
  LEFT JOIN top t ON t.challenge_id = c.id
  LEFT JOIN public.profiles p ON p.id = t.user_id
  ORDER BY c.sort_order NULLS LAST, c.name;
END $$;

REVOKE EXECUTE ON FUNCTION public.squad_recent_activity(int) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.list_squad_notifications(int) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.unread_squad_notifications_count() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.mark_squad_notifications_read() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.head_to_head(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.squad_records() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.squad_recent_activity(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_squad_notifications(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unread_squad_notifications_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_squad_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.head_to_head(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.squad_records() TO authenticated;
