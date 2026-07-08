import { supabase } from "@/integrations/supabase/client";
import { isDemoMode, isDemoId, newDemoId } from "@/lib/demo-mode";

const DEMO_SESSION_KEY = "bowls.demoSession";

function readDemoSession(): TrainingSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEMO_SESSION_KEY);
    return raw ? (JSON.parse(raw) as TrainingSession) : null;
  } catch {
    return null;
  }
}

function writeDemoSession(s: TrainingSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (s) window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(DEMO_SESSION_KEY);
  } catch {}
}

function makeDemoSession(userId: string): TrainingSession {
  const now = new Date().toISOString();
  return {
    id: newDemoId(),
    user_id: userId,
    session_started_at: now,
    session_ended_at: null,
    total_duration_minutes: null,
    status: "active",
    notes: null,
    total_activities: 0,
    drills_completed: 0,
    challenges_completed: 0,
    category_breakdown: {},
    paused_at: null,
    total_paused_seconds: 0,
    created_at: now,
    updated_at: now,
  };
}


export type SessionSetup = {
  club?: string | null;
  green?: string | null;
  green_type?: string | null;
  conditions?: string[] | null;
  notes?: string | null;
};

export type TrainingSession = {
  id: string;
  user_id: string;
  session_started_at: string;
  session_ended_at: string | null;
  total_duration_minutes: number | null;
  status: "active" | "paused" | "complete";
  notes: string | null;
  total_activities: number;
  drills_completed: number;
  challenges_completed: number;
  category_breakdown: Record<string, number>;
  paused_at: string | null;
  total_paused_seconds: number;
  created_at: string;
  updated_at: string;
  club?: string | null;
  green?: string | null;
  green_type?: string | null;
  conditions?: string[] | null;
};


const sb = supabase as any;

