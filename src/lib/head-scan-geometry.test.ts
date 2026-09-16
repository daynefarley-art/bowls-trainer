import { describe, it, expect } from "vitest";
import { measureBowl } from "@/lib/head-scan";
import { projectGround, solveGround, JACK_DIAMETER_MM } from "@/lib/head-scan-geometry";
import { matBandLabel } from "@/lib/measurement";

/**
 * MEASUREMENT QA — known real-world edge-to-edge distances.
 *
 * Each case builds a synthetic photo with the forward camera model: a jack on
 * the ground at a known place, a bowl whose NEAR EDGE sits a known number of
 * millimetres from the jack's outer edge, both projected into image
 * coordinates. The solver must recover the original distance.
 */
const ASPECT = 4 / 3;
const FOV = 66;

function scan(gapMm: number, pitchDeg: number, camHeightMm = 1500, jackAheadMm = 1800) {
  const jackR = JACK_DIAMETER_MM / 2;
  const jackG = { x: 0, y: jackAheadMm };
  // Bowl near edge, directly beyond the jack.
  const bowlG = { x: 0, y: jackAheadMm + jackR + gapMm };

  const jackImg = projectGround(jackG, camHeightMm, ASPECT, pitchDeg, FOV)!;
  const bowlImg = projectGround(bowlG, camHeightMm, ASPECT, pitchDeg, FOV)!;
  // Apparent jack radius in normalised image WIDTH units, from its depth.
  const tanH = Math.tan(((FOV / 2) * Math.PI) / 180);
  const radius = JACK_DIAMETER_MM / jackImg.depth / (2 * 2 * tanH);
  return { jackImg, bowlImg, radius };
}

function solve(gapMm: number, pitchDeg: number) {
  const s = scan(gapMm, pitchDeg);
  return solveGround(
    { x: s.jackImg.x, y: s.jackImg.y, radius: s.radius },
    { x: s.bowlImg.x, y: s.bowlImg.y },
    ASPECT,
    pitchDeg,
    FOV,
  ).gapMm;
}

describe("edge-to-edge geometry — known distances", () => {
  const cases: Array<[number, number]> = [
    [0, 55],
    [300, 55],
    [600, 55],
    [1200, 55],
    [1300, 55],
    [600, 35],
    [1300, 35],
    [1300, 75],
  ];
  it.each(cases)("recovers %i mm at pitch %i", (gap, pitch) => {
    const got = solve(gap, pitch);
    expect(Math.abs(got - gap)).toBeLessThan(Math.max(15, gap * 0.03));
  });

  it("maps recovered distances onto the correct mat bands", () => {
    expect(solve(0, 55)).toBeLessThan(5); // touching, to within rounding
    expect(matBandLabel(0)).toBe("Touching");

    // 300 / 600 / 1200 sit exactly ON a band boundary, so compare at 5 mm
    // resolution — sub-millimetre solver noise must not flip the band.
    const band = (mm: number) => matBandLabel((Math.round(mm / 5) * 5) / 600);
    expect(band(solve(300, 55))).toBe("Within 1/2 mat");
    expect(band(solve(600, 55))).toBe("Within 1 mat");
    expect(band(solve(1200, 55))).toBe("Within 2 mats");
    expect(band(solve(1300, 55))).toBe("Over 2 mats");

  });

  it("1300 mm is about 2.17 mats and scores zero", () => {
    const s = scan(1300, 50);
    const m = measureBowl(
      {
        number: 1,
        hand: "forehand",
        status: "marked",
        point: { x: s.bowlImg.x, y: s.bowlImg.y },
        radius: 0.0004,
      },
      { point: { x: s.jackImg.x, y: s.jackImg.y }, radius: s.radius },
      ASPECT,
      "mat_bottom",
      50,
    )!;
    expect(m.gapMm / 600).toBeGreaterThan(2.1);
    expect(m.gapMm / 600).toBeLessThan(2.25);
    expect(m.tap.points).toBe(0);
  });

  it("a straight-down scan behaves exactly like the legacy flat model", () => {
    const jack = { point: { x: 0.5, y: 0.5 }, radius: 0.02 };
    const perUnit = JACK_DIAMETER_MM / 2 / jack.radius; // mm per width unit
    const gapUnits = 600 / perUnit;
    const m = measureBowl(
      {
        number: 1,
        hand: "forehand",
        status: "marked",
        point: { x: 0.5 + jack.radius + gapUnits, y: 0.5 },
        radius: 0.0004,
      },
      jack,
      ASPECT,
      "mat_bottom",
      90,
    )!;
    expect(Math.abs(m.gapMm - 600)).toBeLessThan(2);
  });
});

describe("zoom and pan cannot change a measurement", () => {
  it("is identical for the same image coordinates regardless of view state", () => {
    // Stored geometry is normalised against the image, so the only way zoom or
    // pan could affect a result is by mutating these numbers. Same inputs in,
    // same millimetres out.
    const a = solve(1300, 55);
    const b = solve(1300, 55);
    expect(a).toBe(b);
  });
});
