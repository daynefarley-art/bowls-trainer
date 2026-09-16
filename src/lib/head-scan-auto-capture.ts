export const AUTO_CAPTURE_LEVEL_PITCH_MIN_DEG = 88;
export const AUTO_CAPTURE_LEVEL_PITCH_MAX_DEG = 90;
export const AUTO_CAPTURE_LEVEL_ROLL_MAX_ABS_DEG = 2;
export const AUTO_CAPTURE_SENSOR_STALE_MS = 400;
export const AUTO_CAPTURE_STABLE_HOLD_MS = 1200;

export type AutoCaptureLevelReading = {
  supported: boolean;
  pitchDeg: number;
  rollDeg: number;
  ts: number;
};

/** The one authoritative permission gate for automatic Head Scan capture. */
export function isStrictlyLevel(reading: AutoCaptureLevelReading, now: number): boolean {
  return (
    reading.supported &&
    reading.ts > 0 &&
    now - reading.ts >= 0 &&
    now - reading.ts <= AUTO_CAPTURE_SENSOR_STALE_MS &&
    Number.isFinite(reading.pitchDeg) &&
    reading.pitchDeg >= AUTO_CAPTURE_LEVEL_PITCH_MIN_DEG &&
    reading.pitchDeg <= AUTO_CAPTURE_LEVEL_PITCH_MAX_DEG &&
    Number.isFinite(reading.rollDeg) &&
    Math.abs(reading.rollDeg) <= AUTO_CAPTURE_LEVEL_ROLL_MAX_ABS_DEG
  );
}