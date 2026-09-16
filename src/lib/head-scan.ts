import { classifyTap, type VisualTap } from "@/components/bowls/VisualTarget";
import {
  DEFAULT_FOV_H_DEG,
  DEFAULT_PRINCIPAL_POINT_X,
  OVERHEAD_PITCH_DEG,
  solveGround,
} from "@/lib/head-scan-geometry";

/**
 * Head Scan V1 — shared configuration + geometry.
 *
 * Head Scan is an ALTERNATIVE INPUT METHOD for the existing Visual Target.
 * It never scores anything itself: it converts photo taps into the same
 * (x, y) mat-unit coordinates that a manual Visual Target tap produces, and
 * hands them straight to `classifyTap`. There is exactly one scoring system.
 *
 * V2 hooks: `HeadScanSuggestion` below is the shape an automatic detector
 * would emit (jack + bowls + confidence). The marking UI consumes plain
 * normalised points, so a detector can pre-fill them without any change to
 * conversion, Visual Target, scoring, BSI or statistics.
 */

/** Normalised image point: 0..1 of the displayed photo, origin top-left. */
export type PhotoPoint = { x: number; y: number };

export type HeadScanBowlStatus = "pending" | "marked" | "not_in_photo" | "unidentified";

export type HeadScanBowlMark = {
  number: number;
  hand: "forehand" | "backhand";
  label?: string;
  status: HeadScanBowlStatus;
  point: PhotoPoint | null;
  /**
   * Measured outside-edge radius of THIS bowl in normalised frame-width units.
   * Captured from the photo by the player; never assumed or configured.
   * null = not measured, so no physical distance can be derived.
   */
  radius: number | null;
  /**
   * UI-ONLY geometry of the detected bowl body (centre + approximate radius).
   * Used to stop a later tap re-selecting an already accepted bowl. It never
   * takes part in measurement.
   */
  lockPoint?: PhotoPoint | null;
  lockRadius?: number | null;
  /** Reserved for V2 automatic detection. */
  confidence?: number;
};


export type HeadScanJack = {
  point: PhotoPoint;
  /** Radius of the jack in normalised image WIDTH units. */
  radius: number;
  confidence?: number;
};

/** V2: an automatic detector would return this and skip straight to review. */
export type HeadScanSuggestion = {
  jack: HeadScanJack | null;
  bowls: Array<{ point: PhotoPoint; confidence: number }>;
};

/** Which end of the photo the player delivered from. */
export type HeadScanOrientation = "mat_bottom" | "mat_top";

/**
 * PHYSICAL MEASUREMENT MODEL (Head Scan only).
 *
 * Every Head Scan distance is EDGE-TO-EDGE: the shortest physical gap between
 * the outside edge of the jack and the outside edge of the bowl. For two
 * circles that is simply
 *
 *   gap = centre-to-centre distance − jack radius − bowl radius
 *
 * Both radii are MEASURED from the photograph by the player (the scale circle
 * on the jack and on each bowl). No bowl diameter is assumed, configured or
 * inferred anywhere — different bowl sizes need no user setting.
 *
 * Real-world scale comes from the one object with a regulation size in the
 * frame: the jack.
 */
// Jack scale (63.5 mm diameter) lives in head-scan-geometry.ts.

/**
 * Physical mat length used for Head Scan scoring thresholds.
 * A bowls mat is 600 mm long, so "within one mat" = 600 mm edge-to-edge.
 *
 * NOTE: this is deliberately NOT the legacy `CM_PER_MAT = 183` constant in
 * VisualTarget.tsx. That value is a legacy Visual Target coordinate/scaling
 * convention baked into existing stored results, personal bests and BSI
 * history. It is flagged for a separate migration/audit and is NOT touched
 * here. Head Scan measures in millimetres independently and only converts to
 * Visual Target coordinates at the very end, for display and review.
 */
export const HEAD_SCAN_MM_PER_MAT = 600;

/**
 * TEMPORARY QA FLAG — raw millimetre readouts inside Head Scan only.
 *
 * Exists purely so a fixed head can be compared against a tape measure and a
 * Bowlometer. It never reaches the database, practice history, analytics or a
 * user profile: the value shown is the SAME `gapMm` that the scoring logic
 * consumes, rendered on screen and nowhere else.
 *
 * Set to false to remove every raw measurement readout from the app.
 */
export const HEAD_SCAN_MEASUREMENT_DEBUG = true;

/** Same hard placement boundary as the Visual Target (in mat units). */
const MAX_R_MAT = 2.6;

