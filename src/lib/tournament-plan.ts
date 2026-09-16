// ─────────────────────────────────────────────────────────────────────────────
// Bowls Trainer — Tournament Training plan generation.
//
// Deliberately deterministic and explainable: bowls logic first, no opaque AI.
// It only ever emits slugs that exist in the canonical drill / challenge
// library, and produces plain session structures that the shared program engine
// (`@/lib/programs`) persists. Nothing here scores, times or touches BSI.
// ─────────────────────────────────────────────────────────────────────────────

import type { NewSessionInput, ProgramPhase } from "@/lib/programs";

export type TournamentFormat = "singles" | "pairs" | "triples" | "fours";
export type PlayingPosition = "lead" | "second" | "third" | "skip";

export const TOURNAMENT_FORMATS: Array<{ value: TournamentFormat; label: string }> = [
  { value: "singles", label: "Singles" },
  { value: "pairs", label: "Pairs" },
  { value: "triples", label: "Triples" },
  { value: "fours", label: "Fours" },
];

export const PLAYING_POSITIONS: Array<{ value: PlayingPosition; label: string }> = [
  { value: "lead", label: "Lead" },
  { value: "second", label: "Second" },
  { value: "third", label: "Third" },
  { value: "skip", label: "Skip" },
];

export function needsPosition(format: TournamentFormat): boolean {
  return format !== "singles";
}

type Emphasis = {
  /** Drill slugs in priority order. */
  drills: string[];
  /** Challenge slugs used for pressure / variety work. */
  challenges: string[];
  summary: string;
};

/**
 * Role emphasis, expressed only with drills and challenges that exist today.
 * Leads never get a drive-heavy plan; skips get the broadest mix.
 */
export const ROLE_EMPHASIS: Record<PlayingPosition | "singles", Emphasis> = {
  lead: {
    drills: ["jack-delivery-accuracy", "lead-drill", "medium-draw", "short-draw", "long-draw", "weight-control-ladder"],
    challenges: ["keep-it-up", "traffic-jam", "switch-32"],
    summary: "Jack delivery, first-bowl draw accuracy, length control and forehand/backhand balance.",
  },
  second: {
    drills: ["medium-draw", "lead-drill", "weight-control-ladder", "long-draw", "short-draw", "upshot-drill"],
    challenges: ["slimed", "traffic-jam"],
    summary: "Draw accuracy, positional bowls, weight control and consolidating the head.",
  },
  third: {
    drills: ["medium-draw", "upshot-drill", "running-shot-drill", "weight-control-ladder", "long-draw", "drive-accuracy"],
    challenges: ["drive-then-draw", "traffic-jam"],
    summary: "Draw plus upshots, running shots, controlled weight and conversion versatility.",
  },
  skip: {
    drills: ["medium-draw", "upshot-drill", "running-shot-drill", "drive-accuracy", "weight-control-ladder", "jack-in-ditch", "long-draw"],
    challenges: ["drive-then-draw", "jack-in-ditch", "traffic-jam"],
    summary: "The broadest mix — draw, upshots, running shots, conversion, driving, weight and pressure.",
  },
  singles: {
    drills: ["medium-draw", "long-draw", "short-draw", "weight-control-ladder", "upshot-drill", "drive-accuracy"],
    challenges: ["traffic-jam", "slimed"],
    summary: "A balanced all-round plan across draw, length, weight and conversion.",
  },
};

export function emphasisFor(format: TournamentFormat, position: PlayingPosition | null): Emphasis {
  if (format === "singles" || !position) return ROLE_EMPHASIS.singles;
  return ROLE_EMPHASIS[position];
}

