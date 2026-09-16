/**
 * HEAD SCAN CALIBRATION PANEL — DEVELOPER DIAGNOSTIC UI.
 *
 * Rendered ONLY when HeadScanFlow is given `calibration`, which only the
 * private diagnostics route (dayne@tss.co.nz) does. It never appears in a
 * drill, never writes anywhere, and never changes production measurement:
 * it varies the camera-model inputs (FOV-H, optional independent FOV-V) that
 * the solver already accepts and reports the resulting error against manually
 * entered tape-measure ground truth.
 *
 * Recalculation is pure render: the frozen photo, jack circle, target marks
 * and captured pitch/roll are inputs here and are never mutated.
 */
import { useMemo, useState } from "react";
import {
  CALIBRATION_FOV_CHIPS,
  CALIBRATION_FOV_MAX,
  CALIBRATION_FOV_MIN,
  CALIBRATION_FOV_STEP,
  CALIBRATION_FOV_V_MAX,
  CALIBRATION_FOV_V_MIN,
  CALIBRATION_PITCH_MAX,
  CALIBRATION_PITCH_MIN,
  CALIBRATION_PITCH_STEP,
  CALIBRATION_SWEEP_FOVS,
  SWEEP_FOV_MAX,
  SWEEP_FOV_MIN,
  SWEEP_FOV_STEP,
  bestSweepIndexByMae,
  calibrationResult,
  runFov2dSweep,
  runFov2dSweepReport,
  runFovSweep,
  runSolverSweep3d,
  runSolverSweep4d,
  runSolverSweep5d,
  runIntrinsicsSweep,
  SWEEP3D_REFINE_SPAN,
  CALIBRATION_PPX_DEFAULT,
  CALIBRATION_PPX_MAX,
  CALIBRATION_PPX_MIN,
  CALIBRATION_PPX_STEP,
  type CalibrationGeometry,
  type CalibrationResult,
  type Solver3dPass as Solver3dPassType,
  type Solver3dPoint,
  type Solver3dReport,
  type Sweep2dReport,
} from "@/lib/head-scan-calibration";
import {
  runJackSensitivity,
  JACK_SENSITIVITY_PASS_MM,
  type JackSensitivityReport,
} from "@/lib/head-scan-jack-sensitivity";
import {
  runJackRadiusAutoRefinement,
  type JackRefineReport,
} from "@/lib/head-scan-jack-refine";
import { DEFAULT_FOV_H_DEG } from "@/lib/head-scan-geometry";


