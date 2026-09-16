/**
 * HEAD SCAN — CAMERA CALIBRATION / FOV TESTING (DIAGNOSTIC ONLY).
 *
 * PURPOSE
 * -------
 * A controlled tape-measure test showed the solver under-reads LATERAL
 * distance far more than DEPTH as the phone is tilted. That pattern points at
 * the assumed camera intrinsics (the hard-coded 66° horizontal FOV and the
 * vertical FOV derived from it) rather than at marking error.
 *
 * This module provides the tools to TEST that hypothesis against a real frozen
 * capture. It contains:
 *   • no correction factors,
 *   • no fitted constants,
 *   • no production behaviour of any kind.
 *
 * Every number here comes from the SAME `measureBowl` the scoring path uses;
 * the only thing that varies is the FOV handed to it. Ground truth values are
 * used EXCLUSIVELY to compute error — they are never fed to the solver.
 */

import { measureBowl, type HeadScanJack, type PhotoPoint } from "@/lib/head-scan";
import {
  DEFAULT_FOV_H_DEG,
  DEFAULT_PRINCIPAL_POINT_X,
  derivedFovVDeg,
} from "@/lib/head-scan-geometry";

/** Horizontal FOV values offered as quick-select chips and used by the sweep. */
export const CALIBRATION_FOV_CHIPS: readonly number[] = [45, 50, 55, 60, 65, 66, 70, 75];
/** The calibration sweep grid: 55°–75° in 0.5° steps. */
export const SWEEP_FOV_MIN = 55;
export const SWEEP_FOV_MAX = 75;
export const SWEEP_FOV_STEP = 0.5;
export const CALIBRATION_FOV_MIN = 40;
export const CALIBRATION_FOV_MAX = 80;
export const CALIBRATION_FOV_STEP = 0.5;
export const CALIBRATION_FOV_V_MIN = 40;
export const CALIBRATION_FOV_V_MAX = 100;

/**
 * Default ground truth for the current controlled test rig (millimetres,
 * outside jack edge → outside target edge). Editable in the UI: future
 * calibration layouts will use different distances.
 */
export const DEFAULT_GROUND_TRUTH_MM: Readonly<Record<number, number>> = {
  1: 539, // Right
  2: 627, // Left
  3: 1154, // Back / long
};

export const CALIBRATION_TARGET_LABELS: Readonly<Record<number, string>> = {
  1: "Right",
  2: "Left",
  3: "Back",
};

/**
 * The FROZEN capture geometry. Once a photo is taken, nothing in here changes:
 * a recalculation or sweep re-runs the solver against exactly these values.
 */
export type CalibrationGeometry = {
  jack: HeadScanJack;
  /** Marked target edge points, in delivery order. */
  targets: Array<{ number: number; point: PhotoPoint | null; status: string }>;
  /** Displayed photo aspect (width / height) — same value the solver uses. */
  aspect: number;
  orientation: "mat_bottom" | "mat_top";
  /** SENSOR pitch recorded at shutter. Never the Angle Test target angle. */
  capturePitchDeg: number;
  /** Radius used for the arrow-tip pseudo-bowl. */
  tipRadius: number;
};

export type CalibrationRow = {
  number: number;
  label: string;
  measuredMm: number | null;
  actualMm: number | null;
  signedErrorMm: number | null;
  absoluteErrorMm: number | null;
  percentageError: number | null;
};

export type CalibrationResult = {
  fovHDeg: number;
  /** null = derived from FOV-H + aspect (the production model). */
  fovVOverrideDeg: number | null;
  /** The vertical FOV actually in force. */
  activeFovVDeg: number;
  /** Horizontal optical centre used (0.5 = the production assumption). */
  principalPointX: number;
  /** Radial distortion coefficient used (0 = the production assumption). */
  k1: number;
  rows: CalibrationRow[];
  /** Mean Absolute Percentage Error over rows that have a ground truth. */
  mape: number | null;
  /** Mean Absolute Error in millimetres over rows that have a ground truth. */
  maeMm: number | null;
  /** Largest absolute error in millimetres across the rows with ground truth. */
  maxAbsErrorMm: number | null;
};

