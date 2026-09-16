/**
 * HEAD SCAN — TEMPORARY "ANGLE TEST MODE" GATE.
 *
 * Diagnostic only. This lets us deliberately capture the SAME stationary head
 * at a chosen phone pitch (90/80/70/60/50) so we can audit how the existing
 * perspective solver behaves as the camera angles over.
 *
 * It contains NO geometry and NO measurement: it only decides whether the live
 * attitude is close enough to the chosen target to arm the shutter. The solver
 * always receives the ACTUAL sensor pitch recorded at shutter — never the
 * selected target angle.
 */

export const ANGLE_TEST_TARGETS_DEG = [90, 80, 70, 60, 50] as const;
export const ANGLE_TEST_DEFAULT_TARGET_DEG = 90;
/** Auto capture arms only inside ±1° of the selected target. */
export const ANGLE_TEST_PITCH_TOLERANCE_DEG = 1;
/** "Nearly there" band. */
export const ANGLE_TEST_NEAR_TOLERANCE_DEG = 3;
/** Sideways roll must stay this square for a valid test capture. */
export const ANGLE_TEST_ROLL_TOLERANCE_DEG = 0.5;

export type AngleTestReading = {
  supported: boolean;
  pitchDeg: number;
  rollDeg: number;
  ts: number;
};

export type AngleTestStatus = "no_sensor" | "stale" | "adjust" | "near" | "ready";

export type AngleTestState = {
  /** Signed error: actual − target. */
  pitchErrorDeg: number | null;
  pitchOk: boolean;
  rollOk: boolean;
  /** Both tolerances met with a fresh reading — the shutter may arm. */
  valid: boolean;
  status: AngleTestStatus;
  message: string;
};

/** The one authoritative Angle Test Mode gate (mirrors isStrictlyLevel's role). */
export function angleTestState(
  reading: AngleTestReading,
  targetDeg: number,
  now: number,
  staleMs: number,
): AngleTestState {
  if (!reading.supported || !Number.isFinite(reading.pitchDeg) || !Number.isFinite(reading.rollDeg)) {
    return {
      pitchErrorDeg: null,
      pitchOk: false,
      rollOk: false,
      valid: false,
      status: "no_sensor",
      message: "Angle sensor unavailable — capture manually",
    };
  }
  const fresh = reading.ts > 0 && now - reading.ts >= 0 && now - reading.ts <= staleMs;
  const pitchErrorDeg = reading.pitchDeg - targetDeg;
  const absErr = Math.abs(pitchErrorDeg);
  const rollOk = Math.abs(reading.rollDeg) <= ANGLE_TEST_ROLL_TOLERANCE_DEG;
  const pitchOk = absErr <= ANGLE_TEST_PITCH_TOLERANCE_DEG;

  if (!fresh) {
    return {
      pitchErrorDeg,
      pitchOk: false,
      rollOk,
      valid: false,
      status: "stale",
      message: "Waiting for angle sensor…",
    };
  }
  if (!rollOk) {
    return {
      pitchErrorDeg,
      pitchOk,
      rollOk,
      valid: false,
      status: pitchOk ? "near" : "adjust",
      message: "Keep phone level side-to-side",
    };
  }
  if (pitchOk) {
    return { pitchErrorDeg, pitchOk, rollOk, valid: true, status: "ready", message: "Angle ready" };
  }
  if (absErr <= ANGLE_TEST_NEAR_TOLERANCE_DEG) {
    return { pitchErrorDeg, pitchOk, rollOk, valid: false, status: "near", message: "Nearly there" };
  }
  return {
    pitchErrorDeg,
    pitchOk,
    rollOk,
    valid: false,
    status: "adjust",
    message: "Adjust phone angle",
  };
}
