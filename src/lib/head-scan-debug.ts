/**
 * HEAD SCAN — TEMPORARY GEOMETRY DIAGNOSTICS.
 *
 * Purpose: capture everything needed to audit ONE real Head Scan against a
 * tape measure, and nothing else. This module contains NO geometry, NO
 * measurement and NO scoring: it only *reads* the values the solver already
 * produced and formats them.
 *
 * It is entirely in-memory and gated behind `HEAD_SCAN_MEASUREMENT_DEBUG`.
 * Nothing here is written to the database, analytics, practice history or a
 * user profile — the only way this data leaves the device is if the player
 * taps "Copy Debug JSON" / "Share Debug JSON" themselves.
 */

import { measureBowl, HEAD_SCAN_MM_PER_MAT, type HeadScanJack, type PhotoPoint } from "@/lib/head-scan";
import { matBandLabel } from "@/lib/measurement";
import {
  DEFAULT_FOV_H_DEG,
  JACK_DIAMETER_MM,
  OVERHEAD_PITCH_DEG,
  derivedFovVDeg,
  solveGround,
} from "@/lib/head-scan-geometry";


export type CaptureDeviceInfo = {
  timestamp: string;
  userAgent: string | null;
  platform: string | null;
  devicePixelRatio: number | null;
  screen: { width: number; height: number; orientationAngle: number | null; orientationType: string | null } | null;
  imageWidth: number;
  imageHeight: number;
  imageAspectRatio: number;
  /** Video constraints Head Scan asked for (ideal only). */
  requestedConstraints?: Record<string, unknown> | null;
  /** Actual stream frame size reported by the <video> element. */
  videoWidth?: number;
  videoHeight?: number;
  /** Pixel size of the frame that measurement operates on. */
  sourceWidth?: number;
  sourceHeight?: number;

  /** Raw MediaTrackSettings for the video track used, as reported. */
  trackSettings: Record<string, unknown> | null;
  /** Subset of MediaTrackCapabilities, when the browser exposes it. */
  trackCapabilities: Record<string, unknown> | null;
  facingMode: unknown;
  trackWidth: unknown;
  trackHeight: unknown;
  trackAspectRatio: unknown;
  frameRate: unknown;
  zoom: unknown;
  /** Any focal length / FOV / intrinsic hint the browser exposes (usually none). */
  intrinsics: Record<string, unknown> | null;
};

export type CaptureAttitudeInfo = {
  levelSupported: boolean;
  rawAlpha: number | null;
  rawBeta: number | null;
  rawGamma: number | null;
  /** Beta after the face-down ±180 normalisation used by the level guide. */
  normalisedBeta: number | null;
  screenOrientationAngle: number | null;
  capturePitchDeg: number;
  captureRollDeg: number | null;
};

export type AutoCaptureDebugInfo = {
  autoCaptureLevelPitchMin: number;
  autoCaptureLevelPitchMax: number;
  autoCaptureLevelRollMaxAbs: number;
  stableHoldRequiredMs: number;
  actualStableHoldMs: number | null;
  sensorAgeAtShutterMs: number | null;
  levelAtShutter: boolean;
  pitchAtShutterDeg: number | null;
  rollAtShutterDeg: number | null;
  autoCaptureFinalGuardPassed: boolean;
  autoCaptureTriggerSource: "automatic" | "manual";
};

/**
 * TEMPORARY ANGLE TEST MODE metadata. Diagnostic only — recorded at shutter so
 * a controlled dataset can pair the target angle with the ACTUAL sensor pitch
 * the solver used.
 */
export type AngleTestDebugInfo = {
  angleTestMode: boolean;
  angleTestTargetDeg: number | null;
  angleTestPitchToleranceDeg: number | null;
  angleTestRollToleranceDeg: number | null;
  angleTestActualPitchDeg: number | null;
  angleTestActualRollDeg: number | null;
  angleTestPitchErrorDeg: number | null;
  angleTestValidAtShutter: boolean;
  angleTestStableHoldMs: number | null;
  /**
   * False when NO genuine orientation reading existed at shutter. Angle Test
   * data with this false must be discarded — the solver fell back to the
   * assumed overhead pitch, which is not a measured angle.
   */
  angleTestMeasuredAngleValid?: boolean;
  /** Motion/orientation permission state for THIS document at shutter. */
  angleTestMotionPermission?: string | null;
};

/** Snapshot taken AT CAPTURE and held in memory for this photo only. */
export type HeadScanCaptureDebug = {
  device: CaptureDeviceInfo;
  attitude: CaptureAttitudeInfo;
  autoCapture: AutoCaptureDebugInfo;
  angleTest?: AngleTestDebugInfo | null;
};