/** Measure one marked target at a given FOV. Pure read of the solver. */
export function measureTargetMm(
  geom: CalibrationGeometry,
  target: { number: number; point: PhotoPoint | null; status: string },
  fovHDeg: number,
  fovVDeg: number | null,
  principalPointX: number = DEFAULT_PRINCIPAL_POINT_X,
  k1: number = 0,
): number | null {
  if (!target.point || target.status !== "marked") return null;
  const m = measureBowl(
    { number: target.number, hand: "forehand", status: "marked", point: target.point, radius: geom.tipRadius },
    geom.jack,
    geom.aspect,
    geom.orientation,
    // GROUND TRUTH IS NEVER AN INPUT. The frozen sensor pitch is.
    geom.capturePitchDeg,
    fovHDeg,
    fovVDeg,
    principalPointX,
    k1,
  );
  return m ? m.gapMm : null;
}

/**
 * Build the calibration table for ONE camera model.
 * `groundTruthMm` is used only for the error columns.
 */
export function calibrationResult(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  fovHDeg: number = DEFAULT_FOV_H_DEG,
  fovVOverrideDeg: number | null = null,
  principalPointX: number = DEFAULT_PRINCIPAL_POINT_X,
  k1: number = 0,
): CalibrationResult {
  const rows: CalibrationRow[] = geom.targets.map((t) => {
    const measuredMm = measureTargetMm(geom, t, fovHDeg, fovVOverrideDeg, principalPointX, k1);
    const actualMm = groundTruthMm[t.number] ?? null;
    const usable = measuredMm != null && actualMm != null && actualMm > 0;
    const signed = usable ? measuredMm - actualMm : null;
    return {
      number: t.number,
      label: CALIBRATION_TARGET_LABELS[t.number] ?? `Target ${t.number}`,
      measuredMm,
      actualMm,
      signedErrorMm: signed,
      absoluteErrorMm: signed == null ? null : Math.abs(signed),
      percentageError: signed == null ? null : (signed / (actualMm as number)) * 100,
    };
  });

  const pcts = rows
    .map((r) => r.percentageError)
    .filter((p): p is number => p != null)
    .map(Math.abs);
  const abs = rows.map((r) => r.absoluteErrorMm).filter((v): v is number => v != null);

  return {
    fovHDeg,
    fovVOverrideDeg,
    activeFovVDeg: fovVOverrideDeg ?? derivedFovVDeg(fovHDeg, geom.aspect),
    principalPointX,
    k1,
    rows,
    mape: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    maeMm: abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : null,
    maxAbsErrorMm: abs.length ? Math.max(...abs) : null,
  };
}


/**
 * FOV SWEEP — the identical frozen geometry solved at each candidate FOV-H.
 * Nothing about the photo, jack or marks is touched.
 */
export function runFovSweep(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  fovs: readonly number[] = CALIBRATION_FOV_CHIPS,
  fovVOverrideDeg: number | null = null,
): CalibrationResult[] {
  return fovs.map((f) => calibrationResult(geom, groundTruthMm, f, fovVOverrideDeg));
}

/**
 * ADVANCED 2D SWEEP — horizontal × vertical FOV. Answers whether one FOV
 * parameter can explain the error or whether H and V need independent
 * intrinsics. Returns the best `limit` combinations ranked by MAPE.
 */
export function runFov2dSweep(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  hRange: readonly number[] = rangeDeg(45, 80, 2.5),
  vRange: readonly number[] = rangeDeg(40, 100, 2.5),
  limit = 10,
): CalibrationResult[] {
  const out: CalibrationResult[] = [];
  for (const h of hRange) {
    for (const v of vRange) {
      const r = calibrationResult(geom, groundTruthMm, h, v);
      if (r.mape != null) out.push(r);
    }
  }
  out.sort((a, b) => (a.mape as number) - (b.mape as number));
  return out.slice(0, limit);
}

export function rangeDeg(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(2)));
  return out;
}

/** Index of the lowest-MAPE row in a sweep, or -1. */
export function bestSweepIndex(results: readonly CalibrationResult[]): number {
  let best = -1;
  let bestMape = Infinity;
  results.forEach((r, i) => {
    if (r.mape != null && r.mape < bestMape) {
      bestMape = r.mape;
      best = i;
    }
  });
  return best;
}

/** The 55°–75° / 0.5° candidate grid used by "RUN FOV SWEEP". */
export const CALIBRATION_SWEEP_FOVS: readonly number[] = rangeDeg(
  SWEEP_FOV_MIN,
  SWEEP_FOV_MAX,
  SWEEP_FOV_STEP,
);

/** Index of the lowest Mean-Absolute-Error (mm) row in a sweep, or -1. */
export function bestSweepIndexByMae(results: readonly CalibrationResult[]): number {
  let best = -1;
  let bestMae = Infinity;
  results.forEach((r, i) => {
    if (r.maeMm != null && r.maeMm < bestMae) {
      bestMae = r.maeMm;
      best = i;
    }
  });
  return best;
}

