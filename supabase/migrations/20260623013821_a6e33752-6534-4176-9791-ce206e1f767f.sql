
-- Invitation status enum
DO $$ BEGIN
  CREATE TYPE public.invitation_status AS ENUM ('pending','used','expired','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Invitations table
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'player',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_code text NOT NULL UNIQUE DEFAULT replace(replace(replace(encode(gen_random_bytes(15),'base64'),'/','_'),'+','-'),'=',''),
  status public.invitation_status NOT NULL DEFAULT 'pending',
  notes text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS invitations_email_lower_idx ON public.invitations (lower(email));
CREATE INDEX IF NOT EXISTS invitations_status_idx ON public.invitations (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage invitations" ON public.invitations;
CREATE POLICY "Admins manage invitations" ON public.invitations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- App settings table (single source for beta flag and any future toggles)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads settings" ON public.app_settings;
CREATE POLICY "Anyone reads settings" ON public.app_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins write settings" ON public.app_settings;
CREATE POLICY "Admins write settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.app_settings (key, value)
  VALUES ('private_beta_mode', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Validate an invitation code (anon-callable so the auth page can check before signup)
CREATE OR REPLACE FUNCTION public.validate_invitation(_code text)
RETURNS TABLE(valid boolean, email text, role public.app_role, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.invitations;
BEGIN
  SELECT * INTO r FROM public.invitations WHERE invite_code = _code;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::public.app_role, 'not_found'::text; RETURN;
  END IF;
  IF r.status = 'revoked' THEN
    RETURN QUERY SELECT false, r.email, r.role, 'revoked'::text; RETURN;
  END IF;
  IF r.status = 'used' THEN
    RETURN QUERY SELECT false, r.email, r.role, 'used'::text; RETURN;
  END IF;
  IF r.expires_at < now() THEN
    RETURN QUERY SELECT false, r.email, r.role, 'expired'::text; RETURN;
  END IF;
  RETURN QUERY SELECT true, r.email, r.role, NULL::text;
END $$;
GRANT EXECUTE ON FUNCTION public.validate_invitation(text) TO anon, authenticated;

-- Consume invitation after the new user has signed up
CREATE OR REPLACE FUNCTION public.consume_invitation(_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.invitations;
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO r FROM public.invitations WHERE invite_code = _code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  IF r.expires_at < now() THEN RAISE EXCEPTION 'invitation_expired'; END IF;
  IF lower(r.email) <> lower(coalesce(v_email,'')) THEN RAISE EXCEPTION 'email_mismatch'; END IF;

  UPDATE public.invitations
    SET status = 'used', used_at = now(), used_by = v_uid
    WHERE id = r.id;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, r.role)
    ON CONFLICT (user_id, role) DO NOTHING;

  IF r.role <> 'player' THEN
    DELETE FROM public.user_roles WHERE user_id = v_uid AND role = 'player';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.consume_invitation(text) TO authenticated;

-- Admin stats helper
CREATE OR REPLACE FUNCTION public.admin_invitation_stats()
RETURNS TABLE(sent bigint, used bigint, pending bigint, expired bigint, revoked bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE status='used')::bigint,
    count(*) FILTER (WHERE status='pending' AND expires_at >= now())::bigint,
    count(*) FILTER (WHERE status='expired' OR (status='pending' AND expires_at < now()))::bigint,
    count(*) FILTER (WHERE status='revoked')::bigint
  FROM public.invitations;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_invitation_stats() TO authenticated;
