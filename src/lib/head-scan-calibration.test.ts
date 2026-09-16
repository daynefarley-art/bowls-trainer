import { describe, expect, it } from "vitest";
import { measureBowl, type HeadScanJack } from "@/lib/head-scan";
import { DEFAULT_FOV_H_DEG, derivedFovVDeg, solveGround } from "@/lib/head-scan-geometry";
import {
  CALIBRATION_FOV_CHIPS,
  CALIBRATION_SWEEP_FOVS,
  DEFAULT_GROUND_TRUTH_MM,
  calibrationResult,
  clearGroundTruth,
  loadGroundTruth,
  runFov2dSweep,
  runFovSweep,
  saveGroundTruth,
  bestSweepIndex,
  bestSweepIndexByMae,
  runSolverSweep3dPass,
  runSolverSweep4dPass,
  runSolverSweep5dPass,
  runIntrinsicsSweepPass,
  type CalibrationGeometry,
} from "@/lib/head-scan-calibration";
import { isDiagnosticsUser } from "@/lib/diagnostics-access";

const JACK: HeadScanJack = { point: { x: 0.5, y: 0.62 }, radius: 0.03 };
const ASPECT = 0.75;

function geometry(): CalibrationGeometry {
  return {
    jack: { point: { ...JACK.point }, radius: JACK.radius },
    targets: [
      { number: 1, point: { x: 0.68, y: 0.6 }, status: "marked" },
      { number: 2, point: { x: 0.31, y: 0.6 }, status: "marked" },
      { number: 3, point: { x: 0.5, y: 0.34 }, status: "marked" },
      { number: 4, point: null, status: "not_in_photo" },
    ],
    aspect: ASPECT,
    orientation: "mat_bottom",
    capturePitchDeg: 70.437,
    tipRadius: 0.0004,
  };
}

const GROUND_TRUTH = { ...DEFAULT_GROUND_TRUTH_MM };

