CREATE OR REPLACE FUNCTION public.delete_my_result(_result_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT user_id INTO v_owner FROM public.results WHERE id = _result_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'result_not_found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  DELETE FROM public.results WHERE id = _result_id AND user_id = v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_challenge_result(_result_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT user_id INTO v_owner FROM public.challenge_results WHERE id = _result_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'result_not_found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  DELETE FROM public.challenge_results WHERE id = _result_id AND user_id = v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_my_result(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_my_challenge_result(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_result(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_challenge_result(uuid) TO authenticated, service_role;