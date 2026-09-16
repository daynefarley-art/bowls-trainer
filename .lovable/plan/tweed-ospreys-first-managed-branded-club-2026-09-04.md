# Tweed Ospreys — First Managed Branded Club

## Goal
Deliver the first managed club-branding implementation for **Tweed Ospreys**, with automatic squad/coach assignment, member opt-out, and Super Admin-only branding controls. No club-admin self-service, no page builder, no club-specific hard-coding.

## Product decisions
- Club branding is a managed entitlement, not self-service.
- Only platform Super Admins can enable/configure managed branding.
- A club can have a default squad and default coach; new members are auto-added/opt-out-able.
- Coaching/squad relationships stay canonical and reusable for other clubs.

## Schema (additive, backward-compatible)
- `clubs` table: canonical club record.
- `club_memberships` table: user ↔ club relationship with role and status.
- `club_branding` table: managed theme tokens, logo path, entitlement flag.
- `club_defaults` table: auto-squad, default coach, opt-out rules.
- `club_audit_log` table: branding/default changes by Super Admin.
- Extend `invitations` with nullable `club_id` and `club_role`.
- Storage bucket `club-logos` for managed logos.

## RPCs / security
- Super Admin guarded functions for upserting clubs, setting branding, setting defaults, listing audit log.
- Membership creation function that enforces one-account identity and triggers auto-squad/coach rules.
- Opt-out function that removes only the auto-created squad/coach links.
- Revoke public/anon execute on SECURITY DEFINER functions; grant only authenticated/service_role.

## UI
- `ClubProvider` / `useActiveClub` inside authenticated layout only.
- `ClubThemeProvider` applies CSS brand variables when active club has managed branding.
- Header/logo components render club logo/name + subtle "Powered by Bowls Trainer" attribution.
- Club switcher in authenticated UI.
- New Super Admin routes:
  - `/admin/clubs` — list clubs
  - `/admin/clubs/$clubId` — defaults + managed branding (Super Admin only)
- Member-facing club card in Profile with opt-out control.

## Tweed Ospreys configuration
- Create Tweed Ospreys club with managed branding enabled.
- Configure default squad = Tweed Ospreys squad.
- Configure default coach = Adam McKeown (`adam.mckeown@clubtweed.com.au`, `1011ecf2-b568-430d-aca3-5869ab4cefb1`).
- Apply Tweed palette derived from supplied logo once uploaded.

## Verification
- Super Admin can manage Tweed branding/defaults.
- Tweed Club Admin cannot edit theme.
- New member flows: registration → membership → squad → coach.
- Existing user joins Tweed: same account, added membership, squad/coach automation.
- Member opt-out removes squad/coach link but keeps club membership and history.
- Multi-club switching restores correct theme.
- Responsive checks on desktop, tablet, ~390px mobile.
- Regression checks for login, training, BSI, coach views, squad management.

## Cleanup
- Remove temporary test users/memberships after verification.
- Keep Tweed club, branding config, logo, defaults, and Adam coach configuration.