export type HeadScanDebugReport = ReturnType<typeof buildHeadScanDebug>;

/** Pull whatever intrinsic-ish keys a browser happens to expose. */
export function readIntrinsics(settings: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!settings) return null;
  const keys = [
    "focalLength",
    "focalLengthX",
    "focalLengthY",
    "principalPointX",
    "principalPointY",
    "fieldOfView",
    "horizontalFieldOfView",
    "verticalFieldOfView",
    "depthNear",
    "depthFar",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in settings) out[k] = settings[k];
  return Object.keys(out).length ? out : null;
}

export type DebugBowlInput = {
  number: number;
  status: string;
  point: PhotoPoint | null;
};

/**
 * Build the complete diagnostic report. Every measured number comes from the
 * SAME `measureBowl` / `solveGround` calls the scoring path uses.
 */
export function buildHeadScanDebug(args: {
  capture: HeadScanCaptureDebug | null;
  jack: HeadScanJack | null;
  bowls: DebugBowlInput[];
  /** Displayed photo box aspect (width / height) fed to the solver. */
  aspect: number;
  orientation: "mat_bottom" | "mat_top";
  capturePitchDeg: number;
  /** Radius used for the arrow-tip pseudo-bowl, so the tip drives the maths. */
  tipRadius: number;
  imageWidth: number;
  imageHeight: number;
  /** On-screen photo box size in CSS px — rendering only, never geometry. */
  displayWidth?: number;
  displayHeight?: number;
  /** QA-only attitude/optics overrides (never available in production). */
  sensorPitchDeg?: number | null;
  pitchOverride?: number | null;
  fovOverride?: number | null;
  /** CALIBRATION-only independent vertical FOV. */
  fovVOverride?: number | null;
  /** CALIBRATION-only diagnostic block (ground truth, errors, sweeps). */
  calibration?: unknown;
  opticalAxis?: { x: number; y: number; z: number } | null;
}) {
  const { capture, jack, bowls, aspect, orientation, capturePitchDeg, tipRadius } = args;
  const fovHDeg = args.fovOverride ?? DEFAULT_FOV_H_DEG;
  const fovVDeg = args.fovVOverride ?? null;



  const dispW = args.displayWidth ?? 0;
  const dispH = args.displayHeight ?? 0;
  const displayToSourceX = dispW > 0 ? args.imageWidth / dispW : null;
  const displayToSourceY = dispH > 0 ? args.imageHeight / dispH : null;

  const jackPixels = jack ? jack.radius * args.imageWidth : null;
  const jackDisplayPixels = jack && dispW > 0 ? jack.radius * dispW : null;


  const perBowl = bowls.map((b) => {
    if (!jack || !b.point || b.status !== "marked") {
      return { bowl: b.number, status: b.status, measured: null };
    }
    const m = measureBowl(
      { number: b.number, hand: "forehand", status: "marked", point: b.point, radius: tipRadius },
      jack,
      aspect,
      orientation,
      capturePitchDeg,
      fovHDeg,
      fovVDeg,
    );
    const sol = solveGround(
      { x: jack.point.x, y: jack.point.y, radius: jack.radius },
      b.point,
      aspect,
      capturePitchDeg,
      fovHDeg,
      fovVDeg,
    );
    const mats = m ? m.gapMm / HEAD_SCAN_MM_PER_MAT : null;
    return {
      bowl: b.number,
      status: b.status,
      measured: {
        edgePointNorm: b.point,
        edgePointPixels: { x: b.point.x * args.imageWidth, y: b.point.y * args.imageHeight },
        edgeSourcePixels: { x: b.point.x * args.imageWidth, y: b.point.y * args.imageHeight },
        edgeDisplayPixels:
          dispW > 0 && dispH > 0 ? { x: b.point.x * dispW, y: b.point.y * dispH } : null,

        groundBowlMm: sol.bowl,
        groundJackMm: sol.jack,
        bowlUnit: sol.debug.bowlUnit,
        rawCentreToEdgeMm: sol.debug.rawCentreMm,
        jackRadiusSubtractedMm: sol.debug.jackRadiusSubtractedMm,
        gapAfterJackRadiusMm: sol.gapMm,
        finalEdgeToEdgeMm: m ? m.gapMm : null,
        mats,
        band: mats == null ? null : matBandLabel(mats),
        model: sol.perspective ? "perspective" : "flat_fallback",
      },
    };
  });

  const anySol =
    jack && bowls.find((b) => b.point && b.status === "marked")
      ? solveGround(
          { x: jack.point.x, y: jack.point.y, radius: jack.radius },
          bowls.find((b) => b.point && b.status === "marked")!.point!,
          aspect,
          capturePitchDeg,
          fovHDeg,
          fovVDeg,
        )
      : null;


  return {
    schema: "bowlmate.headscan.debug/1",
    generatedAt: new Date().toISOString(),
    capture: capture?.device ?? null,
    resolution: {
      requestedConstraints: capture?.device.requestedConstraints ?? null,
      videoWidth: capture?.device.videoWidth ?? null,
      videoHeight: capture?.device.videoHeight ?? null,
      sourceWidth: capture?.device.sourceWidth ?? args.imageWidth,
      sourceHeight: capture?.device.sourceHeight ?? args.imageHeight,
      measurementWidth: args.imageWidth,
      measurementHeight: args.imageHeight,
      displayWidth: dispW || null,
      displayHeight: dispH || null,
      displayToSourceX,
      displayToSourceY,
    },

    attitude: capture?.attitude ?? {
      levelSupported: false,
      rawAlpha: null,
      rawBeta: null,
      rawGamma: null,
      normalisedBeta: null,
      screenOrientationAngle: null,
      capturePitchDeg,
      captureRollDeg: null,
    },
    autoCapture: capture?.autoCapture ?? null,
    angleTest: capture?.angleTest ?? null,

    overrides: {
      sensorPitchDeg: args.sensorPitchDeg ?? null,
      pitchOverrideActive: args.pitchOverride != null,
      pitchOverrideDeg: args.pitchOverride ?? null,
      fovOverrideActive: args.fovOverride != null,
      fovOverrideDeg: args.fovOverride ?? null,
      horizontalFovOverride: args.fovOverride ?? null,
      verticalFovOverrideActive: fovVDeg != null,
      verticalFovOverrideDeg: fovVDeg,
      verticalFovOverride: fovVDeg,
      defaultFovHDeg: DEFAULT_FOV_H_DEG,
      activeFovHDeg: fovHDeg,
      derivedFovVDeg: derivedFovVDeg(fovHDeg, aspect),
      activeFovVDeg: fovVDeg ?? derivedFovVDeg(fovHDeg, aspect),
      activePitchDeg: capturePitchDeg,
      opticalAxis: args.opticalAxis ?? null,
    },
    /** CALIBRATION MODE ONLY — ground truth, errors and any sweep results. */
    calibration: args.calibration ?? null,
    solver: {
      DEFAULT_FOV_H_DEG,
      activeFovHDeg: fovHDeg,
      derivedFovVDeg: derivedFovVDeg(fovHDeg, aspect),
      activeFovVDeg: fovVDeg ?? derivedFovVDeg(fovHDeg, aspect),
      OVERHEAD_PITCH_DEG,
      JACK_DIAMETER_MM,
      HEAD_SCAN_MM_PER_MAT,
      tipRadiusNorm: tipRadius,
      solverAspect: aspect,
      orientation,
      perspectiveEnabled: capturePitchDeg < 88,
      flatFallbackUsed: perBowl.some((b) => b.measured?.model === "flat_fallback"),
      tanH: anySol?.debug.tanH ?? null,
      tanV: anySol?.debug.tanV ?? null,
      pitchInputDeg: anySol?.debug.pitchInputDeg ?? capturePitchDeg,
      pitchUsedDeg: anySol?.debug.pitchUsedDeg ?? null,
    },

    jack: jack
      ? {
          normX: jack.point.x,
          normY: jack.point.y,
          normRadius: jack.radius,
          radiusPixels: jackPixels,
          sourceRadiusPixels: jackPixels,
          displayRadiusPixels: jackDisplayPixels,

          assumedDiameterMm: JACK_DIAMETER_MM,
          jackDepthMm: anySol?.debug.jackDepthMm ?? null,
          groundMm: anySol?.jack ?? null,
          backProjectedUnit: anySol?.debug.jackUnit ?? null,
          mmPerUnit: anySol?.debug.mmPerUnit ?? null,
        }
      : null,
    bowls: perBowl,
  };
}

/** Clipboard with a legacy fallback; returns true when the copy succeeded. */
export async function copyDebugJson(json: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = json;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function canShareDebugJson(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function shareDebugJson(json: string): Promise<boolean> {
  try {
    await navigator.share({ title: "Head Scan debug", text: json });
    return true;
  } catch {
    return false;
  }
}
