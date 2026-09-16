import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_LABELS, categoryForDrill, type CategoryKey } from "@/lib/bowls";

/**
 * WEEKLY TRAINING GOALS — V1
 *
 * Source of truth for "active practice time" is `practice_activities.active_seconds`,
 * the same segment-based timer that powers pause / resume / background handling.
 * We deliberately do NOT use training-session wall-clock elapsed time, which
 * includes walking, chatting, travel and backgrounded app time.
 *
 * Challenges COUNT toward the weekly goal: they run through the exact same
 * practice_activities timing model as drills, so their active time is measured
 * identically. Drill and challenge counts are reported separately so a player
 * can still see the split.
 *
 * Weeks are LOCAL Monday 00:00 → Sunday 23:59, matching the rest of the app.
 */

/** Hard cap per single activity (mirrors MAX_ACTIVITY_MINUTES in bowls.ts). */
export const MAX_ACTIVITY_SECONDS = 60 * 60;

export type GoalRow = {
  id: string;
  user_id: string;
  weekly_minutes: number | null;
  min_training_days: number | null;
  reminders_enabled: boolean;
  focus_areas: string[];
  playing_position: string | null;
  effective_from: string;
};

export type ActivityRow = {
  id: string;
  kind: "drill" | "challenge";
  slug: string | null;
  title: string | null;
  status: string;
  active_seconds: number | null;
  started_at: string;
  last_active_at: string | null;
  completed_at: string | null;
  discarded_at: string | null;
  discard_kept_stats: boolean | null;
};

// ---------- week maths (local time, Monday start) ----------

export function startOfLocalWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Mon=0..Sun=6
  x.setDate(x.getDate() - day);
  return x;
}

export function addWeeks(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}

