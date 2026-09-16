/**
 * CAMERA ATTITUDE — device orientation → REAR-CAMERA OPTICAL-AXIS PITCH.
 *
 * WHY THIS EXISTS
 * ---------------
 * Head Scan's ground-plane solver needs ONE angle: how far the rear camera's
 * optical axis is tilted below the horizontal plane (90° = straight down at
 * the green, 0° = looking along the ground at the horizon).
 *
 * The previous code approximated that with
 *
 *     pitch = 90 − hypot(beta, gamma)
 *
 * which is not the camera's pitch. It is a scalar "how untidy is the phone"
 * number, and it is wrong in two specific ways:
 *
 *   1. ROLL LEAKS IN. `gamma` includes rotation about the optical axis for a
 *      face-down phone. Rolling the phone sideways does not change where the
 *      camera points, yet it reduced the reported pitch.
 *   2. IT IS NOT A ROTATION. Combining two Euler angles with Pythagoras is
 *      only ever an approximation, and it diverges quickly away from level.
 *
 * The correct quantity comes from the full device rotation. Per the W3C
 * DeviceOrientation spec the device→world rotation is the intrinsic sequence
 * R = Rz(alpha) · Rx(beta) · Ry(gamma), in a world frame with Z pointing UP.
 * The device +Z axis sticks out of the SCREEN, so the REAR camera looks along
 * device −Z. Project that into the world and the pitch below horizontal is
 *
 *     pitch = asin( −axis_world.z )      ( = asin(cos β · cos γ) )
 *
 * Sanity: phone flat on its back (β = γ = 0) ⇒ pitch 90° (camera straight
 * down). Phone upright in portrait (β = 90°) ⇒ pitch 0° (camera horizontal).
 * Tilted 30° back from flat ⇒ 60°. Alpha (compass heading) never appears, and
 * neither does screen orientation: rotating the *content* cannot move the
 * lens. Screen orientation only affects the image ROLL, reported separately
 * for diagnostics.
 *
 * Nothing here applies a correction factor of any kind — it is a pure
 * coordinate transform.
 */

export type DeviceOrientationSample = {
  /** Compass heading, degrees. Does not affect pitch. */
  alpha: number | null;
  /** Front/back tilt, degrees, as reported (NOT normalised). */
  beta: number | null;
  /** Left/right tilt, degrees, as reported. */
  gamma: number | null;
  /** screen.orientation.angle (0 / 90 / 180 / 270). Affects roll only. */
  screenAngle?: number | null;
};

export type CameraAttitude = {
  /**
   * Rear-camera optical-axis angle BELOW the horizontal plane, degrees.
   * 90 = straight down, 0 = horizontal. Clamped to [0, 90]; a camera pointing
   * above the horizon reports 0 because it can never see the ground plane.
   */
  pitchDeg: number;
  /** Unit optical-axis vector in the world frame (X east, Y north, Z up). */
  opticalAxis: { x: number; y: number; z: number };
  /**
   * Rotation of the image horizontal away from the world horizontal, degrees.
   * DIAGNOSTIC ONLY — the solver does not use it.
   */
  rollDeg: number;
  /** False when no usable sensor values were supplied. */
  valid: boolean;
};

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Straight down: what we report when there is no attitude data at all. */
export const OVERHEAD_ATTITUDE: CameraAttitude = {
  pitchDeg: 90,
  opticalAxis: { x: 0, y: 0, z: -1 },
  rollDeg: 0,
  valid: false,
};

/**
 * Full device-attitude → rear-camera optical-axis transform.
 * Pass the RAW sensor values; no pre-normalisation is needed or wanted.
 */
export function cameraAttitude(sample: DeviceOrientationSample): CameraAttitude {
  const { alpha, beta, gamma } = sample;
  if (beta == null && gamma == null) return OVERHEAD_ATTITUDE;

  const a = rad(alpha ?? 0);
  const b = rad(beta ?? 0);
  const g = rad(gamma ?? 0);

  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const cg = Math.cos(g);
  const sg = Math.sin(g);

  // Columns of R = Rz(alpha)·Rx(beta)·Ry(gamma): the device axes in world.
  const xDev = { x: ca * cg - sa * sb * sg, y: sa * cg + ca * sb * sg, z: -cb * sg };
  const yDev = { x: -sa * cb, y: ca * cb, z: sb };
  const zDev = { x: ca * sg + sa * sb * cg, y: sa * sg - ca * sb * cg, z: cb * cg };

  // Rear camera looks out of the BACK of the device: −Z.
  const axis = { x: -zDev.x, y: -zDev.y, z: -zDev.z };

  const pitchRaw = deg(Math.asin(Math.max(-1, Math.min(1, -axis.z))));
  const pitchDeg = Math.max(0, Math.min(90, pitchRaw));

  // Roll: how far the image's horizontal axis is out of the world horizontal.
  // Screen rotation re-labels which device axis is "image right".
  const t = rad(sample.screenAngle ?? 0);
  const right = {
    x: xDev.x * Math.cos(t) + yDev.x * Math.sin(t),
    y: xDev.y * Math.cos(t) + yDev.y * Math.sin(t),
    z: xDev.z * Math.cos(t) + yDev.z * Math.sin(t),
  };
  const rollDeg = deg(Math.asin(Math.max(-1, Math.min(1, right.z))));

  return { pitchDeg, opticalAxis: axis, rollDeg, valid: true };
}
