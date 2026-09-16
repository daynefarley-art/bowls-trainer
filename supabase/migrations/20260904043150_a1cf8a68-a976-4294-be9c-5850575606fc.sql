ALTER TABLE public.club_memberships
  ADD COLUMN IF NOT EXISTS auto_squad_opted_out boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.member_opt_out_club_squad(_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_memberships cm
    WHERE cm.club_id = _club_id AND cm.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_defaults d
    WHERE d.club_id = _club_id AND d.allow_member_squad_opt_out
  ) THEN
    RAISE EXCEPTION 'opt_out_not_allowed';
  END IF;

  DELETE FROM public.squad_members sm
  WHERE sm.source = 'club_auto'
    AND sm.source_club_id = _club_id
    AND (sm.user_id = v_uid OR sm.member_user_id = v_uid);

  UPDATE public.club_memberships
  SET auto_squad_opted_out = true, updated_at = now()
  WHERE club_id = _club_id AND user_id = v_uid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_club_member_defaults(_club_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d public.club_defaults%ROWTYPE;
  v_opted_out boolean := false;
BEGIN
  SELECT * INTO d FROM public.club_defaults WHERE club_id = _club_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(cm.auto_squad_opted_out, false) INTO v_opted_out
  FROM public.club_memberships cm
  WHERE cm.club_id = _club_id AND cm.user_id = _user_id;

  IF d.auto_add_to_squad AND NOT v_opted_out
     AND d.default_squad_owner_id IS NOT NULL AND d.default_squad_owner_id <> _user_id THEN
    INSERT INTO public.squad_members (user_id, member_user_id, source, source_club_id)
      VALUES (_user_id, d.default_squad_owner_id, 'club_auto', _club_id)
      ON CONFLICT (user_id, member_user_id) DO NOTHING;
    INSERT INTO public.squad_members (user_id, member_user_id, source, source_club_id)
      VALUES (d.default_squad_owner_id, _user_id, 'club_auto', _club_id)
      ON CONFLICT (user_id, member_user_id) DO NOTHING;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.admin_add_club_member(_club_id uuid, _email text, _club_role text DEFAULT 'member'::text)
RETURNS TABLE(user_id uuid, membership_id uuid, is_new_account boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
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
    INSERT INTO public.club_memberships (user_id, club_id, role, status)
      VALUES (NEW.id, inv.club_id, COALESCE(inv.club_role, 'member'), 'active')
      ON CONFLICT (user_id, club_id) DO NOTHING;
    PERFORM public.apply_club_member_defaults(inv.club_id, NEW.id);
    UPDATE public.invitations SET status = 'used', used_at = now(), used_by = NEW.id WHERE id = inv.id;
  END LOOP;

  RETURN NEW;
END;
$function$;