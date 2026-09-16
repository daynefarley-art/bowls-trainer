import {
  practicePriorities,
  skillAreaForDrill,
  SKILL_AREA_LABELS,
  type Drill,
  type Result,
  type SkillAreaKey,
} from "@/lib/bowls";
import type { ExerciseVariant, NewBlockInput, TrainerBlock } from "@/lib/trainer";

// ─────────────────────────────────────────────────────────────────────────────
// Bowls Trainer session generator.
//
// This does NOT introduce a new recommendation engine. It translates the
// EXISTING improvement recommendations (practicePriorities / skill-area scores
// in bowls.ts) into a structured, ~30 minute block plan, choosing drills and
// variants out of the exercise_variants catalogue.
//
// Everything about "which variant" is data-driven: adding rows to
// exercise_variants immediately gives the generator new options, with no code
// change here.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SESSION_MINUTES = 30;

type MinResult = Pick<Result, "drill_id" | "percentage" | "bsi" | "played_at">;

export type GeneratedPlan = {
  focusAreas: SkillAreaKey[];
  plannedMinutes: number;
  blocks: NewBlockInput[];
  meta: Record<string, unknown>;
};

// ─── Anti-repetition memory ──────────────────────────────────────────────────

const HISTORY_HALF_LIFE_DAYS = 10;

export type RepetitionMemory = {
  /** variantId -> recency weight (1 = just used, →0 as it ages out) */
  variantRecency: Map<string, number>;
  /** drillId -> recency weight */
  exerciseRecency: Map<string, number>;
  /** ordered variant-id signatures of the most recent sessions */
  recentSignatures: string[];
};

function recencyWeight(iso: string | null): number {
  if (!iso) return 0;
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 1;
  return Math.pow(0.5, days / HISTORY_HALF_LIFE_DAYS);
}

/** Build the cross-session memory used to damp down repeats. */
export function buildRepetitionMemory(recentBlocks: TrainerBlock[]): RepetitionMemory {
  const variantRecency = new Map<string, number>();
  const exerciseRecency = new Map<string, number>();
  const bySession = new Map<string, TrainerBlock[]>();

  for (const b of recentBlocks) {
    const w = recencyWeight(b.completed_at ?? b.started_at ?? null);
    if (b.exercise_variant_id) {
      variantRecency.set(b.exercise_variant_id, Math.max(variantRecency.get(b.exercise_variant_id) ?? 0, w));
    }
    if (b.exercise_id) {
      exerciseRecency.set(b.exercise_id, Math.max(exerciseRecency.get(b.exercise_id) ?? 0, w));
    }
    const arr = bySession.get(b.session_id) ?? [];
    arr.push(b);
    bySession.set(b.session_id, arr);
  }

  const recentSignatures = [...bySession.values()]
    .map((blocks) =>
      blocks
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
        .map((b) => b.exercise_variant_id ?? b.exercise_slug ?? "?")
        .join(">"),
    )
    .slice(0, 6);

  return { variantRecency, exerciseRecency, recentSignatures };
}

// ─── Variant selection ───────────────────────────────────────────────────────

type Candidate = { variant: ExerciseVariant; drill: Drill; score: number };

/**
 * Score every active variant for a target skill area. Recent usage *reduces
 * priority* rather than disqualifying — a weakness can be trained repeatedly,
 * but the drill/variant/hand/length should keep moving.
 */