/**
 * GROUND TRUTH PERSISTENCE (diagnostics only).
 *
 * The tape-measured distances stay the same across the 90/80/70/60/50°
 * captures, so they are kept in localStorage for this device. They are TEST
 * DATA: never sent anywhere, never used as solver input, and only ever read
 * by the developer-gated calibration UI.
 */
const GROUND_TRUTH_STORAGE_KEY = "bt.headscan.calibration.groundTruth.v1";

export function loadGroundTruth(): Record<number, number | null> {
  if (typeof localStorage === "undefined") return { ...DEFAULT_GROUND_TRUTH_MM };
  try {
    const raw = localStorage.getItem(GROUND_TRUTH_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GROUND_TRUTH_MM };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<number, number | null> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(k);
      if (!Number.isFinite(n)) continue;
      out[n] = typeof v === "number" && Number.isFinite(v) ? v : null;
    }
    return Object.keys(out).length ? out : { ...DEFAULT_GROUND_TRUTH_MM };
  } catch {
    return { ...DEFAULT_GROUND_TRUTH_MM };
  }
}

export function saveGroundTruth(value: Record<number, number | null>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(GROUND_TRUTH_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* diagnostics only — a storage failure must never break Head Scan */
  }
}

export function clearGroundTruth(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(GROUND_TRUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * FULL 2D FOV SWEEP (diagnostic only)
 *
 * Runs the SAME `calibrationResult` → `measureBowl` path the live Head Scan
 * calculation uses, once per H/V pair, against the frozen capture geometry.
 * Nothing is mutated: the caller's active FOV settings are untouched, so the
 * settings in force before the sweep are still in force after it.
 * ------------------------------------------------------------------ */

export const SWEEP2D_H_MIN = 45;
export const SWEEP2D_H_MAX = 85;
export const SWEEP2D_V_MIN = 70;
export const SWEEP2D_V_MAX = 105;
export const SWEEP2D_STEP = 1;

export type Sweep2dReport = {
  hRange: { minDeg: number; maxDeg: number; stepDeg: number };
  vRange: { minDeg: number; maxDeg: number; stepDeg: number };
  combinationsTested: number;
  bestByMae: CalibrationResult | null;
  /** Lowest MAXIMUM absolute error — stops one good target hiding a bad one. */
  bestBalanced: CalibrationResult | null;
  top10: CalibrationResult[];
};

export function runFov2dSweepReport(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  hRange: readonly number[] = rangeDeg(SWEEP2D_H_MIN, SWEEP2D_H_MAX, SWEEP2D_STEP),
  vRange: readonly number[] = rangeDeg(SWEEP2D_V_MIN, SWEEP2D_V_MAX, SWEEP2D_STEP),
): Sweep2dReport {
  const all: CalibrationResult[] = [];
  for (const h of hRange) {
    for (const v of vRange) {
      const r = calibrationResult(geom, groundTruthMm, h, v);
      if (r.maeMm != null) all.push(r);
    }
  }
  const byMae = [...all].sort((a, b) => (a.maeMm as number) - (b.maeMm as number));
  const byMax = [...all].sort(
    (a, b) => (a.maxAbsErrorMm as number) - (b.maxAbsErrorMm as number),
  );
  return {
    hRange: { minDeg: hRange[0] ?? SWEEP2D_H_MIN, maxDeg: hRange[hRange.length - 1] ?? SWEEP2D_H_MAX, stepDeg: SWEEP2D_STEP },
    vRange: { minDeg: vRange[0] ?? SWEEP2D_V_MIN, maxDeg: vRange[vRange.length - 1] ?? SWEEP2D_V_MAX, stepDeg: SWEEP2D_STEP },
    combinationsTested: hRange.length * vRange.length,
    bestByMae: byMae[0] ?? null,
    bestBalanced: byMax[0] ?? null,
    top10: byMae.slice(0, 10),
  };
}

/* ------------------------------------------------------------------ *
 * TEST-ONLY SOLVER PITCH RANGE (diagnostics UI only).
 * The captured sensor pitch is never modified by these; they only bound
 * the calibration panel's optional override control.
 * ------------------------------------------------------------------ */
export const CALIBRATION_PITCH_MIN = 40;
export const CALIBRATION_PITCH_MAX = 90;
export const CALIBRATION_PITCH_STEP = 0.5;

/* ------------------------------------------------------------------ *
 * 3-VARIABLE SOLVER SWEEP (H-FOV × V-FOV × solver pitch) — DIAGNOSTIC.
 *
 * Answers one question: can the EXISTING perspective model reproduce every
 * known ground-truth distance at once for some physically plausible camera
 * model? It runs the same `calibrationResult` → `measureBowl` path, once per
 * combination, against the frozen capture geometry. Nothing is mutated: the
 * caller's active FOV/pitch settings are untouched, no correction factor is
 * derived, and no winning combination is ever applied automatically.
 * ------------------------------------------------------------------ */

export const SWEEP3D_H_MIN = 45;
export const SWEEP3D_H_MAX = 75;
export const SWEEP3D_H_STEP = 1;
export const SWEEP3D_V_MIN = 75;
export const SWEEP3D_V_MAX = 95;
export const SWEEP3D_V_STEP = 1;
export const SWEEP3D_PITCH_MIN = 40;
export const SWEEP3D_PITCH_MAX = 60;
export const SWEEP3D_PITCH_STEP = 0.5;

/** Refinement pass: ± this many degrees around the best coarse combination. */
export const SWEEP3D_REFINE_SPAN = 2;
export const SWEEP3D_REFINE_FOV_STEP = 0.25;
export const SWEEP3D_REFINE_PITCH_STEP = 0.1;

/* ------------------------------------------------------------------ *
 * PRINCIPAL POINT X (horizontal optical centre) — CALIBRATION ONLY.
 * Production always assumes 0.5. These bounds only limit the diagnostic
 * control and the 4-variable sweep.
 * ------------------------------------------------------------------ */
export const CALIBRATION_PPX_DEFAULT = DEFAULT_PRINCIPAL_POINT_X;
export const CALIBRATION_PPX_MIN = 0.4;
export const CALIBRATION_PPX_MAX = 0.6;
export const CALIBRATION_PPX_STEP = 0.005;

export type Solver3dPoint = {
  fovHDeg: number;
  fovVDeg: number;
  pitchDeg: number;
  /** Horizontal optical centre used for this combination. */
  principalPointX: number;
  /** Radial distortion coefficient used for this combination (0 = none). */
  k1: number;
  rows: CalibrationRow[];
  mape: number | null;
  maeMm: number | null;
  maxAbsErrorMm: number | null;
  /** Worst |percentage error| across the targets — the minimax criterion. */
  maxAbsPercentError: number | null;
};

export type Solver3dPass = {
  hRange: { minDeg: number; maxDeg: number; stepDeg: number };
  vRange: { minDeg: number; maxDeg: number; stepDeg: number };
  pitchRange: { minDeg: number; maxDeg: number; stepDeg: number };
  /** Principal-point-X grid actually swept (normalised image units). */
  ppxRange: { min: number; max: number; step: number };
  /** k1 grid actually swept (0 only, for the 3D/4D sweeps). */
  k1Range: { min: number; max: number; step: number };
  combinationsTested: number;
  bestMape: Solver3dPoint | null;
  /** Lowest WORST-CASE percentage error: no target may be badly wrong. */
  bestMinimax: Solver3dPoint | null;
  topResults: Solver3dPoint[];
};

export type Solver3dReport = {
  coarse: Solver3dPass;
  refined: Solver3dPass | null;
  totalCombinationsTested: number;
};

/** Aliases: the sweep now carries a fourth variable (principal point X). */
export type Solver4dPoint = Solver3dPoint;
export type Solver4dPass = Solver3dPass;
export type Solver4dReport = Solver3dReport;

function toPoint(r: CalibrationResult, pitchDeg: number): Solver3dPoint {
  const pcts = r.rows
    .map((row) => row.percentageError)
    .filter((p): p is number => p != null)
    .map(Math.abs);
  return {
    fovHDeg: r.fovHDeg,
    fovVDeg: r.activeFovVDeg,
    pitchDeg,
    principalPointX: r.principalPointX,
    k1: r.k1,
    rows: r.rows,
    mape: r.mape,
    maeMm: r.maeMm,
    maxAbsErrorMm: r.maxAbsErrorMm,
    maxAbsPercentError: pcts.length ? Math.max(...pcts) : null,
  };
}

/** Inclusive numeric grid, rounded to 4 dp so 0.0025 steps stay exact. */
export function rangeNum(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(4)));
  return out;
}

