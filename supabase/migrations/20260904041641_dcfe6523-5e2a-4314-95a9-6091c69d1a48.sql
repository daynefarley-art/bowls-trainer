-- ============================================================
-- 1. TABLES (create all before any policies reference them)
-- ============================================================

CREATE TABLE public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  short_name text,
  description text,
  website text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, club_id)
);

CREATE TABLE public.club_branding (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  managed_branding_enabled boolean NOT NULL DEFAULT false,
  logo_url text,
  logo_storage_path text,
  primary_colour text,
  secondary_colour text,
  accent_colour text,
  surface_colour text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.club_defaults (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  auto_add_to_squad boolean NOT NULL DEFAULT false,
  default_squad_owner_id uuid REFERENCES auth.users(id),
  auto_assign_default_coach boolean NOT NULL DEFAULT false,
  default_coach_id uuid REFERENCES auth.users(id),
  allow_member_squad_opt_out boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.club_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Extend invitations for club membership
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id),
  ADD COLUMN IF NOT EXISTS club_role text DEFAULT 'member';

-- Track automatic squad/coach provenance
ALTER TABLE public.squad_members
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_club_id uuid REFERENCES public.clubs(id);

ALTER TABLE public.coach_access
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_club_id uuid REFERENCES public.clubs(id);

-- ============================================================
-- 2. GRANTS
-- ============================================================

GRANT SELECT ON public.clubs TO authenticated;
GRANT ALL ON public.clubs TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.club_memberships TO authenticated;
GRANT ALL ON public.club_memberships TO service_role;

GRANT SELECT ON public.club_branding TO authenticated;
GRANT ALL ON public.club_branding TO service_role;

GRANT SELECT ON public.club_defaults TO authenticated;
GRANT ALL ON public.club_defaults TO service_role;

GRANT SELECT ON public.club_audit_log TO authenticated;
GRANT ALL ON public.club_audit_log TO service_role;

-- ============================================================
-- 3. RLS ENABLE
-- ============================================================

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS POLICIES
-- ============================================================

CREATE POLICY "Admins can manage clubs"
  ON public.clubs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view their clubs"
  ON public.clubs
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_memberships m
    WHERE m.club_id = public.clubs.id AND m.user_id = auth.uid() AND m.status = 'active'
  ));

CREATE POLICY "Users can view own memberships"
  ON public.club_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage memberships"
  ON public.club_memberships
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage club branding"
  ON public.club_branding
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view their club branding"
  ON public.club_branding
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_memberships m
    WHERE m.club_id = public.club_branding.club_id AND m.user_id = auth.uid() AND m.status = 'active'
  ));

CREATE POLICY "Admins can manage club defaults"
  ON public.club_defaults
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view their club defaults"
  ON public.club_defaults
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_memberships m
    WHERE m.club_id = public.club_defaults.club_id AND m.user_id = auth.uid() AND m.status = 'active'
  ));

CREATE POLICY "Admins can view club audit log"
  ON public.club_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 5. TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_clubs_updated_at BEFORE UPDATE ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_club_memberships_updated_at BEFORE UPDATE ON public.club_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. FUNCTIONS
-- ============================================================