function rankCandidates(args: {
  area: SkillAreaKey;
  drills: Drill[];
  variants: ExerciseVariant[];
  memory: RepetitionMemory;
  results: MinResult[];
  usedVariantIds: Set<string>;
  usedDrillIds: Set<string>;
  targetDifficulty: number;
}): Candidate[] {
  const drillById = new Map(args.drills.map((d) => [d.id, d]));
  const avgByDrill = new Map<string, number>();
  for (const d of args.drills) {
    const vals = args.results
      .filter((r) => r.drill_id === d.id)
      .map((r) => (r.bsi != null ? Number(r.bsi) : r.percentage != null ? Number(r.percentage) : NaN))
      .filter((v) => Number.isFinite(v));
    if (vals.length) avgByDrill.set(d.id, vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  const out: Candidate[] = [];
  for (const v of args.variants) {
    const drill = drillById.get(v.exercise_id);
    if (!drill) continue;
    const drillArea = skillAreaForDrill(drill.slug);
    const matches = v.target_skill === args.area || drillArea === args.area;
    if (!matches) continue;

    let score = 100;
    // Difficulty progression: prefer variants near the player's current level.
    score -= Math.abs(v.difficulty - args.targetDifficulty) * 9;
    // Cross-session anti-repetition.
    score -= (args.memory.variantRecency.get(v.id) ?? 0) * 55;
    score -= (args.memory.exerciseRecency.get(drill.id) ?? 0) * 22;
    // Within-session anti-repetition.
    if (args.usedVariantIds.has(v.id)) score -= 1000;
    if (args.usedDrillIds.has(drill.id)) score -= 40;
    // Nudge towards drills the player has neglected or scores poorly in.
    const avg = avgByDrill.get(drill.id);
    if (avg == null) score += 12;
    else score += Math.max(0, (70 - avg) * 0.4);
    // Deterministic-ish jitter so equal candidates rotate.
    score += Math.random() * 8;

    out.push({ variant: v, drill, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ─── Difficulty progression ──────────────────────────────────────────────────

/** 1–5 target difficulty derived from the player's recent scoring in that area. */
function targetDifficultyFor(area: SkillAreaKey, results: MinResult[], drills: Drill[]): number {
  const ids = new Set(drills.filter((d) => skillAreaForDrill(d.slug) === area).map((d) => d.id));
  const vals = results
    .filter((r) => ids.has(r.drill_id))
    .map((r) => (r.bsi != null ? Number(r.bsi) : r.percentage != null ? Number(r.percentage) : NaN))
    .filter((v) => Number.isFinite(v));
  if (!vals.length) return 2;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg >= 80) return 5;
  if (avg >= 70) return 4;
  if (avg >= 55) return 3;
  if (avg >= 40) return 2;
  return 1;
}

// ─── Coaching groups ─────────────────────────────────────────────────────────
// Closely related skills are grouped so a short session doesn't end up stacked
// with three variations of the same coaching need (upshot + running + drive).

export type CoachingGroup = "draw" | "weight" | "attacking" | "jack";

const AREA_GROUP: Record<SkillAreaKey, CoachingGroup> = {
  draw: "draw",
  weight: "weight",
  upshots: "attacking",
  running: "attacking",
  driving: "attacking",
  jack: "jack",
};

const GROUP_THEME: Record<CoachingGroup, string> = {
  draw: "Draw accuracy",
  weight: "Weight control",
  attacking: "Attacking shots",
  jack: "Jack delivery",
};

export function groupForArea(area: SkillAreaKey): CoachingGroup {
  return AREA_GROUP[area] ?? "draw";
}

/**
 * Short coaching-purpose summary for the dashboard, e.g.
 * "Attacking shots & draw accuracy" — never a list of drill names.
 */
export function coachingFocusSummary(areas: (SkillAreaKey | string)[]): string {
  const themes: string[] = [];
  for (const a of areas) {
    const g = AREA_GROUP[a as SkillAreaKey];
    if (!g) continue;
    const t = GROUP_THEME[g];
    if (!themes.includes(t)) themes.push(t);
  }
  if (!themes.length) return "General practice";
  const [first, ...rest] = themes.slice(0, 2);
  return rest.length ? `${first} & ${rest[0]!.toLowerCase()}` : first!;
}

// ─── Session shape ───────────────────────────────────────────────────────────
// Coaching roles rather than "slots to fill". Block counts stay small on
// purpose: 30 min = 3 blocks, 45 = 4, 60 = 5.

type BlockRole = "warmup" | "primary" | "secondary" | "progression" | "finisher";
type BlockRecipe = { role: BlockRole; type: string; minutes: number };

const RECIPE_30_MIN: BlockRecipe[] = [
  { role: "warmup", type: "warmup", minutes: 5 },
  { role: "primary", type: "focus", minutes: 14 },
  { role: "secondary", type: "focus", minutes: 11 },
];

const RECIPE_45_MIN: BlockRecipe[] = [
  { role: "warmup", type: "warmup", minutes: 6 },
  { role: "primary", type: "focus", minutes: 15 },
  { role: "secondary", type: "focus", minutes: 12 },
  { role: "progression", type: "focus", minutes: 12 },
];

const RECIPE_60_MIN: BlockRecipe[] = [
  { role: "warmup", type: "warmup", minutes: 6 },
  { role: "primary", type: "focus", minutes: 16 },
  { role: "progression", type: "focus", minutes: 13 },
  { role: "secondary", type: "focus", minutes: 13 },
  { role: "finisher", type: "challenge", minutes: 12 },
];

export const SESSION_DURATION_OPTIONS = [30, 45, 60] as const;
export type SessionDuration = (typeof SESSION_DURATION_OPTIONS)[number];

/** Pick the block recipe for the requested duration (nearest supported). */
export function recipeForMinutes(minutes: number): BlockRecipe[] {
  if (minutes >= 55) return RECIPE_60_MIN;
  if (minutes >= 40) return RECIPE_45_MIN;
  return RECIPE_30_MIN;
}

function endsFor(drill: Drill, minutes: number): number {
  const perEnd = drill.bowls_per_end || 4;
  const configured = drill.scoring_config?.ends ?? Math.max(1, Math.round((drill.max_score / 20) / (perEnd / 4)));
  return Math.max(1, Math.min(configured || 4, Math.max(2, Math.round(minutes / 2))));
}

// ─── Coaching language ───────────────────────────────────────────────────────

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}

function reasonFor(role: BlockRole, area: SkillAreaKey, variant: ExerciseVariant, seed: number): string {
  const label = SKILL_AREA_LABELS[area].toLowerCase();
  const theme = GROUP_THEME[groupForArea(area)].toLowerCase();
  switch (role) {
    case "warmup":
      return pick(
        [
          "Build rhythm and find your line before the focused work.",
          "An easy draw start to settle your weight and feel.",
          "Groove your delivery before today's main work.",
        ],
        seed,
      );
    case "primary":
      return pick(
        [
          `Today's main focus — your ${theme} results have the most room to move.`,
          `The biggest gain available right now is in your ${theme}, so it gets the most time today.`,
          `Main block: sustained work on ${theme} to build consistency.`,
        ],
        seed,
      );
    case "progression":
      return pick(
        [
          `Steps the ${theme} work up a level now that you're warm.`,
          `A harder progression on the same theme to test what you've just practised.`,
        ],
        seed,
      );
    case "secondary":
      return pick(
        [
          `Balances the session with some ${label} work.`,
          `Complementary ${theme} work to round out the session.`,
        ],
        seed,
      );
    default:
      return pick(
        [
          `Finish under a little pressure using the ${variant.name.toLowerCase()} setup.`,
          "A short finisher to consolidate what you've worked on.",
        ],
        seed,
      );
  }
}

// ─── Warm-up selection ───────────────────────────────────────────────────────
// A warm-up is preparation, not a prescription: prefer an easy draw variant
// that leaves the hand free rather than something like "forehand only".

function pickWarmup(args: {
  drills: Drill[];
  variants: ExerciseVariant[];
  memory: RepetitionMemory;
  results: MinResult[];
}): Candidate | null {
  const ranked = rankCandidates({
    area: "draw",
    drills: args.drills,
    variants: args.variants,
    memory: args.memory,
    results: args.results,
    usedVariantIds: new Set(),
    usedDrillIds: new Set(),
    targetDifficulty: 1,
  });
  if (!ranked.length) return null;
  const scored = ranked.map((c) => {
    const hand = (c.variant.setup_parameters as Record<string, unknown>)['hand'];
    const restrictive = hand === "forehand" || hand === "backhand";
    return { c, s: c.score + (restrictive ? -45 : 25) - (c.variant.difficulty - 1) * 10 };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0]!.c;
}

// ─── Generator ───────────────────────────────────────────────────────────────

export function generateTrainerPlan(args: {
  results: MinResult[];
  drills: Drill[];
  variants: ExerciseVariant[];
  memory: RepetitionMemory;
  plannedMinutes?: number;
}): GeneratedPlan | null {
  const { drills, variants, memory } = args;
  if (!drills.length || !variants.length) return null;

  const priorities = practicePriorities(args.results, drills);
  if (!priorities.length) return null;

  const requestedMinutes = args.plannedMinutes ?? DEFAULT_SESSION_MINUTES;
  const recipes = recipeForMinutes(requestedMinutes);

  // Primary = top coaching priority. Secondary = the best priority from a
  // DIFFERENT coaching group, so related attacking skills can't dominate.
  const primary = priorities[0]!.key;
  const primaryGroup = groupForArea(primary);
  const secondary =
    priorities.find((p) => groupForArea(p.key) !== primaryGroup)?.key ??
    priorities[1]?.key ??
    primary;
  const secondaryGroup = groupForArea(secondary);
  const tertiary =
    priorities.find((p) => groupForArea(p.key) !== primaryGroup && groupForArea(p.key) !== secondaryGroup)?.key ??
    secondary;

  const usedVariantIds = new Set<string>();
  const usedDrillIds = new Set<string>();
  const blocks: NewBlockInput[] = [];
  const focusAreas: SkillAreaKey[] = [];
  const seed = Math.floor(Math.random() * 997);

  recipes.forEach((recipe, i) => {
    const area: SkillAreaKey =
      recipe.role === "warmup"
        ? "draw"
        : recipe.role === "primary" || recipe.role === "progression"
          ? primary
          : recipe.role === "secondary"
            ? secondary
            : tertiary;

    const baseDifficulty = targetDifficultyFor(area, args.results, drills);
    const targetDifficulty =
      recipe.role === "warmup"
        ? 1
        : recipe.role === "progression" || recipe.role === "finisher"
          ? Math.min(5, baseDifficulty + 1)
          : baseDifficulty;

    let picked: Candidate | null = null;
    if (recipe.role === "warmup") {
      picked = pickWarmup({ drills, variants, memory, results: args.results });
    }
    if (!picked) {
      let ranked = rankCandidates({
        area,
        drills,
        variants,
        memory,
        results: args.results,
        usedVariantIds,
        usedDrillIds,
        targetDifficulty,
      });
      if (!ranked.length) {
        for (const p of priorities) {
          ranked = rankCandidates({
            area: p.key,
            drills,
            variants,
            memory,
            results: args.results,
            usedVariantIds,
            usedDrillIds,
            targetDifficulty,
          });
          if (ranked.length) break;
        }
      }
      picked = ranked[0] ?? null;
    }
    if (!picked) return;

    usedVariantIds.add(picked.variant.id);
    usedDrillIds.add(picked.drill.id);
    if (recipe.role !== "warmup" && !focusAreas.includes(area)) focusAreas.push(area);

    blocks.push({
      sequence: blocks.length + 1,
      block_type: recipe.type,
      exercise_id: picked.drill.id,
      exercise_slug: picked.drill.slug,
      exercise_variant_id: picked.variant.id,
      variant_slug: picked.variant.slug,
      title: `${picked.drill.name} — ${picked.variant.name.replace(/^.*— /, "")}`,
      target_skill: area,
      reason: reasonFor(recipe.role, area, picked.variant, seed + i),
      planned_minutes: recipe.minutes,
      planned_ends: endsFor(picked.drill, recipe.minutes),
      config: {
        block_role: recipe.role,
        setup_parameters: picked.variant.setup_parameters,
        scoring_parameters: picked.variant.scoring_parameters,
        difficulty: picked.variant.difficulty,
        variant_name: picked.variant.name,
        variant_description: picked.variant.description,
      },
    });
  });

  if (blocks.length < 2) return null;

  const signature = blocks.map((b) => b.exercise_variant_id ?? b.exercise_slug).join(">");
  const structurallyRepeated = memory.recentSignatures.includes(signature);

  // The real planned duration is the sum of the blocks we could actually fill —
  // a block that found no variant must not be billed as practice time.
  const estimatedMinutes = blocks.reduce((sum, b) => sum + (b.planned_minutes ?? 0), 0);
  const finalFocus = focusAreas.length ? focusAreas : [primary];

  return {
    focusAreas: finalFocus,
    plannedMinutes: estimatedMinutes || requestedMinutes,
    blocks,
    meta: {
      signature,
      structurallyRepeated,
      generator: "v3",
      requestedMinutes,
      estimatedMinutes,
      primaryFocus: primary,
      secondaryFocus: secondary,
      focusSummary: coachingFocusSummary(finalFocus),
      priorities: priorities.slice(0, 3),
    },
  };
}

/**
 * Generate, then regenerate a couple of times if the shape matched a recent
 * session — order and variant jitter usually break the tie.
 */
export function generateVariedTrainerPlan(args: Parameters<typeof generateTrainerPlan>[0]): GeneratedPlan | null {
  let best: GeneratedPlan | null = null;
  for (let i = 0; i < 4; i++) {
    const plan = generateTrainerPlan(args);
    if (!plan) return best;
    best = plan;
    if (!plan.meta['structurallyRepeated']) return plan;
  }
  return best;
}

