/**
 * HEAD SCAN — JACK SELECTION SENSITIVITY TEST (DIAGNOSTIC ONLY).
 *
 * Quantifies how much ordinary user variation when marking the jack changes
 * the final edge-to-edge bowl distances.
 *
 * Nothing here mutates state: the captured photo, bowl edge points, sensor
 * pitch, ground truth, solver parameters and the real jack selection are all
 * left exactly as they are. Every simulated case is measured through the SAME
 * `measureTargetMm` → `measureBowl` production path, with a throwaway copy of
 * the jack circle.
 */

import { CALIBRATION_TARGET_LABELS, measureTargetMm, type CalibrationGeometry } from "@/lib/head-scan-calibration";
import { DEFAULT_FOV_H_DEG, DEFAULT_PRINCIPAL_POINT_X } from "@/lib/head-scan-geometry";

/** PASS threshold: ±2 px of jack-selection variation must stay within this. */
export const JACK_SENSITIVITY_PASS_MM = 5;
/** Pixel levels reported in the summary. */
export const JACK_SENSITIVITY_LEVELS: readonly number[] = [1, 2, 3];

export type JackSensitivityBowl = {
  number: number;
  label: string;
  /** Final edge-to-edge distance for this simulated jack (mm). */
  mm: number | null;
  /** Change from the perfectly marked baseline (mm). */
  deltaMm: number | null;
  /** Change from the baseline as a percentage of the baseline distance. */
  deltaPercent: number | null;
};

export type JackSensitivityCase = {
  /** "centre" | "radius" | "combined" | "baseline". */
  kind: "baseline" | "centre" | "radius" | "combined";
  label: string;
  /** Simulated jack centre offset in SOURCE pixels. */
  dxPx: number;
  dyPx: number;
  /** Simulated jack radius change in SOURCE pixels. */
  drPx: number;
  /** Largest |dx|,|dy|,|dr| in this case — the "px level" it belongs to. */
  levelPx: number;
  jack: { normX: number; normY: number; normRadius: number };
  bowls: JackSensitivityBowl[];
  maxAbsDeltaMm: number | null;
  meanAbsDeltaMm: number | null;
  maxAbsDeltaPercent: number | null;
};

export type JackSensitivityLevelSummary = {
  levelPx: number;
  casesTested: number;
  /** Worst single bowl distance change at this level (mm). */
  worstAbsDeltaMm: number | null;
  /** Mean absolute distance change across every bowl at this level (mm). */
  meanAbsDeltaMm: number | null;
  /** Worst single bowl percentage change at this level. */
  worstAbsDeltaPercent: number | null;
  /** PASS when every bowl stayed within the ±5 mm threshold. */
  verdict: "PASS" | "CAUTION";
};

export type JackSensitivityReport = {
  schema: "bowlmate.headscan.jackSensitivity/1";
  generatedAt: string;
  thresholdMm: number;
  /** Solver settings held fixed for every case. */
  solver: {
    fovHDeg: number;
    fovVDeg: number | null;
    principalPointX: number;
    k1: number;
    capturePitchDeg: number;
    aspect: number;
    orientation: string;
  };
  baseline: {
    normX: number;
    normY: number;
    normRadius: number;
    sourcePixelCentre: { x: number; y: number } | null;
    sourcePixelRadius: number | null;
    imageWidth: number;
    imageHeight: number;
    bowls: Array<{ number: number; label: string; mm: number | null }>;
  };
  cases: JackSensitivityCase[];
  /** ±1 px, ±2 px, ±3 px roll-ups. */
  summary: JackSensitivityLevelSummary[];
  /** PASS when the ±2 px level passes; CAUTION otherwise. */
  verdict: "PASS" | "CAUTION";
};

type Offset = { kind: JackSensitivityCase["kind"]; dx: number; dy: number; dr: number };

/** The simulated jack selections, in report order. */
export function jackSensitivityCaseGrid(): Offset[] {
  const out: Offset[] = [{ kind: "baseline", dx: 0, dy: 0, dr: 0 }];
  // Centre offsets: horizontal, vertical, then diagonals.
  for (const n of [1, 2, 3]) {
    out.push({ kind: "centre", dx: +n, dy: 0, dr: 0 });
    out.push({ kind: "centre", dx: -n, dy: 0, dr: 0 });
    out.push({ kind: "centre", dx: 0, dy: +n, dr: 0 });
    out.push({ kind: "centre", dx: 0, dy: -n, dr: 0 });
  }
  for (const n of [1, 2, 3]) {
    out.push({ kind: "centre", dx: +n, dy: +n, dr: 0 });
    out.push({ kind: "centre", dx: +n, dy: -n, dr: 0 });
    out.push({ kind: "centre", dx: -n, dy: +n, dr: 0 });
    out.push({ kind: "centre", dx: -n, dy: -n, dr: 0 });
  }
  // Radius error on its own.
  for (const n of [1, 2, 3]) {
    out.push({ kind: "radius", dx: 0, dy: 0, dr: +n });
    out.push({ kind: "radius", dx: 0, dy: 0, dr: -n });
  }
  // Realistic combined errors: centre shifted while the radius is also off.
  const combos: Array<[number, number, number]> = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, 1],
    [-1, -1, -1],
    [2, 1, 2],
    [2, 2, -2],
    [-2, 1, -1],
    [-2, -2, 2],
  ];
  for (const [dx, dy, dr] of combos) out.push({ kind: "combined", dx, dy, dr });
  return out;
}