/**
 * One pass of the 4-variable grid (H-FOV × V-FOV × pitch × principal point X).
 * `geom` is read-only: the pitch is swapped on a copy, and nothing about the
 * photo, jack, marks or ground truth is mutated.
 */
export function runSolverSweep4dPass(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  hRange: readonly number[],
  vRange: readonly number[],
  pitchRange: readonly number[],
  ppxRange: readonly number[] = [DEFAULT_PRINCIPAL_POINT_X],
  topCount = 20,
  k1Range: readonly number[] = [0],
): Solver3dPass {
  let bestMape: Solver3dPoint | null = null;
  let bestMinimax: Solver3dPoint | null = null;
  const top: Solver3dPoint[] = [];

  for (const pitch of pitchRange) {
    // A COPY — the frozen capture geometry itself is never written to.
    const g: CalibrationGeometry = { ...geom, capturePitchDeg: pitch };
    for (const h of hRange) {
      for (const v of vRange) {
        for (const ppx of ppxRange) {
         for (const k1 of k1Range) {
          const r = calibrationResult(g, groundTruthMm, h, v, ppx, k1);
          if (r.mape == null) continue;
          const p = toPoint(r, pitch);
          if (bestMape == null || (p.mape as number) < (bestMape.mape as number)) bestMape = p;
          if (
            p.maxAbsPercentError != null &&
            (bestMinimax == null ||
              p.maxAbsPercentError < (bestMinimax.maxAbsPercentError as number))
          ) {
            bestMinimax = p;
          }
          // Keep a small ranked buffer instead of every combination.
          if (top.length < topCount || (p.mape as number) < (top[top.length - 1].mape as number)) {
            top.push(p);
            top.sort((a, b) => (a.mape as number) - (b.mape as number));
            if (top.length > topCount) top.length = topCount;
          }
         }
        }
      }
    }
  }

  const span = (a: readonly number[], step: number) => ({
    minDeg: a[0] ?? 0,
    maxDeg: a[a.length - 1] ?? 0,
    stepDeg: step,
  });
  const stepOf = (a: readonly number[]) =>
    a.length > 1 ? Number((a[1] - a[0]).toFixed(4)) : 0;

  return {
    hRange: span(hRange, stepOf(hRange)),
    vRange: span(vRange, stepOf(vRange)),
    pitchRange: span(pitchRange, stepOf(pitchRange)),
    ppxRange: {
      min: ppxRange[0] ?? DEFAULT_PRINCIPAL_POINT_X,
      max: ppxRange[ppxRange.length - 1] ?? DEFAULT_PRINCIPAL_POINT_X,
      step: stepOf(ppxRange),
    },
    k1Range: {
      min: k1Range[0] ?? 0,
      max: k1Range[k1Range.length - 1] ?? 0,
      step: stepOf(k1Range),
    },
    combinationsTested:
      hRange.length * vRange.length * pitchRange.length * ppxRange.length * k1Range.length,
    bestMape,
    bestMinimax,
    topResults: top,
  };
}

