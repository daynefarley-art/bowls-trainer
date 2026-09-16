import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PASSWORD_RESET_URL } from "@/lib/canonical-url";

export type UserStatus = "active" | "suspended" | "deleted";
export type UserRole = "admin" | "coach" | "player";

export type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  club: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  status: UserStatus;
  roles: UserRole[];
};

export type AdminUserStats = {
  total: number;
  active: number;
  suspended: number;
  deleted: number;
  coaches: number;
  admins: number;
  new_this_month: number;
  invitations_pending: number;
};

async function requireAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Response("Forbidden", { status: 403 });
}

// Far-future ban used to lock out suspended / deleted accounts via Supabase Auth
const FOREVER_BAN = "876000h"; // ~100 years

async function setAuthBan(userId: string, banned: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? FOREVER_BAN : "none",
  } as any);
  if (error) throw new Error(error.message);
}

export const getAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.rpc("admin_list_users");
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminUser[];
  });

export const getAdminUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("admin_get_user", { _user_id: data.userId });
    if (error) throw new Error(error.message);
    return (rows?.[0] ?? null) as AdminUser | null;
  });

export const getAdminUserStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.rpc("admin_user_stats");
    if (error) throw new Error(error.message);
    return (data?.[0] ?? null) as AdminUserStats | null;
  });

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      status: z.enum(["active", "suspended", "deleted"]),
      reason: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.rpc("admin_set_user_status", {
      _user_id: data.userId,
      _status: data.status,
      _reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    await setAuthBan(data.userId, data.status !== "active");
    return { ok: true };
  });

// Hard-delete a user: removes the auth.users row (cascades to profiles, roles,
// results, etc.) so the email can be used to sign up again.
export const hardDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    if (context.userId === data.userId) {
      throw new Error("You cannot delete your own account.");
    }
    // Block deleting the last admin
    const { data: adminRows, error: adminErr } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (adminErr) throw new Error(adminErr.message);
    const admins = (adminRows ?? []).map((r: any) => r.user_id);
    if (admins.includes(data.userId) && admins.length <= 1) {
      throw new Error("Cannot delete the last admin account.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const changeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["admin", "coach", "player"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.rpc("admin_change_user_role", {
      _user_id: data.userId,
      _role: data.role,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Password reset (Super Admin)
//
// Uses the canonical Supabase Auth recovery flow (POST /auth/v1/recover), the
// exact same mechanism as the user-facing "Forgot password" screen. No password
// is set, exposed or generated here, and no recovery token is returned to the
// admin — Supabase emails the user directly.
// ---------------------------------------------------------------------------


export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), origin: z.string().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (userErr) throw new Error(userErr.message);
    const email = userRes?.user?.email;
    if (!email) throw new Error("This account has no email address, so a reset cannot be sent.");

    const SUPABASE_URL = process.env["SUPABASE_URL"];
    const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("Auth is not configured.");

    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(PASSWORD_RESET_URL)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ email }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        res.status === 429
          ? "Too many reset emails have been sent recently. Please try again shortly."
          : `Could not send the reset email (${res.status}). ${body.slice(0, 200)}`,
      );
    }
    return { ok: true, email };
  });
