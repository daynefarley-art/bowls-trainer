import { describe, expect, it } from "vitest";
import {
  AUTO_CAPTURE_SENSOR_STALE_MS,
  isStrictlyLevel,
  type AutoCaptureLevelReading,
} from "@/lib/head-scan-auto-capture";

const reading = (pitchDeg: number, rollDeg: number, ts = 1000): AutoCaptureLevelReading => ({
  supported: true,
  pitchDeg,
  rollDeg,
  ts,
});

describe("Head Scan strict auto-capture gate", () => {
  it("accepts only fresh readings inside pitch 88–90 and roll ±2", () => {
    expect(isStrictlyLevel(reading(88, -2), 1100)).toBe(true);
    expect(isStrictlyLevel(reading(90, 2), 1100)).toBe(true);
    expect(isStrictlyLevel(reading(89, 0), 1100)).toBe(true);
  });

  it("rejects the two physical-device regression readings", () => {
    expect(isStrictlyLevel(reading(86.158128, 0.115315), 1100)).toBe(false);
    expect(isStrictlyLevel(reading(85.744482, -1.311557), 1100)).toBe(false);
  });

  it("rejects stale, future, unsupported and non-finite readings", () => {
    expect(isStrictlyLevel(reading(89, 0), 1000 + AUTO_CAPTURE_SENSOR_STALE_MS + 1)).toBe(false);
    expect(isStrictlyLevel(reading(89, 0, 1001), 1000)).toBe(false);
    expect(isStrictlyLevel({ ...reading(89, 0), supported: false }, 1100)).toBe(false);
    expect(isStrictlyLevel(reading(Number.NaN, 0), 1100)).toBe(false);
  });
});