export function formatWeekLabel(weekStart: Date, now = new Date()): string {
  const thisWeek = startOfLocalWeek(now).getTime();
  const ws = weekStart.getTime();
  if (ws === thisWeek) return "This week";
  if (ws === addWeeks(startOfLocalWeek(now), -1).getTime()) return "Last week";
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const f = (x: Date) => x.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${f(weekStart)} – ${f(end)}`;
}

// ---------- counting rules ----------

/** An activity counts once it is finished and its stats were kept. */
export function countsTowardGoal(a: ActivityRow): boolean {
  if (a.status === "completed") return true;
  if (a.status === "discarded" && a.discard_kept_stats) return true;
  return false;
}

/** When the activity landed in a week. */
export function activityEndedAt(a: ActivityRow): Date {
  return new Date(a.completed_at ?? a.discarded_at ?? a.last_active_at ?? a.started_at);
}

export function activitySeconds(a: ActivityRow): number {
  const s = a.active_seconds ?? 0;
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.min(s, MAX_ACTIVITY_SECONDS);
}

// ---------- weekly summary ----------

export type CategorySplit = { key: string; label: string; minutes: number; count: number };

export type WeekSummary = {
  weekStart: Date;
  label: string;
  minutes: number;
  goalMinutes: number | null;
  /** 0..N — can exceed 100. Null when no goal applied that week. */
  percent: number | null;
  metGoal: boolean;
  trainingDays: number;
  drills: number;
  challenges: number;
  categories: CategorySplit[];
};

function emptyCategories(): Map<string, CategorySplit> {
  const m = new Map<string, CategorySplit>();
  (Object.keys(CATEGORY_LABELS) as CategoryKey[]).forEach((k) =>
    m.set(k, { key: k, label: CATEGORY_LABELS[k], minutes: 0, count: 0 }),
  );
  m.set("challenge", { key: "challenge", label: "Challenges", minutes: 0, count: 0 });
  m.set("other", { key: "other", label: "Other", minutes: 0, count: 0 });
  return m;
}

export function summariseWeek(
  activities: ActivityRow[],
  weekStart: Date,
  goalMinutes: number | null,
  now = new Date(),
): WeekSummary {
  const from = weekStart.getTime();
  const to = addWeeks(weekStart, 1).getTime();
  const cats = emptyCategories();
  const days = new Set<string>();
  let seconds = 0;
  let drills = 0;
  let challenges = 0;

  for (const a of activities) {
    if (!countsTowardGoal(a)) continue;
    const t = activityEndedAt(a).getTime();
    if (t < from || t >= to) continue;
    const secs = activitySeconds(a);
    seconds += secs;
    if (a.kind === "challenge") challenges += 1;
    else drills += 1;
    if (secs > 0 || a.kind) days.add(new Date(t).toDateString());

    const key =
      a.kind === "challenge" ? "challenge" : (a.slug ? categoryForDrill(a.slug) : null) ?? "other";
    const bucket = cats.get(key)!;
    bucket.minutes += secs / 60;
    bucket.count += 1;
  }

  const minutes = Math.round(seconds / 60);
  const percent = goalMinutes && goalMinutes > 0 ? Math.round((minutes / goalMinutes) * 100) : null;

  return {
    weekStart,
    label: formatWeekLabel(weekStart, now),
    minutes,
    goalMinutes,
    percent,
    metGoal: percent != null && percent >= 100,
    trainingDays: days.size,
    drills,
    challenges,
    categories: Array.from(cats.values())
      .map((c) => ({ ...c, minutes: Math.round(c.minutes) }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.minutes - a.minutes),
  };
}

/**
 * Goal that applied to a given week = the most recent goal change that took
 * effect on or before the END of that week. Keeps history honest when a
 * player changes their target.
 */
export function goalForWeek(goals: GoalRow[], weekStart: Date): number | null {
  const weekEnd = addWeeks(weekStart, 1).getTime();
  let best: GoalRow | null = null;
  for (const g of goals) {
    const t = new Date(g.effective_from).getTime();
    if (t >= weekEnd) continue;
    if (!best || t > new Date(best.effective_from).getTime()) best = g;
  }
  const mins = best?.weekly_minutes ?? null;
  return mins && mins > 0 ? mins : null;
}

export function recentWeeks(activities: ActivityRow[], goals: GoalRow[], weeks = 8, now = new Date()) {
  const current = startOfLocalWeek(now);
  const out: WeekSummary[] = [];
  for (let i = 0; i < weeks; i++) {
    const ws = addWeeks(current, -i);
    out.push(summariseWeek(activities, ws, goalForWeek(goals, ws), now));
  }
  return out;
}

// ---------- data access ----------

export const GOALS_QK = (userId: string) => ["training_goals", userId] as const;
export const GOAL_ACTIVITIES_QK = (userId: string) => ["training_goal_activities", userId] as const;

export async function fetchGoals(userId: string): Promise<GoalRow[]> {
  const { data, error } = await (supabase as any)
    .from("training_goals")
    .select("*")
    .eq("user_id", userId)
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GoalRow[];
}

export function currentGoal(goals: GoalRow[]): GoalRow | null {
  return goals[0] ?? null;
}

export async function setWeeklyGoal(
  userId: string,
  weeklyMinutes: number | null,
  extra?: { minTrainingDays?: number | null; remindersEnabled?: boolean },
): Promise<void> {
  const { error } = await (supabase as any).from("training_goals").insert({
    user_id: userId,
    weekly_minutes: weeklyMinutes,
    min_training_days: extra?.minTrainingDays ?? null,
    reminders_enabled: extra?.remindersEnabled ?? false,
  });
  if (error) throw error;
}

/** Finished practice activities from the last `weeks` weeks. */
export async function fetchGoalActivities(userId: string, weeks = 12): Promise<ActivityRow[]> {
  const since = addWeeks(startOfLocalWeek(new Date()), -(weeks - 1)).toISOString();
  const { data, error } = await (supabase as any)
    .from("practice_activities")
    .select(
      "id,kind,slug,title,status,active_seconds,started_at,last_active_at,completed_at,discarded_at,discard_kept_stats",
    )
    .eq("user_id", userId)
    .in("status", ["completed", "discarded"])
    .gte("started_at", since)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

export const GOAL_PRESETS = [60, 90, 120, 180, 240, 300] as const;

export function formatGoal(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// ---------- weekly activity list ----------

export type WeekActivity = {
  id: string;
  kind: "drill" | "challenge";
  title: string;
  categoryLabel: string;
  minutes: number;
  endedAt: Date;
};

/** Individual finished activities that landed in a given week, newest first. */
export function activitiesInWeek(activities: ActivityRow[], weekStart: Date): WeekActivity[] {
  const from = weekStart.getTime();
  const to = addWeeks(weekStart, 1).getTime();
  const out: WeekActivity[] = [];
  for (const a of activities) {
    if (!countsTowardGoal(a)) continue;
    const ended = activityEndedAt(a);
    const t = ended.getTime();
    if (t < from || t >= to) continue;
    const key =
      a.kind === "challenge" ? "challenge" : (a.slug ? categoryForDrill(a.slug) : null) ?? "other";
    const label =
      key === "challenge"
        ? "Challenges"
        : key === "other"
          ? "Other"
          : CATEGORY_LABELS[key as CategoryKey];
    out.push({
      id: a.id,
      kind: a.kind,
      title: a.title ?? a.slug ?? (a.kind === "challenge" ? "Challenge" : "Drill"),
      categoryLabel: label,
      minutes: Math.round(activitySeconds(a) / 60),
      endedAt: ended,
    });
  }
  return out.sort((x, y) => y.endedAt.getTime() - x.endedAt.getTime());
}

/** Group activities by local day, newest day first. */
export function groupActivitiesByDay(items: WeekActivity[]) {
  const map = new Map<string, { label: string; date: Date; items: WeekActivity[] }>();
  for (const it of items) {
    const key = it.endedAt.toDateString();
    if (!map.has(key)) {
      map.set(key, {
        label: it.endedAt.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "short",
        }),
        date: it.endedAt,
        items: [],
      });
    }
    map.get(key)!.items.push(it);
  }
  return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const f = (x: Date) => x.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${f(weekStart)} – ${f(end)}`;
}