/** Legacy 3-variable pass: identical, with the optical centre fixed at 0.5. */
export function runSolverSweep3dPass(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  hRange: readonly number[],
  vRange: readonly number[],
  pitchRange: readonly number[],
  topCount = 20,
): Solver3dPass {
  return runSolverSweep4dPass(
    geom,
    groundTruthMm,
    hRange,
    vRange,
    pitchRange,
    [DEFAULT_PRINCIPAL_POINT_X],
    topCount,
  );
}

/** Coarse grid + automatic refinement around the best coarse (MAPE) result. */
export function runSolverSweep3d(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  topCount = 20,
): Solver3dReport {
  const coarse = runSolverSweep3dPass(
    geom,
    groundTruthMm,
    rangeDeg(SWEEP3D_H_MIN, SWEEP3D_H_MAX, SWEEP3D_H_STEP),
    rangeDeg(SWEEP3D_V_MIN, SWEEP3D_V_MAX, SWEEP3D_V_STEP),
    rangeDeg(SWEEP3D_PITCH_MIN, SWEEP3D_PITCH_MAX, SWEEP3D_PITCH_STEP),
    topCount,
  );

  let refined: Solver3dPass | null = null;
  const b = coarse.bestMape;
  if (b) {
    const s = SWEEP3D_REFINE_SPAN;
    refined = runSolverSweep3dPass(
      geom,
      groundTruthMm,
      rangeDeg(b.fovHDeg - s, b.fovHDeg + s, SWEEP3D_REFINE_FOV_STEP),
      rangeDeg(b.fovVDeg - s, b.fovVDeg + s, SWEEP3D_REFINE_FOV_STEP),
      rangeDeg(b.pitchDeg - s, b.pitchDeg + s, SWEEP3D_REFINE_PITCH_STEP),
      topCount,
    );
  }

  return {
    coarse,
    refined,
    totalCombinationsTested:
      coarse.combinationsTested + (refined ? refined.combinationsTested : 0),
  };
}

