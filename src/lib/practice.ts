import { supabase } from "@/integrations/supabase/client";

// Practice activity: a single drill or challenge attempt that can be
// paused, saved for later and resumed. Used as the container for all
// automatic practice-time tracking and bowls-delivered accounting.

export type PracticeStatus = "active" | "paused" | "completed" | "discarded";
export type PracticeKind = "drill" | "challenge";

export type PracticeActivity = {
  id: string;
  user_id: string;
  kind: PracticeKind;
  drill_id: string | null;
  challenge_id: string | null;
  slug: string | null;
  title: string | null;
  status: PracticeStatus;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
  bowls_delivered: number;
  active_seconds: number;
  active_since: string | null;
  started_at: string;
  last_active_at: string;
  completed_at: string | null;
  discarded_at: string | null;
  discard_kept_stats: boolean | null;
  result_id: string | null;
  challenge_result_id: string | null;
  created_at: string;
  updated_at: string;
};

const sb = supabase as any;

// Cap any single active segment to prevent runaway accrual if visibility
// events are missed (phone left open overnight, etc.).
const MAX_ACTIVE_SEGMENT_SECONDS = 90 * 60;

/**
 * Backgrounding the app (screen lock, phone in pocket, glancing at a message)
 * is NOT the same as stopping practice. A bowler routinely walks the rink,
 * inspects the head and retrieves bowls without touching the phone, and the
 * screen locks while they do it. We therefore keep the timer RUNNING across
 * short/medium background gaps and only trim the excess beyond this grace
 * window, which is the point where "still practising" becomes "left the drill
 * open".
 */
export const BACKGROUND_GRACE_SECONDS = 10 * 60;

/**
 * If the app was killed/suspended without any lifecycle event, we can only
 * fall back to last_active_at. That timestamp moves on autosaves, so it can
 * legitimately be several minutes old during real practice — hence a wider
 * grace before we trim.
 */
export const ABANDON_GRACE_SECONDS = 20 * 60;


export const ACTIVE_PRACTICE_QK = (userId: string) => ["practice_activities", "live", userId];
export const SAVED_PRACTICES_QK = (userId: string) => ["practice_activities", "saved", userId];

function nowIso() {
  return new Date().toISOString();
}

function segmentSeconds(activeSince: string | null): number {
  if (!activeSince) return 0;
  const s = Math.floor((Date.now() - new Date(activeSince).getTime()) / 1000);
  return Math.max(0, Math.min(s, MAX_ACTIVE_SEGMENT_SECONDS));
}

/** Sum of accumulated + current live segment (clamped). */
export function totalActiveSeconds(a: Pick<PracticeActivity, "active_seconds" | "active_since" | "status">): number {
  const base = a.active_seconds ?? 0;
  if (a.status !== "active") return base;
  return base + segmentSeconds(a.active_since ?? null);
}

export function formatActive(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

// ─── CRUD ────────────────────────────────────────────────────────────────

export type StartActivityInput = {
  userId: string;
  kind: PracticeKind;
  drillId?: string | null;
  challengeId?: string | null;
  slug?: string | null;
  title?: string | null;
  config?: Record<string, unknown>;
  initialState?: Record<string, unknown>;
  bowlsDelivered?: number;
};

/**
 * Start a fresh practice activity in the active state. Also flushes any
 * other active/paused activity to paused for this user so only one is live.
 */
export async function startActivity(input: StartActivityInput): Promise<PracticeActivity> {
  console.log("[practice] startActivity", { userId: input.userId, kind: input.kind, slug: input.slug });
  await pauseAllActive(input.userId);
  const { data, error } = await sb
    .from("practice_activities")
    .insert({
      user_id: input.userId,
      kind: input.kind,
      drill_id: input.drillId ?? null,
      challenge_id: input.challengeId ?? null,
      slug: input.slug ?? null,
      title: input.title ?? null,
      config: input.config ?? {},
      state: input.initialState ?? {},
      bowls_delivered: input.bowlsDelivered ?? 0,
      status: "active",
      active_since: nowIso(),
      started_at: nowIso(),
      last_active_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) {
    console.error("[practice] startActivity FAILED", error);
    throw error;
  }
  console.log("[practice] startActivity created", data?.id);
  return data as PracticeActivity;
}

/** Find a resumable activity for a given user + drill/challenge slug. */
export async function findResumable(
  userId: string,
  kind: PracticeKind,
  slug: string,
): Promise<PracticeActivity | null> {
  const { data, error } = await sb
    .from("practice_activities")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("slug", slug)
    .in("status", ["active", "paused"])
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("[practice] findResumable FAILED", { userId, kind, slug, error });
  return (data ?? null) as PracticeActivity | null;
}

export async function getActivity(id: string): Promise<PracticeActivity | null> {
  const { data, error } = await sb.from("practice_activities").select("*").eq("id", id).maybeSingle();
  if (error) console.error("[practice] getActivity FAILED", id, error);
  return (data ?? null) as PracticeActivity | null;
}

/** All active + paused activities for a user, newest first. */
export async function listSaved(userId: string): Promise<PracticeActivity[]> {
  const { data, error } = await sb
    .from("practice_activities")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "paused"])
    .order("last_active_at", { ascending: false });
  if (error) {
    console.error("[practice] listSaved FAILED", error);
    throw error;
  }
  console.log("[practice] listSaved", userId, "->", data?.length ?? 0, "rows");
  return (data ?? []) as PracticeActivity[];
}

