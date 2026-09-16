/**
 * GENERIC PRACTICE PRESCRIPTION CONCEPTS.
 *
 * These are recorder-level concepts, deliberately NOT Bowls-Trainer specific:
 * anything (Trainer, a coach plan, a future challenge builder) can hand a
 * recorder a prescription and the recorder behaves accordingly.
 *
 * Nothing here changes scoring maths. Target mode only scales the EXISTING
 * band boundaries; weight intent and progression are prescribed delivery
 * instructions that are displayed and recorded, never scored separately.
 *
 * When no prescription is supplied every value is null/undefined and the
 * recorders behave exactly as they always have.
 */

export type TargetMode = "standard" | "narrow";
export type WeightIntent = "normal" | "yard_on" | "heavy";
export type ProgressionMode = "ascending" | "descending" | "random";

/**
 * Narrow scales the existing scoring rings to 75% of their standard radius.
 * Bands, keys and points are untouched — only the tolerance tightens.
 */
export const NARROW_BAND_SCALE = 0.75;

export function bandScaleForTarget(mode: TargetMode | null | undefined): number {
  return mode === "narrow" ? NARROW_BAND_SCALE : 1;
}

export function targetModeLabel(mode: TargetMode | null | undefined): string | null {
  if (mode === "narrow") return "Narrow";
  if (mode === "standard") return "Standard";
  return null;
}

export function weightIntentLabel(w: WeightIntent | null | undefined): string | null {
  if (w === "yard_on") return "Yard-on";
  if (w === "heavy") return "Heavy";
  if (w === "normal") return "Normal";
  return null;
}

export function progressionLabel(p: ProgressionMode | null | undefined): string | null {
  if (!p) return null;
  return p.charAt(0).toUpperCase() + p.slice(1);
}

// ─── Parsing (tolerant — config strings come from a catalogue, not an enum) ───

export function parseTargetMode(v: unknown): TargetMode | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "narrow" || s === "tight") return "narrow";
  if (s === "standard" || s === "normal" || s === "wide") return "standard";
  return null;
}

export function parseWeightIntent(v: unknown): WeightIntent | null {
  const s = typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  if (s === "yard_on" || s === "yardon") return "yard_on";
  if (s === "heavy" || s === "drive" || s === "running") return "heavy";
  if (s === "normal" || s === "draw") return "normal";
  return null;
}

export function parseProgression(v: unknown): ProgressionMode | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "ascending" || s === "up") return "ascending";
  if (s === "descending" || s === "down") return "descending";
  if (s === "random" || s === "shuffled") return "random";
  return null;
}

// ─── Drill capability tables ────────────────────────────────────────────────

/**
 * Drills whose scoring uses the shared Visual Target mat bands, and can
 * therefore honour a narrower scoring tolerance. Anything not listed keeps
 * target width purely instructional.
 */
const TARGET_WIDTH_DRILLS = new Set(["short-draw", "medium-draw", "long-draw", "weight-control-ladder"]);

export function supportsTargetWidth(slug: string | null | undefined): boolean {
  return !!slug && TARGET_WIDTH_DRILLS.has(slug);
}

/**
 * Ordered distance/position steps a drill genuinely has. Progression can only
 * reorder something that exists — drills without steps keep progression
 * instructional.
 */
const PROGRESSION_STEPS: Record<string, string[]> = {
  "weight-control-ladder": ["Short", "Medium", "Long"],
};

export function progressionStepsFor(slug: string | null | undefined): string[] {
  return (slug && PROGRESSION_STEPS[slug]) || [];
}

export function supportsProgression(slug: string | null | undefined): boolean {
  return progressionStepsFor(slug).length > 1;
}

/**
 * Drills where a prescribed delivery weight is meaningful. Weight intent is
 * label-only everywhere — no sensor inference, no separate scoring.
 */
const WEIGHT_INTENT_DRILLS = new Set([
  "short-draw",
  "medium-draw",
  "long-draw",
  "weight-control-ladder",
  "slimed",
  "switch-32",
]);

export function supportsWeightIntent(slug: string | null | undefined): boolean {
  return !!slug && WEIGHT_INTENT_DRILLS.has(slug);
}

// ─── Deterministic progression ordering ─────────────────────────────────────

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ordered step indices for a prescribed progression.
 *  ascending  → 0,1,2,…   (easiest/nearest → hardest/furthest)
 *  descending → reverse
 *  random     → Fisher–Yates seeded by `seed` (the block id), so reopening,
 *               resuming or restarting the app reproduces the SAME order
 *               with no extra persisted state.
 */
export function progressionOrder(
  mode: ProgressionMode | null | undefined,
  count: number,
  seed: string,
): number[] {
  const base = Array.from({ length: Math.max(0, count) }, (_, i) => i);
  if (!mode || mode === "ascending") return base;
  if (mode === "descending") return base.reverse();
  const rnd = mulberry32(hashSeed(seed || "progression"));
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base;
}

/**
 * Prescribed step label for each delivery slot, cycling the ordered steps.
 * Returns [] when the drill has no steps (progression stays instructional).
 */
export function prescribedStepLabels(
  slug: string | null | undefined,
  mode: ProgressionMode | null | undefined,
  slots: number,
  seed: string,
): string[] {
  const steps = progressionStepsFor(slug);
  if (steps.length < 2 || !mode) return [];
  const order = progressionOrder(mode, steps.length, seed);
  return Array.from({ length: slots }, (_, i) => steps[order[i % order.length]]);
}
