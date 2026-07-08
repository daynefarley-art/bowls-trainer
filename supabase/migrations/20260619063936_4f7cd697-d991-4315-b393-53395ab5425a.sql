
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  club text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, p.full_name, p.club, p.created_at, u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY p.created_at DESC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_user(_user_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  club text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, p.full_name, p.club, p.created_at, u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = _user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user(uuid) TO authenticated;
