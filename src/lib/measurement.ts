/**
 * MEASUREMENT VERSIONING — single authoritative definition.
 *
 * Every Visual Target / Head Scan result carries a measurement version inside
 * its existing `breakdown` JSONB. No database column and no migration is
 * required, and NOTHING is ever backfilled.
 *
 *   measure_v absent  → V1 (legacy). Frozen forever, interpreted exactly as
 *                       it always was.
 *   measure_v === 2   → V2. Distances mean an ESTIMATED (manual) or MEASURED
 *                       (Head Scan) edge-to-edge gap between the outer edge of
 *                       the jack and the nearest outer edge of the bowl.
 *
 * IMPORTANT: the coordinate space and the scoring band boundaries are
 * IDENTICAL in V1 and V2 (0.5 / 1.0 / 2.0 mat units → 5 / 3 / 1 / 0 points).
 * V2 changes what the number MEANS physically (edge-to-edge at 600 mm per
 * mat), not how a coordinate is scored. That is why stamping measure_v cannot
 * alter a single historical score, BSI value, personal best, statistic or
 * replay: no legacy row is touched and no legacy threshold is changed.
 *
 * USER-FACING RULE: users only ever see MATS. Millimetres, centimetres, bowl
 * diameter/radius and any other physical object dimension must never appear in
 * the UI. The mm constants below are internal calibration only.
 */

export type MeasureVersion = 1 | 2;

/** Version stamped onto every NEW Visual Target / Head Scan result. */
export const CURRENT_MEASURE_V: MeasureVersion = 2;

/** Internal calibration only — never render these to the user. */
export const MM_PER_MAT = 600;
export const V2_BAND_MM = { half: 300, one: 600, two: 1200 } as const;

/** Mat-unit band boundaries. Shared by manual Visual Target and Head Scan. */
export const BAND_MATS = { half: 0.5, one: 1.0, two: 2.0 } as const;

/** Points per band. Authoritative for V2; identical to the frozen V1 table. */
export const BAND_POINTS = { half: 5, one: 3, two: 1, outside: 0 } as const;

/**
 * Read the measurement version of a stored breakdown.
 * Absent ⇒ 1 (legacy). Never assume 2 for old data.
 */
export function measureVersionOf(breakdown: unknown): MeasureVersion {
  const v = (breakdown as { measure_v?: unknown } | null | undefined)?.measure_v;
  return v === 2 ? 2 : 1;
}

export function isV2(breakdown: unknown): boolean {
  return measureVersionOf(breakdown) === 2;
}

/**
 * Version pinning for saved/paused practices. A practice created before this
 * deployment has no `measure_v` in its stored state, so it stays V1 for its
 * entire life even when resumed afterwards. A practice created after this
 * deployment carries `measure_v: 2` in its state from the very first save.
 *
 * `practiceState` is the practice_activities.state JSONB (null when the
 * recorder is not tracking a practice — in that case the result is new and
 * therefore V2).
 */
export function measureVersionForPractice(practiceState: unknown): MeasureVersion {
  if (practiceState == null || typeof practiceState !== "object") return CURRENT_MEASURE_V;
  const raw = practiceState as Record<string, unknown>;
  // An empty state object means the row was only just created by this build.
  if (Object.keys(raw).length === 0) return CURRENT_MEASURE_V;
  return raw.measure_v === 2 ? 2 : 1;
}

/**
 * USER-FACING mat wording for a distance in mat units.
 * The single source of truth for how a scoring distance is described anywhere
 * in the app — Visual Target, Head Scan, end review, summaries, coaching.
 */
export function matBandLabel(distanceMats: number, bandScale = 1): string {
  const s = bandScale > 0 ? bandScale : 1;
  if (distanceMats <= 0) return "Touching";
  if (distanceMats <= BAND_MATS.half * s) return "Within 1/2 mat";
  if (distanceMats <= BAND_MATS.one * s) return "Within 1 mat";
  if (distanceMats <= BAND_MATS.two * s) return "Within 2 mats";
  return "Over 2 mats";
}

export function matBandPoints(distanceMats: number, bandScale = 1): number {
  const s = bandScale > 0 ? bandScale : 1;
  if (distanceMats <= BAND_MATS.half * s) return BAND_POINTS.half;
  if (distanceMats <= BAND_MATS.one * s) return BAND_POINTS.one;
  if (distanceMats <= BAND_MATS.two * s) return BAND_POINTS.two;
  return BAND_POINTS.outside;
}

/** e.g. "Within 1 mat · 3 pts" — the only readout shown for V2 entry. */
export function matBandReadout(distanceMats: number, bandScale = 1): string {
  const pts = matBandPoints(distanceMats, bandScale);
  const label = matBandLabel(distanceMats, bandScale);
  const suffix = bandScale === 1 ? "" : " · narrow";
  return `${label} · ${pts} ${pts === 1 ? "pt" : "pts"}${suffix}`;
}

/** Standard (unscaled) mat wording — unchanged from V1/V2 and used everywhere
 *  outside a narrowed-target prescription. */
export function standardMatBandLabel(distanceMats: number): string {
  if (distanceMats <= 0) return "Touching";
  if (distanceMats <= BAND_MATS.half) return "Within 1/2 mat";
  if (distanceMats <= BAND_MATS.one) return "Within 1 mat";
  if (distanceMats <= BAND_MATS.two) return "Within 2 mats";
  return "Over 2 mats";
}

/** Head Scan: internal mm gap → user-facing mat wording. Never show the mm. */
export function matBandLabelFromMm(gapMm: number): string {
  return standardMatBandLabel(gapMm / MM_PER_MAT);
}
