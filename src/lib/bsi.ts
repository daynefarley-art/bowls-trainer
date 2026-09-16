/**
 * ============================================================
 * CANONICAL BOWLS SKILL INDEX (BSI) ENGINE
 * ============================================================
 *
 * This module is the ONE place where BSI is calculated. Drill and
 * challenge recorders supply raw outcome data; they never invent BSI
 * mathematics of their own.
 *
 * The model has exactly three stages:
 *
 *   1. OUTCOME NORMALISATION
 *      Every recordable outcome of a drill maps to a per-bowl
 *      "execution quality" value on a 0–100 scale. The average of a
 *      session's per-bowl values is the RAW PERFORMANCE SCORE.
 *      Drills with no per-bowl outcome map fall back to the drill's
 *      own raw percentage.
 *
 *   2. DIFFICULTY NORMALISATION
 *      raw is passed through a single monotonic gamma curve:
 *
 *          bsi = 100 * (raw / 100) ^ gamma(skill)
 *
 *      gamma < 1 lifts a hard skill, gamma = 1 is the neutral
 *      baseline (draw bowling). The curve is order-preserving,
 *      anchored at 0 -> 0 and 100 -> 100, so it can never break
 *      monotonicity nor exceed the cap.
 *
 *   3. CAP / ROUNDING
 *      Clamped to 0–100 and rounded to one decimal.
 *
 * Design rules:
 *   - no hidden bonuses
 *   - no drill-specific special cases outside the tables below
 *   - drill SCORING is untouched; only its BSI interpretation lives here
 */

// ------------------------------------------------------------------
// 1. OUTCOME → per-bowl execution quality (0–100)
// ------------------------------------------------------------------

/**
 * Draw-family anchors. A bowl inside half a mat is near-perfect
 * execution; a reliable one-mat bowl is advanced; two mats is
 * competent club standard.
 */
export const DRAW_OUTCOME_BSI = {
  half_mat: 95,
  one_mat: 82,
  two_mats: 60,
  outside_two_mats: 0,
} as const;

/**
 * Per-bowl outcome maps, keyed by drill slug then by the
 * `scoring_config.categories[].key` stored in the database.
 * Values are execution quality, NOT drill points.
 */
export const OUTCOME_BSI: Record<string, Record<string, number>> = {
  // --- Draw Accuracy (baseline difficulty) ---
  "short-draw": { ...DRAW_OUTCOME_BSI },
  "medium-draw": { ...DRAW_OUTCOME_BSI },
  "long-draw": { ...DRAW_OUTCOME_BSI },
  "lead-drill": { ...DRAW_OUTCOME_BSI },

  // --- Weight Control (same spatial anchors as draw) ---
  "weight-control-ladder": { ...DRAW_OUTCOME_BSI },

  // --- Jack Delivery ---
  "jack-delivery-accuracy": {
    perfect: 95,
    acceptable: 70,
    miss: 0,
  },

  // --- Drive (attacking, high difficulty) ---
  "drive-accuracy": {
    full_hit: 100,
    movement: 80, // jack moved / deflected — clear drive competence
    channel: 55, // correct drive line, no contact — meaningful partial
    miss: 0,
  },

  // --- Upshot / Conversion (attacking, high difficulty) ---
  "upshot-drill": {
    remove_hold: 100,
    remove: 82,
    contact: 62,
    target_zone: 40, // correct attacking weight, no contact
    miss: 0,
  },

  "running-shot-drill": {
    move_remain: 100,
    full_contact: 80,
    disturb: 60,
    miss: 0,
  },
};

// ------------------------------------------------------------------
// 2. DIFFICULTY COEFFICIENTS (gamma)
// ------------------------------------------------------------------

/** Neutral baseline — draw bowling defines the BSI scale. */
export const BASELINE_GAMMA = 1;

/**
 * gamma < 1 => harder skill, raw performance is lifted.
 * Chosen so that an equivalent standard of execution produces a
 * comparable BSI across skills (see bsi.test.ts calibration table).
 */
export const SKILL_DIFFICULTY: Record<string, number> = {
  "short-draw": 1,
  "medium-draw": 1,
  "long-draw": 1,
  "lead-drill": 1,
  "weight-control-ladder": 1,
  "jack-delivery-accuracy": 0.95,
  "running-shot-drill": 0.75,
  "drive-accuracy": 0.72,
  "upshot-drill": 0.72,
  "jack-in-ditch": 0.75,
};

export function difficultyFor(slug: string | null | undefined): number {
  if (!slug) return BASELINE_GAMMA;
  return SKILL_DIFFICULTY[slug] ?? BASELINE_GAMMA;
}

