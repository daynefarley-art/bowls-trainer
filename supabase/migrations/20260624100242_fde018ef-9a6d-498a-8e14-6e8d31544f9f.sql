
-- 1) Coach notes: require ongoing accepted access for UPDATE and DELETE
DROP POLICY IF EXISTS "Coach updates own note" ON public.coach_notes;
DROP POLICY IF EXISTS "Coach deletes own note" ON public.coach_notes;

CREATE POLICY "Coach updates own note"
  ON public.coach_notes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = coach_id AND public.has_accepted_access(auth.uid(), player_id))
  WITH CHECK (auth.uid() = coach_id AND public.has_accepted_access(auth.uid(), player_id));

CREATE POLICY "Coach deletes own note"
  ON public.coach_notes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = coach_id AND public.has_accepted_access(auth.uid(), player_id));

-- 2) coach_access: stop storing denormalized emails
-- 2a) request_coach_access no longer writes email columns
CREATE OR REPLACE FUNCTION public.request_coach_access(_coach_email text)
RETURNS public.coach_access
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_player_id UUID := auth.uid();
  v_coach_id UUID;
  v_result public.coach_access;
BEGIN
  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT u.id INTO v_coach_id
  FROM auth.users u
  JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'coach'
  WHERE lower(u.email) = lower(_coach_email)
  LIMIT 1;

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'No registered coach was found with that email address.';
  END IF;

  INSERT INTO public.coach_access (player_id, coach_id, status)
  VALUES (v_player_id, v_coach_id, 'pending')
  ON CONFLICT (player_id, coach_id)
  DO UPDATE SET status = 'pending', requested_at = now(), revoked_at = NULL, declined_at = NULL, updated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

-- 2b) Drop the denormalized email columns
ALTER TABLE public.coach_access
  DROP COLUMN IF EXISTS player_email,
  DROP COLUMN IF EXISTS coach_email;

-- 2c) Update coach_list_pending_requests to resolve player email via auth.users
CREATE OR REPLACE FUNCTION public.coach_list_pending_requests()
RETURNS TABLE(id uuid, player_id uuid, player_email text, requested_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('coach', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT ca.id, ca.player_id, u.email::text, ca.requested_at
  FROM public.coach_access ca
  JOIN auth.users u ON u.id = ca.player_id
  WHERE ca.coach_id = auth.uid() AND ca.status = 'pending'
  ORDER BY ca.requested_at DESC;
END;
$function$;

-- 2d) Update coach_list_players to resolve player email via auth.users
CREATE OR REPLACE FUNCTION public.coach_list_players()
RETURNS TABLE(player_id uuid, player_email text, full_name text, club text, accepted_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'coach') AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT ca.player_id, u.email::text, p.full_name, p.club, ca.accepted_at
  FROM public.coach_access ca
  JOIN auth.users u ON u.id = ca.player_id
  LEFT JOIN public.profiles p ON p.id = ca.player_id
  WHERE ca.coach_id = auth.uid() AND ca.status = 'accepted'
  ORDER BY ca.accepted_at DESC NULLS LAST;
END;
$function$;

-- 2e) New helper so a player can see their own coach's email (as they originally typed it)
CREATE OR REPLACE FUNCTION public.my_coach_list()
RETURNS TABLE(id uuid, coach_id uuid, coach_email text, status text, requested_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN QUERY
  SELECT ca.id, ca.coach_id, u.email::text, ca.status, ca.requested_at
  FROM public.coach_access ca
  JOIN auth.users u ON u.id = ca.coach_id
  WHERE ca.player_id = auth.uid()
  ORDER BY ca.requested_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.my_coach_list() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_coach_list() TO authenticated;

-- 3) Restrict anon EXECUTE on SECURITY DEFINER functions that require an authenticated caller
REVOKE EXECUTE ON FUNCTION public.admin_change_user_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_invitation_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_status(uuid, public.user_status, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_user_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_invitation(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.erase_my_history() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_invitation(text) FROM anon;
