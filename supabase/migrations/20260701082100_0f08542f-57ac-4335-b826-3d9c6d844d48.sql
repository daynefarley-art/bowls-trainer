
-- Badge thresholds table
CREATE TABLE public.challenge_badge_thresholds (
  challenge_slug text PRIMARY KEY,
  bronze numeric NOT NULL,
  silver numeric NOT NULL,
  gold numeric NOT NULL,
  platinum numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.challenge_badge_thresholds TO authenticated, anon;
GRANT ALL ON public.challenge_badge_thresholds TO service_role;
ALTER TABLE public.challenge_badge_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read thresholds" ON public.challenge_badge_thresholds FOR SELECT USING (true);

INSERT INTO public.challenge_badge_thresholds (challenge_slug, bronze, silver, gold, platinum) VALUES
  ('keep-it-up', 5, 10, 15, 20),
  ('jack-in-ditch', 10, 15, 20, 25),
  ('drive-then-draw', 20, 30, 40, 50),
  ('traffic-jam', 15, 25, 35, 45),
  ('slimed', 20, 35, 50, 65)
ON CONFLICT (challenge_slug) DO NOTHING;

-- Challenge of the Week
CREATE TABLE public.challenge_of_the_week (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.challenge_of_the_week TO authenticated, anon;
GRANT ALL ON public.challenge_of_the_week TO service_role;
ALTER TABLE public.challenge_of_the_week ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read cow" ON public.challenge_of_the_week FOR SELECT USING (true);

-- Helper: current season (calendar quarter)
CREATE OR REPLACE FUNCTION public.current_season()
RETURNS TABLE(season_year int, quarter int, start_date date, end_date date)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    EXTRACT(YEAR FROM now())::int,
    EXTRACT(QUARTER FROM now())::int,
    date_trunc('quarter', now())::date,
    (date_trunc('quarter', now()) + interval '3 months' - interval '1 day')::date;
$$;
GRANT EXECUTE ON FUNCTION public.current_season() TO authenticated;

-- Pick / get challenge of the week
CREATE OR REPLACE FUNCTION public.pick_challenge_of_the_week()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week date := date_trunc('week', now())::date;
  v_id uuid;
BEGIN
  SELECT challenge_id INTO v_id FROM public.challenge_of_the_week WHERE week_start = v_week;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT id INTO v_id FROM public.challenges ORDER BY random() LIMIT 1;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.challenge_of_the_week (week_start, challenge_id)
    VALUES (v_week, v_id) ON CONFLICT (week_start) DO NOTHING;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.pick_challenge_of_the_week() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_challenge_of_the_week() TO service_role;

CREATE OR REPLACE FUNCTION public.current_challenge_of_the_week()
RETURNS TABLE(challenge_id uuid, challenge_slug text, challenge_name text, week_start date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_week date := date_trunc('week', now())::date;
BEGIN
  RETURN QUERY
    SELECT c.id, c.slug, c.name, cow.week_start
    FROM public.challenge_of_the_week cow
    JOIN public.challenges c ON c.id = cow.challenge_id
    WHERE cow.week_start = v_week
    LIMIT 1;
END $$;
GRANT EXECUTE ON FUNCTION public.current_challenge_of_the_week() TO authenticated;

-- Compute badge tier from score
CREATE OR REPLACE FUNCTION public.badge_points_for(_slug text, _score numeric)
RETURNS int
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN _score >= t.platinum THEN 5
      WHEN _score >= t.gold     THEN 3
      WHEN _score >= t.silver   THEN 2
      WHEN _score >= t.bronze   THEN 1
      ELSE 0
    END
    FROM public.challenge_badge_thresholds t
    WHERE t.challenge_slug = _slug
  ), 0);
$$;
GRANT EXECUTE ON FUNCTION public.badge_points_for(text, numeric) TO authenticated;

-- Championship leaderboard for current season across squad (self + members)
CREATE OR REPLACE FUNCTION public.squad_championship_leaderboard()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  club text,
  badge_points int,
  pb_points int,
  cow_wins int,
  total_points int,
  is_self boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT (start_date)::timestamptz, (end_date + 1)::timestamptz INTO v_start, v_end FROM public.current_season();

  RETURN QUERY
  WITH scope AS (
    SELECT v_uid AS uid
    UNION
    SELECT sm.member_user_id FROM public.squad_members sm WHERE sm.user_id = v_uid
  ),
  season_results AS (
    SELECT cr.user_id, cr.challenge_id, cr.score::numeric AS score, cr.played_at, c.slug
    FROM public.challenge_results cr
    JOIN public.challenges c ON c.id = cr.challenge_id
    JOIN scope s ON s.uid = cr.user_id
    WHERE cr.played_at >= v_start AND cr.played_at < v_end
  ),
  best_per_challenge AS (
    SELECT user_id, challenge_id, slug, MAX(score) AS best
    FROM season_results GROUP BY user_id, challenge_id, slug
  ),
  badge_pts AS (
    SELECT user_id, SUM(public.badge_points_for(slug, best))::int AS pts
    FROM best_per_challenge GROUP BY user_id
  ),
  pb_pts AS (
    SELECT user_id, COUNT(*)::int AS pts FROM best_per_challenge WHERE best > 0 GROUP BY user_id
  ),
  cow_weeks AS (
    SELECT cow.week_start, cow.challenge_id,
      (cow.week_start)::timestamptz AS w_start,
      (cow.week_start + 7)::timestamptz AS w_end
    FROM public.challenge_of_the_week cow
    WHERE cow.week_start >= (SELECT start_date FROM public.current_season())
      AND cow.week_start <= (SELECT end_date FROM public.current_season())
      AND cow.week_start < date_trunc('week', now())::date  -- only completed weeks
  ),
  cow_scores AS (
    SELECT cw.week_start, cr.user_id, MAX(cr.score::numeric) AS best
    FROM cow_weeks cw
    JOIN public.challenge_results cr ON cr.challenge_id = cw.challenge_id
      AND cr.played_at >= cw.w_start AND cr.played_at < cw.w_end
    JOIN scope s ON s.uid = cr.user_id
    GROUP BY cw.week_start, cr.user_id
  ),
  cow_winners AS (
    SELECT DISTINCT ON (week_start) week_start, user_id
    FROM cow_scores ORDER BY week_start, best DESC
  ),
  cow_pts AS (
    SELECT user_id, COUNT(*)::int * 3 AS pts FROM cow_winners GROUP BY user_id
  ),
  cow_wins_cnt AS (
    SELECT user_id, COUNT(*)::int AS wins FROM cow_winners GROUP BY user_id
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
  LEFT JOIN badge_pts b ON b.user_id = s.uid
  LEFT JOIN pb_pts pb ON pb.user_id = s.uid
  LEFT JOIN cow_pts cp ON cp.user_id = s.uid
  LEFT JOIN cow_wins_cnt cw ON cw.user_id = s.uid
  ORDER BY 7 DESC, p.full_name NULLS LAST;
END $$;
GRANT EXECUTE ON FUNCTION public.squad_championship_leaderboard() TO authenticated;

-- Personal squad stats
CREATE OR REPLACE FUNCTION public.my_squad_stats()
RETURNS TABLE(
  squad_size int,
  my_rank int,
  my_points int,
  challenges_led int,
  top3_finishes int,
  cow_wins int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  WITH board AS (
    SELECT user_id, total_points, cow_wins,
      RANK() OVER (ORDER BY total_points DESC) AS rk
    FROM public.squad_championship_leaderboard()
  ),
  records AS (
    SELECT holder_user_id FROM public.squad_records() WHERE holder_user_id IS NOT NULL
  ),
  lb_all AS (
    -- top3 across every challenge in squad
    SELECT c.id AS challenge_id, sl.user_id,
      ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY sl.best_score DESC NULLS LAST) AS r
    FROM public.challenges c
    CROSS JOIN LATERAL public.challenge_squad_leaderboard(c.id) sl
  )
  SELECT
    (SELECT count(*)::int FROM public.squad_members WHERE user_id = v_uid),
    COALESCE((SELECT rk::int FROM board WHERE user_id = v_uid), 0),
    COALESCE((SELECT total_points FROM board WHERE user_id = v_uid), 0),
    (SELECT count(*)::int FROM records WHERE holder_user_id = v_uid),
    (SELECT count(*)::int FROM lb_all WHERE user_id = v_uid AND r <= 3),
    COALESCE((SELECT cow_wins FROM board WHERE user_id = v_uid), 0);
END $$;
GRANT EXECUTE ON FUNCTION public.my_squad_stats() TO authenticated;
