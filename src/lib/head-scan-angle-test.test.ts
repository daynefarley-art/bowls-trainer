import { describe, expect, it } from "vitest";
import {
  ANGLE_TEST_DEFAULT_TARGET_DEG,
  ANGLE_TEST_TARGETS_DEG,
  angleTestState,
  type AngleTestReading,
} from "@/lib/head-scan-angle-test";

const r = (pitchDeg: number, rollDeg: number, ts = 1000): AngleTestReading => ({
  supported: true,
  pitchDeg,
  rollDeg,
  ts,
});

describe("Head Scan angle test gate", () => {
  it("offers the five calibration angles with 90° default", () => {
    expect([...ANGLE_TEST_TARGETS_DEG]).toEqual([90, 80, 70, 60, 50]);
    expect(ANGLE_TEST_DEFAULT_TARGET_DEG).toBe(90);
  });

  it("is ready within ±1° of target with square roll", () => {
    const s = angleTestState(r(69.6, 0.4), 70, 1100, 400);
    expect(s.valid).toBe(true);
    expect(s.status).toBe("ready");
    expect(s.pitchErrorDeg).toBeCloseTo(-0.4, 6);
  });

  it("reports nearly there, then adjust, as the phone drifts", () => {
    expect(angleTestState(r(72.5, 0), 70, 1100, 400).status).toBe("near");
    expect(angleTestState(r(75, 0), 70, 1100, 400).status).toBe("adjust");
  });

  it("blocks capture on excess sideways roll", () => {
    const s = angleTestState(r(70, 3.2), 70, 1100, 400);
    expect(s.valid).toBe(false);
    expect(s.message).toBe("Keep phone level side-to-side");
  });

  it("enforces the tightened ±0.5° roll tolerance", () => {
    expect(angleTestState(r(70, 0.5), 70, 1100, 400).valid).toBe(true);
    expect(angleTestState(r(70, -0.5), 70, 1100, 400).valid).toBe(true);
    expect(angleTestState(r(70, 0.6), 70, 1100, 400).valid).toBe(false);
    expect(angleTestState(r(70, -1.2), 70, 1100, 400).valid).toBe(false);
  });

  it("blocks capture on stale, future or unsupported readings", () => {
    expect(angleTestState(r(70, 0), 70, 1600, 400).valid).toBe(false);
    expect(angleTestState(r(70, 0, 1200), 70, 1100, 400).valid).toBe(false);
    expect(angleTestState({ ...r(70, 0), supported: false }, 70, 1100, 400).valid).toBe(false);
  });
});