/**
 * Merge a partial state patch. Auto-saves are debounced by the hook; this
 * writes immediately. Never touches active_seconds or status.
 */
export async function patchState(
  id: string,
  patch: Record<string, unknown>,
  extras?: { bowlsDelta?: number; bowlsDelivered?: number },
): Promise<void> {
  // Read then write — we can't do jsonb || via the JS client generically.
  const { data: current } = await sb
    .from("practice_activities")
    .select("state, bowls_delivered")
    .eq("id", id)
    .maybeSingle();
  if (!current) return;
  const nextState = { ...(current.state ?? {}), ...patch };
  const nextBowls =
    extras?.bowlsDelivered !== undefined
      ? extras.bowlsDelivered
      : (current.bowls_delivered ?? 0) + (extras?.bowlsDelta ?? 0);
  const { error } = await sb
    .from("practice_activities")
    .update({
      state: nextState,
      bowls_delivered: nextBowls,
      last_active_at: nowIso(),
    })
    .eq("id", id);
  if (error) console.error("[practice] patchState FAILED", id, error);
  else console.log("[practice] patchState", id, Object.keys(patch), "bowls=", nextBowls);
}

/** Replace the state jsonb wholesale. */
export async function setState(id: string, state: Record<string, unknown>): Promise<void> {
  await sb
    .from("practice_activities")
    .update({ state, last_active_at: nowIso() })
    .eq("id", id);
}

/**
 * Increment bowls_delivered by delta. Used when a new physical bowl is
 * recorded, so lifetime bowls counts each bowl exactly once.
 */
export async function incrementBowls(id: string, delta = 1): Promise<void> {
  const { data } = await sb
    .from("practice_activities")
    .select("bowls_delivered")
    .eq("id", id)
    .maybeSingle();
  if (!data) return;
  await sb
    .from("practice_activities")
    .update({
      bowls_delivered: (data.bowls_delivered ?? 0) + delta,
      last_active_at: nowIso(),
    })
    .eq("id", id);
}

/**
 * Flush current live segment into active_seconds and set status. Used by
 * pauseActivity, resumeActivity, completeActivity and discardActivity so
 * the time accounting is identical everywhere.
 */
async function flushSegment(id: string, next: {
  status?: PracticeStatus;
  restart?: boolean;      // set a new active_since after flush
  completed?: boolean;
  discarded?: boolean;
  discardKeepStats?: boolean;
  resultId?: string | null;
  challengeResultId?: string | null;
  /** Seconds of the live segment to discard as idle (never below zero). */
  subtractSeconds?: number;
}): Promise<PracticeActivity | null> {
  const { data: cur, error: readError } = await sb
    .from("practice_activities")
    .select("active_since, active_seconds")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("[practice] flushSegment read FAILED", id, readError);
    return null;
  }
  if (!cur) return null;
  const raw = segmentSeconds(cur.active_since ?? null);
  const addSecs = Math.max(0, raw - Math.max(0, Math.floor(next.subtractSeconds ?? 0)));
  const update: Record<string, unknown> = {
    active_seconds: (cur.active_seconds ?? 0) + addSecs,
    active_since: next.restart ? nowIso() : null,
    last_active_at: nowIso(),
  };
  if (next.status) update.status = next.status;
  if (next.completed) update.completed_at = nowIso();
  if (next.discarded) {
    update.discarded_at = nowIso();
    update.discard_kept_stats = next.discardKeepStats ?? false;
  }
  if (next.resultId !== undefined) update.result_id = next.resultId;
  if (next.challengeResultId !== undefined) update.challenge_result_id = next.challengeResultId;
  const { data, error } = await sb
    .from("practice_activities")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) console.error("[practice] flushSegment update FAILED", id, error);
  return (data ?? null) as PracticeActivity | null;
}

export async function pauseActivity(id: string): Promise<PracticeActivity | null> {
  console.log("[practice] pauseActivity", id);
  return flushSegment(id, { status: "paused" });
}

