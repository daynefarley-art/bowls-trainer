CREATE OR REPLACE FUNCTION public.delete_my_training_session(_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT user_id INTO v_owner FROM public.training_sessions WHERE id = _session_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.results
    WHERE session_id = _session_id AND user_id = v_uid;
  DELETE FROM public.challenge_results
    WHERE session_id = _session_id AND user_id = v_uid;
  DELETE FROM public.training_sessions
    WHERE id = _session_id AND user_id = v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_my_training_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_training_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_training_session(uuid) TO service_role;