describe("head scan calibration (diagnostic only)", () => {
  it("leaves production measurement untouched when no calibration input is given", () => {
    const mark = {
      number: 1,
      hand: "forehand" as const,
      status: "marked" as const,
      point: { x: 0.68, y: 0.6 },
      radius: 0.0004,
    };
    const before = measureBowl(mark, JACK, ASPECT, "mat_bottom", 70.437)!;
    // Explicit default FOV-H and an absent vertical override must be identical.
    const after = measureBowl(mark, JACK, ASPECT, "mat_bottom", 70.437, DEFAULT_FOV_H_DEG, null)!;
    expect(after.gapMm).toBeCloseTo(before.gapMm, 9);

    // The derived vertical FOV reproduces the legacy aspect-derived model.
    const derived = derivedFovVDeg(DEFAULT_FOV_H_DEG, ASPECT);
    const explicitV = measureBowl(mark, JACK, ASPECT, "mat_bottom", 70.437, DEFAULT_FOV_H_DEG, derived)!;
    expect(explicitV.gapMm).toBeCloseTo(before.gapMm, 6);
  });

  it("changing FOV actually changes the solver result", () => {
    const g = geometry();
    const a = calibrationResult(g, GROUND_TRUTH, 66, null);
    const b = calibrationResult(g, GROUND_TRUTH, 50, null);
    expect(a.rows[0].measuredMm).not.toBeCloseTo(b.rows[0].measuredMm!, 3);
    expect(a.activeFovVDeg).toBeCloseTo(derivedFovVDeg(66, ASPECT), 6);
  });

  it("independent vertical FOV changes the result only when set", () => {
    const g = geometry();
    const derivedRun = calibrationResult(g, GROUND_TRUTH, 66, null);
    const sameV = calibrationResult(g, GROUND_TRUTH, 66, derivedFovVDeg(66, ASPECT));
    const otherV = calibrationResult(g, GROUND_TRUTH, 66, 70);
    expect(sameV.rows[2].measuredMm).toBeCloseTo(derivedRun.rows[2].measuredMm!, 4);
    expect(otherV.rows[2].measuredMm).not.toBeCloseTo(derivedRun.rows[2].measuredMm!, 3);
  });

  it("recalculating never mutates the frozen capture geometry", () => {
    const g = geometry();
    const snapshot = JSON.stringify(g);
    calibrationResult(g, GROUND_TRUTH, 55, 80);
    runFovSweep(g, GROUND_TRUTH);
    runFov2dSweep(g, GROUND_TRUTH, [50, 60], [50, 60], 5);
    expect(JSON.stringify(g)).toBe(snapshot);
    expect(g.capturePitchDeg).toBe(70.437);
  });

  it("the sweep uses identical geometry and the recorded sensor pitch for every run", () => {
    const g = geometry();
    const sweep = runFovSweep(g, GROUND_TRUTH);
    expect(sweep).toHaveLength(CALIBRATION_FOV_CHIPS.length);
    for (const r of sweep) {
      const direct = solveGround(
        { x: g.jack.point.x, y: g.jack.point.y, radius: g.jack.radius },
        g.targets[0].point!,
        g.aspect,
        70.437,
        r.fovHDeg,
      );
      // Same jack, same mark, same pitch — only FOV differs. (measureBowl also
      // subtracts the negligible arrow-tip radius, hence the 1 mm tolerance.)
      expect(Math.abs(r.rows[0].measuredMm! - direct.gapMm)).toBeLessThan(1);
    }
    expect(bestSweepIndex(sweep)).toBeGreaterThanOrEqual(0);
  });

  it("never substitutes an Angle Test target angle for the actual capture angle", () => {
    const g = geometry(); // actual 70.437, nominal target would be 70
    const actual = calibrationResult(g, GROUND_TRUTH, 66, null);
    const nominal = calibrationResult({ ...g, capturePitchDeg: 70 }, GROUND_TRUTH, 66, null);
    expect(actual.rows[2].measuredMm).not.toBe(nominal.rows[2].measuredMm);
  });

  it("uses ground truth only for error maths, never as solver input", () => {
    const g = geometry();
    const withTruth = calibrationResult(g, GROUND_TRUTH, 66, null);
    const withoutTruth = calibrationResult(g, {}, 66, null);
    expect(withoutTruth.rows[0].measuredMm).toBeCloseTo(withTruth.rows[0].measuredMm!, 9);
    expect(withoutTruth.rows[0].percentageError).toBeNull();
    expect(withoutTruth.mape).toBeNull();

    const wildTruth = calibrationResult(g, { 1: 99999, 2: 1, 3: 5 }, 66, null);
    expect(wildTruth.rows[0].measuredMm).toBeCloseTo(withTruth.rows[0].measuredMm!, 9);
  });

  it("computes signed, absolute and percentage error plus MAPE", () => {
    const g = geometry();
    const r = calibrationResult(g, { 1: 500, 2: null, 3: null }, 66, null);
    const row = r.rows[0];
    expect(row.signedErrorMm).toBeCloseTo(row.measuredMm! - 500, 9);
    expect(row.absoluteErrorMm).toBeCloseTo(Math.abs(row.signedErrorMm!), 9);
    expect(row.percentageError).toBeCloseTo((row.signedErrorMm! / 500) * 100, 9);
    expect(r.mape).toBeCloseTo(Math.abs(row.percentageError!), 9);
  });

  it("ranks the 2D sweep by MAPE and returns at most the requested count", () => {
    const g = geometry();
    const best = runFov2dSweep(g, GROUND_TRUTH, [50, 55, 60, 66], [50, 60, 70, 80], 5);
    expect(best.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < best.length; i++) {
      expect(best[i].mape!).toBeGreaterThanOrEqual(best[i - 1].mape!);
    }
  });

  it("sweeps 55–75° in 0.5° steps and ranks the best FOV by mean absolute error", () => {
    const g = geometry();
    expect(CALIBRATION_SWEEP_FOVS[0]).toBe(55);
    expect(CALIBRATION_SWEEP_FOVS[CALIBRATION_SWEEP_FOVS.length - 1]).toBe(75);
    expect(CALIBRATION_SWEEP_FOVS).toHaveLength(41);

    const sweep = runFovSweep(g, GROUND_TRUTH, CALIBRATION_SWEEP_FOVS);
    expect(sweep).toHaveLength(41);
    const best = bestSweepIndexByMae(sweep);
    expect(best).toBeGreaterThanOrEqual(0);
    for (const r of sweep) expect(r.maeMm!).toBeGreaterThanOrEqual(sweep[best].maeMm!);

    // MAE really is the mean of the absolute millimetre errors.
    const rows = sweep[best].rows.filter((r) => r.absoluteErrorMm != null);
    const manual = rows.reduce((a, r) => a + r.absoluteErrorMm!, 0) / rows.length;
    expect(sweep[best].maeMm).toBeCloseTo(manual, 9);
  });

  it("persists ground truth between captures and can be reset", () => {
    clearGroundTruth();
    expect(loadGroundTruth()).toEqual(DEFAULT_GROUND_TRUTH_MM);
    saveGroundTruth({ 1: 539, 2: 627, 3: 1154 });
    expect(loadGroundTruth()).toEqual({ 1: 539, 2: 627, 3: 1154 });
    clearGroundTruth();
    expect(loadGroundTruth()).toEqual(DEFAULT_GROUND_TRUTH_MM);
  });

  it("the 3-variable sweep ranks by MAPE, reports minimax and never mutates geometry", () => {
    const g = geometry();
    const snapshot = JSON.stringify(g);
    const pass = runSolverSweep3dPass(g, GROUND_TRUTH, [50, 60], [80, 85], [45, 50, 55], 5);
    expect(JSON.stringify(g)).toBe(snapshot);
    expect(pass.combinationsTested).toBe(12);
    expect(pass.topResults.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < pass.topResults.length; i++) {
      expect(pass.topResults[i].mape!).toBeGreaterThanOrEqual(pass.topResults[i - 1].mape!);
    }
    expect(pass.bestMape!.mape).toBeCloseTo(pass.topResults[0].mape!, 9);
    // Best minimax is the lowest worst-case percentage error seen.
    expect(pass.bestMinimax!.maxAbsPercentError!).toBeLessThanOrEqual(
      pass.bestMape!.maxAbsPercentError!,
    );
    // Each point solves at its own pitch, not the captured one.
    expect(pass.topResults.every((p) => [45, 50, 55].includes(p.pitchDeg))).toBe(true);
  });

  it("principal point X defaults to the frame centre and only shifts when set", () => {
    const g = geometry();
    const centre = calibrationResult(g, GROUND_TRUTH, 66, null);
    const explicit = calibrationResult(g, GROUND_TRUTH, 66, null, 0.5);
    const shifted = calibrationResult(g, GROUND_TRUTH, 66, null, 0.45);
    expect(explicit.rows[0].measuredMm).toBeCloseTo(centre.rows[0].measuredMm!, 9);
    expect(shifted.rows[0].measuredMm).not.toBeCloseTo(centre.rows[0].measuredMm!, 3);
    expect(shifted.principalPointX).toBe(0.45);
  });

  it("the 4-variable sweep adds PP-X without mutating geometry", () => {
    const g = geometry();
    const snapshot = JSON.stringify(g);
    const pass = runSolverSweep4dPass(g, GROUND_TRUTH, [55, 60], [80, 85], [50, 55], [0.48, 0.5], 5);
    expect(JSON.stringify(g)).toBe(snapshot);
    expect(pass.combinationsTested).toBe(16);
    expect(pass.ppxRange).toEqual({ min: 0.48, max: 0.5, step: 0.02 });
    expect(pass.topResults.every((p) => [0.48, 0.5].includes(p.principalPointX))).toBe(true);
  });

  it("k1 = 0 is a strict no-op and non-zero k1 changes the result", () => {
    const g = geometry();
    const base = calibrationResult(g, GROUND_TRUTH, 66, null, 0.5);
    const zeroK1 = calibrationResult(g, GROUND_TRUTH, 66, null, 0.5, 0);
    const barrel = calibrationResult(g, GROUND_TRUTH, 66, null, 0.5, -0.2);
    expect(zeroK1.rows[0].measuredMm).toBe(base.rows[0].measuredMm);
    expect(barrel.rows[0].measuredMm).not.toBeCloseTo(base.rows[0].measuredMm!, 3);
    expect(barrel.k1).toBe(-0.2);
  });

  it("the 5-variable sweep adds k1 without mutating geometry", () => {
    const g = geometry();
    const snapshot = JSON.stringify(g);
    const pass = runSolverSweep5dPass(
      g,
      GROUND_TRUTH,
      [55, 60],
      [80, 85],
      [50, 55],
      [0.48, 0.5],
      [-0.1, 0, 0.1],
      5,
    );
    expect(JSON.stringify(g)).toBe(snapshot);
    expect(pass.combinationsTested).toBe(48);
    expect(pass.k1Range).toEqual({ min: -0.1, max: 0.1, step: 0.1 });
    expect(pass.topResults.every((p) => [-0.1, 0, 0.1].includes(p.k1))).toBe(true);
    // The existing 4D pass is untouched: it still solves with k1 = 0.
    const four = runSolverSweep4dPass(g, GROUND_TRUTH, [55, 60], [80, 85], [50, 55], [0.48, 0.5], 5);
    expect(four.topResults.every((p) => p.k1 === 0)).toBe(true);
  });

  it("the intrinsics sweep locks pitch to the sensor value and never sweeps it", () => {
    const g = geometry();
    const snapshot = JSON.stringify(g);
    const pass = runIntrinsicsSweepPass(
      g,
      GROUND_TRUTH,
      70.437,
      [55, 60],
      [80, 85],
      [0.48, 0.5],
      [-0.1, 0, 0.1],
      5,
    );
    expect(JSON.stringify(g)).toBe(snapshot);
    expect(pass.combinationsTested).toBe(24);
    expect(pass.pitchRange).toEqual({ minDeg: 70.437, maxDeg: 70.437, stepDeg: 0 });
    expect(pass.topResults.every((p) => p.pitchDeg === 70.437)).toBe(true);
    expect(pass.bestMape).not.toBeNull();
    expect(pass.bestMinimax!.maxAbsPercentError!).toBeLessThanOrEqual(
      pass.bestMape!.maxAbsPercentError!,
    );
    // An override pitch on the geometry is ignored: the passed sensor pitch wins.
    const overridden = runIntrinsicsSweepPass(
      { ...g, capturePitchDeg: 50 },
      GROUND_TRUTH,
      70.437,
      [55],
      [80],
      [0.5],
      [0],
      1,
    );
    expect(overridden.topResults[0].pitchDeg).toBe(70.437);
  });

  it("restricts the calibration UI to the developer account", () => {
    expect(isDiagnosticsUser("dayne@tss.co.nz")).toBe(true);
    expect(isDiagnosticsUser("someone@else.com")).toBe(false);
    expect(isDiagnosticsUser(null)).toBe(false);
  });
});
