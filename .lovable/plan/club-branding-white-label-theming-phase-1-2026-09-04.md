# Club Branding / White-Label Theming — Phase 1

## What exists today (audit)

- **Users/profiles**: `profiles` (id → auth user, full_name, `club` TEXT, `default_club` TEXT, premium/coach flags, status). Club is a free-text string only — there is **no club entity and no membership relationship**.
- **Roles**: canonical `user_roles` table + `app_role` enum (`admin`, `player`, `coach`) with `has_role()` security-definer helper. These are platform-wide roles, not club-scoped.
- **Invitations**: `invitations` table + `validate_invitation` / `consume_invitation` RPCs, admin tester directory RPCs, admin UI at `/admin/invitations`. Email-normalised, one-account-per-person already enforced.
- **Theme**: single canonical token system in `src/styles.css` (`--primary`, `--accent`, `--gradient-hero`, `--gradient-primary`, etc.) mapped through `@theme inline`. Components already use semantic classes; brand marks come from `BTLogo` / `PageHeader` (fixed PNG assets).
- **Layout boundary**: `src/routes/_authenticated/route.tsx` wraps every signed-in screen; `auth.tsx`, `reset-password.tsx`, `index.tsx` are public.
- **Tournament Centre / public tournament pages do not exist in this project** — nothing to preserve or re-theme there (sections 15/16 are a no-op here; I'll confirm nothing public changes).
- **Storage**: no buckets yet; Cloud storage available for logos.

## What gets built

### 1. Data model (additive, backward compatible)
- `clubs` — name, slug, created_by, timestamps.
- `club_memberships` — (club_id, user_id) unique, `club_role` enum (`club_admin`, `coach`, `member`), `status` (`active`, `invited`, `removed`). Multi-club by design; existing `profiles.club` text is left untouched and used only as a seed hint.
- `club_branding` — one row per club: `branding_enabled`, `logo_url`, `logo_dark_url`, `primary_color`, `accent_color`, `header_color`, `entitlement` flag (`branding_entitled` boolean default true, so a future subscription can flip it without redesign).
- `club_branding_audit` — admin id, club, field changed, old/new value, timestamp (matches existing `admin_action_log` style).
- `invitations` gains `club_id` + `club_role` (nullable, additive). `consume_invitation` extended to also attach a club membership when present — never creates a second account.
- Storage bucket `club-logos`, public read, write restricted to club admins of that club (path prefix `<club_id>/`).
- GRANTs + RLS on every new table: members read their own clubs/branding; only `club_admin` of that club (or platform admin) writes.

### 2. Active club resolution
- `useActiveClub()` hook + `ClubProvider` mounted inside `_authenticated/route.tsx` only.
- Resolution order: persisted choice in localStorage (validated against memberships) → single membership auto-select → none (personal mode, Bowls Trainer default theme).
- Switching writes the new club id, invalidates queries; no logout, no reload.

### 3. Runtime theming
- `ClubThemeProvider` sets `--primary`, `--primary-glow`, `--accent`, `--gradient-hero`, `--gradient-primary` and new `--brand-*` aliases as inline CSS variables on the authenticated layout wrapper only. Public routes never receive them.
- Colours converted hex → OKLCH; **foreground picked automatically** by contrast ratio (WCAG relative luminance, ≥4.5:1), so a yellow primary yields dark text. Extreme lightness is clamped so hover/disabled/selected states stay readable; the admin screen warns when a colour needs clamping.
- Semantic tokens (`destructive`, `success`, `warning`, bowl forehand/backhand, BSI band colours) are explicitly excluded from theming.
- Club logo replaces the BT mark inside `BTLogo`/`PageHeader` when branding is active, with a subtle "Powered by Bowls Trainer" line retained in the header/profile.

### 4. UI surfaces
- **Club switcher**: in Profile, plus a compact switcher chip in `PageHeader` only when the user has ≥2 memberships.
- **Club Settings → Branding** (`/clubs/$clubId/branding`, club admins only): logo upload/replace, primary + accent colour pickers with hex fields, branding on/off, live preview (header, logo, primary button, accent chip, nav highlight, card), Save, Reset to Bowls Trainer defaults, contrast warnings.
- **Club members / invite** (`/clubs/$clubId/members`): invite by name+email+club role reusing the existing invitation pipeline; existing accounts get membership attached directly with a sign-in-only message.
- Ordinary members see the club name/logo but no branding controls (route guard + RLS).

### 5. Verification (live UI, Playwright)
Seed two test clubs with visibly different themes, a single-club user, a multi-club user, a branding-off club, a club admin and an ordinary member. Verify: logged-out default branding, single-club auto-resolve, branding-off fallback, multi-club switching (logo + colours + data context, no logout), invite-existing-user → second membership, admin branding screen save/reset/upload, member has no controls, difficult colours (very light / very dark / yellow) stay readable, desktop / tablet / 390px widths with no overflow, public routes unchanged. Test data removed afterwards.

## Technical notes
- Migrations are additive only; nothing existing is dropped or renamed, satisfying the one-release backward-compatibility rule.
- Club role checks go through a `has_club_role()` security-definer function, mirroring the existing `has_role()` pattern — no role data stored on profiles or memberships-as-text.
- Branding writes go through authenticated server functions with club-admin verification; logo uploads validated for type (png/jpg/webp/svg), size (≤2MB) and dimensions.

## Scope note
This is a large build. I'll deliver it in order: schema → resolution/theme runtime → admin + switcher UI → hard-coded colour migration → live verification, and report against all 18 completion-report points at the end.
