// Challenge system types & helpers.
// Challenges are completely separate from drills and do NOT affect the BSI.

export type ChallengeConfig = {
  // Common
  type?: "keep-it-up" | "fixed-ends";
  diagram?: string;
  score_unit?: string;
  // Keep It Up
  start_bowls?: number;
  max_bowls?: number;
  // Fixed-ends format (Traffic Jam etc.)
  ends?: number;
  bowls_per_end?: number;
  max_score?: number;
  min_score?: number;
  // Optional per-bowl target labels (e.g. ["front","front","centre","centre"])
  bowl_targets?: string[];
};

export type VisualPoint = {
  x: number;
  y: number;
  band: "half" | "one" | "two" | "outside";
};

export type FixedEndsEnd = {
  end_number: number;
  // length = bowls_per_end; true = scored (1 pt), false = did not score (0 pt)
  bowls: boolean[];
  end_score: number;
  // Optional, populated only when the user picks Visual Target scoring
  bowls_visual?: (VisualPoint | null)[];
};

export type FixedEndsBreakdown = {
  type: "fixed-ends";
  ends: FixedEndsEnd[];
  total_score: number;
  max_score: number;
  accuracy_pct: number;
  scoring_mode?: "simple" | "visual";
};

export type DriveDrawBowl = {
  kind: "drive" | "draw";
  key: string;
  points: number;
  // Hand used for this bowl. Alternates by end so both hands get equal practice.
  hand?: "forehand" | "backhand";
  // Optional, populated only for the draw bowl when Visual Target scoring is used
  x?: number;
  y?: number;
  band?: "half" | "one" | "two" | "outside";
};

export type DriveDrawEnd = {
  end_number: number;
  bowls: DriveDrawBowl[];
  end_score: number;
};

export type DriveDrawBreakdown = {
  type: "drive-draw";
  total_ends?: number;
  bowls_per_end?: number;
  total_bowls?: number;
  ends: DriveDrawEnd[];
  total_score: number;
  max_score: number;
  scoring_mode?: "simple" | "visual";
};

// Per-bowl outcome for Jack in the Ditch.
//  Before the jack is struck: "gate" = 1, "jack" = 4 (and the jack is removed), "miss" = 0
//  After the jack is struck:  "gate" = 1, "miss" = 0 (jack option not available)
export type JackInDitchOutcome = "gate" | "jack" | "miss";

export type JackInDitchBowl = {
  bowl_number: number; // 1..4
  outcome: JackInDitchOutcome;
  points: number;
};

export type JackInDitchEnd = {
  end_number: number;
  bowls: JackInDitchBowl[];
  jack_struck_on: number | null; // bowl number 1..4 that struck the jack, else null
  perfect_end: boolean;
  end_score: number; // includes Perfect End bonus
  // Legacy fields kept for backward compatibility with old saved results
  bowl_to_ditch?: number | null;
  bowls_used?: number;
};

export type JackInDitchBreakdown = {
  type: "jack-in-ditch";
  ends: JackInDitchEnd[];
  total_score: number;
  max_score: number;
  perfect_ends?: number;
  drive_gate_successes?: number;
  jack_hits?: number;
};

export const JACK_IN_DITCH_PERFECT_BONUS = 2;
export const JACK_IN_DITCH_POINTS_GATE = 1;
export const JACK_IN_DITCH_POINTS_JACK = 4;

// SLiMeD challenge — Short / Long / Medium / Ditch circuit
export type SlimedTarget = "S" | "L" | "M" | "D";
export type SlimedHand = "forehand" | "backhand";
export type SlimedScoringMode = "simple" | "visual";
export type SlimedLine = "narrow" | "on" | "wide";
export type SlimedWeight = "short" | "jack-high" | "past";

export type SlimedBowl = {
  bowl_number: number;        // 1..32
  circuit: number;            // 1..4
  hand: SlimedHand;
  target: SlimedTarget;
  score: 0 | 1 | 2;
  // Visual-only fields
  x?: number;
  y?: number;
  line?: SlimedLine;
  weight?: SlimedWeight;
};

export type SlimedBreakdown = {
  type: "slimed";
  mode: SlimedScoringMode;
  bowls: SlimedBowl[];
  total_score: number;
  max_score: number;
  circuit_scores: number[]; // length 4
};

