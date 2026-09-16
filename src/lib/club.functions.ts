import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Club = {
  id: string;
  name: string;
  slug: string;
  short_name: string | null;
  description: string | null;
  website: string | null;
  member_count: number;
  managed_branding_enabled: boolean;
  primary_colour: string | null;
  secondary_colour: string | null;
  accent_colour: string | null;
  surface_colour: string | null;
  logo_url: string | null;
  auto_add_to_squad: boolean;
  default_squad_owner_id: string | null;
  auto_assign_default_coach: boolean;
  default_coach_id: string | null;
  allow_member_squad_opt_out: boolean;
  join_code: string | null;
  join_code_enabled: boolean;
};

export type MyClub = {
  id: string;
  name: string;
  slug: string;
  short_name: string | null;
  role: string;
  status: string;
  managed_branding_enabled: boolean;
  primary_colour: string | null;
  secondary_colour: string | null;
  accent_colour: string | null;
  surface_colour: string | null;
  logo_url: string | null;
};

export type ClubDefaultsInput = {
  clubId: string;
  autoAddToSquad?: boolean;
  defaultSquadOwnerId?: string | null;
  autoAssignDefaultCoach?: boolean;
  defaultCoachId?: string | null;
  allowMemberSquadOptOut?: boolean;
};

export type ClubBrandingInput = {
  clubId: string;
  enabled: boolean;
  logoUrl?: string | null;
  logoStoragePath?: string | null;
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
  surface?: string | null;
};

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const listClubs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.rpc("admin_list_clubs");
    if (error) throw new Error(error.message);
    return (data ?? []) as Club[];
  });

export const upsertClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        slug: z.string().min(1),
        shortName: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("admin_upsert_club", {
      _id: data.id ?? "00000000-0000-0000-0000-000000000000",
      _name: data.name,
      _slug: data.slug,
      _short_name: data.shortName ?? undefined,
      _description: data.description ?? undefined,
      _website: data.website ?? undefined,
    } as any);
    if (error) throw new Error(error.message);
    return rows as string;
  });

export const setClubBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clubId: z.string().uuid(),
        enabled: z.boolean(),
        logoUrl: z.string().nullable().optional(),
        logoStoragePath: z.string().nullable().optional(),
        primary: z.string().nullable().optional(),
        secondary: z.string().nullable().optional(),
        accent: z.string().nullable().optional(),
        surface: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.rpc("admin_set_club_branding", {
      _club_id: data.clubId,
      _enabled: data.enabled,
      _logo_url: data.logoUrl ?? undefined,
      _logo_storage_path: data.logoStoragePath ?? undefined,
      _primary: data.primary ?? undefined,
      _secondary: data.secondary ?? undefined,
      _accent: data.accent ?? undefined,
      _surface: data.surface ?? undefined,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setClubDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clubId: z.string().uuid(),
        autoAddToSquad: z.boolean().optional(),
        defaultSquadOwnerId: z.string().uuid().nullable().optional(),
        autoAssignDefaultCoach: z.boolean().optional(),
        defaultCoachId: z.string().uuid().nullable().optional(),
        allowMemberSquadOptOut: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.rpc("admin_set_club_defaults", {
      _club_id: data.clubId,
      _auto_add_to_squad: data.autoAddToSquad ?? undefined,
      _default_squad_owner_id: data.defaultSquadOwnerId ?? undefined,
      _auto_assign_default_coach: data.autoAssignDefaultCoach ?? undefined,
      _default_coach_id: data.defaultCoachId ?? undefined,
      _allow_member_squad_opt_out: data.allowMemberSquadOptOut ?? undefined,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addClubMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clubId: z.string().uuid(),
        email: z.string().email(),
        clubRole: z.enum(["member", "admin", "coach"]).default("member"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("admin_add_club_member", {
      _club_id: data.clubId,
      _email: data.email,
      _club_role: data.clubRole,
    });
    if (error) throw new Error(error.message);
    return (rows?.[0] ?? null) as { user_id: string; membership_id: string; is_new_account: boolean } | null;
  });

export const optOutClubSquad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clubId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("member_opt_out_club_squad", {
      _club_id: data.clubId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyClubs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("my_clubs");
    if (error) throw new Error(error.message);
    return (data ?? []) as MyClub[];
  });

export const setClubJoinCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clubId: z.string().uuid(),
        code: z.string().nullable().optional(),
        enabled: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.rpc("admin_set_club_join_code", {
      _club_id: data.clubId,
      _code: data.code ?? null,
      _enabled: data.enabled,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
