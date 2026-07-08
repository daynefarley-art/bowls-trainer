
-- 1. user_status enum
DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('active','suspended','deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. status on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status public.user_status NOT NULL DEFAULT 'active';

-- 3. admin action log
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  affected_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_action_log TO authenticated;
GRANT ALL ON public.admin_action_log TO service_role;
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view logs" ON public.admin_action_log;
CREATE POLICY "Admins view logs" ON public.admin_action_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins insert logs" ON public.admin_action_log;
CREATE POLICY "Admins insert logs" ON public.admin_action_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') AND admin_id = auth.uid());

-- 4. Prevent removing the last admin role
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.role = 'admin' AND (SELECT count(*) FROM public.user_roles WHERE role='admin') <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last admin account';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_prevent_last_admin ON public.user_roles;
CREATE TRIGGER trg_prevent_last_admin
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

-- 5. Extend admin_list_users to include status + roles array
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  id uuid, email text, full_name text, club text,
  created_at timestamptz, last_sign_in_at timestamptz,
  status public.user_status, roles app_role[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public, private AS $$
BEGIN
  IF NOT private.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT
    u.id, u.email::text, p.full_name, p.club,
    p.created_at, u.last_sign_in_at,
    COALESCE(p.status,'active'::public.user_status),
    COALESCE((SELECT array_agg(ur.role) FROM public.user_roles ur WHERE ur.user_id=u.id),
             ARRAY[]::app_role[])
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY p.created_at DESC NULLS LAST;
END $$;

DROP FUNCTION IF EXISTS public.admin_get_user(uuid);
CREATE OR REPLACE FUNCTION public.admin_get_user(_user_id uuid)
RETURNS TABLE(
  id uuid, email text, full_name text, club text,
  created_at timestamptz, last_sign_in_at timestamptz,
  status public.user_status, roles app_role[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public, private AS $$
BEGIN
  IF NOT private.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT
    u.id, u.email::text, p.full_name, p.club,
    p.created_at, u.last_sign_in_at,
    COALESCE(p.status,'active'::public.user_status),
    COALESCE((SELECT array_agg(ur.role) FROM public.user_roles ur WHERE ur.user_id=u.id),
             ARRAY[]::app_role[])
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = _user_id;
END $$;

-- 6. Set user status + log
CREATE OR REPLACE FUNCTION public.admin_set_user_status(_user_id uuid, _status public.user_status, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  -- Block suspending/deleting the last admin
  IF _status <> 'active' AND public.has_role(_user_id,'admin')
     AND (SELECT count(*) FROM public.user_roles WHERE role='admin') <= 1 THEN
    RAISE EXCEPTION 'Cannot suspend or delete the last admin account';
  END IF;
  INSERT INTO public.profiles (id) VALUES (_user_id) ON CONFLICT (id) DO NOTHING;
  UPDATE public.profiles SET status=_status, updated_at=now() WHERE id=_user_id;
  INSERT INTO public.admin_action_log (admin_id, affected_user_id, action, details)
    VALUES (auth.uid(), _user_id, 'set_status', jsonb_build_object('status', _status::text, 'reason', _reason));
END $$;

-- 7. Change role (single role per user model) + log + last-admin protection
CREATE OR REPLACE FUNCTION public.admin_change_user_role(_user_id uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_roles app_role[];
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT array_agg(role) INTO current_roles FROM public.user_roles WHERE user_id=_user_id;
  -- Removing last admin?
  IF 'admin' = ANY(COALESCE(current_roles, ARRAY[]::app_role[])) AND _role <> 'admin'
     AND (SELECT count(*) FROM public.user_roles WHERE role='admin') <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last admin account';
  END IF;
  DELETE FROM public.user_roles WHERE user_id=_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);
  INSERT INTO public.admin_action_log (admin_id, affected_user_id, action, details)
    VALUES (auth.uid(), _user_id, 'change_role', jsonb_build_object('from', current_roles, 'to', _role::text));
END $$;

-- 8. Wrap existing set/remove role helpers with audit logging
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id,_role) ON CONFLICT (user_id,role) DO NOTHING;
  INSERT INTO public.admin_action_log (admin_id, affected_user_id, action, details)
    VALUES (auth.uid(), _user_id, 'grant_role', jsonb_build_object('role', _role::text));
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_user_role(_user_id uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.user_roles WHERE user_id=_user_id AND role=_role;
  INSERT INTO public.admin_action_log (admin_id, affected_user_id, action, details)
    VALUES (auth.uid(), _user_id, 'revoke_role', jsonb_build_object('role', _role::text));
END $$;

-- 9. Aggregate stats for the management dashboard
CREATE OR REPLACE FUNCTION public.admin_user_stats()
RETURNS TABLE(
  total bigint, active bigint, suspended bigint, deleted bigint,
  coaches bigint, admins bigint, new_this_month bigint, invitations_pending bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.profiles)::bigint,
    (SELECT count(*) FROM public.profiles WHERE status='active')::bigint,
    (SELECT count(*) FROM public.profiles WHERE status='suspended')::bigint,
    (SELECT count(*) FROM public.profiles WHERE status='deleted')::bigint,
    (SELECT count(DISTINCT user_id) FROM public.user_roles WHERE role='coach')::bigint,
    (SELECT count(DISTINCT user_id) FROM public.user_roles WHERE role='admin')::bigint,
    (SELECT count(*) FROM public.profiles WHERE created_at >= date_trunc('month', now()))::bigint,
    (SELECT count(*) FROM public.invitations WHERE status='pending' AND expires_at >= now())::bigint;
END $$;