export async function getActiveSession(userId: string): Promise<TrainingSession | null> {
  if (isDemoMode()) return readDemoSession();
  const { data } = await sb
    .from("training_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "paused"])
    .order("session_started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as TrainingSession | null;
}

export async function startSession(userId: string, setup?: SessionSetup): Promise<TrainingSession> {
  if (isDemoMode()) {
    const existing = readDemoSession();
    if (existing) return existing;
    const s = makeDemoSession(userId);
    if (setup) {
      s.club = setup.club ?? null;
      s.green = setup.green ?? null;
      s.green_type = setup.green_type ?? null;
      s.conditions = setup.conditions ?? null;
      s.notes = setup.notes ?? null;
    }
    writeDemoSession(s);
    return s;
  }
  const existing = await getActiveSession(userId);
  if (existing) return existing;
  const payload: any = { user_id: userId };
  if (setup) {
    payload.club = setup.club ?? null;
    payload.green = setup.green ?? null;
    payload.green_type = setup.green_type ?? null;
    payload.conditions = setup.conditions ?? null;
    payload.notes = setup.notes ?? null;
  }
  const { data, error } = await sb
    .from("training_sessions")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as TrainingSession;
}

export async function getLastCompletedSession(userId: string): Promise<TrainingSession | null> {
  if (isDemoMode()) return null;
  const { data } = await sb
    .from("training_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "complete")
    .order("session_ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as TrainingSession | null;
}


export async function pauseSession(sessionId: string): Promise<TrainingSession> {
  if (isDemoId(sessionId) || isDemoMode()) {
    const s = readDemoSession();
    if (s) {
      const updated = { ...s, status: "paused" as const, paused_at: new Date().toISOString() };
      writeDemoSession(updated);
      return updated;
    }
  }
  const { data, error } = await sb
    .from("training_sessions")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "active")
    .select("*")
    .single();
  if (error) throw error;
  return data as TrainingSession;
}

export async function resumeSession(sessionId: string): Promise<TrainingSession> {
  if (isDemoId(sessionId) || isDemoMode()) {
    const s = readDemoSession();
    if (s) {
      const pausedSecs = s.paused_at
        ? Math.max(0, Math.floor((Date.now() - new Date(s.paused_at).getTime()) / 1000))
        : 0;
      const updated = {
        ...s,
        status: "active" as const,
        paused_at: null,
        total_paused_seconds: (s.total_paused_seconds ?? 0) + pausedSecs,
      };
      writeDemoSession(updated);
      return updated;
    }
  }
  const { data: current } = await sb
    .from("training_sessions")
    .select("paused_at, total_paused_seconds")
    .eq("id", sessionId)
    .maybeSingle();
  const pausedSecs = current?.paused_at
    ? Math.max(0, Math.floor((Date.now() - new Date(current.paused_at).getTime()) / 1000))
    : 0;
  const total = (current?.total_paused_seconds ?? 0) + pausedSecs;
  const { data, error } = await sb
    .from("training_sessions")
    .update({ status: "active", paused_at: null, total_paused_seconds: total })
    .eq("id", sessionId)
    .select("*")
    .single();
  if (error) throw error;
  return data as TrainingSession;
}

export async function endSession(
  sessionId: string,
  notes?: string | null,
): Promise<TrainingSession> {
  if (isDemoId(sessionId) || isDemoMode()) {
    const s = readDemoSession() ?? makeDemoSession("demo");
    const endedAt = new Date();
    const startedAt = new Date(s.session_started_at).getTime();
    let pausedSecs = s.total_paused_seconds ?? 0;
    if (s.paused_at) pausedSecs += Math.max(0, Math.floor((endedAt.getTime() - new Date(s.paused_at).getTime()) / 1000));
    const elapsed = Math.max(0, Math.floor((endedAt.getTime() - startedAt) / 1000) - pausedSecs);
    const updated: TrainingSession = {
      ...s,
      status: "complete",
      session_ended_at: endedAt.toISOString(),
      total_duration_minutes: Math.max(1, Math.round(elapsed / 60)),
      paused_at: null,
      total_paused_seconds: pausedSecs,
      notes: notes ?? null,
    };
    writeDemoSession(null);
    return updated;
  }
  const { data: current } = await sb
    .from("training_sessions")
    .select("session_started_at, paused_at, total_paused_seconds")
    .eq("id", sessionId)
    .maybeSingle();
  const startedAt = current?.session_started_at
    ? new Date(current.session_started_at).getTime()
    : Date.now();
  const endedAt = new Date();
  let pausedSecs = current?.total_paused_seconds ?? 0;
  if (current?.paused_at) {
    pausedSecs += Math.max(0, Math.floor((endedAt.getTime() - new Date(current.paused_at).getTime()) / 1000));
  }
  const elapsedSecs = Math.max(0, Math.floor((endedAt.getTime() - startedAt) / 1000) - pausedSecs);
  const totalMinutes = Math.max(1, Math.round(elapsedSecs / 60));
  const { data, error } = await sb
    .from("training_sessions")
    .update({
      status: "complete",
      session_ended_at: endedAt.toISOString(),
      total_duration_minutes: totalMinutes,
      paused_at: null,
      total_paused_seconds: pausedSecs,
      notes: notes ?? null,
    })
    .eq("id", sessionId)
    .select("*")
    .single();
  if (error) throw error;
  return data as TrainingSession;
}

export async function discardSession(sessionId: string): Promise<void> {
  if (isDemoId(sessionId) || isDemoMode()) {
    writeDemoSession(null);
    return;
  }
  // Detach any activities first so they survive as solo entries
  await sb.from("results").update({ session_id: null }).eq("session_id", sessionId);
  await sb.from("challenge_results").update({ session_id: null }).eq("session_id", sessionId);
  await sb.from("training_sessions").delete().eq("id", sessionId);
}

/**
 * Increment session counters after an activity is saved.
 */
export async function attachActivity(
  sessionId: string,
  kind: "drill" | "challenge",
  category: string | null,
): Promise<void> {
  if (isDemoId(sessionId) || isDemoMode()) {
    const s = readDemoSession();
    if (!s) return;
    const breakdown = { ...(s.category_breakdown ?? {}) } as Record<string, number>;
    if (category) breakdown[category] = (breakdown[category] ?? 0) + 1;
    writeDemoSession({
      ...s,
      total_activities: (s.total_activities ?? 0) + 1,
      drills_completed: (s.drills_completed ?? 0) + (kind === "drill" ? 1 : 0),
      challenges_completed: (s.challenges_completed ?? 0) + (kind === "challenge" ? 1 : 0),
      category_breakdown: breakdown,
    });
    return;
  }
  const { data: current } = await sb
    .from("training_sessions")
    .select("total_activities, drills_completed, challenges_completed, category_breakdown")
    .eq("id", sessionId)
    .maybeSingle();
  if (!current) return;
  const breakdown = { ...(current.category_breakdown ?? {}) } as Record<string, number>;
  if (category) breakdown[category] = (breakdown[category] ?? 0) + 1;
  await sb
    .from("training_sessions")
    .update({
      total_activities: (current.total_activities ?? 0) + 1,
      drills_completed: (current.drills_completed ?? 0) + (kind === "drill" ? 1 : 0),
      challenges_completed: (current.challenges_completed ?? 0) + (kind === "challenge" ? 1 : 0),
      category_breakdown: breakdown,
    })
    .eq("id", sessionId);
}


export function formatElapsed(
  fromIso: string,
  toIso?: string,
  pausedSeconds: number = 0,
  pausedAtIso?: string | null,
): string {
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  let extraPaused = 0;
  if (pausedAtIso) {
    extraPaused = Math.max(0, Math.floor((to - new Date(pausedAtIso).getTime()) / 1000));
  }
  const seconds = Math.max(0, Math.floor((to - from) / 1000) - pausedSeconds - extraPaused);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const ACTIVE_SESSION_QK = (userId: string) => ["training_sessions", "active", userId];
export const SESSIONS_QK = (userId: string) => ["training_sessions", userId];