const mm = (v: number | null) => (v == null ? "—" : `${Math.round(v)} mm`);
const pct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const signedMm = (v: number | null) =>
  v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))} mm`;

/** One row of the 2D sweep, e.g. "H 62° / V 84° | R 541 | L 620 | B 1160 | …". */
function sweep2dLine(r: CalibrationResult): string {
  const byNumber = (n: number) => r.rows.find((row) => row.number === n)?.measuredMm ?? null;
  const val = (n: number) => (byNumber(n) == null ? "—" : String(Math.round(byNumber(n)!)));
  return (
    `H ${r.fovHDeg}° / V ${r.fovVOverrideDeg ?? Math.round(r.activeFovVDeg)}° | ` +
    `R ${val(1)} | L ${val(2)} | B ${val(3)} | ` +
    `MAE ${r.maeMm == null ? "—" : r.maeMm.toFixed(1)} mm | ` +
    `MAPE ${r.mape == null ? "—" : r.mape.toFixed(2)}% | ` +
    `Max ${r.maxAbsErrorMm == null ? "—" : Math.round(r.maxAbsErrorMm)} mm`
  );
}

export type CalibrationPanelState = {
  groundTruth: Record<number, number | null>;
  sweep: CalibrationResult[] | null;
  sweep2d: CalibrationResult[] | null;
  live: CalibrationResult | null;
};

export function HeadScanCalibrationPanel({
  geometry,
  fovOverride,
  setFovOverride,
  fovVOverride,
  setFovVOverride,
  groundTruth,
  setGroundTruth,
  sweep,
  setSweep,
  sweep2d,
  setSweep2d,
  sweep2dFull,
  setSweep2dFull,
  sweep3d,
  setSweep3d,
  sweep4d,
  setSweep4d,
  sweep5d,
  setSweep5d,
  sweepIntrinsics,
  setSweepIntrinsics,
  jackSensitivity,
  setJackSensitivity,
  jackRefine,
  setJackRefine,
  photoSrc,
  showRefineOverlay,
  setShowRefineOverlay,
  imageWidth,
  imageHeight,
  captureRollDeg,
  sensorPitchDeg,
  pitchOverride,
  setPitchOverride,
  ppxOverride,
  setPpxOverride,

  onResetGroundTruth,
}: {
  geometry: CalibrationGeometry | null;
  fovOverride: number | null;
  setFovOverride: (v: number | null) => void;
  fovVOverride: number | null;
  setFovVOverride: (v: number | null) => void;
  groundTruth: Record<number, number | null>;
  setGroundTruth: (v: Record<number, number | null>) => void;
  sweep: CalibrationResult[] | null;
  setSweep: (v: CalibrationResult[] | null) => void;
  sweep2d: CalibrationResult[] | null;
  setSweep2d: (v: CalibrationResult[] | null) => void;
  sweep2dFull: Sweep2dReport | null;
  setSweep2dFull: (v: Sweep2dReport | null) => void;
  sweep3d: Solver3dReport | null;
  setSweep3d: (v: Solver3dReport | null) => void;
  sweep4d: Solver3dReport | null;
  setSweep4d: (v: Solver3dReport | null) => void;
  sweep5d: Solver3dReport | null;
  setSweep5d: (v: Solver3dReport | null) => void;
  /** Sensor-pitch-locked intrinsics sweep (H · V · PP-X · k1). */
  sweepIntrinsics: Solver3dReport | null;
  setSweepIntrinsics: (v: Solver3dReport | null) => void;
  /** Jack-selection sensitivity test (diagnostic only). */
  jackSensitivity: JackSensitivityReport | null;
  setJackSensitivity: (v: JackSensitivityReport | null) => void;
  /** Jack radius auto-refinement experiment (diagnostic only). */
  jackRefine: JackRefineReport | null;
  setJackRefine: (v: JackRefineReport | null) => void;
  /** The in-memory photo data URL. Never leaves the device. */
  photoSrc: string | null;
  /** Draws the auto-fitted circle over the photo for visual inspection. */
  showRefineOverlay: boolean;
  setShowRefineOverlay: (v: boolean) => void;
  /** Source-pixel size of the measured frame (px offsets are converted with it). */
  imageWidth: number;
  imageHeight: number;
  captureRollDeg: number | null;
  /** The REAL sensor pitch recorded at shutter. Never modified here. */
  sensorPitchDeg: number;
  /** Test-only solver pitch. null = off = use the sensor pitch. */
  pitchOverride: number | null;
  setPitchOverride: (v: number | null) => void;
  /** Test-only horizontal optical centre. null = off = production 0.5. */
  ppxOverride: number | null;
  setPpxOverride: (v: number | null) => void;

  onResetGroundTruth: () => void;
}) {
  const [nonce, setNonce] = useState(0);
  const [running2d, setRunning2d] = useState(false);
  const [running3d, setRunning3d] = useState(false);
  const [running4d, setRunning4d] = useState(false);
  const [running5d, setRunning5d] = useState(false);
  const [runningIntr, setRunningIntr] = useState(false);
  const [runningJackSens, setRunningJackSens] = useState(false);
  const [runningRefine, setRunningRefine] = useState(false);
  /** Explicit, opt-in only: a sweep never applies a combination by itself. */
  const applyPoint = (p: Solver3dPoint) => {
    setFovOverride(p.fovHDeg);
    setFovVOverride(p.fovVDeg);
    setPitchOverride(p.pitchDeg);
    setPpxOverride(p.principalPointX === CALIBRATION_PPX_DEFAULT ? null : p.principalPointX);
  };
  const hasGroundTruth = Object.values(groundTruth).some((v) => typeof v === "number" && v > 0);
  const activeFovH = fovOverride ?? DEFAULT_FOV_H_DEG;
  const activePpx = ppxOverride ?? CALIBRATION_PPX_DEFAULT;

  const live = useMemo(
    () =>
      geometry
        ? calibrationResult(geometry, groundTruth, activeFovH, fovVOverride, activePpx)
        : null,
    // `nonce` is the explicit "Recalculate" button; the rest already re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geometry, groundTruth, activeFovH, fovVOverride, activePpx, nonce],
  );


  const bestSweep = sweep ? bestSweepIndexByMae(sweep) : -1;

  return (
    <div
      className="mx-auto max-h-72 w-full max-w-xs space-y-2 overflow-auto rounded-xl border border-sky-400/50 bg-black/80 px-3 py-2 font-mono text-[11px] text-sky-200"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="text-center font-bold tracking-widest text-sky-300">HEAD SCAN CALIBRATION</p>

      {/* ---- Camera model ---- */}
      <label className="flex items-center gap-2 font-bold text-white">
        <input
          type="checkbox"
          checked={fovOverride != null}
          onChange={(e) => setFovOverride(e.target.checked ? DEFAULT_FOV_H_DEG : null)}
        />
        FOV OVERRIDE
      </label>
      {fovOverride != null && (
        <div className="space-y-1">
          <input
            type="range"
            min={CALIBRATION_FOV_MIN}
            max={CALIBRATION_FOV_MAX}
            step={CALIBRATION_FOV_STEP}
            value={fovOverride}
            onChange={(e) => setFovOverride(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={CALIBRATION_FOV_MIN}
              max={CALIBRATION_FOV_MAX}
              step={CALIBRATION_FOV_STEP}
              value={fovOverride}
              onChange={(e) => setFovOverride(Number(e.target.value))}
              className="w-20 rounded bg-white/10 px-1 py-0.5 text-white"
            />
            <span>FOV-H °</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {CALIBRATION_FOV_CHIPS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFovOverride(v)}
                className={`rounded px-1.5 py-0.5 ${
                  fovOverride === v ? "bg-sky-400 text-black" : "bg-white/10"
                }`}
              >
                {v}
                {v === DEFAULT_FOV_H_DEG ? "° ★" : "°"}
              </button>
            ))}
          </div>
          <p className="text-sky-300/80">★ {DEFAULT_FOV_H_DEG}° = current default</p>
        </div>
      )}

      <label className="flex items-center gap-2 font-bold text-white">
        <input
          type="checkbox"
          checked={fovVOverride != null}
          onChange={(e) =>
            setFovVOverride(e.target.checked ? (live?.activeFovVDeg ?? DEFAULT_FOV_H_DEG) : null)
          }
        />
        INDEPENDENT VERTICAL FOV
      </label>
      {fovVOverride != null && (
        <div className="space-y-1">
          <input
            type="range"
            min={CALIBRATION_FOV_V_MIN}
            max={CALIBRATION_FOV_V_MAX}
            step={CALIBRATION_FOV_STEP}
            value={fovVOverride}
            onChange={(e) => setFovVOverride(Number(e.target.value))}
            className="w-full"
          />
          <p>FOV-V: {fovVOverride.toFixed(1)}°</p>
        </div>
      )}

      {/* ---- 2D FOV SWEEP (diagnostic only; never applies a winning FOV) ---- */}
      <button
        type="button"
        disabled={!geometry || !hasGroundTruth || running2d}
        onClick={() => {
          if (!geometry) return;
          setRunning2d(true);
          // Pure calculation on the frozen geometry — the active FOV-H/FOV-V
          // settings are never written to, so they survive the sweep as-is.
          setTimeout(() => {
            setSweep2dFull(runFov2dSweepReport(geometry, groundTruth));
            setRunning2d(false);
          }, 0);
        }}
        className="w-full rounded bg-sky-400/20 py-1 font-bold text-sky-200 disabled:opacity-40"
      >
        {running2d ? "RUNNING…" : "RUN 2D FOV SWEEP"}
      </button>
      {!hasGroundTruth && (
        <p className="text-sky-300/70">Enter ground-truth distances to enable the 2D sweep.</p>
      )}

      {sweep2dFull && (
        <div className="rounded border border-sky-400/40 p-1.5">
          <p className="font-bold text-white">
            2D FOV SWEEP · H {sweep2dFull.hRange.minDeg}–{sweep2dFull.hRange.maxDeg}° / V{" "}
            {sweep2dFull.vRange.minDeg}–{sweep2dFull.vRange.maxDeg}° ·{" "}
            {sweep2dFull.combinationsTested} combos
          </p>
          <div className="max-h-40 overflow-auto">
            {sweep2dFull.top10.map((r, i) => (
              <p
                key={`${r.fovHDeg}-${r.fovVOverrideDeg}`}
                className={i === 0 ? "bg-sky-400/25 font-bold" : ""}
              >
                {sweep2dLine(r)}
              </p>
            ))}
          </div>
          <p className="pt-1 font-bold text-emerald-300">
            BEST BALANCED (lowest max error)
            <br />
            {sweep2dFull.bestBalanced ? sweep2dLine(sweep2dFull.bestBalanced) : "—"}
          </p>
          <p className="text-sky-300/70">Diagnostic only — no FOV is applied.</p>
        </div>
      )}

      {/* ---- 3-VARIABLE SOLVER SWEEP (H-FOV × V-FOV × pitch) ---- */}
      <button
        type="button"
        disabled={!geometry || !hasGroundTruth || running3d}
        onClick={() => {
          if (!geometry) return;
          setRunning3d(true);
          // Pure maths on the frozen geometry: the sliders below are not
          // touched, so the user's H/V/pitch settings survive the sweep.
          setTimeout(() => {
            setSweep3d(runSolverSweep3d(geometry, groundTruth));
            setRunning3d(false);
          }, 0);
        }}
        className="w-full rounded bg-sky-400/20 py-1 font-bold text-sky-200 disabled:opacity-40"
      >
        {running3d ? "RUNNING…" : "RUN 3D CALIBRATION SWEEP"}
      </button>

      {sweep3d && (
        <div className="space-y-2 rounded border border-sky-400/40 p-1.5">
          <p className="font-bold text-white">
            3D SOLVER SWEEP · {sweep3d.totalCombinationsTested} combos
          </p>
          <Sweep3dPass
            title={`COARSE · H ${sweep3d.coarse.hRange.minDeg}–${sweep3d.coarse.hRange.maxDeg}° / V ${sweep3d.coarse.vRange.minDeg}–${sweep3d.coarse.vRange.maxDeg}° / P ${sweep3d.coarse.pitchRange.minDeg}–${sweep3d.coarse.pitchRange.maxDeg}°`}
            pass={sweep3d.coarse}
            onApply={applyPoint}
          />
          {sweep3d.refined && (
            <Sweep3dPass
              title={`REFINED · around best coarse (±${SWEEP3D_REFINE_SPAN}°)`}
              pass={sweep3d.refined}
              onApply={applyPoint}
            />
          )}
          <p className="text-sky-300/70">
            Diagnostic only — nothing is applied unless you press APPLY.
          </p>
        </div>
      )}

      {/* ---- 4-VARIABLE SOLVER SWEEP (adds principal point X) ---- */}
      <button
        type="button"
        disabled={!geometry || !hasGroundTruth || running4d}
        onClick={() => {
          if (!geometry) return;
          setRunning4d(true);
          // Same frozen geometry, same read-only maths — the live sliders and
          // the PP-X override below are untouched by the sweep.
          setTimeout(() => {
            setSweep4d(runSolverSweep4d(geometry, groundTruth));
            setRunning4d(false);
          }, 0);
        }}
        className="w-full rounded bg-fuchsia-400/20 py-1 font-bold text-fuchsia-200 disabled:opacity-40"
      >
        {running4d ? "RUNNING…" : "RUN 4D SWEEP (H · V · PITCH · PP-X)"}
      </button>

      {sweep4d && (
        <div className="space-y-2 rounded border border-fuchsia-400/40 p-1.5">
          <p className="font-bold text-white">
            4D SOLVER SWEEP · {sweep4d.totalCombinationsTested} combos
          </p>
          <Sweep3dPass
            title={`COARSE · H ${sweep4d.coarse.hRange.minDeg}–${sweep4d.coarse.hRange.maxDeg}° / V ${sweep4d.coarse.vRange.minDeg}–${sweep4d.coarse.vRange.maxDeg}° / P ${sweep4d.coarse.pitchRange.minDeg}–${sweep4d.coarse.pitchRange.maxDeg}° / PP-X ${sweep4d.coarse.ppxRange.min}–${sweep4d.coarse.ppxRange.max}`}
            pass={sweep4d.coarse}
            onApply={applyPoint}
          />
          {sweep4d.refined && (
            <Sweep3dPass
              title="REFINED · around best coarse"
              pass={sweep4d.refined}
              onApply={applyPoint}
            />
          )}
          <p className="text-fuchsia-200/70">
            Diagnostic only — nothing is applied unless you press APPLY.
          </p>
        </div>
      )}

      {/* ---- 5-VARIABLE SOLVER SWEEP (adds radial distortion k1) ---- */}
      <button
        type="button"
        disabled={!geometry || !hasGroundTruth || running5d}
        onClick={() => {
          if (!geometry) return;
          setRunning5d(true);
          // Diagnostic only: the frozen geometry and every live override are
          // read-only here, and production always solves with k1 = 0.
          setTimeout(() => {
            setSweep5d(runSolverSweep5d(geometry, groundTruth));
            setRunning5d(false);
          }, 0);
        }}
        className="w-full rounded bg-orange-400/20 py-1 font-bold text-orange-200 disabled:opacity-40"
      >
        {running5d ? "RUNNING…" : "RUN 5D SWEEP (H · V · PITCH · PP-X · k1)"}
      </button>

      {sweep5d && (
        <div className="space-y-2 rounded border border-orange-400/40 p-1.5">
          <p className="font-bold text-white">
            5D SOLVER SWEEP · {sweep5d.totalCombinationsTested} combos
          </p>
          <Sweep3dPass
            title={`COARSE · H ${sweep5d.coarse.hRange.minDeg}–${sweep5d.coarse.hRange.maxDeg}° / V ${sweep5d.coarse.vRange.minDeg}–${sweep5d.coarse.vRange.maxDeg}° / P ${sweep5d.coarse.pitchRange.minDeg}–${sweep5d.coarse.pitchRange.maxDeg}° / PP-X ${sweep5d.coarse.ppxRange.min}–${sweep5d.coarse.ppxRange.max} / k1 ${sweep5d.coarse.k1Range.min}–${sweep5d.coarse.k1Range.max}`}
            pass={sweep5d.coarse}
            onApply={applyPoint}
          />
          {sweep5d.refined && (
            <Sweep3dPass
              title="REFINED · around best coarse"
              pass={sweep5d.refined}
              onApply={applyPoint}
            />
          )}
          <p className="text-orange-200/70">
            Diagnostic only — k1 is never used by production measurement, and
            APPLY only sets the FOV / pitch / PP-X test overrides.
          </p>
        </div>
      )}

      {/* ---- 4-VARIABLE INTRINSICS SWEEP · SENSOR PITCH LOCKED ---- */}
      <button
        type="button"
        disabled={!geometry || !hasGroundTruth || runningIntr}
        onClick={() => {
          if (!geometry) return;
          setRunningIntr(true);
          // Every candidate solves at the EXACT sensor pitch from the shutter:
          // no pitch override, no fitted pitch. Diagnostic only.
          setTimeout(() => {
            setSweepIntrinsics(runIntrinsicsSweep(geometry, groundTruth, sensorPitchDeg));
            setRunningIntr(false);
          }, 0);
        }}
        className="w-full rounded bg-sky-400/20 py-1 font-bold text-sky-200 disabled:opacity-40"
      >
        {runningIntr
          ? "RUNNING…"
          : "RUN 4D INTRINSICS SWEEP — SENSOR PITCH LOCKED"}
      </button>

      {sweepIntrinsics && (
        <div className="space-y-2 rounded border border-sky-400/40 p-1.5">
          <p className="font-bold text-white">
            4D INTRINSICS SWEEP · PITCH LOCKED {sensorPitchDeg.toFixed(2)}° ·{" "}
            {sweepIntrinsics.totalCombinationsTested} combos
          </p>
          <Sweep3dPass
            title={`COARSE · H ${sweepIntrinsics.coarse.hRange.minDeg}–${sweepIntrinsics.coarse.hRange.maxDeg}° / V ${sweepIntrinsics.coarse.vRange.minDeg}–${sweepIntrinsics.coarse.vRange.maxDeg}° / PP-X ${sweepIntrinsics.coarse.ppxRange.min}–${sweepIntrinsics.coarse.ppxRange.max} / k1 ${sweepIntrinsics.coarse.k1Range.min}–${sweepIntrinsics.coarse.k1Range.max}`}
            pass={sweepIntrinsics.coarse}
            onApply={applyPoint}
          />
          {sweepIntrinsics.refined && (
            <Sweep3dPass
              title="REFINED · around best coarse"
              pass={sweepIntrinsics.refined}
              onApply={applyPoint}
            />
          )}
          <BoundaryFlag
            pass={sweepIntrinsics.refined ?? sweepIntrinsics.coarse}
            ranges={sweepIntrinsics.coarse}
          />
          <p className="text-sky-200/70">
            Pitch is never fitted here — every combination used the recorded
            sensor pitch. Diagnostic only; production values are unchanged.
          </p>
        </div>
      )}

      {/* ---- JACK SELECTION SENSITIVITY TEST (diagnostic only) ---- */}
      <button
        type="button"
        disabled={!geometry || runningJackSens}
        onClick={() => {
          if (!geometry) return;
          setRunningJackSens(true);
          setTimeout(() => {
            setJackSensitivity(
              runJackSensitivity(
                geometry,
                imageWidth,
                imageHeight,
                activeFovH,
                fovVOverride,
                activePpx,
                0,
              ),
            );
            setRunningJackSens(false);
          }, 0);
        }}
        className="w-full rounded bg-amber-400/20 py-1 font-bold text-amber-200 disabled:opacity-40"
      >
        {runningJackSens ? "RUNNING…" : "RUN JACK SELECTION SENSITIVITY TEST"}
      </button>

      {jackSensitivity && (
        <div className="space-y-2 rounded border border-amber-400/40 p-1.5">
          <p className="font-bold text-white">
            JACK SENSITIVITY ·{" "}
            <span className={jackSensitivity.verdict === "PASS" ? "text-emerald-300" : "text-red-300"}>
              {jackSensitivity.verdict}
            </span>{" "}
            (±2 px within ±{JACK_SENSITIVITY_PASS_MM} mm)
          </p>
          <p className="text-amber-200/80">
            Baseline jack {jackSensitivity.baseline.normX.toFixed(4)} /{" "}
            {jackSensitivity.baseline.normY.toFixed(4)} · r{" "}
            {jackSensitivity.baseline.normRadius.toFixed(4)} ·{" "}
            {jackSensitivity.baseline.sourcePixelRadius?.toFixed(1) ?? "—"} px
          </p>
          <div className="space-y-0.5">
            {jackSensitivity.baseline.bowls.map((b) => (
              <p key={b.number}>
                BASE {b.label}: {mm(b.mm)}
              </p>
            ))}
          </div>
          <div className="max-h-40 space-y-0.5 overflow-auto">
            {jackSensitivity.cases
              .filter((c) => c.kind !== "baseline")
              .map((c, i) => (
                <p key={i} className="whitespace-nowrap">
                  <span className="text-white">{c.label}</span>{" "}
                  {c.bowls.map((b) => `${b.label} ${signedMm(b.deltaMm)}`).join(" | ")} · max{" "}
                  {mm(c.maxAbsDeltaMm)} · mean {mm(c.meanAbsDeltaMm)}
                </p>
              ))}
          </div>
          <div className="space-y-0.5 border-t border-amber-400/30 pt-1">
            {jackSensitivity.summary.map((s) => (
              <p key={s.levelPx}>
                ±{s.levelPx} px → worst {mm(s.worstAbsDeltaMm)} · avg {mm(s.meanAbsDeltaMm)} · worst{" "}
                {pct(s.worstAbsDeltaPercent)} ·{" "}
                <span className={s.verdict === "PASS" ? "text-emerald-300" : "text-red-300"}>
                  {s.verdict}
                </span>
              </p>
            ))}
          </div>
          <p className="text-amber-200/70">
            Simulation only — the real jack selection, overrides and solver
            state are untouched.
          </p>
        </div>
      )}

      {/* ---- JACK RADIUS AUTO-REFINEMENT EXPERIMENT (diagnostic only) ---- */}
      <button
        type="button"
        disabled={!geometry || !photoSrc || runningRefine}
        onClick={() => {
          if (!geometry || !photoSrc) return;
          setRunningRefine(true);
          void runJackRadiusAutoRefinement(
            photoSrc,
            geometry,
            activeFovH,
            fovVOverride,
            activePpx,
            0,
          )
            .then((r) => {
              setJackRefine(r);
              setShowRefineOverlay(true);
            })
            .catch(() => setJackRefine(null))
            .finally(() => setRunningRefine(false));
        }}
        className="w-full rounded bg-cyan-400/20 py-1 font-bold text-cyan-200 disabled:opacity-40"
      >
        {runningRefine ? "REFINING…" : "RUN JACK RADIUS AUTO-REFINEMENT"}
      </button>

      {jackRefine && (
        <div className="space-y-2 rounded border border-cyan-400/40 p-1.5">
          <p className="font-bold text-white">
            JACK RADIUS AUTO-REFINEMENT · analysed {jackRefine.analysis.width}×
            {jackRefine.analysis.height}
          </p>
          {jackRefine.error && <p className="text-red-300">{jackRefine.error}</p>}
          <p>
            User radius {jackRefine.manual.radiusPx.toFixed(2)} px → auto{" "}
            {jackRefine.refined ? jackRefine.refined.radiusPx.toFixed(2) : "—"} px ·{" "}
            <span className="text-white">
              Δr{" "}
              {jackRefine.correction.radiusPx == null
                ? "—"
                : `${jackRefine.correction.radiusPx >= 0 ? "+" : "−"}${Math.abs(jackRefine.correction.radiusPx).toFixed(2)} px`}
            </span>{" "}
            ({pct(jackRefine.correction.radiusPercent)})
          </p>
          <p>
            Δcentre X{" "}
            {jackRefine.correction.centreXPx == null
              ? "—"
              : jackRefine.correction.centreXPx.toFixed(2)}{" "}
            px · Y{" "}
            {jackRefine.correction.centreYPx == null
              ? "—"
              : jackRefine.correction.centreYPx.toFixed(2)}{" "}
            px
          </p>
          {jackRefine.fit && (
            <p>
              Samples {jackRefine.fit.raysAccepted}/{jackRefine.fit.raysCast} (
              {jackRefine.fit.acceptedPercent.toFixed(0)}%) · residual RMS{" "}
              {jackRefine.fit.residualRmsPx.toFixed(2)} px · max{" "}
              {jackRefine.fit.residualMaxPx.toFixed(2)} px · confidence{" "}
              {(jackRefine.fit.confidence * 100).toFixed(0)}%
            </p>
          )}
          <div className="space-y-0.5 border-t border-cyan-400/30 pt-1">
            {jackRefine.bowls.map((b) => (
              <p key={b.number} className="whitespace-nowrap">
                <span className="text-white">{b.label}</span> manual {mm(b.manualMm)} → auto{" "}
                {mm(b.refinedMm)} · {signedMm(b.deltaMm)} ({pct(b.deltaPercent)})
              </p>
            ))}
          </div>
          <p>
            Max |Δ| {mm(jackRefine.maxAbsDeltaMm)} · mean |Δ| {mm(jackRefine.meanAbsDeltaMm)}
          </p>
          <label className="flex items-center gap-2 font-bold text-white">
            <input
              type="checkbox"
              checked={showRefineOverlay}
              onChange={(e) => setShowRefineOverlay(e.target.checked)}
            />
            SHOW FITTED CIRCLE OVERLAY
          </label>
          <p className="text-cyan-200/70">
            Experiment only — the real jack selection and every production
            constant are unchanged.
          </p>
        </div>
      )}


      {/* ---- Principal point X (test only; production is always 0.5) ---- */}
      <label className="flex items-center gap-2 font-bold text-white">
        <input
          type="checkbox"
          checked={ppxOverride != null}
          onChange={(e) => setPpxOverride(e.target.checked ? CALIBRATION_PPX_DEFAULT : null)}
        />
        PRINCIPAL POINT X
      </label>
      {ppxOverride != null && (
        <div className="space-y-1">
          <input
            type="range"
            min={CALIBRATION_PPX_MIN}
            max={CALIBRATION_PPX_MAX}
            step={CALIBRATION_PPX_STEP}
            value={ppxOverride}
            onChange={(e) => setPpxOverride(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={CALIBRATION_PPX_MIN}
              max={CALIBRATION_PPX_MAX}
              step={CALIBRATION_PPX_STEP}
              value={ppxOverride}
              onChange={(e) =>
                setPpxOverride(
                  e.target.value === "" ? CALIBRATION_PPX_DEFAULT : Number(e.target.value),
                )
              }
              className="w-24 rounded bg-white/10 px-1 py-0.5 text-white"
            />
            <span>PP-X: {ppxOverride.toFixed(3)}</span>
          </div>
          <button
            type="button"
            onClick={() => setPpxOverride(CALIBRATION_PPX_DEFAULT)}
            className="w-full rounded bg-white/10 py-0.5 text-sky-200"
          >
            RESET TO CENTRE (0.500)
          </button>
        </div>
      )}


      {/* ---- Pitch override (test only; sensor pitch is never modified) ---- */}
      <label className="flex items-center gap-2 font-bold text-white">
        <input
          type="checkbox"
          checked={pitchOverride != null}
          onChange={(e) => setPitchOverride(e.target.checked ? sensorPitchDeg : null)}
        />
        PITCH OVERRIDE
      </label>
      {pitchOverride != null && (
        <div className="space-y-1">
          <input
            type="range"
            min={CALIBRATION_PITCH_MIN}
            max={CALIBRATION_PITCH_MAX}
            step={CALIBRATION_PITCH_STEP}
            value={pitchOverride}
            onChange={(e) => setPitchOverride(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={CALIBRATION_PITCH_MIN}
              max={CALIBRATION_PITCH_MAX}
              step={0.1}
              value={pitchOverride}
              onChange={(e) => setPitchOverride(e.target.value === "" ? sensorPitchDeg : Number(e.target.value))}
              className="w-20 rounded bg-white/10 px-1 py-0.5 text-white"
            />
            <span>Solver Pitch: {pitchOverride.toFixed(1)}°</span>
          </div>
          <button
            type="button"
            onClick={() => setPitchOverride(sensorPitchDeg)}
            className="w-full rounded bg-white/10 py-0.5 text-sky-200"
          >
            RESET TO SENSOR PITCH ({sensorPitchDeg.toFixed(1)}°)
          </button>
        </div>
      )}

      <p>
        Active FOV-H {activeFovH.toFixed(1)}° · FOV-V {live ? live.activeFovVDeg.toFixed(1) : "—"}°
        {fovVOverride == null ? " (derived)" : " (override)"}
      </p>
      <p>
        Sensor pitch {sensorPitchDeg.toFixed(2)}° · roll{" "}
        {captureRollDeg == null ? "n/a" : `${captureRollDeg.toFixed(2)}°`}
      </p>
      <p className={pitchOverride != null ? "font-bold text-amber-300" : ""}>
        Solver pitch {geometry ? geometry.capturePitchDeg.toFixed(2) : "—"}°
        {pitchOverride != null ? " (TEST OVERRIDE)" : " (sensor)"}
      </p>
      <p className={ppxOverride != null ? "font-bold text-fuchsia-300" : ""}>
        Principal point X {activePpx.toFixed(3)}
        {ppxOverride != null ? " (TEST OVERRIDE)" : " (centre)"}
      </p>



      <button
        type="button"
        onClick={() => setNonce((n) => n + 1)}
        className="w-full rounded bg-sky-400/20 py-1 font-bold text-sky-200"
      >
        RECALCULATE
      </button>

      {/* ---- Live results vs ground truth ---- */}
      <div className="rounded border border-sky-400/40 p-1.5">
        <p className="font-bold text-white">GROUND TRUTH – CALIBRATION</p>
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2">
          <span className="text-sky-300/70">Target</span>
          <span className="text-sky-300/70">Calc</span>
          <span className="text-sky-300/70">Actual</span>
          <span className="text-sky-300/70">Err</span>
          <span className="text-sky-300/70">%</span>
          {live?.rows.map((r) => (
            <FragmentRow
              key={r.number}
              label={`${r.number} ${r.label}`}
              measured={mm(r.measuredMm)}
              actual={r.actualMm}
              onActual={(v) => setGroundTruth({ ...groundTruth, [r.number]: v })}
              errMm={signedMm(r.signedErrorMm)}
              errPct={pct(r.percentageError)}
            />
          ))}
        </div>
        <p className="pt-1 font-bold text-white">
          MAPE: {live?.mape == null ? "—" : `${live.mape.toFixed(2)}%`} · MAE:{" "}
          {live?.maeMm == null ? "—" : `${live.maeMm.toFixed(1)} mm`}
        </p>
        <button
          type="button"
          onClick={onResetGroundTruth}
          className="mt-1 w-full rounded bg-white/10 py-0.5 text-sky-200"
        >
          RESET GROUND TRUTH
        </button>
        <p className="text-sky-300/70">
          Saved on this device for the 90/80/70/60/50° captures. Negative error = Head Scan reads
          short.
        </p>
      </div>

      {/* ---- Sweeps ---- */}
      <div className="flex gap-1">
        <button
          type="button"
          disabled={!geometry}
          onClick={() =>
            geometry && setSweep(runFovSweep(geometry, groundTruth, CALIBRATION_SWEEP_FOVS, fovVOverride))
          }
          className="flex-1 rounded bg-sky-400/20 py-1 font-bold text-sky-200 disabled:opacity-40"
        >
          RUN FOV SWEEP
        </button>
        <button
          type="button"
          disabled={!geometry}
          onClick={() => geometry && setSweep2d(runFov2dSweep(geometry, groundTruth))}
          className="flex-1 rounded bg-sky-400/20 py-1 font-bold text-sky-200 disabled:opacity-40"
        >
          ADVANCED 2D
        </button>
      </div>

      {sweep && (
        <div className="rounded border border-sky-400/40 p-1.5">
          <p className="font-bold text-white">
            FOV SWEEP {SWEEP_FOV_MIN}–{SWEEP_FOV_MAX}° / {SWEEP_FOV_STEP}°
          </p>
          <p className="font-bold text-sky-300">
            Best FOV:{" "}
            {bestSweep >= 0
              ? `${sweep[bestSweep].fovHDeg}° (MAE ${sweep[bestSweep].maeMm!.toFixed(1)} mm)`
              : "—"}
          </p>
          <div className="max-h-40 overflow-auto">
            {sweep.map((r, i) => (
              <p key={r.fovHDeg} className={i === bestSweep ? "bg-sky-400/25 font-bold" : ""}>
                {r.fovHDeg}°{" "}
                {r.rows
                  .map(
                    (row) =>
                      `${row.label} ${mm(row.measuredMm)} ${signedMm(row.signedErrorMm)}`,
                  )
                  .join(" · ")}{" "}
                | MAE {r.maeMm == null ? "—" : `${r.maeMm.toFixed(1)} mm`}
              </p>
            ))}
          </div>
        </div>
      )}

      {sweep2d && (
        <div className="rounded border border-sky-400/40 p-1.5">
          <p className="font-bold text-white">BEST 10 (H × V)</p>
          {sweep2d.map((r, i) => (
            <p key={`${r.fovHDeg}-${r.fovVOverrideDeg}-${i}`}>
              H {r.fovHDeg}° V {r.fovVOverrideDeg}°{" "}
              {r.rows.map((row) => `${row.label} ${mm(row.measuredMm)}`).join(" · ")} | MAPE{" "}
              {r.mape == null ? "—" : `${r.mape.toFixed(2)}%`}
            </p>
          ))}
        </div>
      )}

      <p className="text-sky-300/70">
        Diagnostic only. Ground truth is used for error maths only — never as solver input.
      </p>
    </div>
  );
}

/**
 * FINAL CALIBRATION TEST helper — warns when a winning FOV sits on (or within
 * one coarse step of) the edge of the searched range, which means the true
 * optimum probably lies outside the window. Diagnostic display only.
 */
function BoundaryFlag({ pass, ranges }: { pass: Solver3dPassType; ranges: Solver3dPassType }) {
  const notes: string[] = [];
  const check = (label: string, v: number, min: number, max: number, tol: number) => {
    if (v <= min + tol) notes.push(`${label} ${v}° is at/near the LOWER bound (${min}°)`);
    else if (v >= max - tol) notes.push(`${label} ${v}° is at/near the UPPER bound (${max}°)`);
  };
  for (const [name, p] of [
    ["Best MAPE", pass.bestMape],
    ["Best Minimax", pass.bestMinimax],
  ] as const) {
    if (!p) continue;
    check(`${name} H-FOV`, p.fovHDeg, ranges.hRange.minDeg, ranges.hRange.maxDeg, 0.5);
    check(`${name} V-FOV`, p.fovVDeg, ranges.vRange.minDeg, ranges.vRange.maxDeg, 0.5);
  }
  if (!notes.length) {
    return <p className="text-emerald-300">Winning FOVs are interior to the search range.</p>;
  }
  return (
    <div className="rounded border border-red-400/60 bg-red-500/15 p-1 text-red-200">
      <p className="font-bold">⚠ BOUNDARY WARNING</p>
      {notes.map((n) => (
        <p key={n}>{n}</p>
      ))}
    </div>
  );
}

function Sweep3dPass({
  title,
  pass,
  onApply,
}: {
  title: string;
  pass: Solver3dPassType;
  onApply: (p: Solver3dPoint) => void;
}) {
  return (
    <div>
      <p className="font-bold text-white">
        {title} · {pass.combinationsTested} combos
      </p>
      <p className="font-bold text-emerald-300">BEST MAPE</p>
      {pass.bestMape ? <Sweep3dRow p={pass.bestMape} onApply={onApply} /> : <p>—</p>}
      <p className="pt-1 font-bold text-amber-300">BEST MINIMAX (lowest worst-case %)</p>
      {pass.bestMinimax ? <Sweep3dRow p={pass.bestMinimax} onApply={onApply} /> : <p>—</p>}
      <p className="pt-1 font-bold text-white">TOP {pass.topResults.length} BY MAPE</p>
      <div className="max-h-44 overflow-auto">
        {pass.topResults.map((p, i) => (
          <div
            key={`${p.fovHDeg}-${p.fovVDeg}-${p.pitchDeg}-${p.principalPointX}-${p.k1}-${i}`}
            className={i === 0 ? "bg-sky-400/25" : ""}
          >
            <Sweep3dRow p={p} onApply={onApply} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Sweep3dRow({ p, onApply }: { p: Solver3dPoint; onApply: (p: Solver3dPoint) => void }) {
  const cell = (n: number) => {
    const row = p.rows.find((r) => r.number === n);
    if (!row || row.measuredMm == null) return "—";
    const pct =
      row.percentageError == null
        ? ""
        : ` ${row.percentageError >= 0 ? "+" : "−"}${Math.abs(row.percentageError).toFixed(2)}%`;
    return `${Math.round(row.measuredMm)}${
      row.signedErrorMm == null
        ? ""
        : ` (${row.signedErrorMm >= 0 ? "+" : "−"}${Math.abs(Math.round(row.signedErrorMm))} mm${pct})`
    }`;
  };
  return (
    <div className="flex items-start gap-1">
      <p className="flex-1">
        H {p.fovHDeg}° / V {p.fovVDeg.toFixed(2)}° / P {p.pitchDeg.toFixed(1)}° / PPX{" "}
        {p.principalPointX.toFixed(3)} / k1 {p.k1.toFixed(3)} | R {cell(1)} | L{" "}
        {cell(2)} | B {cell(3)} | MAPE {p.mape == null ? "—" : `${p.mape.toFixed(2)}%`} | MAE{" "}
        {p.maeMm == null ? "—" : `${p.maeMm.toFixed(1)} mm`} | Max{" "}
        {p.maxAbsErrorMm == null ? "—" : `${Math.round(p.maxAbsErrorMm)} mm`} /{" "}
        {p.maxAbsPercentError == null ? "—" : `${p.maxAbsPercentError.toFixed(2)}%`}
      </p>
      <button
        type="button"
        onClick={() => onApply(p)}
        className="shrink-0 rounded bg-white/10 px-1 text-sky-200"
      >
        APPLY
      </button>
    </div>
  );
}

function FragmentRow({
  label,
  measured,
  actual,
  onActual,
  errMm,
  errPct,
}: {
  label: string;
  measured: string;
  actual: number | null;
  onActual: (v: number | null) => void;
  errMm: string;
  errPct: string;
}) {
  return (
    <>
      <span className="text-white">{label}</span>
      <span>{measured}</span>
      <input
        type="number"
        inputMode="numeric"
        value={actual ?? ""}
        onChange={(e) => onActual(e.target.value === "" ? null : Number(e.target.value))}
        className="w-16 rounded bg-white/10 px-1 text-white"
      />
      <span>{errMm}</span>
      <span>{errPct}</span>
    </>
  );
}