/** Stage 2: monotonic difficulty normalisation, anchored at 0 and 100. */
export function applyDifficulty(raw: number, slug: string | null | undefined): number {
  const r = clamp(raw);
  if (r <= 0) return 0;
  const gamma = difficultyFor(slug);
  if (gamma === 1) return r;
  return clamp(100 * Math.pow(r / 100, gamma));
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ------------------------------------------------------------------
// Raw performance extraction
// ------------------------------------------------------------------

type Breakdown = unknown;

/** Points → draw execution quality, for per-bowl draw breakdowns. */
export function drawQualityForPoints(points: number): number {
  if (points >= 5) return DRAW_OUTCOME_BSI.half_mat;
  if (points >= 3) return DRAW_OUTCOME_BSI.one_mat;
  if (points >= 1) return DRAW_OUTCOME_BSI.two_mats;
  return 0;
}

/**
 * Stage 1. Returns the average per-bowl execution quality (0–100),
 * or null when the breakdown carries no usable outcome data.
 *
 * Two supported breakdown shapes:
 *   - `{ bowls: [{ points }] }`  (draw recorders, per-bowl)
 *   - `{ [categoryKey]: count }` (count recorders)
 */
export function rawPerformance(
  slug: string | null | undefined,
  breakdown: Breakdown,
): number | null {
  if (!slug || breakdown == null || typeof breakdown !== "object") return null;
  const bd = breakdown as Record<string, unknown>;
  const map = OUTCOME_BSI[slug];

  // Per-bowl shape (draw drills).
  const bowls = bd.bowls;
  if (Array.isArray(bowls) && bowls.length) {
    const vals = (bowls as Array<{ points?: number; outcome?: string }>)
      .map((b) => {
        if (b && typeof b.outcome === "string" && map && map[b.outcome] != null) {
          return map[b.outcome];
        }
        if (b && typeof b.points === "number") return drawQualityForPoints(b.points);
        return null;
      })
      .filter((v): v is number => v != null);
    if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  // Count shape.
  if (!map) return null;
  let bowlCount = 0;
  let total = 0;
  for (const [key, quality] of Object.entries(map)) {
    const n = Number(bd[key] ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    bowlCount += n;
    total += n * quality;
  }
  if (bowlCount <= 0) return null;
  return total / bowlCount;
}

// ------------------------------------------------------------------
// Public entry point — the ONLY way to produce a result BSI
// ------------------------------------------------------------------

/**
 * Canonical BSI for a single drill result.
 *
 * @param slug       drill slug
 * @param breakdown  stored outcome breakdown
 * @param percentage the drill's own raw score percentage (fallback)
 */
export function computeBSI(
  slug: string | null | undefined,
  breakdown: Breakdown,
  percentage: number,
): number {
  const raw = rawPerformance(slug, breakdown) ?? clamp(percentage);
  return round1(applyDifficulty(raw, slug));
}

/** Raw (pre-difficulty) performance score, exposed for diagnostics/tests. */
export function rawBSIScore(
  slug: string | null | undefined,
  breakdown: Breakdown,
  percentage: number,
): number {
  return round1(rawPerformance(slug, breakdown) ?? clamp(percentage));
}

// ------------------------------------------------------------------
// 3. OVERALL BSI — rolling aggregation
// ------------------------------------------------------------------

/**
 * Confidence constant for per-drill shrinkage.
 *
 * A drill with very few recorded results is a noisy estimate of the
 * player's ability in that skill, yet it enters the overall index at
 * full drill weight. That is what makes a first attempt at a hard
 * skill dominate the overall number.
 *
 * We shrink each drill mean toward the player's weighted mean across
 * their other drills by n / (n + K). With K = 2, a single result
 * carries 1/3 of its drill weight, three results carry 60%, and by
 * eight results the estimate is essentially unshrunk. This is a
 * standard empirical-Bayes adjustment: it never clamps direction, so
 * a genuinely poor session still lowers the index — just proportionally
 * to how much evidence there is.
 */
export const DRILL_CONFIDENCE_K = 2;

export type DrillMean = { drillId: string; weight: number; mean: number; count: number };

/** Weighted, confidence-shrunk overall BSI from per-drill means. */
export function aggregateOverallBSI(means: DrillMean[]): number {
  const usable = means.filter((m) => m.count > 0 && m.weight > 0);
  if (!usable.length) return 0;

  const totalWeight = usable.reduce((s, m) => s + m.weight, 0);
  const prior = usable.reduce((s, m) => s + m.mean * m.weight, 0) / totalWeight;

  let weighted = 0;
  for (const m of usable) {
    const confidence = m.count / (m.count + DRILL_CONFIDENCE_K);
    const shrunk = confidence * m.mean + (1 - confidence) * prior;
    weighted += shrunk * m.weight;
  }
  return round1(clamp(weighted / totalWeight));
}