-- Apply club default squad/coach rules for a member
CREATE OR REPLACE FUNCTION public.apply_club_member_defaults(_club_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.club_defaults%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.club_defaults WHERE club_id = _club_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Auto squad: make user and squad owner mutual squad members
  IF d.auto_add_to_squad AND d.default_squad_owner_id IS NOT NULL AND d.default_squad_owner_id <> _user_id THEN
    INSERT INTO public.squad_members (user_id, member_user_id, source, source_club_id)
      VALUES (_user_id, d.default_squad_owner_id, 'club_auto', _club_id)
      ON CONFLICT (user_id, member_user_id) DO NOTHING;
    INSERT INTO public.squad_members (user_id, member_user_id, source, source_club_id)
      VALUES (d.default_squad_owner_id, _user_id, 'club_auto', _club_id)
      ON CONFLICT (user_id, member_user_id) DO NOTHING;
  END IF;

  -- Auto coach: accepted coach_access from default coach to player
  IF d.auto_assign_default_coach AND d.default_coach_id IS NOT NULL AND d.default_coach_id <> _user_id THEN
    INSERT INTO public.coach_access (player_id, coach_id, status, requested_at, accepted_at, source, source_club_id)
      VALUES (_user_id, d.default_coach_id, 'accepted', now(), now(), 'club_auto', _club_id)
      ON CONFLICT (player_id, coach_id) DO UPDATE SET
        status = 'accepted',
        accepted_at = COALESCE(public.coach_access.accepted_at, now()),
        source = 'club_auto',
        source_club_id = _club_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_club_member_defaults(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_club_member_defaults(uuid, uuid) TO authenticated, service_role;

-- Create or attach a club membership (Super Admin)
CREATE OR REPLACE FUNCTION public.admin_add_club_member(
  _club_id uuid,
  _email text,
  _club_role text DEFAULT 'member'
)
RETURNS TABLE(
  user_id uuid,
  membership_id uuid,
  is_new_account boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- No account yet; create a pending invitation with club linkage
    INSERT INTO public.invitations (email, role, club_id, club_role, invited_by, status)
      VALUES (v_email, 'player', _club_id, _club_role, auth.uid(), 'pending')
      RETURNING used_by INTO v_uid; -- unused placeholder
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, true;
    RETURN;
  END IF;

  INSERT INTO public.club_memberships (user_id, club_id, role, status)
    VALUES (v_uid, _club_id, _club_role, 'active')
    ON CONFLICT (user_id, club_id) DO UPDATE SET
      role = EXCLUDED.role,
      status = 'active',
      updated_at = now()
    RETURNING id INTO v_membership_id;

  PERFORM public.apply_club_member_defaults(_club_id, v_uid);

  RETURN QUERY SELECT v_uid, v_membership_id, false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_add_club_member(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_club_member(uuid, text, text) TO authenticated, service_role;

-- Member opts out of the auto club squad (keeps club membership)
CREATE OR REPLACE FUNCTION public.member_opt_out_club_squad(_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Verify membership exists
  IF NOT EXISTS (
    SELECT 1 FROM public.club_memberships
    WHERE club_id = _club_id AND user_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  -- Remove auto squad links
  DELETE FROM public.squad_members
    WHERE (user_id = v_uid AND member_user_id IN (
      SELECT default_squad_owner_id FROM public.club_defaults WHERE club_id = _club_id AND default_squad_owner_id IS NOT NULL
    )) OR (member_user_id = v_uid AND user_id IN (
      SELECT default_squad_owner_id FROM public.club_defaults WHERE club_id = _club_id AND default_squad_owner_id IS NOT NULL
    ))
    AND source = 'club_auto' AND source_club_id = _club_id;

  -- Remove auto coach links
  DELETE FROM public.coach_access
    WHERE player_id = v_uid
      AND coach_id IN (SELECT default_coach_id FROM public.club_defaults WHERE club_id = _club_id AND default_coach_id IS NOT NULL)
      AND source = 'club_auto'
      AND source_club_id = _club_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.member_opt_out_club_squad(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_opt_out_club_squad(uuid) TO authenticated, service_role;

-- Super Admin: upsert club
CREATE OR REPLACE FUNCTION public.admin_upsert_club(
  _id uuid,
  _name text,
  _slug text,
  _short_name text DEFAULT NULL,
  _description text DEFAULT NULL,
  _website text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF btrim(COALESCE(_name,'')) = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF btrim(COALESCE(_slug,'')) = '' THEN RAISE EXCEPTION 'slug_required'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.clubs (name, slug, short_name, description, website)
      VALUES (_name, lower(regexp_replace(_slug, '[^a-z0-9]+', '-', 'gi')), _short_name, _description, _website)
      RETURNING id INTO v_id;
    INSERT INTO public.club_branding (club_id) VALUES (v_id);
    INSERT INTO public.club_defaults (club_id) VALUES (v_id);
  ELSE
    UPDATE public.clubs SET
      name = _name,
      slug = lower(regexp_replace(_slug, '[^a-z0-9]+', '-', 'gi')),
      short_name = _short_name,
      description = _description,
      website = _website,
      updated_at = now()
    WHERE id = _id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_upsert_club(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_club(uuid, text, text, text, text, text) TO authenticated, service_role;

-- Super Admin: set managed branding
CREATE OR REPLACE FUNCTION public.admin_set_club_branding(
  _club_id uuid,
  _enabled boolean,
  _logo_url text DEFAULT NULL,
  _logo_storage_path text DEFAULT NULL,
  _primary text DEFAULT NULL,
  _secondary text DEFAULT NULL,
  _accent text DEFAULT NULL,
  _surface text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old jsonb;
  new jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT to_jsonb(public.club_branding) INTO old FROM public.club_branding WHERE club_id = _club_id;

  INSERT INTO public.club_branding (
    club_id, managed_branding_enabled, logo_url, logo_storage_path,
    primary_colour, secondary_colour, accent_colour, surface_colour, updated_by
  )
  VALUES (_club_id, _enabled, _logo_url, _logo_storage_path, _primary, _secondary, _accent, _surface, auth.uid())
  ON CONFLICT (club_id) DO UPDATE SET
    managed_branding_enabled = EXCLUDED.managed_branding_enabled,
    logo_url = EXCLUDED.logo_url,
    logo_storage_path = EXCLUDED.logo_storage_path,
    primary_colour = EXCLUDED.primary_colour,
    secondary_colour = EXCLUDED.secondary_colour,
    accent_colour = EXCLUDED.accent_colour,
    surface_colour = EXCLUDED.surface_colour,
    updated_at = now(),
    updated_by = auth.uid();

  SELECT to_jsonb(public.club_branding) INTO new FROM public.club_branding WHERE club_id = _club_id;

  INSERT INTO public.club_audit_log (club_id, changed_by, action, old_value, new_value)
    VALUES (_club_id, auth.uid(), 'branding_updated', old, new);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_club_branding(uuid, boolean, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_club_branding(uuid, boolean, text, text, text, text, text, text) TO authenticated, service_role;

-- Super Admin: set club defaults
CREATE OR REPLACE FUNCTION public.admin_set_club_defaults(
  _club_id uuid,
  _auto_add_to_squad boolean DEFAULT NULL,
  _default_squad_owner_id uuid DEFAULT NULL,
  _auto_assign_default_coach boolean DEFAULT NULL,
  _default_coach_id uuid DEFAULT NULL,
  _allow_member_squad_opt_out boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old jsonb;
  new jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT to_jsonb(public.club_defaults) INTO old FROM public.club_defaults WHERE club_id = _club_id;

  INSERT INTO public.club_defaults (
    club_id, auto_add_to_squad, default_squad_owner_id,
    auto_assign_default_coach, default_coach_id, allow_member_squad_opt_out, updated_by
  )
  VALUES (
    _club_id,
    COALESCE(_auto_add_to_squad, false),
    _default_squad_owner_id,
    COALESCE(_auto_assign_default_coach, false),
    _default_coach_id,
    COALESCE(_allow_member_squad_opt_out, true),
    auth.uid()
  )
  ON CONFLICT (club_id) DO UPDATE SET
    auto_add_to_squad = COALESCE(_auto_add_to_squad, public.club_defaults.auto_add_to_squad),
    default_squad_owner_id = COALESCE(_default_squad_owner_id, public.club_defaults.default_squad_owner_id),
    auto_assign_default_coach = COALESCE(_auto_assign_default_coach, public.club_defaults.auto_assign_default_coach),
    default_coach_id = COALESCE(_default_coach_id, public.club_defaults.default_coach_id),
    allow_member_squad_opt_out = COALESCE(_allow_member_squad_opt_out, public.club_defaults.allow_member_squad_opt_out),
    updated_at = now(),
    updated_by = auth.uid();

  SELECT to_jsonb(public.club_defaults) INTO new FROM public.club_defaults WHERE club_id = _club_id;

  INSERT INTO public.club_audit_log (club_id, changed_by, action, old_value, new_value)
    VALUES (_club_id, auth.uid(), 'defaults_updated', old, new);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_club_defaults(uuid, boolean, uuid, boolean, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_club_defaults(uuid, boolean, uuid, boolean, uuid, boolean) TO authenticated, service_role;

-- List clubs with branding + defaults (Super Admin)
CREATE OR REPLACE FUNCTION public.admin_list_clubs()
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  short_name text,
  description text,
  website text,
  member_count bigint,
  managed_branding_enabled boolean,
  primary_colour text,
  secondary_colour text,
  accent_colour text,
  surface_colour text,
  logo_url text,
  auto_add_to_squad boolean,
  default_squad_owner_id uuid,
  auto_assign_default_coach boolean,
  default_coach_id uuid,
  allow_member_squad_opt_out boolean
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
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
      COALESCE(d.allow_member_squad_opt_out, true)
    FROM public.clubs c
    LEFT JOIN public.club_branding b ON b.club_id = c.id
    LEFT JOIN public.club_defaults d ON d.club_id = c.id
    ORDER BY c.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_clubs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_clubs() TO authenticated, service_role;

-- List my clubs with branding (authenticated member)
CREATE OR REPLACE FUNCTION public.my_clubs()
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  short_name text,
  role text,
  status text,
  managed_branding_enabled boolean,
  primary_colour text,
  secondary_colour text,
  accent_colour text,
  surface_colour text,
  logo_url text
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      c.id, c.name, c.slug, c.short_name, m.role, m.status,
      COALESCE(b.managed_branding_enabled, false),
      b.primary_colour, b.secondary_colour, b.accent_colour, b.surface_colour, b.logo_url
    FROM public.club_memberships m
    JOIN public.clubs c ON c.id = m.club_id
    LEFT JOIN public.club_branding b ON b.club_id = c.id
    WHERE m.user_id = auth.uid()
    ORDER BY c.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.my_clubs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_clubs() TO authenticated, service_role;

-- Update consume_invitation to also attach club membership and defaults
CREATE OR REPLACE FUNCTION public.consume_invitation(_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Attach club membership if invitation is club-scoped
  IF r.club_id IS NOT NULL THEN
    INSERT INTO public.club_memberships (user_id, club_id, role, status)
      VALUES (v_uid, r.club_id, COALESCE(r.club_role, 'member'), 'active')
      ON CONFLICT (user_id, club_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = 'active',
        updated_at = now();
    PERFORM public.apply_club_member_defaults(r.club_id, v_uid);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_invitation(text) TO authenticated, service_role;

-- Storage policies for club-logos (bucket created separately)
CREATE POLICY "Club logos public read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'club-logos');

CREATE POLICY "Super Admins can manage club logos"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'club-logos' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'club-logos' AND public.has_role(auth.uid(), 'admin'));