function label(o: Offset): string {
  if (o.kind === "baseline") return "BASELINE";
  const parts: string[] = [];
  if (o.dx || o.dy) parts.push(`Δcentre ${o.dx >= 0 ? "+" : ""}${o.dx}/${o.dy >= 0 ? "+" : ""}${o.dy} px`);
  if (o.dr) parts.push(`Δradius ${o.dr >= 0 ? "+" : ""}${o.dr} px`);
  return parts.join(" · ");
}

/**
 * Run the whole sensitivity test. `geom` is treated as read-only — only a
 * copied jack circle varies between cases.
 */
export function runJackSensitivity(
  geom: CalibrationGeometry,
  imageWidth: number,
  imageHeight: number,
  fovHDeg: number = DEFAULT_FOV_H_DEG,
  fovVDeg: number | null = null,
  principalPointX: number = DEFAULT_PRINCIPAL_POINT_X,
  k1: number = 0,
): JackSensitivityReport {
  const w = imageWidth > 0 ? imageWidth : 0;
  const h = imageHeight > 0 ? imageHeight : 0;
  const targets = geom.targets;

  const measureAll = (jackOverride: CalibrationGeometry["jack"]) => {
    const g: CalibrationGeometry = { ...geom, jack: jackOverride };
    return targets.map((t) => ({
      number: t.number,
      label: CALIBRATION_TARGET_LABELS[t.number] ?? `Bowl ${t.number}`,
      mm: measureTargetMm(g, t, fovHDeg, fovVDeg, principalPointX, k1),
    }));
  };

  const baselineBowls = measureAll(geom.jack);

  const cases: JackSensitivityCase[] = jackSensitivityCaseGrid().map((o) => {
    const jack = {
      ...geom.jack,
      point: {
        x: geom.jack.point.x + (w > 0 ? o.dx / w : 0),
        y: geom.jack.point.y + (h > 0 ? o.dy / h : 0),
      },
      radius: Math.max(0.002, geom.jack.radius + (w > 0 ? o.dr / w : 0)),
    };
    const measured = measureAll(jack);
    const bowls: JackSensitivityBowl[] = measured.map((m, i) => {
      const base = baselineBowls[i]?.mm ?? null;
      const deltaMm = m.mm != null && base != null ? m.mm - base : null;
      return {
        number: m.number,
        label: m.label,
        mm: m.mm,
        deltaMm,
        deltaPercent: deltaMm != null && base ? (deltaMm / base) * 100 : null,
      };
    });
    const absMm = bowls.map((b) => b.deltaMm).filter((v): v is number => v != null).map(Math.abs);
    const absPct = bowls.map((b) => b.deltaPercent).filter((v): v is number => v != null).map(Math.abs);
    return {
      kind: o.kind,
      label: label(o),
      dxPx: o.dx,
      dyPx: o.dy,
      drPx: o.dr,
      levelPx: Math.max(Math.abs(o.dx), Math.abs(o.dy), Math.abs(o.dr)),
      jack: { normX: jack.point.x, normY: jack.point.y, normRadius: jack.radius },
      bowls,
      maxAbsDeltaMm: absMm.length ? Math.max(...absMm) : null,
      meanAbsDeltaMm: absMm.length ? absMm.reduce((a, b) => a + b, 0) / absMm.length : null,
      maxAbsDeltaPercent: absPct.length ? Math.max(...absPct) : null,
    };
  });

  const summary: JackSensitivityLevelSummary[] = JACK_SENSITIVITY_LEVELS.map((lvl) => {
    // A level includes everything up to and including that pixel magnitude.
    const rows = cases.filter((c) => c.levelPx > 0 && c.levelPx <= lvl);
    const mms = rows.flatMap((c) => c.bowls.map((b) => b.deltaMm)).filter((v): v is number => v != null).map(Math.abs);
    const pcts = rows.flatMap((c) => c.bowls.map((b) => b.deltaPercent)).filter((v): v is number => v != null).map(Math.abs);
    const worst = mms.length ? Math.max(...mms) : null;
    return {
      levelPx: lvl,
      casesTested: rows.length,
      worstAbsDeltaMm: worst,
      meanAbsDeltaMm: mms.length ? mms.reduce((a, b) => a + b, 0) / mms.length : null,
      worstAbsDeltaPercent: pcts.length ? Math.max(...pcts) : null,
      verdict: worst != null && worst > JACK_SENSITIVITY_PASS_MM ? "CAUTION" : "PASS",
    };
  });

  const twoPx = summary.find((s) => s.levelPx === 2);

  return {
    schema: "bowlmate.headscan.jackSensitivity/1",
    generatedAt: new Date().toISOString(),
    thresholdMm: JACK_SENSITIVITY_PASS_MM,
    solver: {
      fovHDeg,
      fovVDeg,
      principalPointX,
      k1,
      capturePitchDeg: geom.capturePitchDeg,
      aspect: geom.aspect,
      orientation: geom.orientation,
    },
    baseline: {
      normX: geom.jack.point.x,
      normY: geom.jack.point.y,
      normRadius: geom.jack.radius,
      sourcePixelCentre: w > 0 && h > 0 ? { x: geom.jack.point.x * w, y: geom.jack.point.y * h } : null,
      sourcePixelRadius: w > 0 ? geom.jack.radius * w : null,
      imageWidth: w,
      imageHeight: h,
      bowls: baselineBowls,
    },
    cases,
    summary,
    verdict: twoPx?.verdict ?? "PASS",
  };
}