export async function resumeActivity(id: string): Promise<PracticeActivity | null> {
  // Also flush so we can't stack overlapping segments if this is called
  // multiple times in a row.
  return flushSegment(id, { status: "active", restart: true });
}

/**
 * The drill screen came back to the foreground after `hiddenSeconds` in the
 * background. The timer kept running (screen-off is normal during real bowls
 * practice); here we only trim time beyond the grace window, then restart the
 * segment so accounting stays clean.
 */
export async function creditBackgroundGap(
  id: string,
  hiddenSeconds: number,
): Promise<PracticeActivity | null> {
  const excess = Math.max(0, Math.floor(hiddenSeconds) - BACKGROUND_GRACE_SECONDS);
  if (excess <= 0) return null;
  console.log("[practice] trimming background idle", id, excess, "s");
  return flushSegment(id, { status: "active", restart: true, subtractSeconds: excess });
}

/**
 * Adopting a row that is still marked active (typically because the app was
 * force-closed mid-drill). Trim anything beyond the abandon grace measured
 * from the last recorded interaction, then keep the timer running.
 */
export async function reconcileStaleActive(id: string): Promise<PracticeActivity | null> {
  const { data: cur } = await sb
    .from("practice_activities")
    .select("status, active_since, last_active_at")
    .eq("id", id)
    .maybeSingle();
  if (!cur || cur.status !== "active" || !cur.active_since) return null;
  const idle = Math.floor((Date.now() - new Date(cur.last_active_at ?? cur.active_since).getTime()) / 1000);
  const excess = Math.max(0, idle - ABANDON_GRACE_SECONDS);
  if (excess <= 0) return null;
  console.log("[practice] trimming abandoned idle", id, excess, "s");
  return flushSegment(id, { status: "active", restart: true, subtractSeconds: excess });
}


/**
 * Pause every active/paused activity for this user. Called before starting
 * a new activity so we don't leave a phantom timer running on the previous
 * one.
 */
export async function pauseAllActive(userId: string): Promise<void> {
  const { data } = await sb
    .from("practice_activities")
    .select("id, status")
    .eq("user_id", userId)
    .in("status", ["active", "paused"]);
  const rows = (data ?? []) as { id: string; status: PracticeStatus }[];
  for (const r of rows) {
    if (r.status === "active") await pauseActivity(r.id);
  }
}

export async function completeActivity(
  id: string,
  opts?: { resultId?: string | null; challengeResultId?: string | null },
): Promise<PracticeActivity | null> {
  return flushSegment(id, {
    status: "completed",
    completed: true,
    resultId: opts?.resultId ?? null,
    challengeResultId: opts?.challengeResultId ?? null,
  });
}

/**
 * Discard an unfinished activity.
 *  - keepStats=true: activity flips to 'discarded' with discard_kept_stats=true,
 *    so its bowls_delivered and active_seconds still count toward lifetime totals.
 *  - keepStats=false: the row is hard-deleted, so nothing it contributed remains.
 */
export async function discardActivity(id: string, keepStats: boolean): Promise<void> {
  if (keepStats) {
    await flushSegment(id, {
      status: "discarded",
      discarded: true,
      discardKeepStats: true,
    });
  } else {
    await sb.from("practice_activities").delete().eq("id", id);
  }
}

// ─── Aggregate helpers ───────────────────────────────────────────────────

/**
 * Lifetime bowls delivered from practice activities. Includes:
 *   - completed
 *   - active + paused (so in-progress bowls already count)
 *   - discarded with discard_kept_stats=true
 * Excludes discarded rows that were dropped entirely (those are gone).
 */
export async function lifetimeBowlsFromActivities(userId: string): Promise<number> {
  const { data } = await sb
    .from("practice_activities")
    .select("bowls_delivered, status, discard_kept_stats")
    .eq("user_id", userId);
  const rows = (data ?? []) as Array<Pick<PracticeActivity, "bowls_delivered" | "status" | "discard_kept_stats">>;
  return rows.reduce((sum, r) => sum + (r.bowls_delivered ?? 0), 0);
}

/**
 * Lifetime active practice seconds (sum of all activities, plus live segment
 * of any currently-active one).
 */
export async function lifetimeActiveSecondsFromActivities(userId: string): Promise<number> {
  const { data } = await sb
    .from("practice_activities")
    .select("active_seconds, active_since, status")
    .eq("user_id", userId);
  const rows = (data ?? []) as Array<Pick<PracticeActivity, "active_seconds" | "active_since" | "status">>;
  return rows.reduce((sum, r) => sum + totalActiveSeconds(r), 0);
}