/**
 * Drills / challenges where the target stays stationary for the whole end and
 * a single overhead photo of the head is meaningful. Deliberately opt-in:
 * moving-target challenges (e.g. Jack in the Ditch) are NOT listed.
 */
export const HEAD_SCAN_ENABLED_SLUGS: readonly string[] = [
  "short-draw",
  "medium-draw",
  "long-draw",
  "weight-control-ladder",
];

export function isHeadScanEnabled(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return HEAD_SCAN_ENABLED_SLUGS.includes(slug);
}

export type HeadScanMeasurement = {
  /** Shortest physical gap, outer edge of jack → outer edge of bowl (mm). */
  gapMm: number;
  /** Centre-to-centre physical distance (mm) — diagnostic only. */
  centreMm: number;
  /** Measured jack radius in mm (should land near 31.75 mm). */
  jackRadiusMm: number;
  /** Measured bowl radius in mm — from the photo, never assumed. */
  bowlRadiusMm: number;
  /** Visual Target tap carrying the edge-to-edge distance. */
  tap: VisualTap;
};

/**
 * Convert one marked bowl into a physical edge-to-edge measurement plus the
 * equivalent Visual Target coordinate.
 *
 * GEOMETRY (see head-scan-geometry.ts): both the jack centre and the bowl's
 * near edge are back-projected onto the GROUND PLANE before any distance is
 * taken, using the camera pitch recorded when the photo was captured. This is
 * what makes a shot taken from behind the jack measure correctly — the old
 * single flat scale under-read everything beyond the jack.
 *
 * `pitchDeg` = 90 means the phone was straight down; that case reduces exactly
 * to the previous flat model, so overhead scans are numerically unchanged.
 *
 * Only the RADIUS of the Visual Target position carries the gap; the direction
 * comes from the ground-plane vector (lateral = narrow/wide, forward = long).
 * One mat in Visual Target units represents 600 mm of edge-to-edge gap.
 *
 * Returns null when the bowl has no marked point — an un-measurable bowl is
 * left for manual Visual Target placement rather than being invented.
 */
export function measureBowl(
  mark: HeadScanBowlMark,
  jack: HeadScanJack,
  frameAspect: number,
  orientation: HeadScanOrientation = "mat_bottom",
  pitchDeg: number = OVERHEAD_PITCH_DEG,
  /** QA-only override; production always passes the default. */
  fovHDeg: number = DEFAULT_FOV_H_DEG,
  /** CALIBRATION-only independent vertical FOV; production passes nothing. */
  fovVDeg?: number | null,
  /** CALIBRATION-only horizontal optical centre; production passes nothing. */
  principalPointX: number = DEFAULT_PRINCIPAL_POINT_X,
  /** CALIBRATION-only radial distortion coefficient; production passes nothing. */
  k1: number = 0,
): HeadScanMeasurement | null {
  if (!mark.point || mark.radius == null || mark.radius <= 0) return null;

  const aspect = frameAspect > 0 ? frameAspect : 1;
  const sol = solveGround(
    { x: jack.point.x, y: jack.point.y, radius: jack.radius },
    mark.point,
    aspect,
    pitchDeg,
    fovHDeg,
    fovVDeg,
    principalPointX,
    k1,
  );



  // The marked point is the bowl's NEAREST OUTSIDE EDGE, so its own radius is
  // effectively zero. A legacy mark that stored a body radius still has it
  // subtracted, keeping the measurement edge-to-edge either way.
  const bowlRadiusMm = (mark.radius * sol.jackRadiusMm) / Math.max(jack.radius, 0.002);
  const gapMm = Math.max(0, sol.gapMm - bowlRadiusMm);

  // Ground-plane direction: +x lateral (right), +y away from the camera.
  const dx = sol.bowl.x - sol.jack.x;
  const dy = sol.bowl.y - sol.jack.y;
  const len = Math.hypot(dx, dy) || 1;
  const gapMats = gapMm / HEAD_SCAN_MM_PER_MAT;

  // Standing behind the jack, "away from the camera" is past the jack (long),
  // which is up the Visual Target.
  let x = (dx / len) * gapMats;
  let y = (dy / len) * gapMats;
  if (orientation === "mat_top") {
    x = -x;
    y = -y;
  }

  const dist = Math.hypot(x, y);
  if (dist > MAX_R_MAT && dist > 0) {
    const k = MAX_R_MAT / dist;
    x *= k;
    y *= k;
  }

  return {
    gapMm,
    centreMm: sol.centreMm,
    jackRadiusMm: sol.jackRadiusMm,
    bowlRadiusMm,
    tap: { ...classifyTap(x, y), source: "head_scan" },
  };
}

