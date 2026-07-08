CREATE OR REPLACE FUNCTION public.coach_list_pending_requests()
RETURNS TABLE (
  id uuid,
  player_id uuid,
  player_email text,
  requested_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('coach', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT ca.id, ca.player_id, ca.player_email, ca.requested_at
  FROM public.coach_access ca
  WHERE ca.coach_id = auth.uid()
    AND ca.status = 'pending'
  ORDER BY ca.requested_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_list_pending_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coach_list_pending_requests() FROM anon;
GRANT EXECUTE ON FUNCTION public.coach_list_pending_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.coach_list_pending_requests() TO service_role;

CREATE OR REPLACE FUNCTION public.coach_respond_access_request(_request_id uuid, _accept boolean)
RETURNS public.coach_access
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result public.coach_access;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('coach', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.coach_access
  SET
    status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END,
    accepted_at = CASE WHEN _accept THEN now() ELSE accepted_at END,
    declined_at = CASE WHEN NOT _accept THEN now() ELSE declined_at END,
    revoked_at = NULL,
    updated_at = now()
  WHERE id = _request_id
    AND coach_id = auth.uid()
    AND status = 'pending'
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_respond_access_request(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coach_respond_access_request(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.coach_respond_access_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coach_respond_access_request(uuid, boolean) TO service_role;