export const SLIMED_TARGETS: SlimedTarget[] = ["S", "L", "M", "D"];
export const SLIMED_TARGET_LABEL: Record<SlimedTarget, string> = {
  S: "Short",
  L: "Long",
  M: "Medium",
  D: "Ditch",
};
export const SLIMED_CIRCUIT_HAND: Record<number, SlimedHand> = {
  1: "forehand",
  2: "backhand",
  3: "forehand",
  4: "backhand",
};

export type Challenge = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  setup: string | null;
  rules: string[];
  config: ChallengeConfig & { variant?: "drive-draw" | "jack-in-ditch" | "slimed" | "switch-32" };
  score_label: string;
  sort_order: number;
};

export const DRIVE_THEN_DRAW_SLUG = "drive-then-draw";
export const DRIVE_THEN_DRAW_TOTAL_ENDS = 4;
export const DRIVE_THEN_DRAW_BOWLS_PER_END = 4;
export const DRIVE_THEN_DRAW_TOTAL_BOWLS = DRIVE_THEN_DRAW_TOTAL_ENDS * DRIVE_THEN_DRAW_BOWLS_PER_END;
export const DRIVE_THEN_DRAW_MAX_SCORE = DRIVE_THEN_DRAW_TOTAL_BOWLS * 5;

export const SWITCH32_SLUG = "switch-32";

export function normalizeChallengeConfig(challenge: Challenge): Challenge {
  if (challenge.slug === SWITCH32_SLUG || challenge.config?.variant === "switch-32") {
    return {
      ...challenge,
      config: {
        ...challenge.config,
        type: "fixed-ends",
        variant: "switch-32",
        ends: SWITCH32_TOTAL_ENDS,
        bowls_per_end: SWITCH32_BOWLS_PER_END,
        max_score: SWITCH32_MAX_SCORE,
        min_score: challenge.config?.min_score ?? 0,
      },
    };
  }
  if (challenge.slug !== DRIVE_THEN_DRAW_SLUG && challenge.config?.variant !== "drive-draw") return challenge;
  return {
    ...challenge,
    config: {
      ...challenge.config,
      type: "fixed-ends",
      variant: "drive-draw",
      ends: DRIVE_THEN_DRAW_TOTAL_ENDS,
      bowls_per_end: DRIVE_THEN_DRAW_BOWLS_PER_END,
      max_score: DRIVE_THEN_DRAW_MAX_SCORE,
      min_score: challenge.config?.min_score ?? 0,
    },
  };
}

// ---- Difficulty & Achievement Badges (recognition only — does not affect BSI) ----

export type ChallengeDifficulty = "easy" | "medium" | "hard" | "expert";
export type ChallengeBadgeTier = "bronze" | "silver" | "gold" | "platinum";

export const DIFFICULTY_META: Record<ChallengeDifficulty, { label: string; emoji: string }> = {
  easy:   { label: "Easy",   emoji: "🟢" },
  medium: { label: "Medium", emoji: "🟡" },
  hard:   { label: "Hard",   emoji: "🟠" },
  expert: { label: "Expert", emoji: "🔴" },
};

export const BADGE_META: Record<ChallengeBadgeTier, { label: string; emoji: string }> = {
  bronze:   { label: "Bronze",   emoji: "🥉" },
  silver:   { label: "Silver",   emoji: "🥈" },
  gold:     { label: "Gold",     emoji: "🥇" },
  platinum: { label: "Platinum", emoji: "💎" },
};

export const CHALLENGE_DIFFICULTY: Record<string, ChallengeDifficulty> = {
  "keep-it-up":      "easy",
  "jack-in-ditch":   "medium",
  "drive-then-draw": "medium",
  "traffic-jam":     "hard",
  "slimed":          "expert",
  "switch-32":       "expert",
};

export const CHALLENGE_BADGE_THRESHOLDS: Record<string, Record<ChallengeBadgeTier, number>> = {
  "keep-it-up":      { bronze: 5,  silver: 10, gold: 15, platinum: 20 },
  "jack-in-ditch":   { bronze: 10, silver: 15, gold: 20, platinum: 25 },
  "drive-then-draw": { bronze: 20, silver: 30, gold: 40, platinum: 50 },
  "traffic-jam":     { bronze: 15, silver: 25, gold: 35, platinum: 45 },
  "slimed":          { bronze: 20, silver: 35, gold: 50, platinum: 65 },
  "switch-32":       { bronze: 60, silver: 90, gold: 120, platinum: 140 },
};

