-- Fix Beat A Squad Member ghost target lookup.
-- The original PL/pgSQL function exposed output columns named user_id/full_name,
-- which made unqualified table column references ambiguous at runtime.
CREATE OR REPLACE FUNCTION public.ghost_target(_challenge_id uuid, _user_id uuid)
RETURNS TABLE(user_id uuid, full_name text, best_score numeric, is_survival boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Must be self, a squad member, or an admin.
  IF _user_id <> v_uid
     AND NOT EXISTS (
       SELECT 1
       FROM public.squad_members sm
       WHERE sm.user_id = v_uid
         AND sm.member_user_id = _user_id
     )
     AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    _user_id AS user_id,
    p.full_name,
    MAX(cr.score)::numeric AS best_score,
    (c.slug = 'keep-it-up') AS is_survival
  FROM public.challenges c
  LEFT JOIN public.profiles p ON p.id = _user_id
  LEFT JOIN public.challenge_results cr
    ON cr.challenge_id = c.id
   AND cr.user_id = _user_id
  WHERE c.id = _challenge_id
  GROUP BY p.full_name, c.slug;
END;
$$;

REVOKE ALL ON FUNCTION public.ghost_target(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ghost_target(uuid, uuid) TO authenticated;
