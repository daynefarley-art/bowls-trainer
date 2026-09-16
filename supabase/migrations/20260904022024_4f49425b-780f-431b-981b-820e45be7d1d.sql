ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS platforms text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ios_install_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS android_install_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_tester boolean NOT NULL DEFAULT false;

INSERT INTO public.app_settings (key, value)
VALUES ('testflight_url', '""'::jsonb), ('play_test_url', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Invite (or update) a beta tester. One person = one Bowls Trainer account.
CREATE OR REPLACE FUNCTION public.admin_upsert_tester(
  _email text,
  _full_name text DEFAULT NULL,
  _role public.app_role DEFAULT 'player',
  _platforms text[] DEFAULT '{}'::text[],
  _notes text DEFAULT NULL
)
RETURNS TABLE(
  outcome text,
  invitation_id uuid,
  invite_code text,
  email text,
  platforms text[],
  user_id uuid,
  needs_registration boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(btrim(_email));
  v_uid uuid;
  v_plat text[] := COALESCE(_platforms, '{}'::text[]);
  r public.invitations;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_email = '' THEN RAISE EXCEPTION 'email_required'; END IF;

  SELECT u.id INTO v_uid FROM auth.users u WHERE lower(u.email) = v_email;

  -- Most recent non-revoked invitation for this email (canonical identity = normalised email)
  SELECT * INTO r FROM public.invitations i
   WHERE lower(i.email) = v_email AND i.status <> 'revoked'
   ORDER BY i.created_at DESC LIMIT 1;

  IF FOUND THEN
    UPDATE public.invitations i SET
      full_name = COALESCE(NULLIF(btrim(COALESCE(_full_name,'')),''), i.full_name),
      notes = COALESCE(NULLIF(btrim(COALESCE(_notes,'')),''), i.notes),
      platforms = ARRAY(SELECT DISTINCT unnest(i.platforms || v_plat)),
      is_tester = true,
      status = CASE WHEN v_uid IS NOT NULL THEN 'used'::public.invitation_status
                    WHEN i.status = 'used' THEN 'used'::public.invitation_status
                    ELSE 'pending'::public.invitation_status END,
      used_by = COALESCE(i.used_by, v_uid),
      used_at = CASE WHEN v_uid IS NOT NULL THEN COALESCE(i.used_at, now()) ELSE i.used_at END,
      expires_at = CASE WHEN v_uid IS NULL AND i.expires_at < now() + interval '7 days'
                        THEN now() + interval '30 days' ELSE i.expires_at END
     WHERE i.id = r.id
     RETURNING * INTO r;

    RETURN QUERY SELECT
      CASE WHEN v_uid IS NOT NULL THEN 'existing_account' ELSE 'existing_invitation' END,
      r.id, r.invite_code, r.email, r.platforms, v_uid, (v_uid IS NULL);
    RETURN;
  END IF;

  INSERT INTO public.invitations (email, full_name, role, notes, platforms, is_tester,
                                  invited_by, status, used_by, used_at)
  VALUES (v_email, NULLIF(btrim(COALESCE(_full_name,'')),''), _role,
          NULLIF(btrim(COALESCE(_notes,'')),''), v_plat, true, auth.uid(),
          CASE WHEN v_uid IS NOT NULL THEN 'used'::public.invitation_status ELSE 'pending'::public.invitation_status END,
          v_uid,
          CASE WHEN v_uid IS NOT NULL THEN now() ELSE NULL END)
  RETURNING * INTO r;

  RETURN QUERY SELECT
    CASE WHEN v_uid IS NOT NULL THEN 'existing_account' ELSE 'created' END,
    r.id, r.invite_code, r.email, r.platforms, v_uid, (v_uid IS NULL);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_upsert_tester(text,text,public.app_role,text[],text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_tester_platforms(_invitation_id uuid, _platforms text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.invitations
     SET platforms = ARRAY(SELECT DISTINCT unnest(COALESCE(_platforms,'{}'::text[]))),
         is_tester = true
   WHERE id = _invitation_id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_tester_platforms(uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_mark_install_sent(_invitation_id uuid, _platform text, _sent boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _platform = 'ios' THEN
    UPDATE public.invitations SET ios_install_sent_at = CASE WHEN _sent THEN now() ELSE NULL END WHERE id = _invitation_id;
  ELSIF _platform = 'android' THEN
    UPDATE public.invitations SET android_install_sent_at = CASE WHEN _sent THEN now() ELSE NULL END WHERE id = _invitation_id;
  ELSE
    RAISE EXCEPTION 'unknown_platform';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_mark_install_sent(uuid, text, boolean) TO authenticated;

-- Combined directory: distribution status separate from Bowls Trainer account status
CREATE OR REPLACE FUNCTION public.admin_tester_directory()
RETURNS TABLE(
  invitation_id uuid,
  email text,
  full_name text,
  role public.app_role,
  invite_code text,
  invitation_status public.invitation_status,
  platforms text[],
  ios_install_sent_at timestamptz,
  android_install_sent_at timestamptz,
  is_tester boolean,
  notes text,
  expires_at timestamptz,
  created_at timestamptz,
  user_id uuid,
  account_status text,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT i.id, i.email, i.full_name, i.role, i.invite_code,
         CASE WHEN i.status = 'pending' AND i.expires_at < now()
              THEN 'expired'::public.invitation_status ELSE i.status END,
         i.platforms, i.ios_install_sent_at, i.android_install_sent_at, i.is_tester,
         i.notes, i.expires_at, i.created_at,
         u.id,
         CASE WHEN u.id IS NULL THEN 'not_registered'
              ELSE COALESCE(p.status::text, 'active') END,
         u.last_sign_in_at
    FROM public.invitations i
    LEFT JOIN auth.users u ON lower(u.email) = lower(i.email)
    LEFT JOIN public.profiles p ON p.id = u.id
   ORDER BY i.created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_tester_directory() TO authenticated;