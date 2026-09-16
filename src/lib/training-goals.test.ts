import { describe, expect, it } from "vitest";
import {
  activitySeconds,
  countsTowardGoal,
  goalForWeek,
  recentWeeks,
  startOfLocalWeek,
  summariseWeek,
  type ActivityRow,
  type GoalRow,
} from "./training-goals";

const NOW = new Date(2026, 0, 8, 12, 0, 0); // Thu 8 Jan 2026
const WEEK = startOfLocalWeek(NOW); // Mon 5 Jan 2026

function act(p: Partial<ActivityRow> & { completed_at: string; active_seconds: number }): ActivityRow {
  return {
    id: Math.random().toString(36),
    kind: "drill",
    slug: "medium-draw",
    title: null,
    status: "completed",
    started_at: p.completed_at,
    last_active_at: p.completed_at,
    discarded_at: null,
    discard_kept_stats: null,
    ...p,
  } as ActivityRow;
}

const iso = (d: number, h = 10) => new Date(2026, 0, d, h).toISOString();

describe("counting rules", () => {
  it("counts completed activities", () => {
    expect(countsTowardGoal(act({ completed_at: iso(5), active_seconds: 60 }))).toBe(true);
  });
  it("counts discarded activities only when stats were kept", () => {
    const base = act({ completed_at: iso(5), active_seconds: 60 });
    expect(countsTowardGoal({ ...base, status: "discarded", discard_kept_stats: true })).toBe(true);
    expect(countsTowardGoal({ ...base, status: "discarded", discard_kept_stats: false })).toBe(false);
  });
  it("ignores active and paused practices", () => {
    const base = act({ completed_at: iso(5), active_seconds: 60 });
    expect(countsTowardGoal({ ...base, status: "active" })).toBe(false);
    expect(countsTowardGoal({ ...base, status: "paused" })).toBe(false);
  });
  it("clamps a single runaway activity to 60 minutes", () => {
    expect(activitySeconds(act({ completed_at: iso(5), active_seconds: 99999 }))).toBe(3600);
    expect(activitySeconds(act({ completed_at: iso(5), active_seconds: -5 }))).toBe(0);
  });
});

describe("summariseWeek", () => {
  const rows = [
    act({ completed_at: iso(5), active_seconds: 1800 }), // Mon 30m draw
    act({ completed_at: iso(5, 15), active_seconds: 900, slug: "drive-accuracy" }), // Mon 15m weight
    act({ completed_at: iso(7), active_seconds: 1200, kind: "challenge", slug: "keep-it-up" }), // Wed 20m
    act({ completed_at: iso(2), active_seconds: 3600 }), // previous week
  ];

  it("sums only this week's active minutes", () => {
    expect(summariseWeek(rows, WEEK, 120, NOW).minutes).toBe(65);
  });
  it("counts distinct training days", () => {
    expect(summariseWeek(rows, WEEK, 120, NOW).trainingDays).toBe(2);
  });
  it("splits drills and challenges", () => {
    const s = summariseWeek(rows, WEEK, 120, NOW);
    expect(s.drills).toBe(2);
    expect(s.challenges).toBe(1);
  });
  it("reports percent against the goal and supports over 100%", () => {
    expect(summariseWeek(rows, WEEK, 120, NOW).percent).toBe(54);
    const over = summariseWeek(rows, WEEK, 30, NOW);
    expect(over.percent).toBe(217);
    expect(over.metGoal).toBe(true);
  });
  it("returns null percent when no goal is set", () => {
    const s = summariseWeek(rows, WEEK, null, NOW);
    expect(s.percent).toBeNull();
    expect(s.metGoal).toBe(false);
    expect(s.minutes).toBe(65);
  });
  it("breaks time down by category", () => {
    const cats = summariseWeek(rows, WEEK, 120, NOW).categories;
    expect(cats.find((c) => c.key === "draw")?.minutes).toBe(30);
    expect(cats.find((c) => c.key === "challenge")?.minutes).toBe(20);
    expect(cats.every((c) => c.count > 0)).toBe(true);
  });
});

describe("goalForWeek", () => {
  const goals: GoalRow[] = [
    { weekly_minutes: 180, effective_from: new Date(2026, 0, 6).toISOString() } as GoalRow,
    { weekly_minutes: 90, effective_from: new Date(2025, 11, 1).toISOString() } as GoalRow,
  ];
  it("uses the goal in effect during that week", () => {
    expect(goalForWeek(goals, WEEK)).toBe(180);
    expect(goalForWeek(goals, new Date(2025, 11, 29))).toBe(90);
  });
  it("returns null for weeks before any goal existed", () => {
    expect(goalForWeek(goals, new Date(2025, 10, 3))).toBeNull();
  });
  it("treats a cleared goal as no goal", () => {
    const cleared: GoalRow[] = [
      { weekly_minutes: null, effective_from: new Date(2026, 0, 6).toISOString() } as GoalRow,
      ...goals.slice(1),
    ];
    expect(goalForWeek(cleared, WEEK)).toBeNull();
  });
});

describe("recentWeeks", () => {
  it("returns newest first and covers the requested span", () => {
    const weeks = recentWeeks([act({ completed_at: iso(5), active_seconds: 600 })], [], 4, NOW);
    expect(weeks).toHaveLength(4);
    expect(weeks[0].minutes).toBe(10);
    expect(weeks[1].minutes).toBe(0);
    expect(weeks[0].weekStart.getTime()).toBeGreaterThan(weeks[3].weekStart.getTime());
  });
});