/* ------------------------------------------------------------------ *
 * 4-VARIABLE SOLVER SWEEP — H-FOV × V-FOV × pitch × principal point X.
 *
 * Tests one hypothesis: is the persistent under-read on the far-left target
 * explained by the optical centre not being at the middle of the frame?
 * Diagnostic only — no winning combination is ever applied automatically.
 * ------------------------------------------------------------------ */

export const SWEEP4D_H_MIN = 40;
export const SWEEP4D_H_MAX = 65;
export const SWEEP4D_H_STEP = 1;
export const SWEEP4D_V_MIN = 68;
export const SWEEP4D_V_MAX = 88;
export const SWEEP4D_V_STEP = 1;
export const SWEEP4D_PITCH_MIN = 50;
export const SWEEP4D_PITCH_MAX = 64;
export const SWEEP4D_PITCH_STEP = 0.5;
export const SWEEP4D_PPX_MIN = 0.4;
export const SWEEP4D_PPX_MAX = 0.6;
export const SWEEP4D_PPX_STEP = 0.01;

export const SWEEP4D_REFINE_SPAN_DEG = 2;
export const SWEEP4D_REFINE_FOV_STEP = 0.25;
export const SWEEP4D_REFINE_PITCH_STEP = 0.1;
export const SWEEP4D_REFINE_PPX_SPAN = 0.03;
export const SWEEP4D_REFINE_PPX_STEP = 0.0025;

export function runSolverSweep4d(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  topCount = 20,
): Solver3dReport {
  const coarse = runSolverSweep4dPass(
    geom,
    groundTruthMm,
    rangeDeg(SWEEP4D_H_MIN, SWEEP4D_H_MAX, SWEEP4D_H_STEP),
    rangeDeg(SWEEP4D_V_MIN, SWEEP4D_V_MAX, SWEEP4D_V_STEP),
    rangeDeg(SWEEP4D_PITCH_MIN, SWEEP4D_PITCH_MAX, SWEEP4D_PITCH_STEP),
    rangeNum(SWEEP4D_PPX_MIN, SWEEP4D_PPX_MAX, SWEEP4D_PPX_STEP),
    topCount,
  );

  let refined: Solver3dPass | null = null;
  const b = coarse.bestMape;
  if (b) {
    const s = SWEEP4D_REFINE_SPAN_DEG;
    refined = runSolverSweep4dPass(
      geom,
      groundTruthMm,
      rangeDeg(b.fovHDeg - s, b.fovHDeg + s, SWEEP4D_REFINE_FOV_STEP),
      rangeDeg(b.fovVDeg - s, b.fovVDeg + s, SWEEP4D_REFINE_FOV_STEP),
      rangeDeg(b.pitchDeg - s, b.pitchDeg + s, SWEEP4D_REFINE_PITCH_STEP),
      rangeNum(
        b.principalPointX - SWEEP4D_REFINE_PPX_SPAN,
        b.principalPointX + SWEEP4D_REFINE_PPX_SPAN,
        SWEEP4D_REFINE_PPX_STEP,
      ),
      topCount,
    );
  }

  return {
    coarse,
    refined,
    totalCombinationsTested:
      coarse.combinationsTested + (refined ? refined.combinationsTested : 0),
  };
}


/* ------------------------------------------------------------------ *
 * 5-VARIABLE SOLVER SWEEP — H-FOV × V-FOV × pitch × PP-X × k1.
 *
 * The 4D sweep left a systematic left-side residual and pushed the optical
 * centre to the edge of its range, which is the signature of LENS DISTORTION
 * rather than a decentred principal point. This sweep adds one radial
 * distortion coefficient (single-term Brown model, applied around the optical
 * centre in normalised camera coordinates before back-projection) so the two
 * hypotheses can be told apart.
 *
 * Diagnostic only. The 3D and 4D sweeps are untouched and still run with
 * k1 = 0, and no winning combination is ever applied to production.
 * ------------------------------------------------------------------ */

