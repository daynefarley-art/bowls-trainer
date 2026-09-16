CREATE OR REPLACE FUNCTION public.admin_upsert_club(
  _id uuid,
  _name text,
  _slug text,
  _short_name text = NULL,
  _description text = NULL,
  _website text = NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid := CASE WHEN _id = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL ELSE _id END;
  new_id uuid;
BEGIN
  IF target_id IS NULL THEN
    INSERT INTO public.clubs (name, slug, short_name, description, website)
    VALUES (_name, _slug, _short_name, _description, _website)
    RETURNING id INTO new_id;
    RETURN new_id;
  ELSE
    UPDATE public.clubs
    SET name = _name,
        slug = _slug,
        short_name = _short_name,
        description = _description,
        website = _website,
        updated_at = now()
    WHERE id = target_id;
    RETURN target_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.member_opt_out_club_squad(_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.squad_members
  WHERE user_id = auth.uid()
    AND member_user_id = auth.uid()
    AND provenance = 'club_auto'
    AND EXISTS (
      SELECT 1 FROM public.club_memberships cm
      WHERE cm.club_id = _club_id
        AND cm.user_id = auth.uid()
    );

  UPDATE public.club_memberships
  SET auto_squad_opted_out = true, updated_at = now()
  WHERE club_id = _club_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_club(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_opt_out_club_squad(uuid) TO authenticated;