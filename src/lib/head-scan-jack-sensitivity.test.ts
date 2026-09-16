import { describe, expect, it } from "vitest";
import type { CalibrationGeometry } from "@/lib/head-scan-calibration";
import { runJackSensitivity, jackSensitivityCaseGrid } from "@/lib/head-scan-jack-sensitivity";

const geom: CalibrationGeometry = {
  jack: { point: { x: 0.5, y: 0.6 }, radius: 0.03 },
  targets: [
    { number: 1, point: { x: 0.7, y: 0.55 }, status: "marked" },
    { number: 2, point: { x: 0.3, y: 0.58 }, status: "marked" },
    { number: 3, point: { x: 0.52, y: 0.35 }, status: "marked" },
  ],
  aspect: 4 / 3,
  orientation: "mat_bottom",
  capturePitchDeg: 55,
  tipRadius: 0.001,
};

describe("jack selection sensitivity", () => {
  it("keeps the baseline case at zero delta", () => {
    const r = runJackSensitivity(geom, 1600, 1200);
    const base = r.cases.find((c) => c.kind === "baseline")!;
    expect(base.maxAbsDeltaMm).toBe(0);
    expect(r.baseline.normX).toBe(0.5);
    expect(r.baseline.sourcePixelRadius).toBeCloseTo(48, 6);
  });

  it("does not mutate the supplied geometry", () => {
    const before = JSON.stringify(geom);
    runJackSensitivity(geom, 1600, 1200);
    expect(JSON.stringify(geom)).toBe(before);
  });

  it("reports ±1/±2/±3 px summaries and a verdict", () => {
    const r = runJackSensitivity(geom, 1600, 1200);
    expect(r.summary.map((s) => s.levelPx)).toEqual([1, 2, 3]);
    expect(["PASS", "CAUTION"]).toContain(r.verdict);
    expect(r.cases.length).toBe(jackSensitivityCaseGrid().length);
  });
});