export const SWEEP5D_H_MIN = 40;
export const SWEEP5D_H_MAX = 65;
export const SWEEP5D_H_STEP = 1;
export const SWEEP5D_V_MIN = 68;
export const SWEEP5D_V_MAX = 88;
export const SWEEP5D_V_STEP = 2;
export const SWEEP5D_PITCH_MIN = 50;
export const SWEEP5D_PITCH_MAX = 64;
export const SWEEP5D_PITCH_STEP = 1;
export const SWEEP5D_PPX_MIN = 0.42;
export const SWEEP5D_PPX_MAX = 0.58;
export const SWEEP5D_PPX_STEP = 0.02;
/** Both barrel (negative) and pincushion (positive) distortion are searched. */
export const SWEEP5D_K1_MIN = -0.3;
export const SWEEP5D_K1_MAX = 0.3;
export const SWEEP5D_K1_STEP = 0.05;

export const SWEEP5D_REFINE_FOV_SPAN = 2;
export const SWEEP5D_REFINE_FOV_STEP = 0.5;
export const SWEEP5D_REFINE_PITCH_SPAN = 1;
export const SWEEP5D_REFINE_PITCH_STEP = 0.2;
export const SWEEP5D_REFINE_PPX_SPAN = 0.02;
export const SWEEP5D_REFINE_PPX_STEP = 0.005;
export const SWEEP5D_REFINE_K1_SPAN = 0.05;
export const SWEEP5D_REFINE_K1_STEP = 0.01;

/** One pass of the 5-variable grid. `geom` is read-only throughout. */
export function runSolverSweep5dPass(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  hRange: readonly number[],
  vRange: readonly number[],
  pitchRange: readonly number[],
  ppxRange: readonly number[],
  k1Range: readonly number[],
  topCount = 20,
): Solver3dPass {
  return runSolverSweep4dPass(
    geom,
    groundTruthMm,
    hRange,
    vRange,
    pitchRange,
    ppxRange,
    topCount,
    k1Range,
  );
}

export function runSolverSweep5d(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  topCount = 20,
): Solver3dReport {
  const coarse = runSolverSweep5dPass(
    geom,
    groundTruthMm,
    rangeDeg(SWEEP5D_H_MIN, SWEEP5D_H_MAX, SWEEP5D_H_STEP),
    rangeDeg(SWEEP5D_V_MIN, SWEEP5D_V_MAX, SWEEP5D_V_STEP),
    rangeDeg(SWEEP5D_PITCH_MIN, SWEEP5D_PITCH_MAX, SWEEP5D_PITCH_STEP),
    rangeNum(SWEEP5D_PPX_MIN, SWEEP5D_PPX_MAX, SWEEP5D_PPX_STEP),
    rangeNum(SWEEP5D_K1_MIN, SWEEP5D_K1_MAX, SWEEP5D_K1_STEP),
    topCount,
  );

  let refined: Solver3dPass | null = null;
  const b = coarse.bestMape;
  if (b) {
    refined = runSolverSweep5dPass(
      geom,
      groundTruthMm,
      rangeDeg(b.fovHDeg - SWEEP5D_REFINE_FOV_SPAN, b.fovHDeg + SWEEP5D_REFINE_FOV_SPAN, SWEEP5D_REFINE_FOV_STEP),
      rangeDeg(b.fovVDeg - SWEEP5D_REFINE_FOV_SPAN, b.fovVDeg + SWEEP5D_REFINE_FOV_SPAN, SWEEP5D_REFINE_FOV_STEP),
      rangeDeg(b.pitchDeg - SWEEP5D_REFINE_PITCH_SPAN, b.pitchDeg + SWEEP5D_REFINE_PITCH_SPAN, SWEEP5D_REFINE_PITCH_STEP),
      rangeNum(b.principalPointX - SWEEP5D_REFINE_PPX_SPAN, b.principalPointX + SWEEP5D_REFINE_PPX_SPAN, SWEEP5D_REFINE_PPX_STEP),
      rangeNum(b.k1 - SWEEP5D_REFINE_K1_SPAN, b.k1 + SWEEP5D_REFINE_K1_SPAN, SWEEP5D_REFINE_K1_STEP),
      topCount,
    );
  }

  return {
    coarse,
    refined,
    totalCombinationsTested:
      coarse.combinationsTested + (refined ? refined.combinationsTested : 0),
  };
}