// ---- Switch 32 ----
export type Switch32Target = "S" | "M" | "L";
export type Switch32Hand = "forehand" | "backhand";
export type Switch32ScoringMode = "simple" | "visual";

export const SWITCH32_TOTAL_ENDS = 8;
export const SWITCH32_BOWLS_PER_END = 4;
export const SWITCH32_TOTAL_BOWLS = SWITCH32_TOTAL_ENDS * SWITCH32_BOWLS_PER_END;
export const SWITCH32_MAX_SCORE = SWITCH32_TOTAL_BOWLS * 5;
export const SWITCH32_TARGETS: Switch32Target[] = ["S", "M", "L"];
export const SWITCH32_TARGET_LABEL: Record<Switch32Target, string> = {
  S: "Short",
  M: "Medium",
  L: "Long",
};

export type Switch32Bowl = {
  bowl_number: number;   // 1..32
  end_number: number;    // 1..8
  bowl_in_end: number;   // 1..4
  hand: Switch32Hand;
  target: Switch32Target;
  score: 0 | 1 | 3 | 5;
  // Visual-only fields
  x?: number;
  y?: number;
  line?: "narrow" | "on" | "wide";
  weight?: "short" | "jack-high" | "past";
};

export type Switch32End = {
  end_number: number;
  target: Switch32Target;
  bowls: Switch32Bowl[];
  end_score: number;
};

export type Switch32Breakdown = {
  type: "switch-32";
  mode: Switch32ScoringMode;
  ends: Switch32End[];
  total_score: number;
  max_score: number;
  end_scores: number[];
  by_length: Record<Switch32Target, { score: number; max: number }>;
  by_hand: Record<Switch32Hand, { score: number; max: number }>;
};


// Per-challenge presentation of the score (units and "best" label).
// Keep It Up is a survival challenge — the score IS the number of ends survived.
export function getChallengeScoreUnit(slug: string): string | null {
  if (slug === "keep-it-up") return "Ends";
  return null;
}

export function formatChallengeScore(slug: string, score: number | null | undefined): string {
  if (score == null) return "—";
  const unit = getChallengeScoreUnit(slug);
  return unit ? `${score} ${unit}` : `${score}`;
}

export function getChallengeBestLabel(slug: string): string {
  if (slug === "keep-it-up") return "Longest Run";
  return "Best";
}

export function getChallengeRemainingUnit(slug: string): string {
  if (slug === "keep-it-up") return "End";
  return "point";
}

export const BADGE_ORDER: ChallengeBadgeTier[] = ["bronze", "silver", "gold", "platinum"];

export function getChallengeDifficulty(slug: string): ChallengeDifficulty | null {
  return CHALLENGE_DIFFICULTY[slug] ?? null;
}

export function getBadgeForScore(slug: string, score: number | null | undefined): ChallengeBadgeTier | null {
  if (score == null) return null;
  const thr = CHALLENGE_BADGE_THRESHOLDS[slug];
  if (!thr) return null;
  let earned: ChallengeBadgeTier | null = null;
  for (const tier of BADGE_ORDER) {
    if (score >= thr[tier]) earned = tier;
  }
  return earned;
}

export function getNextBadge(slug: string, best: number | null | undefined): { tier: ChallengeBadgeTier; required: number; remaining: number } | null {
  const thr = CHALLENGE_BADGE_THRESHOLDS[slug];
  if (!thr) return null;
  const s = best ?? 0;
  for (const tier of BADGE_ORDER) {
    if (s < thr[tier]) return { tier, required: thr[tier], remaining: thr[tier] - s };
  }
  return null;
}

export type BowlOutcome = "survived" | "lost" | "toucher";

export type KeepItUpEnd = {
  end_number: number;
  bowls_before: number;
  bowls_after: number;
  outcomes: BowlOutcome[]; // length = bowls_before; index 0 = bowl 1
  // Optional, populated only when the user picks Visual Target scoring
  outcomes_visual?: (VisualPoint | null)[];
};

