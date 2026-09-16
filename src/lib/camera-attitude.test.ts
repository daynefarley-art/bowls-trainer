import { describe, it, expect } from "vitest";
import { cameraAttitude } from "@/lib/camera-attitude";
import { solveGround, DEFAULT_FOV_H_DEG, projectGround, JACK_DIAMETER_MM } from "@/lib/head-scan-geometry";

const pitch = (beta: number, gamma: number, alpha = 0, screenAngle = 0) =>
  cameraAttitude({ alpha, beta, gamma, screenAngle }).pitchDeg;

describe("camera attitude → optical-axis pitch", () => {
  it("A. flat on its back = camera straight down = 90°", () => {
    expect(pitch(0, 0)).toBeCloseTo(90, 3);
  });

  it("B. tilted 30° from vertical-down = 60°", () => {
    expect(pitch(30, 0)).toBeCloseTo(60, 3);
    expect(pitch(0, 30)).toBeCloseTo(60, 3);
  });

  it("C. tilted 45° = 45°", () => {
    expect(pitch(45, 0)).toBeCloseTo(45, 3);
  });

  it("upright portrait = camera horizontal = 0°", () => {
    expect(pitch(90, 0)).toBeCloseTo(0, 3);
  });

  it("D/E/F. screen orientation never changes the optical-axis pitch", () => {
    for (const angle of [0, 90, 180, 270]) {
      expect(pitch(40, 0, 0, angle)).toBeCloseTo(50, 3);
    }
  });

  it("G. changing roll (heading about a vertical axis) cannot change pitch", () => {
    for (const alpha of [0, 45, 90, 200, 359]) {
      expect(pitch(0, 0, alpha)).toBeCloseTo(90, 3);
      expect(pitch(35, 0, alpha)).toBeCloseTo(55, 3);
    }
  });

  it("a camera pointing above the horizon clamps to 0 rather than going negative", () => {
    expect(pitch(180, 0)).toBe(0);
  });

  it("reports an optical axis pointing downwards when overhead", () => {
    const a = cameraAttitude({ alpha: 0, beta: 0, gamma: 0 });
    expect(a.opticalAxis.z).toBeCloseTo(-1, 6);
    expect(a.valid).toBe(true);
  });

  it("falls back to overhead when the sensor gives nothing", () => {
    const a = cameraAttitude({ alpha: null, beta: null, gamma: null });
    expect(a.pitchDeg).toBe(90);
    expect(a.valid).toBe(false);
  });

  it("the legacy hypot(beta,gamma) rule disagreed with the real transform", () => {
    // Pure sideways roll of a face-down phone: the lens has NOT moved off
    // vertical, but the old rule reported 20° of pitch error.
    const legacy = 90 - Math.hypot(0, 20);
    expect(legacy).toBeCloseTo(70, 6);
    expect(pitch(0, 20)).toBeCloseTo(70, 3); // gamma IS real tilt here…
    // …whereas heading rotation is not, and the old rule agreed only by luck.
    expect(pitch(20, 20)).not.toBeCloseTo(90 - Math.hypot(20, 20), 1);
  });
});

describe("FOV override is diagnostic only", () => {
  const ASPECT = 4 / 3;

  function scene(pitchDeg: number, fov: number) {
    const jackR = JACK_DIAMETER_MM / 2;
    const jackG = { x: 0, y: 1800 };
    const bowlG = { x: 0, y: 1800 + jackR + 900 };
    const j = projectGround(jackG, 1500, ASPECT, pitchDeg, fov)!;
    const b = projectGround(bowlG, 1500, ASPECT, pitchDeg, fov)!;
    const tanH = Math.tan(((fov / 2) * Math.PI) / 180);
    const radius = JACK_DIAMETER_MM / j.depth / (2 * 2 * tanH);
    return { j, b, radius };
  }

  it("changes the recovered distance at an angled pitch", () => {
    const s = scene(50, DEFAULT_FOV_H_DEG);
    const base = solveGround({ x: s.j.x, y: s.j.y, radius: s.radius }, s.b, ASPECT, 50).gapMm;
    const other = solveGround({ x: s.j.x, y: s.j.y, radius: s.radius }, s.b, ASPECT, 50, 52).gapMm;
    expect(Math.abs(base - 900)).toBeLessThan(30);
    expect(Math.abs(other - base)).toBeGreaterThan(20);
  });

  it("leaves the production default untouched", () => {
    expect(DEFAULT_FOV_H_DEG).toBe(66);
  });
});