/* ------------------------------------------------------------------ *
 * 4-VARIABLE INTRINSICS SWEEP — SENSOR PITCH LOCKED.
 *
 * Identical machinery to the 5D sweep, minus the pitch variable: every
 * candidate solves with the EXACT pitch the device sensor recorded at the
 * shutter. Nothing is fitted to pitch and no pitch override is consulted, so
 * the result answers "can the intrinsics alone (H-FOV, V-FOV, PP-X, k1)
 * reproduce ground truth at the true capture angle?".
 *
 * Diagnostic only. Production still solves with FOV-H 66°, derived FOV-V,
 * PP-X 0.5 and k1 = 0.
 * ------------------------------------------------------------------ */

// FINAL CALIBRATION TEST — widened FOV search (temporary; revert to
// H 40–75 / V 60–95 after calibration is finished).
export const INTRINSICS_H_MIN = 35;
export const INTRINSICS_H_MAX = 50;
export const INTRINSICS_H_STEP = 0.5;
export const INTRINSICS_V_MIN = 50;
export const INTRINSICS_V_MAX = 65;
export const INTRINSICS_V_STEP = 0.5;
export const INTRINSICS_PPX_MIN = 0.4;
export const INTRINSICS_PPX_MAX = 0.6;
export const INTRINSICS_PPX_STEP = 0.02;
export const INTRINSICS_K1_MIN = -0.3;
export const INTRINSICS_K1_MAX = 0.3;
export const INTRINSICS_K1_STEP = 0.05;

export const INTRINSICS_REFINE_FOV_SPAN = 1;
export const INTRINSICS_REFINE_FOV_STEP = 0.25;
export const INTRINSICS_REFINE_PPX_SPAN = 0.02;
export const INTRINSICS_REFINE_PPX_STEP = 0.005;
export const INTRINSICS_REFINE_K1_SPAN = 0.05;
export const INTRINSICS_REFINE_K1_STEP = 0.01;

/**
 * One pass of the intrinsics grid at a single, fixed pitch.
 * @param sensorPitchDeg the pitch recorded at the shutter — used verbatim.
 */
export function runIntrinsicsSweepPass(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  sensorPitchDeg: number,
  hRange: readonly number[],
  vRange: readonly number[],
  ppxRange: readonly number[],
  k1Range: readonly number[],
  topCount = 20,
): Solver3dPass {
  return runSolverSweep4dPass(
    geom,
    groundTruthMm,
    hRange,
    vRange,
    // The ONLY pitch tested: the real sensor reading.
    [sensorPitchDeg],
    ppxRange,
    topCount,
    k1Range,
  );
}

export function runIntrinsicsSweep(
  geom: CalibrationGeometry,
  groundTruthMm: Record<number, number | null>,
  sensorPitchDeg: number,
  topCount = 20,
): Solver3dReport {
  const coarse = runIntrinsicsSweepPass(
    geom,
    groundTruthMm,
    sensorPitchDeg,
    rangeDeg(INTRINSICS_H_MIN, INTRINSICS_H_MAX, INTRINSICS_H_STEP),
    rangeDeg(INTRINSICS_V_MIN, INTRINSICS_V_MAX, INTRINSICS_V_STEP),
    rangeNum(INTRINSICS_PPX_MIN, INTRINSICS_PPX_MAX, INTRINSICS_PPX_STEP),
    rangeNum(INTRINSICS_K1_MIN, INTRINSICS_K1_MAX, INTRINSICS_K1_STEP),
    topCount,
  );

  let refined: Solver3dPass | null = null;
  const b = coarse.bestMape;
  if (b) {
    refined = runIntrinsicsSweepPass(
      geom,
      groundTruthMm,
      sensorPitchDeg,
      rangeDeg(b.fovHDeg - INTRINSICS_REFINE_FOV_SPAN, b.fovHDeg + INTRINSICS_REFINE_FOV_SPAN, INTRINSICS_REFINE_FOV_STEP),
      rangeDeg(b.fovVDeg - INTRINSICS_REFINE_FOV_SPAN, b.fovVDeg + INTRINSICS_REFINE_FOV_SPAN, INTRINSICS_REFINE_FOV_STEP),
      rangeNum(b.principalPointX - INTRINSICS_REFINE_PPX_SPAN, b.principalPointX + INTRINSICS_REFINE_PPX_SPAN, INTRINSICS_REFINE_PPX_STEP),
      rangeNum(b.k1 - INTRINSICS_REFINE_K1_SPAN, b.k1 + INTRINSICS_REFINE_K1_SPAN, INTRINSICS_REFINE_K1_STEP),
      topCount,
    );
  }

  return {
    coarse,
    refined,
    totalCombinationsTested:
      coarse.combinationsTested + (refined ? refined.combinationsTested : 0),
  };
}
