-- 1. Join code columns
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS join_code text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS join_code_enabled boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS clubs_join_code_uidx ON public.clubs (upper(join_code)) WHERE join_code IS NOT NULL;

-- 2. Canonical membership activation
CREATE OR REPLACE FUNCTION public.activate_club_membership(_club_id uuid, _user_id uuid, _club_role text DEFAULT 'member')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF _club_id IS NULL OR _user_id IS NULL THEN RAISE EXCEPTION 'invalid_args'; END IF;
  INSERT INTO public.club_memberships (user_id, club_id, role, status)
  VALUES (_user_id, _club_id, COALESCE(NULLIF(btrim(_club_role), ''), 'member'), 'active')
  ON CONFLICT (user_id, club_id) DO UPDATE SET
    role = CASE WHEN public.club_memberships.role IN ('admin','coach') THEN public.club_memberships.role ELSE EXCLUDED.role END,
    status = 'active',
    updated_at = now()
  RETURNING id INTO v_id;

  PERFORM public.apply_club_member_defaults(_club_id, _user_id);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_club_membership(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_club_membership(uuid, uuid, text) TO service_role;

-- 3. Code validation (safe for pre-auth signup screen)
CREATE OR REPLACE FUNCTION public.validate_club_code(_code text)
RETURNS TABLE(valid boolean, club_id uuid, club_name text, reason text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE c public.clubs%ROWTYPE; v_code text := upper(btrim(COALESCE(_code, '')));
BEGIN
  IF v_code = '' THEN RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'empty'; RETURN; END IF;
  SELECT * INTO c FROM public.clubs WHERE upper(join_code) = v_code;
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'not_found'; RETURN; END IF;
  IF NOT c.join_code_enabled THEN RETURN QUERY SELECT false, NULL::uuid, c.name, 'disabled'; RETURN; END IF;
  RETURN QUERY SELECT true, c.id, c.name, NULL::text;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_club_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_club_code(text) TO anon, authenticated, service_role;

-- 4. Join with code (member role only)
CREATE OR REPLACE FUNCTION public.join_club_with_code(_code text)
RETURNS TABLE(club_id uuid, club_name text, already_member boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); c public.clubs%ROWTYPE; v_existing boolean; v_code text := upper(btrim(COALESCE(_code,'')));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO c FROM public.clubs WHERE upper(join_code) = v_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF NOT c.join_code_enabled THEN RAISE EXCEPTION 'code_disabled'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.club_memberships m WHERE m.club_id = c.id AND m.user_id = v_uid AND m.status = 'active')
    INTO v_existing;

  PERFORM public.activate_club_membership(c.id, v_uid, 'member');
  RETURN QUERY SELECT c.id, c.name, v_existing;
END;
$$;
REVOKE ALL ON FUNCTION public.join_club_with_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_club_with_code(text) TO authenticated, service_role;

-- 5. Club admin helpers
CREATE OR REPLACE FUNCTION public.is_club_admin(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_memberships
    WHERE user_id = _user_id AND club_id = _club_id AND role = 'admin' AND status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.is_club_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_club_admin(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.club_admin_my_clubs()
RETURNS TABLE(id uuid, name text, slug text, short_name text, join_code text, join_code_enabled boolean, member_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
    SELECT c.id, c.name, c.slug, c.short_name, c.join_code, c.join_code_enabled,
      (SELECT count(*) FROM public.club_memberships m2 WHERE m2.club_id = c.id AND m2.status = 'active')
    FROM public.clubs c
    JOIN public.club_memberships m ON m.club_id = c.id AND m.user_id = v_uid
    WHERE (m.role = 'admin' AND m.status = 'active') OR public.has_role(v_uid, 'admin')
    ORDER BY c.name;
END;
$$;
REVOKE ALL ON FUNCTION public.club_admin_my_clubs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_admin_my_clubs() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.club_admin_list_members(_club_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text, role text, status text, joined_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_club_admin(v_uid, _club_id) AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
    SELECT m.user_id, p.full_name, u.email::text, m.role, m.status, m.joined_at
    FROM public.club_memberships m
    LEFT JOIN public.profiles p ON p.id = m.user_id
    LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.club_id = _club_id
    ORDER BY p.full_name NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.club_admin_list_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_admin_list_members(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.club_admin_invite_member(_club_id uuid, _email text)
RETURNS TABLE(user_id uuid, is_new_account boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_email text := lower(btrim(_email)); v_target uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_club_admin(v_uid, _club_id) AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_email = '' THEN RAISE EXCEPTION 'email_required'; END IF;

  SELECT u.id INTO v_target FROM auth.users u WHERE lower(u.email) = v_email;

  IF v_target IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE lower(i.email) = v_email AND i.status = 'pending' AND i.club_id = _club_id
    ) THEN
      INSERT INTO public.invitations (email, role, club_id, club_role, invited_by, status)
      VALUES (v_email, 'player', _club_id, 'member', v_uid, 'pending');
    END IF;
    RETURN QUERY SELECT NULL::uuid, true;
    RETURN;
  END IF;

  PERFORM public.activate_club_membership(_club_id, v_target, 'member');
  RETURN QUERY SELECT v_target, false;
END;
$$;
REVOKE ALL ON FUNCTION public.club_admin_invite_member(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_admin_invite_member(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.club_admin_remove_member(_club_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_club_admin(v_uid, _club_id) AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  DELETE FROM public.squad_members sm
    WHERE sm.source = 'club_auto' AND sm.source_club_id = _club_id
      AND (sm.user_id = _user_id OR sm.member_user_id = _user_id);
  DELETE FROM public.club_memberships WHERE club_id = _club_id AND user_id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.club_admin_remove_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_admin_remove_member(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.club_admin_list_invitations(_club_id uuid)
RETURNS TABLE(id uuid, email text, status invitation_status, created_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_club_admin(v_uid, _club_id) AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
    SELECT i.id, i.email, i.status, i.created_at, i.expires_at
    FROM public.invitations i
    WHERE i.club_id = _club_id
    ORDER BY i.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.club_admin_list_invitations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_admin_list_invitations(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.club_admin_cancel_invitation(_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_club uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT club_id INTO v_club FROM public.invitations WHERE id = _invitation_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF NOT public.is_club_admin(v_uid, v_club) AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  UPDATE public.invitations SET status = 'revoked' WHERE id = _invitation_id AND status = 'pending';
END;
$$;
REVOKE ALL ON FUNCTION public.club_admin_cancel_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_admin_cancel_invitation(uuid) TO authenticated, service_role;

-- 6. Super admin join-code management
CREATE OR REPLACE FUNCTION public.admin_set_club_join_code(_club_id uuid, _code text, _enabled boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_code text := NULLIF(upper(btrim(COALESCE(_code,''))), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_code IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.clubs WHERE upper(join_code) = v_code AND id <> _club_id
  ) THEN RAISE EXCEPTION 'code_taken'; END IF;
  UPDATE public.clubs SET join_code = v_code, join_code_enabled = COALESCE(_enabled, true), updated_at = now()
   WHERE id = _club_id;
  INSERT INTO public.club_audit_log (club_id, changed_by, action, new_value)
    VALUES (_club_id, auth.uid(), 'join_code_updated', jsonb_build_object('code', v_code, 'enabled', _enabled));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_club_join_code(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_club_join_code(uuid, text, boolean) TO authenticated, service_role;

-- 7. admin_list_clubs now exposes join code
DROP FUNCTION IF EXISTS public.admin_list_clubs();
CREATE OR REPLACE FUNCTION public.admin_list_clubs()
RETURNS TABLE(id uuid, name text, slug text, short_name text, description text, website text, member_count bigint, managed_branding_enabled boolean, primary_colour text, secondary_colour text, accent_colour text, surface_colour text, logo_url text, auto_add_to_squad boolean, default_squad_owner_id uuid, auto_assign_default_coach boolean, default_coach_id uuid, allow_member_squad_opt_out boolean, join_code text, join_code_enabled boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
    SELECT
      c.id, c.name, c.slug, c.short_name, c.description, c.website,
      (SELECT count(*) FROM public.club_memberships m WHERE m.club_id = c.id AND m.status = 'active'),
      COALESCE(b.managed_branding_enabled, false),
      b.primary_colour, b.secondary_colour, b.accent_colour, b.surface_colour, b.logo_url,
      COALESCE(d.auto_add_to_squad, false),
      d.default_squad_owner_id,
      COALESCE(d.auto_assign_default_coach, false),
      d.default_coach_id,
      COALESCE(d.allow_member_squad_opt_out, true),
      c.join_code, c.join_code_enabled
    FROM public.clubs c
    LEFT JOIN public.club_branding b ON b.club_id = c.id
    LEFT JOIN public.club_defaults d ON d.club_id = c.id
    ORDER BY c.name;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_clubs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_clubs() TO authenticated, service_role;

-- 8. Route existing super-admin add-member through the canonical pipeline
CREATE OR REPLACE FUNCTION public.admin_add_club_member(_club_id uuid, _email text, _club_role text DEFAULT 'member')
RETURNS TABLE(user_id uuid, membership_id uuid, is_new_account boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(btrim(_email));
  v_uid uuid;
  v_membership_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_email = '' THEN RAISE EXCEPTION 'email_required'; END IF;

  SELECT u.id INTO v_uid FROM auth.users u WHERE lower(u.email) = v_email;

  IF v_uid IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE lower(i.email) = v_email AND i.status = 'pending' AND i.club_id = _club_id
    ) THEN
      INSERT INTO public.invitations (email, role, club_id, club_role, invited_by, status)
      VALUES (v_email, 'player', _club_id, _club_role, auth.uid(), 'pending');
    END IF;
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, true;
    RETURN;
  END IF;

  v_membership_id := public.activate_club_membership(_club_id, v_uid, _club_role);
  RETURN QUERY SELECT v_uid, v_membership_id, false;
END;
$$;

-- 9. New sign-ups resolve pending club invitations through the canonical pipeline
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE inv RECORD;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'player')
  ON CONFLICT (user_id, role) DO NOTHING;

  FOR inv IN
    SELECT i.id, i.club_id, i.club_role
    FROM public.invitations i
    WHERE lower(i.email) = lower(COALESCE(NEW.email, ''))
      AND i.status = 'pending'
      AND i.club_id IS NOT NULL
  LOOP
    PERFORM public.activate_club_membership(inv.club_id, NEW.id, COALESCE(inv.club_role, 'member'));
    UPDATE public.invitations SET status = 'used', used_at = now(), used_by = NEW.id WHERE id = inv.id;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 10. Tweed Ospreys join code
UPDATE public.clubs SET join_code = 'TWEED1', join_code_enabled = true
 WHERE id = '11111111-1111-1111-1111-111111111111'::uuid AND join_code IS NULL;