export type KeepItUpBreakdown = {
  type: "keep-it-up";
  ends_survived: number;
  ends: KeepItUpEnd[];
  per_bowl: {
    bowl1: { attempts: number; survived: number; touchers: number };
    bowl2: { attempts: number; survived: number; touchers: number };
    bowl3: { attempts: number; survived: number; touchers: number };
    bowl4: { attempts: number; survived: number; touchers: number };
  };
  scoring_mode?: "simple" | "visual";
};

export type ChallengeResult = {
  id: string;
  user_id: string;
  challenge_id: string;
  challenge_name: string;
  category: string | null;
  score: number;
  breakdown: KeepItUpBreakdown | Record<string, unknown>;
  notes: string | null;
  location: string | null;
  conditions: string | null;
  green_speed: string | null;
  played_at: string;
  challenge_started_at: string | null;
  challenge_completed_at: string | null;
  duration_minutes: number | null;
  created_at: string;
};

export function bowlsAfter(outcomes: BowlOutcome[], maxBowls: number): number {
  let survived = 0;
  let touchers = 0;
  for (const o of outcomes) {
    if (o === "survived") survived += 1;
    else if (o === "toucher") touchers += 1;
  }
  // touchers survive AND each restores one previously lost bowl
  return Math.min(maxBowls, survived + touchers * 2);
}

export function summariseKeepItUp(ends: KeepItUpEnd[]): KeepItUpBreakdown["per_bowl"] {
  const init = () => ({ attempts: 0, survived: 0, touchers: 0 });
  const per = { bowl1: init(), bowl2: init(), bowl3: init(), bowl4: init() } as KeepItUpBreakdown["per_bowl"];
  const slots: (keyof KeepItUpBreakdown["per_bowl"])[] = ["bowl1", "bowl2", "bowl3", "bowl4"];
  for (const end of ends) {
    end.outcomes.forEach((o, i) => {
      if (i > 3) return;
      const slot = per[slots[i]];
      slot.attempts += 1;
      if (o === "survived" || o === "toucher") slot.survived += 1;
      if (o === "toucher") slot.touchers += 1;
    });
  }
  return per;
}

export type ChallengeStats = {
  attempts: number;
  best: number | null;
  average: number | null;
  last10: ChallengeResult[];
  trend: "up" | "down" | "flat" | "none";
};

export function challengeStats(results: ChallengeResult[]): ChallengeStats {
  if (results.length === 0) return { attempts: 0, best: null, average: null, last10: [], trend: "none" };
  const sorted = [...results].sort((a, b) => +new Date(b.played_at) - +new Date(a.played_at));
  const last10 = sorted.slice(0, 10);
  const scores = results.map((r) => r.score);
  const best = Math.max(...scores);
  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  let trend: ChallengeStats["trend"] = "flat";
  if (last10.length >= 4) {
    const half = Math.floor(last10.length / 2);
    const recent = last10.slice(0, half);
    const older = last10.slice(half);
    const avg = (xs: ChallengeResult[]) => xs.reduce((s, r) => s + r.score, 0) / xs.length;
    const diff = avg(recent) - avg(older);
    if (diff > 0.25) trend = "up";
    else if (diff < -0.25) trend = "down";
  }
  return { attempts: results.length, best, average, last10, trend };
}

// Active-session storage (separate key from drills so timers don't collide)
const CHALLENGE_SESSION_KEY = "bowls.activeChallenge.v1";
type ActiveChallengeSessions = Record<string, string>; // challengeId -> ISO start

function readChallengeSessions(): ActiveChallengeSessions {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CHALLENGE_SESSION_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function writeChallengeSessions(s: ActiveChallengeSessions) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHALLENGE_SESSION_KEY, JSON.stringify(s));
}
export function ensureChallengeStart(challengeId: string): string {
  const all = readChallengeSessions();
  if (!all[challengeId]) {
    all[challengeId] = new Date().toISOString();
    writeChallengeSessions(all);
  }
  return all[challengeId];
}
export function clearChallengeStart(challengeId: string) {
  const all = readChallengeSessions();
  delete all[challengeId];
  writeChallengeSessions(all);
}
