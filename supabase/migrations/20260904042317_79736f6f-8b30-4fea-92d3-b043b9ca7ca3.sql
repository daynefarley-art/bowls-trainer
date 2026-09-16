-- Seed Tweed Ospreys managed club (idempotent)
INSERT INTO public.clubs (id, name, slug, short_name, description, website)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Tweed Ospreys',
  'tweed-ospreys',
  'Tweed Ospreys',
  'Tweed Ospreys Lawn Bowls Club — managed branded club in Bowls Trainer.',
  'https://clubtweed.com.au'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  short_name = EXCLUDED.short_name,
  description = EXCLUDED.description,
  website = EXCLUDED.website,
  updated_at = now();

INSERT INTO public.club_branding (club_id, managed_branding_enabled, primary_colour, secondary_colour, accent_colour, surface_colour, logo_url, logo_storage_path)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  true,
  '#0055A4',
  '#00AEEF',
  '#FFD700',
  '#FFFFFF',
  null,
  null
)
ON CONFLICT (club_id) DO UPDATE SET
  managed_branding_enabled = EXCLUDED.managed_branding_enabled,
  primary_colour = EXCLUDED.primary_colour,
  secondary_colour = EXCLUDED.secondary_colour,
  accent_colour = EXCLUDED.accent_colour,
  surface_colour = EXCLUDED.surface_colour;

INSERT INTO public.club_defaults (club_id, auto_add_to_squad, default_squad_owner_id, auto_assign_default_coach, default_coach_id, allow_member_squad_opt_out)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  true,
  '1011ecf2-b568-430d-aca3-5869ab4cefb1',
  true,
  '1011ecf2-b568-430d-aca3-5869ab4cefb1',
  true
)
ON CONFLICT (club_id) DO UPDATE SET
  auto_add_to_squad = EXCLUDED.auto_add_to_squad,
  default_squad_owner_id = EXCLUDED.default_squad_owner_id,
  auto_assign_default_coach = EXCLUDED.auto_assign_default_coach,
  default_coach_id = EXCLUDED.default_coach_id,
  allow_member_squad_opt_out = EXCLUDED.allow_member_squad_opt_out;

-- Add canonical coach Adam McKeown as founding member (idempotent)
INSERT INTO public.club_memberships (club_id, user_id, role, status)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '1011ecf2-b568-430d-aca3-5869ab4cefb1',
  'coach',
  'active'
)
ON CONFLICT (club_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  updated_at = now();