export function weeksUntil(tournamentDate: string, today = new Date()): number {
  const target = new Date(`${tournamentDate}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.ceil((target.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, Math.ceil(days / 7));
}

/**
 * Preparation phase for a given week. The final week always tapers so a player
 * is not fatigued on tournament day; the first week builds when there is room.
 */
export function phaseForWeek(week: number, totalWeeks: number): ProgramPhase {
  if (week === totalWeeks) return "TAPER";
  if (totalWeeks >= 3 && week === 1) return "BUILD";
  if (totalWeeks <= 2) return "SHARPEN";
  return "SHARPEN";
}

export type PlanInput = {
  tournamentName: string;
  tournamentDate: string;
  format: TournamentFormat;
  position: PlayingPosition | null;
  /** Sessions per week. Defaults to 3. */
  trainingDays?: number;
  /** Player-nominated focus areas — drill slugs they want extra work on. */
  focusSlugs?: string[];
  /** Categories the player is currently weakest in (see weakAreasFromResults). */
  weakSlugs?: string[];
  notes?: string | null;
  today?: Date;
  /** Slugs available in the library, so we never emit something that's gone. */
  availableDrillSlugs: string[];
  availableChallengeSlugs: string[];
};

/** Library-agnostic session shape: activities are canonical slugs. */
export type PlannedSession = {
  title: string;
  objective: string;
  phase: ProgramPhase;
  weekNumber: number;
  activities: Array<{ kind: "drill" | "challenge"; slug: string; focus?: string | null }>;
};

export type GeneratedPlan = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  weeks: number;
  focusSummary: string;
  sessions: PlannedSession[];
};

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Deterministic rule-based generation.
 *  - role emphasis drives which drills appear and how often
 *  - each week rotates through the emphasis list so nothing repeats back-to-back
 *  - one challenge per week adds pressure work (never in the very first session)
 *  - the final week is shorter and sharper
 */
export function generateTournamentPlan(input: PlanInput): GeneratedPlan {
  const today = input.today ?? new Date();
  const weeks = weeksUntil(input.tournamentDate, today);
  const perWeek = Math.min(6, Math.max(1, input.trainingDays ?? 3));
  const emphasis = emphasisFor(input.format, input.position);

  const drillPool = [
    // Player-nominated focus first, then weaknesses, then role emphasis.
    ...(input.focusSlugs ?? []),
    ...(input.weakSlugs ?? []),
    ...emphasis.drills,
  ].filter((s, i, arr) => input.availableDrillSlugs.includes(s) && arr.indexOf(s) === i);

  const challengePool = emphasis.challenges.filter((s) => input.availableChallengeSlugs.includes(s));

  const sessions: PlannedSession[] = [];
  let cursor = 0;
  let seq = 0;

  for (let week = 1; week <= weeks; week++) {
    const phase = phaseForWeek(week, weeks);
    const taper = phase === "TAPER";
    const sessionsThisWeek = taper ? Math.max(1, perWeek - 1) : perWeek;
    for (let s = 1; s <= sessionsThisWeek; s++) {
      seq += 1;
      const count = taper ? 2 : 3;
      const picks: string[] = [];
      while (picks.length < count && drillPool.length > 0) {
        const slug = drillPool[cursor % drillPool.length]!;
        cursor += 1;
        if (!picks.includes(slug)) picks.push(slug);
        if (picks.length >= drillPool.length) break;
      }
      const wantsChallenge = challengePool.length > 0 && s === sessionsThisWeek && seq > 1;
      const challengeSlug = wantsChallenge ? challengePool[(week - 1) % challengePool.length]! : null;

      sessions.push({
        title: sessionTitle(picks, phase),
        objective: sessionObjective(phase, emphasis.summary, taper),
        phase,
        weekNumber: week,
        activities: [
          ...picks.map((slug) => ({ kind: "drill" as const, slug })),
          ...(challengeSlug ? [{ kind: "challenge" as const, slug: challengeSlug }] : []),
        ],
      });
    }
  }

  const start = isoDate(today);
  return {
    name: `${input.tournamentName} Preparation`,
    description: `${weeks} week${weeks === 1 ? "" : "s"} of ${
      input.format === "singles" ? "singles" : `${input.position ?? "team"} `
    }preparation for ${input.tournamentName}.`.replace("  ", " "),
    startDate: start,
    endDate: input.tournamentDate,
    weeks,
    focusSummary: emphasis.summary,
    sessions,
  };
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function sessionTitle(picks: string[], phase: ProgramPhase): string {
  const lead = picks[0] ? titleCase(picks[0]) : "Practice";
  if (phase === "TAPER") return `Match ready — ${lead}`;
  if (phase === "BUILD") return `Build — ${lead}`;
  return `Sharpen — ${lead}`;
}

function sessionObjective(phase: ProgramPhase, summary: string, taper: boolean): string {
  if (taper) return `Short and sharp. Keep it confident, avoid fatigue before the event. ${summary}`;
  if (phase === "BUILD") return `Groove the basics for the week ahead. ${summary}`;
  return `Add pressure and consistency. ${summary}`;
}

// ─── Weakness detection (simple + explainable) ────────────────────────────────

export type MinResult = { drill_id: string; percentage?: number | null; bsi?: number | null };

/**
 * Drill slugs where the player is materially below their own baseline. Simple,
 * explainable rule: a drill whose average BSI is 8 or more points under the
 * player's overall average, with at least two recorded attempts.
 */
export function weakDrillSlugs(
  results: MinResult[],
  drills: Array<{ id: string; slug: string }>,
  minGap = 8,
): string[] {
  const bySlug = new Map<string, number[]>();
  const slugById = new Map(drills.map((d) => [d.id, d.slug]));
  for (const r of results) {
    const slug = slugById.get(r.drill_id);
    const bsi = typeof r.bsi === "number" ? r.bsi : null;
    if (!slug || bsi === null) continue;
    const arr = bySlug.get(slug) ?? [];
    arr.push(bsi);
    bySlug.set(slug, arr);
  }
  const all = [...bySlug.values()].flat();
  if (all.length === 0) return [];
  const overall = all.reduce((a, b) => a + b, 0) / all.length;
  return [...bySlug.entries()]
    .filter(([, vals]) => vals.length >= 2)
    .map(([slug, vals]) => ({ slug, avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
    .filter((x) => overall - x.avg >= minGap)
    .sort((a, b) => a.avg - b.avg)
    .map((x) => x.slug);
}

export function weaknessExplanation(slugName: string): string {
  return `We've added extra ${slugName} practice because this remains your weakest tournament-prep area.`;
}

/**
 * Map a generated plan onto the canonical program engine's input shape by
 * resolving slugs to existing drill / challenge ids.
 */
export function planToSessionInputs(
  plan: GeneratedPlan,
  drillIdBySlug: Map<string, string>,
  challengeIdBySlug: Map<string, string>,
): NewSessionInput[] {
  return plan.sessions.map((s) => ({
    title: s.title,
    objective: s.objective,
    phase: s.phase,
    weekNumber: s.weekNumber,
    activities: s.activities
      .map((a) =>
        a.kind === "drill"
          ? { kind: "drill" as const, drillId: drillIdBySlug.get(a.slug) ?? null, focus: a.focus ?? null }
          : { kind: "challenge" as const, challengeId: challengeIdBySlug.get(a.slug) ?? null, focus: a.focus ?? null },
      )
      .filter((a) => ("drillId" in a ? !!a.drillId : !!a.challengeId)),
  }));
}
