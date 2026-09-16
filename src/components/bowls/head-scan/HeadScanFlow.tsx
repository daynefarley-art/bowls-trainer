import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  X,
  Undo2,
  RotateCcw,
  Check,
  EyeOff,
  HelpCircle,
  ZoomIn,
  ZoomOut,
  MoreHorizontal,
  Crosshair,
} from "lucide-react";
import type { VisualTap } from "@/components/bowls/VisualTarget";
import {
  measureBowl,
  HEAD_SCAN_MEASUREMENT_DEBUG,
  HEAD_SCAN_MM_PER_MAT,
  type HeadScanBowlMark,
  type HeadScanJack,
  type HeadScanOrientation,
  type PhotoPoint,
} from "@/lib/head-scan";
import { matBandLabel } from "@/lib/measurement";
import {
  buildHeadScanDebug,
  canShareDebugJson,
  copyDebugJson,
  readIntrinsics,
  shareDebugJson,
  type HeadScanCaptureDebug,
} from "@/lib/head-scan-debug";

import {
  bowlEdgeTier,
  detectAtSeed,
  detectJackFromImage,
  jackFitTier,
  loadPixels,
  snapNearEdge,
  JACK_COMFORTABLE_RADIUS_PX,
  type FitTier,
  type LockedObject,
  type PixelBuffer,
} from "@/lib/head-scan-detect";


import {
  DEFAULT_FOV_H_DEG,
  DEFAULT_PRINCIPAL_POINT_X,
  OVERHEAD_PITCH_DEG,
  solveGround,
} from "@/lib/head-scan-geometry";
import { HeadScanCalibrationPanel } from "@/components/bowls/head-scan/HeadScanCalibrationPanel";
import {
  SWEEP_FOV_MAX,
  SWEEP_FOV_MIN,
  SWEEP_FOV_STEP,
  DEFAULT_GROUND_TRUTH_MM,
  bestSweepIndexByMae,
  calibrationResult,
  clearGroundTruth,
  loadGroundTruth,
  saveGroundTruth,
  type CalibrationGeometry,
  type CalibrationResult,
  type Solver3dReport,
  type Sweep2dReport,
} from "@/lib/head-scan-calibration";
import type { JackSensitivityReport } from "@/lib/head-scan-jack-sensitivity";
import type { JackRefineReport } from "@/lib/head-scan-jack-refine";
import { cameraAttitude } from "@/lib/camera-attitude";
import {
  AUTO_CAPTURE_LEVEL_PITCH_MAX_DEG,
  AUTO_CAPTURE_LEVEL_PITCH_MIN_DEG,
  AUTO_CAPTURE_LEVEL_ROLL_MAX_ABS_DEG,
  AUTO_CAPTURE_SENSOR_STALE_MS,
  AUTO_CAPTURE_STABLE_HOLD_MS,
  isStrictlyLevel,
} from "@/lib/head-scan-auto-capture";
import {
  ANGLE_TEST_DEFAULT_TARGET_DEG,
  ANGLE_TEST_PITCH_TOLERANCE_DEG,
  ANGLE_TEST_ROLL_TOLERANCE_DEG,
  ANGLE_TEST_TARGETS_DEG,
  angleTestState,
} from "@/lib/head-scan-angle-test";
import {
  cameraFailureCopy,
  openAppSettings,
  startCamera,
  HEAD_SCAN_VIDEO_CONSTRAINTS,
  type CameraFailureReason,
} from "@/lib/camera-permission";

import {
  getMotionPermissionThisLoad,
  ensureMotionPermission,
  type MotionPermissionState,
} from "@/lib/motion-permission";



/**
 * Head Scan V1.2 — ONE PHOTO, every bowl of the end.
 *
 * WORKFLOW (the only normal path):
 *   take ONE photo → tap the jack → accept → Bowl 1 → Bowl 2 → … → summary →
 *   Use These Positions.
 * Head Scan NEVER closes after Bowl 1: the same photograph stays on screen
 * until every expected bowl is accounted for (scanned / not in photo /
 * can't identify).
 *
 * DETECTION: after each tap we analyse ONLY a small window around that tap
 * (`detectAtSeed`). There is no whole-image search, so touching or leaning
 * bowls are separated by the player's own tap rather than by segmentation.
 * The proposal is then shown with four draggable EDGE HANDLES so the player
 * can correct the visible outside edge in a second — no radius, diameter, mm,
 * cm or calibration number is ever displayed.
 *
 * ABSOLUTE RULE: the photograph never leaves this component. It lives in a
 * data URL plus one in-memory pixel buffer and is dropped on confirm, cancel,
 * retake and unmount. Nothing is uploaded, stored, thumbnailed or persisted.
 *
 * COORDINATE SPACE: every stored point/radius is normalised against the IMAGE
 * itself (identical to the displayed photo box, letterbox removed). Zoom/pan
 * is a pure CSS transform and never mutates a stored value, which is why the
 * jack cannot move between steps.
 *
 * Measurement, mat bands, measure_v stamping and V1/V2 branching are untouched.
 */

type Phase = "camera" | "denied" | "mark";

/** A proposal awaiting the player's "Use this". */
type Draft = {
  kind: "jack" | "bowl";
  /** -1 for the jack. */
  idx: number;
  /** Jack: the circle centre. Bowl: the detected body centre (UI/lock only). */
  point: PhotoPoint;
  /** Radius in normalised image-WIDTH units (jack circle / bowl body). */
  radius: number;
  approx: boolean;
  /** 0..1 — how clean the automatic perimeter fit was. UI only. */
  confidence?: number;
  /** 0..1 — how clearly the bowl's near edge stood out. UI only. */
  edgeConfidence?: number;
  /** Where the automatic snap put the arrow tip, before any player drag. */
  snapEdge?: PhotoPoint;
  /**
   * BOWLS ONLY — the ARROW TIP: the bowl's outside edge nearest the jack.
   * Completely free: the player may drag it to any angle and any length. The
   * measurement runs from the confirmed jack's outer edge to this point.
   */
  edge?: PhotoPoint;
};


/**
 * Jack: drag anywhere inside the red circle to move it; its size comes from
 * the JACK SIZE slider. Bowl: the whole measurement line is the handle.
 */
type DragMode = "move" | "edge";


export type HeadScanBowlSpec = {
  number: number;
  hand: "forehand" | "backhand";
  label?: string;
};

/**
 * ACCOUNTED FOR ≠ POSITION COMPLETE.
 * Only "scanned" carries a Head Scan position; the other two are explicitly
 * unresolved and must be placed manually on the Visual Target.
 */
export type HeadScanResultStatus = "scanned" | "not_in_photo" | "unidentified";

export type HeadScanResult = {
  number: number;
  status: HeadScanResultStatus;
  /** null = needs manual Visual Target placement (not in photo / can't identify). */
  tap: VisualTap | null;
  /**
   * Internal edge-to-edge gap (jack outer edge → bowl outer edge) in mm.
   * Diagnostic/scoring precision only — NEVER displayed to the user.
   */
  gapMm?: number;
};

type Props = {
  endNumber: number;
  bowls: HeadScanBowlSpec[];
  onCancel: () => void;
  onComplete: (results: HeadScanResult[]) => void;
  /**
   * DEVELOPER CALIBRATION MODE. Only the private diagnostics route passes
   * this. It unlocks the camera-model (FOV) calibration tools; when it is
   * false — every drill, every other account — Head Scan behaves exactly as
   * it always has and no calibration input can reach the solver.
   */
  calibration?: boolean;
};


/**
 * TRIANGLE LEVEL GUIDE sensor — ENHANCEMENT ONLY. It never prompts, never
 * blocks and never reports an error. The one-off
 * `DeviceOrientationEvent.requestPermission()` call happens from a real user
 * gesture (Head Scan button / Take Photo) and the answer is persisted.
 *
 * `supported: false` means live orientation data is not flowing for any reason
 * (denied, unsupported, no sensor, no events) — callers degrade silently to the
 * manual shutter.
 */
export type LevelReading = {
  supported: boolean;
  /** Front/back tilt in degrees (0 = phone flat, screen up). */
  beta: number;
  /** Left/right tilt in degrees. */
  gamma: number;
  level: boolean;
  /** True optical-axis pitch below horizontal (90 = straight down). */
  pitchDeg: number;
  /** Image roll away from world horizontal, degrees. */
  rollDeg: number;
  /** performance.now() of the sample this reading came from (0 = none). */
  ts: number;
  /** DIAGNOSTIC ONLY — untouched sensor values, never used in any maths. */
  rawAlpha?: number | null;
  rawBeta?: number | null;
  rawGamma?: number | null;
};


/**
 * LEVEL TOLERANCE — Head Scan V1.
 *
 * Real-world testing: a capture at pitch 84.9° under-read by ~7%, while
 * captures at ~89° matched a tape measure to within a couple of millimetres.
 * So "level" now means the rear camera's OPTICAL AXIS is within 2° of straight
 * down, and the image is within 2° of square — not the old loose ±8° on each
 * raw Euler angle (which accepted 84.9° happily).
 */
const MIN_LEVEL_PITCH_DEG = AUTO_CAPTURE_LEVEL_PITCH_MIN_DEG;
const MAX_LEVEL_ROLL_DEG = AUTO_CAPTURE_LEVEL_ROLL_MAX_ABS_DEG;

/**
 * A reading older than this is STALE: the sensor has stopped delivering and we
 * must never auto-capture from a frozen "level" value.
 */
const SENSOR_STALE_MS = AUTO_CAPTURE_SENSOR_STALE_MS;

/** Diagnostic formatting helper (debug overlay only). */
const fmt = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));


/**
 * How long the phone must stay continuously level before the shutter fires.
 * Deliberately unhurried (1200 ms) so the player has time to frame the whole
 * head and the camera has time to settle focus/exposure. Any movement outside
 * tolerance resets this hold from zero.
 */
const STABLE_HOLD_MS = AUTO_CAPTURE_STABLE_HOLD_MS;

/** Auto capture is inhibited for this long after the live feed starts. */
const CAMERA_SETTLE_MS = 900;


/**
 * Live tilt for the triangle guide. ENHANCEMENT ONLY:
 *  • it never prompts (the one request-per-page-load happens from a real user
 *    gesture in `capture()` / the Head Scan button);
 *  • it never shows an error, a counter or a permission readout;
 *  • `supported: false` simply means no live data, and the caller falls back to
 *    the manual shutter with a plain "hold the phone level" hint.
 */
const NO_LEVEL: LevelReading = {
  supported: false,
  beta: 0,
  gamma: 0,
  level: false,
  pitchDeg: 0,
  rollDeg: 0,
  ts: 0,
};

function useLevelSensor(active: boolean) {
  const [reading, setReading] = useState<LevelReading>(NO_LEVEL);
  const latestRef = useRef<LevelReading>(NO_LEVEL);

  useEffect(() => {
    if (!active || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      latestRef.current = NO_LEVEL;
      setReading(NO_LEVEL);
      return;
    }

    let cancelled = false;
    let attached = false;

    const handler = (event: Event) => {
      if (cancelled) return;
      const e = event as DeviceOrientationEvent;
      // Devices without a real sensor fire events with null angles.
      if (e.beta === null && e.gamma === null) return;
      // Phone held face-down over the head reads beta ≈ ±180.
      const rawBeta = e.beta ?? 0;
      const beta = Math.abs(rawBeta) > 90 ? (rawBeta > 0 ? rawBeta - 180 : rawBeta + 180) : rawBeta;
      const gamma = e.gamma ?? 0;
      // Level is judged on the REAL optical-axis attitude, not on raw Euler
      // angles: the same transform the solver uses at capture time.
      const att = cameraAttitude({
        alpha: e.alpha ?? null,
        beta: e.beta ?? null,
        gamma: e.gamma ?? null,
        screenAngle: typeof screen !== "undefined" ? (screen.orientation?.angle ?? null) : null,
      });
      const nextReading: LevelReading = {
        supported: true,
        beta,
        gamma,
        pitchDeg: att.pitchDeg,
        rollDeg: att.rollDeg,
        ts: performance.now(),
        level: false,
        rawAlpha: e.alpha ?? null,
        rawBeta: e.beta ?? null,
        rawGamma: e.gamma ?? null,
      };
      nextReading.level = att.valid && isStrictlyLevel(nextReading, nextReading.ts);
      // Update synchronously inside the sensor event. React state may render a
      // frame later; the shutter path must never depend on that render delay.
      latestRef.current = nextReading;
      setReading(nextReading);

    };


    // Gated platforms (iOS): listen only once THIS DOCUMENT holds the grant.
    // The grant may arrive from the Take Photo gesture, so poll cheaply. We
    // never call requestPermission() from here, so ends 2/3/4 cannot re-prompt.
    const tryAttach = () => {
      if (attached || cancelled) return;
      if (getMotionPermissionThisLoad() !== "granted") return;
      window.addEventListener("deviceorientation", handler);
      window.addEventListener("deviceorientationabsolute", handler);
      attached = true;
    };
    tryAttach();
    const poll = window.setInterval(tryAttach, 400);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener("deviceorientation", handler);
      window.removeEventListener("deviceorientationabsolute", handler);
    };
  }, [active]);

  return { reading, latestRef };
}


/**
 * The Bowls Trainer triangle level guide.
 *
 * A fixed outline triangle plus a live triangle that rotates and shifts with
 * the phone's tilt. When the two coincide the guide snaps to the brand green
 * and the shutter fires automatically after a short stability hold.
 */
function TriangleLevelGuide({ reading, armed }: { reading: LevelReading; armed: boolean }) {
  const tilt = Math.max(-30, Math.min(30, reading.gamma));
  const lift = Math.max(-30, Math.min(30, reading.beta));
  const ok = reading.level;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <svg viewBox="0 0 200 200" className="h-56 w-56">
        <polygon
          points="100,40 160,150 40,150"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth={2}
          strokeDasharray="6 6"
        />
        <polygon
          points="100,40 160,150 40,150"
          fill={ok ? "rgba(15,81,50,0.28)" : "rgba(255,255,255,0.08)"}
          stroke={ok ? "#22c55e" : "#ffffff"}
          strokeWidth={ok ? 4 : 2.5}
          style={{
            transform: `translate(${(-tilt / 30) * 22}px, ${(lift / 30) * 22}px) rotate(${tilt}deg)`,
            transformOrigin: "100px 110px",
            transition: "transform 90ms linear, stroke 120ms linear, fill 120ms linear",
          }}
        />
        {ok && armed && <circle cx={100} cy={112} r={10} fill="#22c55e" className="animate-ping" />}
      </svg>
    </div>
  );
}

/**
 * Capture audio feedback. A short rising "ready" tick when the phone settles
 * level, and a shutter blip on capture. WebAudio only — no assets, no storage,
 * and silent when the device/browser blocks audio.
 */
function tone(freq: number, ms: number, gain = 0.05) {
  try {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio unavailable — silent */
  }
}






/**
 * FIRST-USE POSITIONING CARD.
 *
 * The photograph must be taken from BEHIND the jack looking towards the bowls,
 * otherwise Head Scan cannot tell a narrow bowl from a wide one. The card is
 * shown before the first camera and can be dismissed permanently; it is always
 * reachable again from "Photo tips" on the camera screen.
 *
 * The preference is a single local flag on this device. No database field, no
 * profile column, nothing synced.
 */
const TIP_KEY = "bt.headScanPositionTipDismissed.v1";

function tipDismissed(): boolean {
  try {
    return window.localStorage.getItem(TIP_KEY) === "1";
  } catch {
    return false;
  }
}

/** Lightweight CSS/SVG diagram — no image asset is generated or stored. */
function PositioningDiagram() {
  return (
    <svg viewBox="0 0 160 130" className="mx-auto h-32 w-full" role="img" aria-label="Stand behind the jack and aim the camera towards the bowls">
      <rect x="0" y="0" width="160" height="130" rx="10" className="fill-secondary" />
      {/* bowls */}
      <circle cx="52" cy="24" r="7" className="fill-charcoal/70" />
      <circle cx="80" cy="18" r="7" className="fill-charcoal/70" />
      <circle cx="108" cy="26" r="7" className="fill-charcoal/70" />
      <circle cx="86" cy="42" r="7" className="fill-charcoal/70" />
      {/* jack */}
      <circle cx="80" cy="66" r="5" fill="#ef2b2b" />
      {/* direction of view */}
      <line x1="80" y1="104" x2="80" y2="54" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" className="text-primary" />
      <polygon points="80,48 75,58 85,58" className="fill-primary" />
      {/* player */}
      <rect x="72" y="104" width="16" height="20" rx="4" className="fill-primary" />
      <text x="80" y="118" textAnchor="middle" className="fill-primary-foreground" fontSize="9" fontWeight="700">
        YOU
      </text>
    </svg>
  );
}

function PositioningCard({
  onStart,
  dismissedDefault,
}: {
  onStart: (dontShowAgain: boolean) => void;
  dismissedDefault: boolean;
}) {
  const [dontShow, setDontShow] = useState(dismissedDefault);
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/75 px-5" onPointerDown={(e) => e.stopPropagation()}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-4 text-charcoal">
        <h2 className="font-display text-lg font-extrabold">How to take a Head Scan photo</h2>
        <PositioningDiagram />
        <p className="text-sm text-muted-foreground">
          Stand behind the jack and aim the camera towards the bowls. You can stand a little further
          back if needed to fit the whole head in the photo. Keep the jack near the centre and
          include all the bowls you want to record.
        </p>
        <p className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">
          Important: Take the photo from behind the jack — not from the side — so Bowls Trainer can
          tell whether bowls are narrow or wide.
        </p>
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          Don’t show this again
        </label>
        <button
          type="button"
          onClick={() => onStart(dontShow)}
          className="h-12 w-full rounded-2xl bt-gradient-primary text-sm font-extrabold uppercase tracking-wide text-primary-foreground"
        >
          Got it — Open Camera
        </button>
      </div>
    </div>
  );
}

export function HeadScanFlow({ endNumber, bowls, onCancel, onComplete, calibration = false }: Props) {
  /**
   * The camera starts immediately. There is deliberately NO extra in-app
   * "allow camera" gate: `startCamera()` uses the already-granted OS/browser
   * permission when there is one, triggers the native prompt when the
   * permission is undetermined, and only then falls through to the explained
   * `denied` screen.
   */
  const [phase, setPhase] = useState<Phase>("camera");
  const [photo, setPhoto] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState({ w: 4, h: 3 });
  const [cameraError, setCameraError] = useState<CameraFailureReason>("init_failed");
  const [orientation, setOrientation] = useState<HeadScanOrientation>("mat_bottom");

  const [jack, setJack] = useState<HeadScanJack | null>(null);
  /** Locked as soon as the jack is accepted — nothing recalculates it after. */
  const [jackAccepted, setJackAccepted] = useState(false);

  const [marks, setMarks] = useState<HeadScanBowlMark[]>(() =>
    bowls.map((b) => ({ ...b, status: "pending", point: null, radius: null })),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  /** The perimeter currently proposed for the selected object. */
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  /** Live drag state: mode plus the grab offset from the circle centre. */
  const dragRef = useRef<{ mode: DragMode; ox: number; oy: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  /** True while the on-device jack acquisition pass is running. */
  const [acquiring, setAcquiring] = useState(false);
  /** Where the acquisition ring animates, in photo units. */
  const [acquirePoint, setAcquirePoint] = useState<PhotoPoint | null>(null);


  const [frame, setFrame] = useState({ w: 1, h: 1 });
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imgWrapRef = useRef<HTMLDivElement | null>(null);
  const pixelsRef = useRef<PixelBuffer | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<null | {
    dist: number;
    cx: number;
    cy: number;
    scale: number;
    tx: number;
    ty: number;
  }>(null);
  const panRef = useRef<null | { x: number; y: number; tx: number; ty: number; moved: boolean }>(
    null,
  );
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const { reading: level, latestRef: levelRef } = useLevelSensor(phase === "camera");
  /**
   * MOTION / ORIENTATION PERMISSION (iOS). Read-only mirror of the shared
   * per-document state in src/lib/motion-permission.ts — the same flow the
   * normal drill Head Scan uses. Never prompts on its own; the prompt is only
   * ever fired from the "Enable Angle Sensor" tap or the Take Photo gesture.
   */
  const [motionPerm, setMotionPerm] = useState<MotionPermissionState>("not_requested");
  useEffect(() => {
    if (phase !== "camera") return;
    const sync = () => setMotionPerm(getMotionPermissionThisLoad());
    sync();
    const id = window.setInterval(sync, 400);
    return () => window.clearInterval(id);
  }, [phase]);
  const enableAngleSensor = () => {
    // MUST run inside this tap handler: iOS only prompts from a user gesture.
    void ensureMotionPermission().then(() => setMotionPerm(getMotionPermissionThisLoad()));
  };
  /** Auto capture is opt-out; the manual shutter always works regardless. */
  const [autoCapture, setAutoCapture] = useState(true);
  /** Progress of the stability hold before the shutter fires. */
  const [holdMs, setHoldMs] = useState(0);
  /**
   * TEMPORARY ANGLE TEST MODE (diagnostic). OFF = Head Scan behaves exactly as
   * before. ON = the shutter arms around a deliberately chosen phone pitch so
   * the same stationary head can be photographed at 90/80/70/60/50°.
   */
  const [angleTestMode, setAngleTestMode] = useState(false);
  const [angleTestTargetDeg, setAngleTestTargetDeg] = useState<number>(
    ANGLE_TEST_DEFAULT_TARGET_DEG,
  );
  /**
   * CAMERA SETTLING. Auto capture is inhibited until the live feed has been
   * running briefly, so a stale/unfocused first frame can never be captured.
   */
  const [cameraSettled, setCameraSettled] = useState(false);
  /** Asks before a Retake would discard markings already made on this photo. */
  const [confirmRetake, setConfirmRetake] = useState(false);
  /** First-use positioning card (and the manual "Photo tips" re-open). */
  const [showTips, setShowTips] = useState(() => !tipDismissed());

  /* ---------------- MEASUREMENT-QUALITY SIGNALS (UI only) ----------------
   * None of these touch the geometry, scoring, bands or measure_v. They only
   * decide what guidance the player is shown.
   */
  /** Phone inside level tolerance at the instant the shutter fired. */
  const [captureLevelOk, setCaptureLevelOk] = useState(true);
  /** Manual shutter used clearly off-level — post-capture warning is showing. */
  const [levelWarn, setLevelWarn] = useState(false);
  /** Player pressed "Use Anyway" on a quality warning. */
  const [lowConfidenceCapture, setLowConfidenceCapture] = useState(false);
  /** Jack occupies too few source pixels to calibrate comfortably. */
  const [jackSizeWarn, setJackSizeWarn] = useState(false);
  /** Magnified jack adjustment (slider + loupe) is open. */
  const [jackAdjust, setJackAdjust] = useState(false);
  /** Fit tier of the CONFIRMED jack, and of each accepted bowl edge. */
  const [jackTier, setJackTier] = useState<FitTier>("medium");
  const [edgeTiers, setEdgeTiers] = useState<Record<number, FitTier>>({});
  /** How far (px) the player dragged each accepted bowl edge from the snap. */
  const [manualNudgePx, setManualNudgePx] = useState<Record<number, number>>({});

  /**
   * Camera pitch (90 = straight down) recorded AT CAPTURE. This is what lets
   * the measurement undo the foreshortening of a photo taken from behind the
   * jack. No sensor ⇒ 90, which reproduces the legacy flat measurement.
   */
  const [capturePitchDeg, setCapturePitchDeg] = useState(OVERHEAD_PITCH_DEG);
  /** Side-to-side roll at capture. Diagnostic only — never used in maths. */
  const [captureRollDeg, setCaptureRollDeg] = useState<number | null>(null);
  /** Optical-axis unit vector at capture. Diagnostic only. */
  const [captureAxis, setCaptureAxis] = useState<{ x: number; y: number; z: number } | null>(null);
  /**
   * QA-ONLY OVERRIDES (HEAD_SCAN_MEASUREMENT_DEBUG). `null` = off, which is the
   * only state that exists in production. They are component state, so they
   * cannot persist beyond this scan and never reach the database.
   */
  const [pitchOverride, setPitchOverride] = useState<number | null>(null);
  const [fovOverride, setFovOverride] = useState<number | null>(null);
  /**
   * CALIBRATION MODE ONLY (developer route). Independent vertical FOV, plus
   * the tape-measure ground truth and any sweep results. All in component
   * state: nothing persists, nothing is stored, nothing reaches production.
   */
  const [calibrationOn, setCalibrationOn] = useState(false);
  const [fovVOverride, setFovVOverride] = useState<number | null>(null);
  /**
   * TEST-ONLY SOLVER PITCH (calibration mode only). `null` = off = use the real
   * captured sensor pitch. It never overwrites `capturePitchDeg`, never
   * persists, and is unreachable for any account without the calibration prop.
   */
  const [calibPitchOverride, setCalibPitchOverride] = useState<number | null>(null);

  /**
   * Tape-measured ground truth. Persisted on this device only so the same
   * physical rig can be shot at 90/80/70/60/50° without re-typing it. It is
   * test data for the error columns — never an input to the solver.
   */
  const [groundTruth, setGroundTruth] = useState<Record<number, number | null>>(() =>
    loadGroundTruth(),
  );
  const updateGroundTruth = useCallback((v: Record<number, number | null>) => {
    setGroundTruth(v);
    saveGroundTruth(v);
  }, []);
  const resetGroundTruth = useCallback(() => {
    clearGroundTruth();
    setGroundTruth({ ...DEFAULT_GROUND_TRUTH_MM });
  }, []);
  const [sweep, setSweep] = useState<CalibrationResult[] | null>(null);
  const [sweep2d, setSweep2d] = useState<CalibrationResult[] | null>(null);
  /** Full H×V sweep report (diagnostic only; never applied to production FOV). */
  const [sweep2dFull, setSweep2dFull] = useState<Sweep2dReport | null>(null);
  const [sweep3d, setSweep3d] = useState<Solver3dReport | null>(null);
  /** 4-variable sweep (adds principal point X). Diagnostic only. */
  const [sweep4d, setSweep4d] = useState<Solver3dReport | null>(null);
  const [sweep5d, setSweep5d] = useState<Solver3dReport | null>(null);
  /** Sensor-pitch-locked intrinsics sweep (H · V · PP-X · k1). Diagnostic only. */
  const [sweepIntrinsics, setSweepIntrinsics] = useState<Solver3dReport | null>(null);
  /** Jack-selection sensitivity test result. Diagnostic only. */
  const [jackSensitivity, setJackSensitivity] = useState<JackSensitivityReport | null>(null);
  /** Jack radius auto-refinement experiment. Diagnostic only. */
  const [jackRefine, setJackRefine] = useState<JackRefineReport | null>(null);
  /** Draws the auto-fitted jack circle over the photo for inspection. */
  const [showRefineOverlay, setShowRefineOverlay] = useState(false);
  /**
   * TEST-ONLY HORIZONTAL OPTICAL CENTRE. `null` = off = the production
   * assumption that the optical axis passes through the frame centre (0.5).
   */
  const [calibPpxOverride, setCalibPpxOverride] = useState<number | null>(null);
  /** Temporary QA panel: expand raw image coordinates. Diagnostic only. */
  const [showQaDetail, setShowQaDetail] = useState(false);
  /**
   * TEMPORARY GEOMETRY DIAGNOSTIC (HEAD_SCAN_MEASUREMENT_DEBUG). Device,
   * camera-track and raw attitude values recorded at capture. In-memory for
   * this photo only — dropped with the photo, never persisted anywhere.
   */
  const [captureDebug, setCaptureDebug] = useState<HeadScanCaptureDebug | null>(null);
  /** Expandable "HEAD SCAN GEOMETRY DEBUG" overlay; collapsed by default. */
  const [geoDebugOpen, setGeoDebugOpen] = useState(false);
  const [debugCopied, setDebugCopied] = useState<string | null>(null);

  /** Short contextual coaching line, shown once per control per photo. */
  const [hint, setHint] = useState<string | null>(null);
  const hintSeenRef = useRef(new Set<string>());

  /**
   * Calibration tooling is live when the developer route enabled it AND either
   * the calibration switch or Angle Test Mode is on. Any other account gets
   * `calibration === false`, so this is permanently false for them.
   */
  const calibrationActive = calibration && (calibrationOn || angleTestMode);
  /**
   * CALIBRATION-ONLY SOLVER PITCH. `null` = use the real sensor pitch, which is
   * the only state that exists outside the private diagnostics route. The
   * captured `capturePitchDeg` is never overwritten by this.
   */
  const calibPitchActive = calibrationActive && calibPitchOverride != null;
  /**
   * The pitch and FOV the solver actually uses. Overrides only exist while the
   * debug flag or calibration mode is on; otherwise these are exactly the
   * captured sensor pitch and the production default FOV — no correction
   * factor of any kind.
   */
  const activePitchDeg =
    HEAD_SCAN_MEASUREMENT_DEBUG && pitchOverride != null
      ? pitchOverride
      : calibPitchActive
        ? (calibPitchOverride as number)
        : capturePitchDeg;
  const activeFovHDeg =
    HEAD_SCAN_MEASUREMENT_DEBUG && fovOverride != null ? fovOverride : DEFAULT_FOV_H_DEG;
  /**
   * Independent vertical FOV exists ONLY inside calibration mode. Everywhere
   * else this is null, which means "derive FOV-V from FOV-H and the aspect" —
   * the untouched production camera model.
   */
  const activeFovVDeg = calibrationActive ? fovVOverride : null;
  /**
   * Horizontal optical centre. Production is always the frame centre; only
   * calibration mode can shift it, and only for this photo.
   */
  const activePrincipalPointX =
    calibrationActive && calibPpxOverride != null
      ? calibPpxOverride
      : DEFAULT_PRINCIPAL_POINT_X;


  /**
   * LIVE CAMERA ANGLE (QA only). Exactly the value `capture()` will freeze and
   * hand to the solver, so pointing the phone down must read ~90° and angling
   * it forward must visibly fall.
   */
  const liveAttitude = cameraAttitude({
    alpha: level.rawAlpha ?? null,
    beta: level.rawBeta ?? null,
    gamma: level.rawGamma ?? null,
    screenAngle:
      typeof window !== "undefined" && typeof screen !== "undefined"
        ? (screen.orientation?.angle ?? null)
        : null,
  });

  /**
   * ANGLE TEST guidance for the live readout. Uses the SAME `level` reading
   * (and therefore the same pitch as `attitude.capturePitchDeg`) — no separate
   * angle calculation exists anywhere in the UI.
   */
  const angleTest = angleTestState(level, angleTestTargetDeg, performance.now(), SENSOR_STALE_MS);





  // ---------------- Frame + photo box geometry ----------------

  useEffect(() => {
    const el = imgWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setFrame({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  /**
   * The letterboxed box the photo occupies inside the frame. Stored
   * coordinates are normalised against THIS box (== the image), so they are
   * unaffected by any change of surrounding UI height.
   */
  const box = useMemo(() => {
    const k = Math.min(frame.w / imgSize.w, frame.h / imgSize.h);
    const w = imgSize.w * k || 1;
    const h = imgSize.h * k || 1;
    return { left: (frame.w - w) / 2, top: (frame.h - h) / 2, w, h };
  }, [frame.w, frame.h, imgSize.w, imgSize.h]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** Drop every trace of the photograph from memory. */
  const dropPhoto = useCallback(() => {
    pixelsRef.current = null;
    setPhoto(null);
  }, []);

  useEffect(
    () => () => {
      stopStream();
      pixelsRef.current = null;
    },
    [stopStream],
  );

  /**
   * Back / cancel discards ONLY the temporary photo and the unconfirmed
   * scan state. The recorder keeps the practice, end, timer, notes, already
   * recorded bowls and the current expected bowl.
   */
  const cancel = useCallback(() => {
    stopStream();
    dropPhoto();
    onCancel();
  }, [dropPhoto, onCancel, stopStream]);

  // ---------------- Camera ----------------

  useEffect(() => {
    // The positioning card is shown BEFORE the camera opens, so the player
    // knows where to stand before any permission prompt or preview appears.
    if (phase !== "camera" || showTips) return;
    let cancelled = false;
    let settleTimer: number | undefined;
    setCameraSettled(false);
    (async () => {
      const result = await startCamera();
      if (cancelled) {
        if (result.ok) result.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!result.ok) {
        setCameraError(result.reason);
        setPhase("denied");
        return;
      }
      streamRef.current = result.stream;
      if (videoRef.current) {
        videoRef.current.srcObject = result.stream;
        try {
          await videoRef.current.play();
        } catch (err) {
          console.log("[HeadScan:camera] video.play() rejected:", err);
        }
      }
      // Give autofocus / auto-exposure a beat before auto capture is allowed,
      // so the shutter can never fire on a stale first frame.
      settleTimer = window.setTimeout(() => {
        if (!cancelled) setCameraSettled(true);
      }, CAMERA_SETTLE_MS);
    })();
    return () => {
      cancelled = true;
      if (settleTimer) window.clearTimeout(settleTimer);
      stopStream();
    };
  }, [phase, showTips, stopStream]);


  const MIN_ZOOM = 1;
  const MAX_ZOOM = 6;
  /**
   * Upper bound on the MEASUREMENT source frame's long edge. High enough that
   * the jack spans hundreds of pixels instead of ~17, low enough that a single
   * JPEG + one pixel buffer stay comfortable on mobile Safari.
   */
  const CAPTURE_MAX_EDGE = 2400;


  const clampView = useCallback(
    (v: { scale: number; tx: number; ty: number }) => {
      const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale));
      const w = frame.w || 1;
      const h = frame.h || 1;
      return {
        scale: s,
        tx: Math.min(0, Math.max(w * (1 - s), v.tx)),
        ty: Math.min(0, Math.max(h * (1 - s), v.ty)),
      };
    },
    [frame.w, frame.h],
  );

  const resetView = useCallback(() => setView({ scale: 1, tx: 0, ty: 0 }), []);

  // The "Pinch to zoom · Drag to move photo" hint disappears the moment the
  // player actually zooms or pans.
  useEffect(() => {
    if (view.scale > 1.02 || view.tx !== 0 || view.ty !== 0) setShowHint(false);
  }, [view.scale, view.tx, view.ty]);

  const zoomAt = useCallback(
    (px: number, py: number, nextScale: number) => {
      setView((v) => {
        const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
        const k = s / v.scale;
        return clampView({ scale: s, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k });
      });
    },
    [clampView],
  );

  const resetMarking = useCallback(() => {
    setJack(null);
    setJackAccepted(false);
    setDraft(null);
    setMarks(bowls.map((b) => ({ ...b, status: "pending", point: null, radius: null })));
    setActiveIdx(0);
    setShowHint(true);
    setHint(null);
    hintSeenRef.current = new Set();
    // Quality signals belong to a single photo — never carry them over.
    setJackTier("medium");
    setEdgeTiers({});
    setManualNudgePx({});
    setJackSizeWarn(false);
    setJackAdjust(false);
    setLowConfidenceCapture(false);
    setLevelWarn(false);
    resetView();
  }, [bowls, resetView]);

  function capture(auto = false, holdStartedAt: number | null = null) {

    // Second (and last) chance to obtain motion permission from a genuine user
    // gesture — only when it has never been answered. Fire-and-forget: the
    // photo is taken regardless of the outcome.
    if (getMotionPermissionThisLoad() === "not_requested") void ensureMotionPermission();
    const shutterNow = performance.now();
    const lv = levelRef.current;
    const finalGuardPassed = isStrictlyLevel(lv, shutterNow);
    // Angle Test Mode has its own shutter gate (target pitch ±1°, roll ±2°).
    // The normal 88–90° gate is untouched and still governs every normal scan.
    const shutterAngleTest = angleTestState(lv, angleTestTargetDeg, shutterNow, SENSOR_STALE_MS);
    const autoGuardPassed = angleTestMode ? shutterAngleTest.valid : finalGuardPassed;
    if (auto && !autoGuardPassed) {
      setHoldMs(0);
      return false;
    }


    const video = videoRef.current;
    if (!video) return false;

    // MEASUREMENT SOURCE: keep the camera's full frame. Only a very large
    // sensor frame is scaled down, and then only to a bound that still leaves
    // far more pixels than the old 480x640 default (memory safety on Safari).
    const vw = video.videoWidth || 1080;
    const vh = video.videoHeight || 1440;
    const k = Math.min(1, CAPTURE_MAX_EDGE / Math.max(vw, vh));
    const w = Math.max(1, Math.round(vw * k));
    const h = Math.max(1, Math.round(vh * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, w, h);
    const url = canvas.toDataURL("image/jpeg", 0.92);
    canvas.width = 0;
    canvas.height = 0;

    // Camera pitch from the level sensor: 0 tilt = phone flat over the head
    // (pitch 90). Tilting the phone up to shoot along the green reduces it.
    // CAMERA PITCH comes from the full device-attitude transform (see
    // src/lib/camera-attitude.ts), not from a scalar combination of beta and
    // gamma. 90 = optical axis straight down; smaller = aimed along the green.
    const attitude = cameraAttitude({
      alpha: lv.rawAlpha ?? null,
      beta: lv.rawBeta ?? null,
      gamma: lv.rawGamma ?? null,
      screenAngle: typeof screen !== "undefined" ? (screen.orientation?.angle ?? null) : null,
    });
    const pitchDeg = lv.supported && attitude.valid ? attitude.pitchDeg : OVERHEAD_PITCH_DEG;
    setCapturePitchDeg(pitchDeg);
    setCaptureRollDeg(lv.supported && attitude.valid ? attitude.rollDeg : null);
    setCaptureAxis(lv.supported && attitude.valid ? attitude.opticalAxis : null);

    // TEMPORARY DIAGNOSTIC SNAPSHOT — in-memory only, never persisted.
    if (HEAD_SCAN_MEASUREMENT_DEBUG) {
      let settings: Record<string, unknown> | null = null;
      let capabilities: Record<string, unknown> | null = null;
      try {
        const track = streamRef.current?.getVideoTracks()[0];
        settings = track ? ({ ...track.getSettings() } as Record<string, unknown>) : null;
        capabilities =
          track && typeof track.getCapabilities === "function"
            ? ({ ...track.getCapabilities() } as Record<string, unknown>)
            : null;
      } catch {
        /* diagnostics must never break capture */
      }
      const so = typeof screen !== "undefined" ? screen.orientation : undefined;
      const snapshot: HeadScanCaptureDebug = {
        device: {
          timestamp: new Date().toISOString(),
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          platform: typeof navigator !== "undefined" ? (navigator.platform ?? null) : null,
          devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : null,
          screen:
            typeof screen !== "undefined"
              ? {
                  width: screen.width,
                  height: screen.height,
                  orientationAngle: so?.angle ?? null,
                  orientationType: so?.type ?? null,
                }
              : null,
          imageWidth: w,
          imageHeight: h,
          imageAspectRatio: h > 0 ? w / h : 0,
          requestedConstraints: HEAD_SCAN_VIDEO_CONSTRAINTS as unknown as Record<string, unknown>,
          videoWidth: vw,
          videoHeight: vh,
          sourceWidth: w,
          sourceHeight: h,

          trackSettings: settings,
          trackCapabilities: capabilities,
          facingMode: settings?.facingMode ?? null,
          trackWidth: settings?.width ?? null,
          trackHeight: settings?.height ?? null,
          trackAspectRatio: settings?.aspectRatio ?? null,
          frameRate: settings?.frameRate ?? null,
          zoom: settings?.zoom ?? null,
          intrinsics: readIntrinsics(settings),
        },
        attitude: {
          levelSupported: lv.supported,
          rawAlpha: lv.rawAlpha ?? null,
          rawBeta: lv.rawBeta ?? null,
          rawGamma: lv.rawGamma ?? null,
          normalisedBeta: lv.supported ? lv.beta : null,
          screenOrientationAngle: so?.angle ?? null,
          capturePitchDeg: pitchDeg,
          captureRollDeg: lv.supported && attitude.valid ? attitude.rollDeg : null,
        },
        autoCapture: {
          autoCaptureLevelPitchMin: AUTO_CAPTURE_LEVEL_PITCH_MIN_DEG,
          autoCaptureLevelPitchMax: AUTO_CAPTURE_LEVEL_PITCH_MAX_DEG,
          autoCaptureLevelRollMaxAbs: AUTO_CAPTURE_LEVEL_ROLL_MAX_ABS_DEG,
          stableHoldRequiredMs: AUTO_CAPTURE_STABLE_HOLD_MS,
          actualStableHoldMs: auto && holdStartedAt != null ? shutterNow - holdStartedAt : null,
          sensorAgeAtShutterMs: lv.ts > 0 ? shutterNow - lv.ts : null,
          levelAtShutter: finalGuardPassed,
          pitchAtShutterDeg: lv.supported ? lv.pitchDeg : null,
          rollAtShutterDeg: lv.supported ? lv.rollDeg : null,
          autoCaptureFinalGuardPassed: auto && finalGuardPassed,
          autoCaptureTriggerSource: auto ? "automatic" : "manual",
        },
        angleTest: {
          angleTestMode,
          angleTestTargetDeg: angleTestMode ? angleTestTargetDeg : null,
          angleTestPitchToleranceDeg: angleTestMode ? ANGLE_TEST_PITCH_TOLERANCE_DEG : null,
          angleTestRollToleranceDeg: angleTestMode ? ANGLE_TEST_ROLL_TOLERANCE_DEG : null,
          angleTestActualPitchDeg: lv.supported ? lv.pitchDeg : null,
          angleTestActualRollDeg: lv.supported ? lv.rollDeg : null,
          angleTestPitchErrorDeg: angleTestMode ? shutterAngleTest.pitchErrorDeg : null,
          angleTestValidAtShutter: angleTestMode && shutterAngleTest.valid,
          angleTestStableHoldMs:
            angleTestMode && auto && holdStartedAt != null ? shutterNow - holdStartedAt : null,
          angleTestMeasuredAngleValid: lv.supported && attitude.valid,
          angleTestMotionPermission: motionPerm,
        },
      };
      setCaptureDebug(snapshot);
      console.log("[HeadScan:debug] capture", snapshot);
    }

    tone(1180, 90, 0.06); // shutter blip
    tryHaptic(18);
    setPhoto(url);
    setImgSize({ w, h });
    stopStream();

    resetMarking();
    // LEVEL CAPTURE QUALITY CONTROL. Auto capture only ever fires level, so
    // this can only trigger on a manual shutter pressed off-level. The photo
    // is kept either way — the player decides whether to retake.
    const levelOk = !lv.supported || !!levelRef.current.level;
    setCaptureLevelOk(angleTestMode ? true : levelOk);
    // In Angle Test Mode an off-level capture is the whole point, so the
    // "not level" warning is suppressed there only.
    if (!auto && !levelOk && !angleTestMode) setLevelWarn(true);

    setPhase("mark");
    return true;
  }


  const captureRef = useRef(capture);
  captureRef.current = capture;

  /**
   * AUTOMATIC CAPTURE — continuous, monotonic, sensor-fresh stability hold.
   *
   * The shutter only fires after the rear camera's optical axis has stayed
   * within MIN_LEVEL_PITCH_DEG / MAX_LEVEL_ROLL_DEG for a genuine, unbroken
   * STABLE_HOLD_MS measured with performance.now(). A single frame outside
   * tolerance — or a sensor that goes quiet for SENSOR_STALE_MS — throws the
   * accumulated time away and the next valid frame starts a brand-new hold
   * from zero. Camera-settle time is a separate precondition and never counts
   * toward the hold. The manual shutter is always available.
   */
  useEffect(() => {
    if (phase !== "camera" || showTips || !autoCapture || !cameraSettled) {
      setHoldMs(0);
      return;
    }

    let raf = 0;
    let startedAt: number | null = null;
    let fired = false;
    let lastPaint = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (fired) return;
      const now = performance.now();
      const lv = levelRef.current;
      // Angle Test Mode swaps in its own tolerance window; everything else
      // about the hold (continuity, freshness, reset-to-zero) is unchanged.
      const valid = angleTestMode
        ? angleTestState(lv, angleTestTargetDeg, now, SENSOR_STALE_MS).valid
        : isStrictlyLevel(lv, now);

      if (!valid) {
        // Any excursion, stale/absent reading or invalid sample resets fully.
        if (startedAt !== null) {
          startedAt = null;
          lastPaint = 0;
          setHoldMs(0);
        }
        return;
      }

      if (startedAt === null) {
        startedAt = now;
        lastPaint = 0;
        setHoldMs(1);
        tone(880, 60); // "ready" tick as the phone settles level
        tryHaptic(10);
        return;
      }

      const elapsed = now - startedAt;
      if (now - lastPaint >= 80) {
        lastPaint = now;
        setHoldMs(elapsed);
      }
      if (elapsed >= STABLE_HOLD_MS) {
        // The shutter itself performs the same check again against the latest
        // synchronously updated sensor ref. Only latch `fired` after capture
        // succeeds; a failed final guard resets and starts from zero.
        const captured = captureRef.current(true, startedAt);
        if (captured) {
          fired = true;
          setHoldMs(STABLE_HOLD_MS);
        } else {
          startedAt = null;
          lastPaint = 0;
          setHoldMs(0);
        }
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      setHoldMs(0);
    };
  }, [phase, showTips, autoCapture, cameraSettled, angleTestMode, angleTestTargetDeg]);



  /**
   * RETAKE — discards ONLY the temporary photo and the Head Scan markings made
   * on it, then returns to the live camera (level guide, auto capture and the
   * manual shutter all restored). It never exits Head Scan, never resets the
   * end, practice, timer or previously committed bowls, and never re-requests
   * camera permission: the same already-granted stream is simply restarted.
   */
  function retake() {
    setMenuOpen(false);
    setConfirmRetake(false);
    dropPhoto();
    resetMarking();
    setPhase("camera");
  }

  /** True once anything has been marked on the CURRENT photo. */
  const hasScanMarkings = jackAccepted || draft !== null || marks.some((b) => b.status !== "pending");

  /** Warn before throwing away markings; otherwise retake immediately. */
  function requestRetake() {
    setMenuOpen(false);
    if (hasScanMarkings) setConfirmRetake(true);
    else retake();
  }


  // ---------------- Pixel buffer + automatic jack acquisition ----------------
  /**
   * Decoded once per photo, held in memory only. As soon as it is ready we run
   * ONE on-device jack pass so the player normally just taps "Confirm jack".
   * Nothing is uploaded, stored or sent to any service.
   */
  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    setAcquiring(true);
    setAcquirePoint(null);
    // A refinement belongs to one photo only.
    setJackRefine(null);
    setShowRefineOverlay(false);
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setImgSize({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 });
      pixelsRef.current = loadPixels(img);
      let found: { x: number; y: number; r: number; confidence: number } | null = null;
      try {
        const d = detectJackFromImage(img);
        if (d.candidate && d.status !== "not_found") {
          found = {
            x: d.candidate.cx,
            y: d.candidate.cy,
            r: d.candidate.r,
            confidence: d.status === "found" ? d.candidate.confidence : d.candidate.confidence * 0.7,
          };
        }
      } catch (err) {
        console.log("[HeadScan] jack acquisition failed:", err);
      }
      img.src = "";
      if (found) setAcquirePoint({ x: found.x, y: found.y });
      // Short, deliberate beat so the acquisition ring is actually seen.
      window.setTimeout(() => {
        if (cancelled) return;
        setAcquiring(false);
        setAcquirePoint(null);
        if (found) {
          setDraft({
            kind: "jack",
            idx: -1,
            point: { x: found.x, y: found.y },
            radius: found.r,
            approx: false,
            confidence: found.confidence,
          });
          setFlash("Jack found — confirm or adjust");
        } else {
          setFlash("Tap the jack");
        }
      }, 650);

    };
    img.onerror = () => {
      if (!cancelled) setAcquiring(false);
    };
    img.src = photo;
    return () => {
      cancelled = true;
      setAcquiring(false);
    };
  }, [photo]);


  // "Pinch to zoom" hint fades out shortly after marking begins.
  useEffect(() => {
    if (phase !== "mark" || !showHint) return;
    const t = setTimeout(() => setShowHint(false), 2600);
    return () => clearTimeout(t);
  }, [phase, showHint]);

  /**
   * CONTEXTUAL HINTS — one short line the first time each control appears on
   * this photo, gone after ~3 s or as soon as the player touches it.
   */
  useEffect(() => {
    if (!draft) return;
    const key = draft.kind;
    if (hintSeenRef.current.has(key)) return;
    hintSeenRef.current.add(key);
    setHint(
      key === "jack"
        ? "Drag circle to move · Use slider to resize"
        : "Drag anywhere on the line · Drag short line to set bowl edge",
    );
  }, [draft]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 3000);
    return () => clearTimeout(t);
  }, [hint]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  // Non-passive wheel listener so desktop/trackpad zoom does not scroll the page.
  useEffect(() => {
    const el = imgWrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const next = viewRef.current.scale * Math.exp(-dy * 0.0018);
      zoomAt(e.clientX - r.left, e.clientY - r.top, next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [phase, zoomAt]);

  function localXY(e: { clientX: number; clientY: number }) {
    const r = imgWrapRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  }

  /** Photo-space point (0..1 of the photo), view transform removed. */
  function pointFromEvent(e: { clientX: number; clientY: number }): PhotoPoint | null {
    const el = imgWrapRef.current;
    if (!el) return null;
    const { x, y } = localXY(e);
    const { scale, tx, ty } = viewRef.current;
    const fx = (x - tx) / scale;
    const fy = (y - ty) / scale;
    return {
      x: Math.min(1, Math.max(0, (fx - box.left) / box.w)),
      y: Math.min(1, Math.max(0, (fy - box.top) / box.h)),
    };
  }

  // ---------------- Seeded local detection ----------------

  function nextPendingFrom(from: number, source: HeadScanBowlMark[]) {
    const next = source.findIndex((b, i) => i > from && b.status === "pending");
    return next === -1 ? source.findIndex((b) => b.status === "pending") : next;
  }

  /** Propose the jack perimeter around the tap. Never searches the image. */
  function seedJack(p: PhotoPoint) {
    const buf = pixelsRef.current;
    const d = buf ? detectAtSeed(buf, p, "jack") : null;
    setJackAdjust(false);
    setDraft({
      kind: "jack",
      idx: -1,
      point: d && !d.approx ? { x: d.cx, y: d.cy } : p,
      radius: d ? d.r : 0.026,
      approx: !d || d.approx,
      confidence: d ? d.confidence : 0,
    });
    tryHaptic(10);
  }


  /**
   * Every object that is already CONFIRMED in this photo. The confirmed jack
   * and every accepted bowl are locked: detection is told about them so it can
   * neither accept a tap on them nor recentre a new candidate onto them.
   */
  const lockedObjects = useMemo<LockedObject[]>(() => {
    const out: LockedObject[] = [];
    if (jackAccepted && jack) out.push({ kind: "jack", cx: jack.point.x, cy: jack.point.y, r: jack.radius });
    marks.forEach((b) => {
      const c = b.lockPoint ?? b.point;
      const r = b.lockRadius ?? b.radius;
      if (b.status === "marked" && c && r)
        out.push({ kind: "bowl", cx: c.x, cy: c.y, r, idx: b.number });
    });
    return out;
  }, [jack, jackAccepted, marks]);

  /** Image height / width — converts normalised y into width units. */
  const asp = imgSize.h / (imgSize.w || 1);

  /** Distance in normalised image-WIDTH units (y corrected for aspect). */
  function widthUnitDist(a: PhotoPoint, b: { cx: number; cy: number }) {
    const dx = a.x - b.cx;
    const dy = (a.y - b.cy) * asp;
    return Math.hypot(dx, dy);
  }

  /**
   * Initial arrow tip: the bowl's outside edge nearest the jack, taken from the
   * detected body. Only a STARTING position — the player may then drag the tip
   * anywhere, at any angle.
   */
  function edgeFromRadius(centre: PhotoPoint, radius: number): PhotoPoint {
    const j = jack?.point ?? { x: 0.5, y: 0.5 };
    const dx = centre.x - j.x;
    const dy = (centre.y - j.y) * asp;
    const len = Math.hypot(dx, dy) || 1;
    const r = Math.min(radius, len * 0.98);
    return { x: centre.x - (dx / len) * r, y: centre.y - (dy / len) * (r / (asp || 1)) };
  }

  /**
   * JACK ANCHOR. The measurement always starts on the confirmed jack's OUTER
   * EDGE, in the direction of the arrow tip — the player never touches a
   * jack-side handle. Rotating the arrow slides this start point around the
   * jack automatically.
   */
  function jackEdgeTowards(tip: PhotoPoint): PhotoPoint {
    const j = jack?.point ?? { x: 0.5, y: 0.5 };
    const r = jack?.radius ?? 0.026;
    const dx = tip.x - j.x;
    const dy = (tip.y - j.y) * asp;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(r, len);
    return { x: j.x + (dx / len) * k, y: j.y + (dy / len) * (k / (asp || 1)) };
  }

  /**
   * The arrow tip is stored as the bowl "point" with a negligible radius, so
   * `measureBowl` (centre − jackR − bowlR) yields exactly
   * jack outer edge → arrow tip. Measurement, mat bands and measure_v are
   * unchanged.
   */
  const TIP_RADIUS = 0.0004;


  /** Propose the near edge of the bowl the player just tapped. */
  function seedBowl(p: PhotoPoint) {
    const idx = activeIdx;
    if (idx < 0 || idx >= marks.length) return;
    const bowlNo = marks[idx].number;

    // Geometric guard — runs even when no pixel buffer is available.
    for (const o of lockedObjects) {
      const hit = o.kind === "jack" ? o.r * 1.25 : o.r * 0.92;
      if (widthUnitDist(p, o) <= hit) {
        setDraft(null);
        setFlash(
          o.kind === "jack"
            ? `That's the jack — tap Bowl ${bowlNo}`
            : `Bowl ${o.idx} already marked — tap Bowl ${bowlNo}`,
        );
        tryHaptic(24);
        return;
      }
    }

    const buf = pixelsRef.current;
    const d = buf ? detectAtSeed(buf, p, "bowl", jack?.radius, lockedObjects) : null;
    if (d?.blocked) {
      setDraft(null);
      setFlash(
        d.blocked === "jack"
          ? `That's the jack — tap Bowl ${bowlNo}`
          : `Bowl ${d.blockedIdx} already marked — tap Bowl ${bowlNo}`,
      );
      tryHaptic(24);
      return;
    }
    const centre = d && !d.approx ? { x: d.cx, y: d.cy } : p;
    const radius = d ? d.r : Math.max(0.02, (jack?.radius ?? 0.026) * 2.05);
    // SMART EDGE SNAP — walk from the bowl towards the jack and lock onto the
    // strongest visible boundary facing the jack. Falls back to the fitted
    // radius when there is no pixel buffer or no clear boundary.
    const jackPt = jack?.point;
    const snap = buf && jackPt ? snapNearEdge(buf, centre, jackPt, radius) : null;
    const edge = snap ? { x: snap.x, y: snap.y } : edgeFromRadius(centre, radius);
    setDraft({
      kind: "bowl",
      idx,
      point: centre,
      radius,
      approx: !d || d.approx,
      edge,
      edgeConfidence: snap ? snap.confidence : 0,
      snapEdge: edge,
    });
    tryHaptic(10);
  }

  /* ---------------- QUALITY DERIVATIONS (presentation only) ---------------- */

  /** The draft jack's radius measured in SOURCE pixels — the calibration base. */
  const draftJackRadiusPx = draft?.kind === "jack" ? draft.radius * (imgSize.w || 1) : 0;
  /** High / medium / low fit for the jack currently being confirmed. */
  const draftJackTier: FitTier | null =
    draft?.kind === "jack" ? jackFitTier(draft.confidence ?? 0, draftJackRadiusPx) : null;
  /** How clean the current bowl's near-edge snap was. */
  const draftEdgeTier: FitTier | null =
    draft?.kind === "bowl" ? bowlEdgeTier(draft.edgeConfidence ?? 0) : null;

  /**
   * OVERALL HEAD SCAN QUALITY — a single, honest status for the photo the
   * player is about to use. Purely advisory: it never blocks the scan, never
   * alters a measurement and never changes which band a bowl lands in.
   */
  const scanQuality = useMemo(() => {
    const edgeList = marks
      .map((b, i) => (b.status === "marked" ? (edgeTiers[i] ?? "medium") : null))
      .filter((t): t is FitTier => t !== null);
    const nudged = Object.values(manualNudgePx).some((px) => px > (imgSize.w || 1) * 0.012);
    if (!captureLevelOk || jackTier === "low" || edgeList.includes("low"))
      return { tier: "low" as FitTier, text: "Scan quality: low — retake for a more accurate read" };
    if (jackTier === "medium" || jackSizeWarn || edgeList.includes("medium") || nudged)
      return { tier: "medium" as FitTier, text: "Scan quality: fair — double-check the edges" };
    return { tier: "high" as FitTier, text: "Scan quality: good" };
  }, [captureLevelOk, jackTier, jackSizeWarn, edgeTiers, manualNudgePx, marks, imgSize.w]);





  function handlePhotoTap(p: PhotoPoint) {
    if (phase !== "mark" || !photo) return;
    if (!jackAccepted) {
      seedJack(p);
      return;
    }
    if (activeIdx < 0 || activeIdx >= marks.length) return;
    seedBowl(p);
  }


  /** Accept the proposal for the selected object. */
  function useThis() {
    if (!draft) return;
    if (draft.kind === "jack") {
      // The jack's image-space centre + perimeter are frozen from here on.
      setJack({ point: draft.point, radius: draft.radius });
      setJackAccepted(true);
      setJackTier(draftJackTier ?? "medium");
      setJackSizeWarn(draftJackRadiusPx < JACK_COMFORTABLE_RADIUS_PX);
      setJackAdjust(false);
      setDraft(null);
      setFlash("Jack locked");
      tryHaptic(14);
      return;
    }
    const idx = draft.idx;
    const tip = draft.edge ?? edgeFromRadius(draft.point, draft.radius);
    // How far the player moved the arrow tip away from the automatic snap.
    const nudge = draft.snapEdge
      ? Math.hypot((tip.x - draft.snapEdge.x) * imgSize.w, (tip.y - draft.snapEdge.y) * imgSize.h)
      : 0;
    setEdgeTiers((prev) => ({ ...prev, [idx]: bowlEdgeTier(draft.edgeConfidence ?? 0) }));
    setManualNudgePx((prev) => ({ ...prev, [idx]: nudge }));
    const next = marks.map((b, i) =>
      i === idx
        ? {
            ...b,
            status: "marked" as const,
            // The measured point IS the arrow tip (bowl's near outer edge).
            point: tip,
            radius: TIP_RADIUS,
            // Body geometry kept for re-selection guarding only.
            lockPoint: draft.point,
            lockRadius: draft.radius,
          }
        : b,
    );
    setMarks(next);
    setDraft(null);
    setActiveIdx(nextPendingFrom(idx, next));
    tryHaptic(14);
  }



  function setStatus(idx: number, status: "not_in_photo" | "unidentified") {
    if (idx < 0 || idx >= marks.length) return;
    setDraft(null);
    const next = marks.map((b, i) =>
      i === idx
        ? { ...b, status, point: null, radius: null, lockPoint: null, lockRadius: null }
        : b,
    );
    setMarks(next);
    setActiveIdx(nextPendingFrom(idx, next));
  }

  function redoBowl(idx: number) {
    setDraft(null);
    const next = marks.map((b, i) =>
      i === idx
        ? {
            ...b,
            status: "pending" as const,
            point: null,
            radius: null,
            lockPoint: null,
            lockRadius: null,
          }
        : b,
    );
    setMarks(next);
    setActiveIdx(idx);
  }


  /** Removes only the most recent decision inside this scan. */
  function undoLast() {
    if (draft) {
      setDraft(null);
      return;
    }
    const lastDone = marks
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.status !== "pending")
      .pop();
    if (!lastDone) {
      // Nothing recorded yet — step back to the jack.
      if (jackAccepted) {
        setJackAccepted(false);
        setJack(null);
      }
      return;
    }
    redoBowl(lastDone.i);
  }

  /**
   * TEMPORARY QA (HEAD_SCAN_MEASUREMENT_DEBUG). Returns EXACTLY the value the
   * scoring logic uses — `measureBowl` is called once, and both the score and
   * the readout come from that same call. Nothing here is stored anywhere.
   *
   * Endpoints, explicitly: jack OUTSIDE EDGE (auto-anchored towards the bowl)
   * → the centre of the short bowl-edge line the player positioned.
   */
  function qaFor(point: PhotoPoint | null) {
    if (!HEAD_SCAN_MEASUREMENT_DEBUG || !jack || !point) return null;
    const aspect = box.h > 0 ? box.w / box.h : 1;
    const m = measureBowl(
      { number: 0, hand: "forehand", status: "marked", point, radius: TIP_RADIUS },
      jack,
      aspect,
      orientation,
      activePitchDeg,
      activeFovHDeg,
      activeFovVDeg,
      activePrincipalPointX,
    );
    if (!m) return null;
    const mats = m.gapMm / HEAD_SCAN_MM_PER_MAT;
    const sol = solveGround(
      { x: jack.point.x, y: jack.point.y, radius: jack.radius },
      point,
      aspect,
      activePitchDeg,
      activeFovHDeg,
      activeFovVDeg,
      activePrincipalPointX,
    );
    return {
      mm: Math.round(m.gapMm),
      mats,
      band: matBandLabel(mats),
      perspective: sol.perspective,
      point,
    };
  }

  /**
   * FROZEN CAPTURE GEOMETRY for calibration. Read-only snapshot of what the
   * player already marked — recalculating or sweeping never mutates the photo,
   * the jack circle, the target marks or the captured pitch/roll.
   */
  const calibrationGeometry: CalibrationGeometry | null = useMemo(() => {
    if (!calibration || !jack) return null;
    return {
      jack,
      targets: marks.map((b) => ({ number: b.number, point: b.point, status: b.status })),
      aspect: box.h > 0 ? box.w / box.h : 1,
      orientation,
      // SENSOR pitch unless the calibration-only pitch override is on. An
      // Angle Test target angle is never substituted.
      capturePitchDeg: calibPitchActive ? (calibPitchOverride as number) : capturePitchDeg,
      tipRadius: TIP_RADIUS,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibration, jack, marks, box.w, box.h, orientation, capturePitchDeg, calibPitchActive, calibPitchOverride]);


  /** Calibration section of the debug export. null unless calibration is on. */
  const calibrationBlock = useMemo(() => {
    if (!calibrationActive || !calibrationGeometry) return null;
    const live = calibrationResult(
      calibrationGeometry,
      groundTruth,
      activeFovHDeg,
      activeFovVDeg,
      activePrincipalPointX,
    );
    const bestIdx = sweep ? bestSweepIndexByMae(sweep) : -1;
    return {
      calibrationMode: true,
      groundTruthMm: groundTruth,
      capture: {
        actualPitchDeg: capturePitchDeg,
        actualRollDeg: captureRollDeg,
      },
      /** Which pitch the calibration recalculation actually solved with. */
      pitch: {
        sensorPitchDeg: capturePitchDeg,
        pitchOverrideActive: calibPitchActive,
        pitchOverrideDeg: calibPitchActive ? calibPitchOverride : null,
        activePitchDeg: calibrationGeometry.capturePitchDeg,
      },
      /** Horizontal optical centre used by this recalculation. */
      principalPoint: {
        defaultX: DEFAULT_PRINCIPAL_POINT_X,
        overrideActive: calibPpxOverride != null,
        overrideX: calibPpxOverride,
        activeX: activePrincipalPointX,
      },

      /** Per-target calculated vs tape-measured, kept strictly independent. */
      targets: live.rows.map((r) => ({
        number: r.number,
        label: r.label,
        calculatedDistanceMm: r.measuredMm,
        groundTruthDistanceMm: r.actualMm,
        errorMm: r.signedErrorMm,
        errorPercent: r.percentageError,
      })),
      live,
      fovSweep: sweep
        ? {
            fovMinDeg: SWEEP_FOV_MIN,
            fovMaxDeg: SWEEP_FOV_MAX,
            fovStepDeg: SWEEP_FOV_STEP,
            bestFovHDeg: bestIdx >= 0 ? sweep[bestIdx].fovHDeg : null,
            bestMaeMm: bestIdx >= 0 ? sweep[bestIdx].maeMm : null,
            results: sweep,
          }
        : null,
      /** Full H×V diagnostic sweep. */
      fovSweep2d: sweep2dFull
        ? {
            hRange: sweep2dFull.hRange,
            vRange: sweep2dFull.vRange,
            combinationsTested: sweep2dFull.combinationsTested,
            bestByMae: sweep2dFull.bestByMae,
            bestBalanced: sweep2dFull.bestBalanced,
            top10: sweep2dFull.top10,
          }
        : null,
      /** Legacy coarse H×V grid ("ADVANCED 2D" button). */
      fovSweep2dAdvanced: sweep2d,
      /** 3-variable solver sweep: H-FOV × V-FOV × solver pitch. */
      solverSweep3d: sweep3d
        ? {
            totalCombinationsTested: sweep3d.totalCombinationsTested,
            coarse: sweep3d.coarse,
            refined: sweep3d.refined,
          }
        : null,
      /** 4-variable solver sweep: adds the principal point X. */
      solverSweep4d: sweep4d
        ? {
            totalCombinationsTested: sweep4d.totalCombinationsTested,
            coarse: sweep4d.coarse,
            refined: sweep4d.refined,
          }
        : null,
      /** 5-variable solver sweep: adds the radial distortion coefficient k1. */
      solverSweep5d: sweep5d
        ? {
            totalCombinationsTested: sweep5d.totalCombinationsTested,
            coarse: sweep5d.coarse,
            refined: sweep5d.refined,
          }
        : null,
      /** Intrinsics-only sweep solved at the exact recorded sensor pitch. */
      intrinsicsSweepSensorPitchLocked: sweepIntrinsics
        ? {
            lockedSensorPitchDeg: capturePitchDeg,
            pitchSwept: false,
            totalCombinationsTested: sweepIntrinsics.totalCombinationsTested,
            coarse: sweepIntrinsics.coarse,
            refined: sweepIntrinsics.refined,
          }
        : null,
      /** Jack-selection sensitivity simulation. Never changes the real jack. */
      jackSelectionSensitivity: jackSensitivity,
      /** Automatic jack-boundary refit experiment. Never applied to the jack. */
      jackRadiusAutoRefinement: jackRefine,
    };
  }, [
    calibrationActive,
    calibrationGeometry,
    groundTruth,
    activeFovHDeg,
    activeFovVDeg,
    activePrincipalPointX,
    calibPpxOverride,
    capturePitchDeg,
    captureRollDeg,
    calibPitchActive,
    calibPitchOverride,
    sweep,
    sweep2d,
    sweep2dFull,
    sweep3d,
    sweep4d,
    sweep5d,
    sweepIntrinsics,
    jackSensitivity,
    jackRefine,
  ]);


  /**
   * TEMPORARY GEOMETRY DIAGNOSTIC REPORT. Pure read-out of the same solver
   * calls the scoring path makes — it changes nothing. In memory only.
   */
  const debugReport = useMemo(() => {
    if (!HEAD_SCAN_MEASUREMENT_DEBUG) return null;
    return buildHeadScanDebug({
      capture: captureDebug,
      jack,
      bowls: marks.map((b) => ({ number: b.number, status: b.status, point: b.point })),
      aspect: box.h > 0 ? box.w / box.h : 1,
      orientation,
      capturePitchDeg: activePitchDeg,
      sensorPitchDeg: capturePitchDeg,
      pitchOverride:
        HEAD_SCAN_MEASUREMENT_DEBUG && pitchOverride != null
          ? pitchOverride
          : calibPitchActive
            ? calibPitchOverride
            : null,
      fovOverride: HEAD_SCAN_MEASUREMENT_DEBUG ? fovOverride : null,
      fovVOverride: activeFovVDeg,
      calibration: calibrationBlock,
      opticalAxis: captureAxis,
      tipRadius: TIP_RADIUS,
      imageWidth: imgSize.w,
      imageHeight: imgSize.h,
      displayWidth: box.w,
      displayHeight: box.h,

    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureDebug, jack, marks, box.w, box.h, orientation, activePitchDeg, activeFovHDeg, activeFovVDeg, calibrationBlock, pitchOverride, calibPitchActive, calibPitchOverride, fovOverride, captureAxis, capturePitchDeg, imgSize.w, imgSize.h]);


  const debugJson = useMemo(
    () => (debugReport ? JSON.stringify(debugReport, null, 2) : ""),
    [debugReport],
  );

  /** Console trace of the full record, once every bowl is accounted for. */
  const loggedRef = useRef(false);
  useEffect(() => {
    if (!HEAD_SCAN_MEASUREMENT_DEBUG || !debugReport || !jack) return;
    const done = marks.every((b) => b.status !== "pending");
    if (done && !loggedRef.current) {
      loggedRef.current = true;
      console.log("[HeadScan:debug] geometry report", debugReport);
    }
    if (!done) loggedRef.current = false;
  }, [debugReport, jack, marks]);

  const allResolved = marks.every((b) => b.status !== "pending") && !draft;



  function finish() {
    if (!jack) return;
    const aspect = box.h > 0 ? box.w / box.h : 1;
    const results: HeadScanResult[] = marks.map((b) => {
      const measured = b.status === "marked" ? measureBowl(b, jack, aspect, orientation, activePitchDeg, activeFovHDeg, activeFovVDeg, activePrincipalPointX) : null;
      // Only "scanned" carries a position. Unresolved bowls get tap = null and
      // NO distance, band or points — they continue on the Visual Target.
      const status: HeadScanResult["status"] =
        b.status === "marked" && measured
          ? "scanned"
          : b.status === "not_in_photo"
            ? "not_in_photo"
            : "unidentified";
      return {
        number: b.number,
        status,
        tap: measured?.tap ?? null,
        gapMm: measured?.gapMm,
      };
    });
    // The photo and its pixel buffer are dropped here; only coordinates leave.
    dropPhoto();
    onComplete(results);
  }

  // ---------------- Pointer handling ----------------

  /**
   * DIRECT MANIPULATION (no floating controls, no D-pad, no sliders):
   *   • JACK  — drag anywhere inside the red outline to move it (Bowlometer
   *     style). Sizing is done with the JACK SIZE slider, never the rim.
   *   • BOWL  — the WHOLE measurement line is the handle. A wide invisible
   *     corridor around the visible 2–3px line means a finger anywhere near it
   *     grabs it; the jack end stays anchored and the bowl end follows.
   */
  /** Forgiving margin around the jack circle so it is easy to grab and move. */
  const JACK_GRAB_MARGIN_PX = 16;



  const ARROW_GRAB_PX = 36;
  /** Half-width of the invisible touch corridor around the measurement line. */
  const LINE_CORRIDOR_PX = 28;
  /** Half-length of the short Bowlometer edge line drawn across the bowl. */
  const EDGE_LINE_HALF_PX = 20;

  /** Shortest distance (px) from a point to the segment a→b. */
  function distToSegmentPx(p: PhotoPoint, a: PhotoPoint, b: PhotoPoint) {
    const px = p.x * box.w;
    const py = p.y * box.h;
    const ax = a.x * box.w;
    const ay = a.y * box.h;
    const bx = b.x * box.w;
    const by = b.y * box.h;
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  }

  /**
   * BOWLOMETER EDGE LINE — a short straight line drawn ACROSS the bowl's
   * nearest visible edge, always perpendicular to the measurement direction so
   * it rotates automatically as the line is moved. Bowls Trainer therefore
   * never needs to know a bowl's diameter: the measurement simply terminates
   * on this line.
   */
  function edgeLineEnds(start: PhotoPoint, tip: PhotoPoint): [PhotoPoint, PhotoPoint] {
    const dx = (tip.x - start.x) * box.w;
    const dy = (tip.y - start.y) * box.h;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (EDGE_LINE_HALF_PX / Math.max(1, viewRef.current.scale));
    const ny = (dx / len) * (EDGE_LINE_HALF_PX / Math.max(1, viewRef.current.scale));
    return [
      { x: tip.x + nx / (box.w || 1), y: tip.y + ny / (box.h || 1) },
      { x: tip.x - nx / (box.w || 1), y: tip.y - ny / (box.h || 1) },
    ];
  }

  /** Which part of the current draft (if any) a touch point grabs. */
  function draftGrab(p: PhotoPoint): DragMode | null {
    if (!draft) return null;
    const scale = Math.max(1, viewRef.current.scale);
    if (draft.kind === "bowl") {
      const e = draft.edge ?? edgeFromRadius(draft.point, draft.radius);
      const start = jackEdgeTowards(e);
      const tipPx = Math.hypot((p.x - e.x) * box.w, (p.y - e.y) * box.h);
      if (tipPx <= ARROW_GRAB_PX / scale) return "edge";
      // The short bowl-edge line has the same priority as the arrow itself.
      const [ea, eb] = edgeLineEnds(start, e);
      if (distToSegmentPx(p, ea, eb) <= LINE_CORRIDOR_PX / scale) return "edge";
      // Anywhere on (or near) the line counts — no need to find the arrowhead.
      return distToSegmentPx(p, start, e) <= LINE_CORRIDOR_PX / scale ? "edge" : null;
    }
    // JACK — one target: anywhere inside (plus a forgiving margin) moves it.
    // There is no rim-resize and no handle; sizing is the JACK SIZE slider.
    const dx = (p.x - draft.point.x) * box.w;
    const dy = (p.y - draft.point.y) * box.h;
    const dist = Math.hypot(dx, dy);
    const rPx = draft.radius * box.w;
    return dist <= Math.max(rPx, 18 / scale) + JACK_GRAB_MARGIN_PX / scale ? "move" : null;
  }


  function onSurfacePointerDown(e: React.PointerEvent) {
    // GESTURE OWNERSHIP: once a measurement control owns the gesture it keeps
    // it until pointer up/cancel. A second finger cannot convert an active
    // drag into a pinch, and the photo can never pan underneath it.
    if (dragRef.current) {
      e.stopPropagation();
      return;
    }
    const pt = localXY(e);
    pointersRef.current.set(e.pointerId, pt);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      gestureRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        ...viewRef.current,
      };
      panRef.current = null;
      setDragMode(null);
      dragRef.current = null;
      return;
    }
    if (pointersRef.current.size > 2) return;

    const p = pointFromEvent(e);
    const grab = p ? draftGrab(p) : null;
    if (p && grab && draft) {
      // For the line, keep the finger↔tip offset when the grab starts away from
      // the arrowhead, so a mid-line grab does not make the tip jump.
      let ox = draft.point.x - p.x;
      let oy = draft.point.y - p.y;
      if (grab === "edge" && draft.kind === "bowl") {
        const tip = draft.edge ?? edgeFromRadius(draft.point, draft.radius);
        const nearTip =
          Math.hypot((p.x - tip.x) * box.w, (p.y - tip.y) * box.h) <=
          ARROW_GRAB_PX / Math.max(1, viewRef.current.scale);
        ox = nearTip ? 0 : tip.x - p.x;
        oy = nearTip ? 0 : tip.y - p.y;
      }
      dragRef.current = { mode: grab, ox, oy };
      setDragMode(grab);
      // The gesture now belongs to the line/circle: never pan the image too.
      panRef.current = null;
      gestureRef.current = null;
      setHint(null);
      e.stopPropagation();
      return;
    }

    panRef.current = {
      x: pt.x,
      y: pt.y,
      tx: viewRef.current.tx,
      ty: viewRef.current.ty,
      moved: false,
    };
  }


  function handleDoubleTap(pt: { x: number; y: number }): boolean {
    const now = Date.now();
    const last = lastTapRef.current;
    lastTapRef.current = { t: now, x: pt.x, y: pt.y };
    if (last && now - last.t < 300 && Math.hypot(pt.x - last.x, pt.y - last.y) < 30) {
      lastTapRef.current = null;
      if (viewRef.current.scale > 1.2) resetView();
      else zoomAt(pt.x, pt.y, 3);
      return true;
    }
    return false;
  }

  /** Apply a drag: jack circle move, or the bowl arrow tip (free angle+length). */
  function applyDrag(p: PhotoPoint) {
    const d0 = dragRef.current;
    if (!d0) return;
    setDraft((d) => {
      if (!d) return d;
      if (d0.mode === "edge") {
        // FREE LINE: the bowl end follows the finger (keeping the grab offset),
        // so dragging sideways rotates it and dragging in/out changes its
        // length. The jack end re-anchors to the jack's outer edge itself.
        const edge = {
          x: Math.min(1, Math.max(0, p.x + d0.ox)),
          y: Math.min(1, Math.max(0, p.y + d0.oy)),
        };
        return { ...d, edge, approx: false };
      }

      if (d0.mode === "move") {
        const point = {
          x: Math.min(1, Math.max(0, p.x + d0.ox)),
          y: Math.min(1, Math.max(0, p.y + d0.oy)),
        };
        return { ...d, point, approx: false };
      }
      const dist = Math.hypot((p.x - d.point.x) * box.w, (p.y - d.point.y) * box.h);
      return {
        ...d,
        radius: Math.min(0.35, Math.max(0.008, dist / (box.w || 1))),
        approx: false,
      };
    });
  }


  function onSurfacePointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    const pt = localXY(e);
    pointersRef.current.set(e.pointerId, pt);

    // An active control drag always wins — checked before pinch and pan.
    if (dragRef.current) {
      const dp = pointFromEvent(e);
      if (dp) applyDrag(dp);
      return;
    }

    const g = gestureRef.current;
    if (g && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const k = dist / g.dist;
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.scale * k));
      const kk = scale / g.scale;
      setView(
        clampView({
          scale,
          tx: cx - (g.cx - g.tx) * kk,
          ty: cy - (g.cy - g.ty) * kk,
        }),
      );
      return;
    }

    if (dragRef.current) {
      const p = pointFromEvent(e);
      if (p) applyDrag(p);
      return;
    }

    const pan = panRef.current;
    if (!pan) return;
    const dx = pt.x - pan.x;
    const dy = pt.y - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) > 8) pan.moved = true;
    // One-finger pan is only available while zoomed in; at 1x a drag is a tap.
    if (pan.moved && viewRef.current.scale > 1.02) {
      setView(clampView({ scale: viewRef.current.scale, tx: pan.tx + dx, ty: pan.ty + dy }));
    }
  }

  function onSurfacePointerUp(e: React.PointerEvent) {
    const wasSingle = pointersRef.current.size === 1;
    const pan = panRef.current;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;

    const wasDrag = dragRef.current !== null;
    dragRef.current = null;
    setDragMode(null);
    panRef.current = null;
    if (wasDrag || !wasSingle || !pan) return;

    const pt = localXY(e);
    if (handleDoubleTap(pt)) return;
    if (pan.moved) return;

    const p = pointFromEvent(e);
    if (p) handlePhotoTap(p);
  }

  // ---------------- Camera could not start ----------------
  if (phase === "denied") {
    const copy = cameraFailureCopy(cameraError);
    return (
      <Shell title="Head Scan" onCancel={cancel}>
        <div className="flex flex-1 flex-col justify-center gap-4 px-6 text-center">
          <h2 className="font-display text-2xl font-extrabold">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <Footer>
          <BigButton onClick={() => setPhase("camera")}>Try Again</BigButton>
          {copy.showSettings && (
            <GhostButton onClick={() => void openAppSettings()}>Open Settings</GhostButton>
          )}
          <GhostButton onClick={cancel}>Use Visual Target Instead</GhostButton>
        </Footer>
      </Shell>
    );
  }

  // ---------------- Camera ----------------
  if (phase === "camera") {
    return (
      <Shell title="Head Scan" onCancel={cancel}>
        <div className="relative flex-1 overflow-hidden bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-0 top-3 px-4 text-center">
            <p className="text-sm font-bold text-white drop-shadow">
              One photo of the head — keep all bowls in frame.
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-white/85">
              Behind jack · Aim towards bowls
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-white/70">
              The photo stays on this device and is never stored.
            </p>
          </div>

          {/* Photo tips stays available even after "Don't show this again". */}
          <button
            type="button"
            onClick={() => setShowTips(true)}
            className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-bold text-white"
          >
            <HelpCircle className="h-4 w-4" /> Photo tips
          </button>

          {showTips && (
            <PositioningCard
              dismissedDefault={tipDismissed()}
              onStart={(dontShowAgain) => {
                try {
                  if (dontShowAgain) window.localStorage.setItem(TIP_KEY, "1");
                  else window.localStorage.removeItem(TIP_KEY);
                } catch {
                  /* storage unavailable — the card simply shows again */
                }
                setShowTips(false);
              }}
            />
          )}
          {level.supported && <TriangleLevelGuide reading={level} armed={autoCapture} />}

          {HEAD_SCAN_MEASUREMENT_DEBUG && (
            <div className="pointer-events-none absolute left-2 top-14 rounded-md border border-amber-400/50 bg-black/75 px-2 py-1 font-mono text-[10px] font-bold text-amber-300">
              <p>
                CAMERA ANGLE:{" "}
                {level.supported && liveAttitude.valid
                  ? `${liveAttitude.pitchDeg.toFixed(1)}°`
                  : "no sensor (90.0° assumed)"}
              </p>
              <p className="font-normal text-amber-200/80">
                α/β/γ {fmt(level.rawAlpha)} / {fmt(level.rawBeta)} / {fmt(level.rawGamma)}
              </p>
              <p className="font-normal text-amber-200/80">
                roll {liveAttitude.rollDeg.toFixed(1)}° · axis z{" "}
                {liveAttitude.opticalAxis.z.toFixed(3)}
              </p>
            </div>
          )}

          {/* ---- TEMPORARY ANGLE TEST MODE (diagnostic) ---- */}
          {angleTestMode && (
            <div className="absolute inset-x-0 bottom-3 px-3">
              <div className="rounded-2xl border border-white/20 bg-black/75 p-3 text-center text-white">
                <p className="text-[10px] font-black tracking-widest text-white/70">PHONE ANGLE</p>
                <p
                  className={`text-3xl font-black leading-none ${
                    angleTest.status === "ready" ? "text-success" : "text-white"
                  }`}
                >
                  {level.supported ? `${level.pitchDeg.toFixed(1)}°` : "—"}
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-white/80">
                  Target: {angleTestTargetDeg}° · Roll:{" "}
                  {level.supported
                    ? `${level.rollDeg >= 0 ? "+" : ""}${level.rollDeg.toFixed(1)}°`
                    : "—"}
                </p>

                {/* Sensor permission states — the angle test needs REAL data. */}
                {!level.supported && motionPerm === "not_requested" && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={enableAngleSensor}
                      className="w-full rounded-full bg-white px-4 py-2 text-sm font-black text-black"
                    >
                      Enable Angle Sensor
                    </button>
                    <p className="mt-1 text-[11px] font-semibold text-white/70">
                      Required for automatic angle capture.
                    </p>
                  </div>
                )}
                {motionPerm === "denied" && (
                  <p className="mt-2 rounded-xl bg-destructive/80 px-3 py-2 text-[11px] font-bold">
                    Angle sensor permission is off. Allow Motion &amp; Orientation access for this
                    site (Settings → Safari → Motion &amp; Orientation Access), then reload.
                  </p>
                )}
                {motionPerm === "unsupported" && (
                  <p className="mt-2 text-[11px] font-bold text-white/70">
                    Angle sensor unavailable — capture manually
                  </p>
                )}
                {!level.supported && motionPerm !== "unsupported" && (
                  <p className="mt-2 text-[11px] font-bold text-amber-300">
                    No measured angle — any capture now is NOT valid calibration data.
                  </p>
                )}


                <div className="mt-2 flex justify-center gap-1.5">
                  {ANGLE_TEST_TARGETS_DEG.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAngleTestTargetDeg(t)}
                      className={`rounded-full px-3 py-1 text-xs font-black ${
                        t === angleTestTargetDeg ? "bg-white text-black" : "bg-white/15 text-white"
                      }`}
                    >
                      {t}°
                    </button>
                  ))}
                </div>

                <p
                  className={`mt-2 rounded-full px-3 py-1 text-sm font-extrabold ${
                    angleTest.status === "ready"
                      ? "bg-success text-white"
                      : angleTest.status === "near"
                        ? "bg-amber-500 text-black"
                        : "bg-white/15 text-white"
                  }`}
                >
                  {angleTest.message}
                </p>
                {autoCapture && angleTest.valid && (
                  <>
                    <p className="mt-1 text-[11px] font-bold text-white/80">Hold steady…</p>
                    <div className="mx-auto mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-white/25">
                      <div
                        className="h-full rounded-full bg-success transition-[width] duration-100 ease-linear"
                        style={{ width: `${Math.min(100, (holdMs / STABLE_HOLD_MS) * 100)}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {!angleTestMode && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <span
                className={`rounded-full px-4 py-1.5 text-sm font-extrabold ${
                  isStrictlyLevel(level, performance.now())
                    ? "bg-success text-white"
                    : "bg-black/60 text-white"
                }`}
              >
                {!level.supported
                  ? "Hold phone as level as possible"
                  : isStrictlyLevel(level, performance.now())
                    ? autoCapture
                      ? "✓ LEVEL — HOLD STILL"
                      : "✓ LEVEL – READY"
                    : "Line the triangles up"}
              </span>
            </div>
          )}
          {/* Subtle hold progress — no clutter, no numbers. */}
          {!angleTestMode && level.supported && autoCapture && holdMs > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-10">
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-success transition-[width] duration-100 ease-linear"
                  style={{ width: `${Math.min(100, (holdMs / STABLE_HOLD_MS) * 100)}%` }}
                />
              </div>
            </div>
          )}


        </div>
        <Footer>
          <BigButton onClick={() => capture(false)} disabled={showTips}>
            <Camera className="mr-2 inline h-5 w-5" /> Take Photo
          </BigButton>
          {!level.supported && motionPerm === "not_requested" && (
            <GhostButton onClick={enableAngleSensor}>Enable Angle Sensor</GhostButton>
          )}
          {level.supported && (
            <GhostButton onClick={() => setAutoCapture((v) => !v)}>
              {autoCapture ? "Turn off auto capture" : "Turn on auto capture"}
            </GhostButton>
          )}
          {/* TEMPORARY diagnostic toggle — off by default, normal flow unchanged. */}
          <GhostButton
            onClick={() => {
              setAngleTestMode((v) => !v);
              setHoldMs(0);
            }}
          >
            {angleTestMode ? "Angle Test Mode: ON" : "Angle Test Mode"}
          </GhostButton>
          <GhostButton onClick={cancel}>Use Visual Target Instead</GhostButton>
        </Footer>

      </Shell>
    );
  }

  // ---------------- Full-screen marking workspace ----------------

  const activeMark = activeIdx >= 0 && activeIdx < marks.length ? marks[activeIdx] : null;
  const s = view.scale;
  const jackPx = jack ? Math.max(jack.radius * 2 * box.w, 24 / s) : 0;

  const draftEdge =
    draft && draft.kind === "bowl" ? (draft.edge ?? edgeFromRadius(draft.point, draft.radius)) : null;
  /** Arrow start — always on the confirmed jack's outer edge, auto-anchored. */
  const arrowStart = draftEdge ? jackEdgeTowards(draftEdge) : null;

  const prompt = draft
    ? draft.kind === "jack"
      ? "Drag the circle to position it"
      : `Bowl ${marks[draft.idx]?.number} — drag the line to its nearest edge`

    : !jackAccepted
      ? "Tap the jack"
      : allResolved
        ? "All bowls accounted for"
        : activeMark
          ? `Bowl ${activeMark.number} · ${activeMark.hand === "forehand" ? "Forehand" : "Backhand"}`
          : "Review";


  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* TOP — one compact line only */}
      <header className="relative z-20 flex shrink-0 items-center gap-2 bg-black/85 px-3 pb-1.5 pt-[max(0.35rem,env(safe-area-inset-top))] text-white">
        <button
          type="button"
          onClick={cancel}
          aria-label="Back to Visual Target"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-white/55">
            End {endNumber} · Head Scan
          </p>
          <p className="truncate font-display text-sm font-extrabold">{prompt}</p>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More options"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 z-30 w-60 overflow-hidden rounded-2xl bg-card text-charcoal bt-shadow-elevated">
              <MenuItem onClick={requestRetake}>
                <RotateCcw className="h-4 w-4" /> Retake photo
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setDraft(null);
                  setJackAccepted(false);
                  setJack(null);
                }}
              >
                <Crosshair className="h-4 w-4" /> Re-tap jack
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setOrientation((o) => (o === "mat_bottom" ? "mat_top" : "mat_bottom"));
                }}
              >
                <Undo2 className="h-4 w-4" />
                {orientation === "mat_bottom" ? "Delivered from ▼" : "Delivered from ▲"}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  cancel();
                }}
              >
                <X className="h-4 w-4" /> Use Visual Target instead
              </MenuItem>
            </div>
          )}
        </div>
      </header>

      {/* CENTRE — the photo owns the screen */}
      <div
        ref={imgWrapRef}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
        onPointerCancel={onSurfacePointerUp}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-black"
        style={{
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
          // @ts-expect-error - vendor property, WebKit only
          WebkitUserDrag: "none",
        }}
      >
        {/* Zoom/pan layer. Purely visual: stored coordinates are unaffected. */}
        <div
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${s})` }}
        >
          {/* The photo box — markers are children so they can never drift. */}
          <div
            className="absolute"
            style={{ left: box.left, top: box.top, width: box.w, height: box.h }}
          >
            {photo && (
              <img
                src={photo}
                alt=""
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
                className="pointer-events-none h-full w-full select-none object-fill"
                style={{
                  WebkitTouchCallout: "none",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                  // @ts-expect-error - vendor property, WebKit only
                  WebkitUserDrag: "none",
                }}
              />
            )}


            {/* Accepted bowls — a simple numbered marker, no editing circle. */}
            {marks.map((b) =>
              b.point ? (
                <span
                  key={b.number}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full font-extrabold text-white"
                  style={{
                    left: `${b.point.x * 100}%`,
                    top: `${b.point.y * 100}%`,
                    width: 26 / s,
                    height: 26 / s,
                    fontSize: 13 / s,
                    border: `${2 / s}px solid rgba(255,255,255,0.9)`,
                    background:
                      b.hand === "backhand"
                        ? "var(--color-bowl-backhand)"
                        : "var(--color-bowl-forehand)",
                  }}
                >
                  {b.number}
                </span>
              ) : null,
            )}

            {/*
              JACK — RED outline, no number, anchored to image coordinates and
              frozen once accepted. Red because jacks are usually white or
              yellow. UI only: detection and measurement are unchanged.
            */}
            {jack && (
              <span
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full"
                style={{
                  left: `${jack.point.x * 100}%`,
                  top: `${jack.point.y * 100}%`,
                  width: jackPx,
                  height: jackPx,
                  border: `${2.5 / s}px solid #ef2b2b`,
                  background: "rgba(239,43,43,0.14)",
                  boxShadow: `0 0 0 ${1 / s}px rgba(0,0,0,0.45)`,
                }}
              >
                <span
                  className="rounded-full"
                  style={{ width: 5 / s, height: 5 / s, background: "#ef2b2b" }}
                />
              </span>
            )}

            {/*
              JACK RADIUS AUTO-REFINEMENT OVERLAY — diagnostic only. Dashed
              white = the player's original circle, dashed cyan = the
              auto-fitted boundary. Neither changes the measured jack.
            */}
            {showRefineOverlay && jackRefine?.refined && jack && (
              <>
                <span
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${jack.point.x * 100}%`,
                    top: `${jack.point.y * 100}%`,
                    width: jack.radius * 2 * box.w,
                    height: jack.radius * 2 * box.w,
                    border: `${1.5 / s}px dashed rgba(255,255,255,0.95)`,
                  }}
                />
                <span
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${jackRefine.refined.normX * 100}%`,
                    top: `${jackRefine.refined.normY * 100}%`,
                    width: jackRefine.refined.normRadius * 2 * box.w,
                    height: jackRefine.refined.normRadius * 2 * box.w,
                    border: `${1.5 / s}px dashed #22d3ee`,
                  }}
                />
              </>
            )}


            {/*
              JACK DRAFT — SOLID red ring: drag anywhere inside it to move.
              The ring is drawn on the exact calibration radius; contrast comes
              from thin dark halos outside and inside, never from the radius.
            */}
            {draft && draft.kind === "jack" && (
              <span
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${draft.point.x * 100}%`,
                  top: `${draft.point.y * 100}%`,
                  width: draft.radius * 2 * box.w,
                  height: draft.radius * 2 * box.w,
                  border: `${3 / s}px solid #ef2b2b`,
                  background:
                    dragMode === "move" ? "rgba(239,43,43,0.22)" : "rgba(239,43,43,0.10)",
                  boxShadow: `0 0 0 ${1.25 / s}px rgba(0,0,0,0.75), inset 0 0 0 ${1.25 / s}px rgba(0,0,0,0.55)`,
                }}
              />
            )}

            {/* Jack is moved by dragging the circle; sizing is slider-only. */}



            {/*
              BOWL DRAFT — ONE measurement arrow. It starts on the confirmed
              jack's outer edge (auto-anchored, no jack-side handle) and ends in
              a draggable arrowhead the player puts on the bowl's nearest edge.
              Free angle and free length; no circle over the bowl.
            */}
            {draft && draft.kind === "bowl" && draftEdge && arrowStart && jack && (
              <svg
                className="pointer-events-none absolute inset-0"
                width={box.w}
                height={box.h}
                viewBox={`0 0 ${box.w} ${box.h}`}
              >
                {/* Dark under-stroke keeps the arrow readable on any surface. */}
                <line
                  x1={arrowStart.x * box.w}
                  y1={arrowStart.y * box.h}
                  x2={draftEdge.x * box.w}
                  y2={draftEdge.y * box.h}
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth={5 / s}
                  strokeLinecap="round"
                />
                <line
                  x1={arrowStart.x * box.w}
                  y1={arrowStart.y * box.h}
                  x2={draftEdge.x * box.w}
                  y2={draftEdge.y * box.h}
                  stroke="#ffffff"
                  strokeWidth={2 / s}
                  strokeLinecap="round"
                />
                {(() => {
                  const x1 = arrowStart.x * box.w;
                  const y1 = arrowStart.y * box.h;
                  const x2 = draftEdge.x * box.w;
                  const y2 = draftEdge.y * box.h;
                  const a = Math.atan2(y2 - y1, x2 - x1);
                  const L = (dragMode === "edge" ? 17 : 14) / s;
                  const W = L * 0.55;
                  const p = (ang: number, len: number) => [
                    x2 - Math.cos(ang) * len,
                    y2 - Math.sin(ang) * len,
                  ];
                  const [ax, ay] = p(a - 0.42, L);
                  const [bx, by] = p(a + 0.42, L);
                  return (
                    <>
                      <polygon
                        points={`${x2},${y2} ${ax},${ay} ${bx},${by}`}
                        fill="#ffffff"
                        stroke="rgba(0,0,0,0.55)"
                        strokeWidth={1.5 / s}
                      />
                      {/*
                        Short straight line across the bowl's nearest edge,
                        perpendicular to the measurement. The measurement ends
                        here — no bowl size is ever needed or displayed.
                      */}
                      <line
                        x1={x2 - Math.sin(a) * -(EDGE_LINE_HALF_PX / s)}
                        y1={y2 + Math.cos(a) * -(EDGE_LINE_HALF_PX / s)}
                        x2={x2 - Math.sin(a) * (EDGE_LINE_HALF_PX / s)}
                        y2={y2 + Math.cos(a) * (EDGE_LINE_HALF_PX / s)}
                        stroke={dragMode === "edge" ? "#22c55e" : "#ffffff"}
                        strokeWidth={4 / s}
                        strokeLinecap="round"
                        paintOrder="stroke"
                      />
                      {/* Generous invisible grab area — never chase a thin line. */}
                      <circle cx={x2} cy={y2} r={ARROW_GRAB_PX / s} fill="transparent" />
                    </>
                  );
                })()}
              </svg>
            )}




          </div>
        </div>

        {/* Zoom controls (outside the transform). */}
        <div className="absolute right-2 top-2 flex flex-col gap-1.5">
          <ZoomButton
            label="Zoom in"
            onClick={() => zoomAt(frame.w / 2, frame.h / 2, viewRef.current.scale * 1.6)}
          >
            <ZoomIn className="h-5 w-5" />
          </ZoomButton>
          <ZoomButton
            label="Zoom out"
            onClick={() => zoomAt(frame.w / 2, frame.h / 2, viewRef.current.scale / 1.6)}
          >
            <ZoomOut className="h-5 w-5" />
          </ZoomButton>
          {s > 1.02 && (
            <ZoomButton label="Reset zoom" onClick={resetView}>
              <RotateCcw className="h-4 w-4" />
            </ZoomButton>
          )}
        </div>

        {/*
          ACQUISITION — a subtle red pulse while the on-device pass looks for
          the jack. Purely cosmetic feedback; nothing leaves the device.
        */}
        {acquiring && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div
              className="absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-dashed border-[#ef2b2b] opacity-80"
              style={{
                left: acquirePoint ? `${box.left + acquirePoint.x * box.w}px` : "50%",
                top: acquirePoint ? `${box.top + acquirePoint.y * box.h}px` : "50%",
                animation: "spin 1.1s linear infinite",
              }}
            />
            <span className="absolute bottom-24 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-white">
              Locating the jack…
            </span>
          </div>
        )}

        {/* Brief, fading guidance — never a permanent banner. */}
        {(showHint || flash || hint) && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3">
            <span className="rounded-full bg-black/55 px-3 py-1 text-center text-[11px] font-semibold text-white">
              {flash ?? hint ?? "Pinch to zoom · Drag to move photo"}
            </span>
          </div>
        )}

        {/*
          TEMPORARY GEOMETRY DIAGNOSTIC OVERLAY (HEAD_SCAN_MEASUREMENT_DEBUG).
          Collapsed to a single small pill so it can never obstruct marking.
          Screen only — nothing is stored or transmitted unless the player
          explicitly copies/shares the JSON.
        */}
        {HEAD_SCAN_MEASUREMENT_DEBUG && debugReport && (
          <div
            className="absolute left-2 top-2 z-20 max-w-[86%]"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setGeoDebugOpen((v) => !v)}
              className="rounded-md border border-amber-400/50 bg-black/75 px-2 py-1 font-mono text-[9px] font-bold tracking-widest text-amber-300"
            >
              HEAD SCAN GEOMETRY DEBUG {geoDebugOpen ? "▲" : "▼"}
            </button>
            {geoDebugOpen && (
              <div className="mt-1 max-h-64 w-72 overflow-auto rounded-md border border-amber-400/40 bg-black/85 p-2 font-mono text-[10px] leading-tight text-amber-200">
                <p>source: {debugReport.resolution.sourceWidth}×{debugReport.resolution.sourceHeight} (video {debugReport.resolution.videoWidth ?? "—"}×{debugReport.resolution.videoHeight ?? "—"})</p>
                <p>display: {Math.round(debugReport.resolution.displayWidth ?? 0)}×{Math.round(debugReport.resolution.displayHeight ?? 0)} · d→s {debugReport.resolution.displayToSourceX?.toFixed(2) ?? "—"}</p>
                <p>jack r: {debugReport.jack?.sourceRadiusPixels?.toFixed(2) ?? "—"} src px / {debugReport.jack?.displayRadiusPixels?.toFixed(2) ?? "—"} disp px</p>

                <p>aspect(solver): {debugReport.solver.solverAspect.toFixed(4)}</p>
                <p>fov_h: {debugReport.solver.DEFAULT_FOV_H_DEG}° · tanH: {debugReport.solver.tanH?.toFixed(4) ?? "—"}</p>
                <p>tanV: {debugReport.solver.tanV?.toFixed(4) ?? "—"}</p>
                <p>
                  pitch in/used: {debugReport.solver.pitchInputDeg.toFixed(1)}° /{" "}
                  {debugReport.solver.pitchUsedDeg?.toFixed(1) ?? "—"}°
                </p>
                <p>
                  raw α/β/γ: {fmt(debugReport.attitude.rawAlpha)} / {fmt(debugReport.attitude.rawBeta)} /{" "}
                  {fmt(debugReport.attitude.rawGamma)}
                </p>
                <p>screen angle: {debugReport.attitude.screenOrientationAngle ?? "—"}</p>
                <p>
                  perspective: {String(debugReport.solver.perspectiveEnabled)} · flat used:{" "}
                  {String(debugReport.solver.flatFallbackUsed)}
                </p>
                {debugReport.jack && (
                  <>
                    <p className="pt-1 text-white">JACK</p>
                    <p>
                      xy: {debugReport.jack.normX.toFixed(4)} / {debugReport.jack.normY.toFixed(4)}
                    </p>
                    <p>
                      r: {debugReport.jack.normRadius.toFixed(5)} ({debugReport.jack.radiusPixels?.toFixed(1)} px)
                    </p>
                    <p>depth: {debugReport.jack.jackDepthMm?.toFixed(0) ?? "—"} mm</p>
                    <p>mmPerUnit: {debugReport.jack.mmPerUnit?.toFixed(1) ?? "—"}</p>
                    <p>
                      ground: {debugReport.jack.groundMm ? `${debugReport.jack.groundMm.x.toFixed(0)}, ${debugReport.jack.groundMm.y.toFixed(0)}` : "—"}
                    </p>
                  </>
                )}
                {debugReport.bowls.map((b) => (
                  <div key={b.bowl} className="pt-1">
                    <p className="text-white">
                      BOWL {b.bowl} — {b.status}
                    </p>
                    {b.measured ? (
                      <>
                        <p>raw centre: {b.measured.rawCentreToEdgeMm.toFixed(0)} mm</p>
                        <p>− jack r: {b.measured.jackRadiusSubtractedMm.toFixed(2)} mm</p>
                        <p>
                          final: {b.measured.finalEdgeToEdgeMm?.toFixed(0)} mm ·{" "}
                          {b.measured.mats?.toFixed(2)} mats
                        </p>
                        <p>
                          {b.measured.band} · {b.measured.model}
                        </p>
                      </>
                    ) : (
                      <p>no measurement</p>
                    )}
                  </div>
                ))}
                <div className="flex gap-1 pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyDebugJson(debugJson);
                      setDebugCopied(ok ? "Copied" : "Copy failed");
                      window.setTimeout(() => setDebugCopied(null), 1800);
                    }}
                    className="flex-1 rounded bg-amber-400/20 px-2 py-1 font-bold text-amber-200"
                  >
                    Copy Debug JSON
                  </button>
                  {canShareDebugJson() && (
                    <button
                      type="button"
                      onClick={() => void shareDebugJson(debugJson)}
                      className="flex-1 rounded bg-amber-400/20 px-2 py-1 font-bold text-amber-200"
                    >
                      Share
                    </button>
                  )}
                </div>
                {debugCopied && <p className="pt-1 text-center text-white">{debugCopied}</p>}
              </div>
            )}
          </div>
        )}


        {/* BOTTOM — compact controls only, floating over the photo. */}
        <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 bg-gradient-to-t from-black/85 via-black/65 to-transparent px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-6">
          {draft ? (
            <>
              {/*
                JACK — Bowlometer-style confirmation. A clean automatic fit is
                simply confirmed; anything less opens the size slider with a
                magnified view so the red circle can be matched to the jack's
                outside edge. No millimetre value is ever shown.
              */}
              {draft.kind === "jack" &&
                (() => {
                  const showSlider = jackAdjust || draftJackTier !== "high";
                  const tierText =
                    draftJackTier === "high"
                      ? "Jack found — looks spot on"
                      : draftJackTier === "medium"
                        ? "Jack found — check the circle"
                        : "Jack unclear — match the circle to its edge";
                  const tierClass =
                    draftJackTier === "high"
                      ? "text-emerald-300"
                      : draftJackTier === "medium"
                        ? "text-amber-300"
                        : "text-red-300";
                  return (
                    <div
                      className="mx-auto mb-1 max-w-xs select-none rounded-xl bg-black/50 px-3 py-2"
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerMove={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onPointerCancel={(e) => e.stopPropagation()}
                      onContextMenu={(e) => e.preventDefault()}
                      onDragStart={(e) => e.preventDefault()}
                      style={{
                        WebkitTouchCallout: "none",
                        WebkitUserSelect: "none",
                        userSelect: "none",
                      }}
                    >
                      <p className={`pb-1 text-center text-[11px] font-bold ${tierClass}`}>
                        {tierText}
                      </p>

                      {showSlider && (
                        <>
                          {/* MAGNIFIED JACK VIEW — the circle at working size. */}
                          {photo && (
                            <div className="mx-auto mb-2 h-24 w-24 overflow-hidden rounded-full ring-2 ring-white/40">
                              {(() => {
                                const jr = Math.max(1, draft.radius * (imgSize.w || 1));
                                const k = Math.min(14, Math.max(1, 30 / jr));
                                const bw = (imgSize.w || 1) * k;
                                const bh = (imgSize.h || 1) * k;
                                const cx = draft.point.x * bw;
                                const cy = draft.point.y * bh;
                                return (
                                  <div
                                    className="relative h-full w-full"
                                    style={{
                                      backgroundImage: `url(${photo})`,
                                      backgroundSize: `${bw}px ${bh}px`,
                                      backgroundPosition: `${48 - cx}px ${48 - cy}px`,
                                      backgroundRepeat: "no-repeat",
                                    }}
                                  >
                                    <div
                                      className="absolute rounded-full border-2 border-[#ef2b2b]"
                                      style={{
                                        width: jr * k * 2,
                                        height: jr * k * 2,
                                        left: 48 - jr * k,
                                        top: 48 - jr * k,
                                      }}
                                    />
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          <p className="pb-1 text-center text-[10px] font-bold uppercase tracking-widest text-white/70">
                            Jack size
                          </p>
                          <input
                            type="range"
                            aria-label="Jack size"
                            min={8}
                            max={120}
                            step={1}
                            value={Math.round(draft.radius * 1000)}
                            onPointerDown={(e) => {
                              // The slider owns this gesture until pointerup/cancel so it
                              // can never be read as photo pan or a native long-press.
                              e.stopPropagation();
                              e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerUp={(e) => {
                              e.stopPropagation();
                              if (e.currentTarget.hasPointerCapture(e.pointerId))
                                e.currentTarget.releasePointerCapture(e.pointerId);
                            }}
                            onPointerCancel={(e) => {
                              if (e.currentTarget.hasPointerCapture(e.pointerId))
                                e.currentTarget.releasePointerCapture(e.pointerId);
                            }}
                            onContextMenu={(e) => e.preventDefault()}
                            onChange={(e) =>
                              setDraft((d) =>
                                d && d.kind === "jack"
                                  ? { ...d, radius: Number(e.target.value) / 1000, approx: false }
                                  : d,
                              )
                            }
                            className="h-6 w-full touch-none accent-[#ef2b2b]"
                            style={{ WebkitTouchCallout: "none", touchAction: "none" }}
                          />
                          <p className="text-center text-[10px] font-semibold text-white/70">
                            Drag circle to move · Use slider to resize
                          </p>
                        </>
                      )}

                      {!showSlider && (
                        <button
                          type="button"
                          onClick={() => setJackAdjust(true)}
                          className="mx-auto block text-center text-[11px] font-bold uppercase tracking-wide text-white/70 underline"
                        >
                          Adjust jack
                        </button>
                      )}
                    </div>
                  );
                })()}

              {/* SMART SNAP FEEDBACK — only when the near edge was not clean. */}
              {draft.kind === "bowl" && draftEdgeTier !== "high" && (
                <p className="mx-auto max-w-xs rounded-lg bg-black/55 px-2 py-1 text-center text-[11px] font-bold text-amber-300">
                  Check the bowl edge — drag the arrow tip onto the near side
                </p>
              )}




              {/* TEMPORARY QA — live edge-to-edge value for this bowl. */}
              {HEAD_SCAN_MEASUREMENT_DEBUG &&
                draft.kind === "bowl" &&
                (() => {
                  const qa = qaFor(draftEdge);
                  if (!qa) return null;
                  return (
                    <p className="mx-auto max-w-xs rounded-lg bg-black/60 px-2 py-1 text-center font-mono text-[11px] font-bold text-amber-300">
                      Calculated: {qa.mm} mm · {qa.mats.toFixed(2)} mats · {qa.band}
                    </p>
                  );
                })()}

              <div className="flex gap-2">
                <BarButton primary onClick={useThis}>
                  <Check className="mr-1.5 inline h-4 w-4" />{" "}
                  {draft.kind === "jack" ? "Confirm jack" : "Use this"}
                </BarButton>
                <BarButton onClick={() => setDraft(null)}>Tap again</BarButton>
                {draft.kind === "bowl" && (
                  <BarButton onClick={() => setStatus(draft.idx, "unidentified")}>
                    <HelpCircle className="h-4 w-4" />
                  </BarButton>
                )}
              </div>
            </>
          ) : !jackAccepted ? (
            <>
              <p className="pb-1 text-center text-xs font-semibold text-white/85">
                Tap the jack in the photo
              </p>
              <div className="flex gap-2">
                <BarButton onClick={requestRetake}>
                  <RotateCcw className="mr-1.5 inline h-4 w-4" /> Retake photo
                </BarButton>
              </div>
            </>
          ) : allResolved ? (
            <>
              {/*
                ACCOUNTED FOR ≠ POSITION COMPLETE. Every bowl is listed with
                exactly what will happen next: scanned bowls carry a position,
                the rest continue on the Visual Target.
              */}
              <div
                className="mx-auto max-h-[32vh] w-full max-w-xs space-y-2 overflow-y-auto overscroll-contain"
                onPointerDown={(e) => e.stopPropagation()}
              >
              <div className="mx-auto max-w-xs space-y-1 rounded-xl bg-black/45 px-3 py-2">
                <p className="pb-1 text-center text-[11px] font-bold text-white/85">
                  {(() => {
                    const left = marks.filter((b) => b.status !== "marked").length;
                    return left === 0
                      ? "Head Scan complete"
                      : left === 1
                        ? "Head Scan complete — 1 bowl needs manual placement"
                        : `Head Scan complete — ${left} bowls need manual placement`;
                  })()}
                </p>

                {/* OVERALL SCAN QUALITY — advisory only, never blocks the scan. */}
                <p
                  className={`pb-1 text-center text-[11px] font-bold ${
                    scanQuality.tier === "high"
                      ? "text-emerald-300"
                      : scanQuality.tier === "medium"
                        ? "text-amber-300"
                        : "text-red-300"
                  }`}
                >
                  {scanQuality.text}
                  {lowConfidenceCapture ? " · off-level photo" : ""}
                </p>



                {marks.map((b, i) => (
                  <button
                    key={b.number}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => redoBowl(i)}
                    className="flex w-full items-center justify-between text-[12px] font-bold text-white"
                  >
                    <span>Bowl {b.number}</span>
                    <span className={b.status === "marked" ? "text-success" : "text-white/75"}>
                      {b.status === "marked" ? "✓ Scanned" : "→ Visual Target"}
                    </span>
                  </button>
                ))}
              </div>

              {/*
                TEMPORARY QA PANEL (HEAD_SCAN_MEASUREMENT_DEBUG). Tape measure /
                Bowlometer / Head Scan comparison aid. Screen only — never
                saved to the database, history, analytics or a profile.
              */}
              {HEAD_SCAN_MEASUREMENT_DEBUG && (
                <div
                  className="mx-auto max-h-44 max-w-xs space-y-1 overflow-auto rounded-xl border border-amber-400/40 bg-black/70 px-3 py-2 font-mono text-[11px] text-amber-300"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <p className="text-center font-bold tracking-widest">HEAD SCAN TEST</p>
                  {marks.map((b) => {
                    const qa = b.status === "marked" ? qaFor(b.point) : null;
                    return (
                      <div key={b.number}>
                        <p className="font-bold text-white">Bowl {b.number}</p>
                        {qa ? (
                          <>
                            <p>Calculated: {qa.mm} mm</p>
                            <p>Mats: {qa.mats.toFixed(2)}</p>
                            <p>Band: {qa.band}</p>
                          </>
                        ) : (
                          <p>Not scanned</p>
                        )}
                      </div>
                    );
                  })}
                  <div className="mt-2 space-y-1 rounded border border-amber-400/40 p-1.5">
                    <p className="font-bold text-white">CURRENT GEOMETRY</p>
                    <p>Pitch: {activePitchDeg.toFixed(1)}°{pitchOverride != null ? " (override)" : ""}</p>
                    <p>FOV-H: {activeFovHDeg.toFixed(1)}°{fovOverride != null ? " (override)" : ""}</p>
                    {marks.map((b) => {
                      const qa = b.status === "marked" ? qaFor(b.point) : null;
                      return (
                        <p key={`cmp-${b.number}`}>
                          Bowl {b.number}: {qa ? `${qa.mm} mm` : "—"}
                        </p>
                      );
                    })}
                  </div>

                  <div className="mt-2 space-y-1 rounded border border-amber-400/40 p-1.5">
                    <label className="flex items-center gap-2 font-bold text-white">
                      <input
                        type="checkbox"
                        checked={pitchOverride != null}
                        onChange={(e) => setPitchOverride(e.target.checked ? 90 : null)}
                      />
                      OVERRIDE CAMERA ANGLE
                    </label>
                    {pitchOverride != null && (
                      <div className="flex flex-wrap gap-1">
                        {[90, 80, 70, 60, 50, 40].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setPitchOverride(v)}
                            className={`rounded px-1.5 py-0.5 ${
                              pitchOverride === v ? "bg-amber-400 text-black" : "bg-white/10"
                            }`}
                          >
                            {v}°
                          </button>
                        ))}
                      </div>
                    )}
                    <label className="flex items-center gap-2 font-bold text-white">
                      <input
                        type="checkbox"
                        checked={fovOverride != null}
                        onChange={(e) => setFovOverride(e.target.checked ? DEFAULT_FOV_H_DEG : null)}
                      />
                      OVERRIDE HORIZONTAL FOV
                    </label>
                    {fovOverride != null && (
                      <div className="space-y-1">
                        <input
                          type="range"
                          min={50}
                          max={80}
                          step={0.5}
                          value={fovOverride}
                          onChange={(e) => setFovOverride(Number(e.target.value))}
                          className="w-full"
                        />
                        <p>FOV: {fovOverride.toFixed(1)}° (default {DEFAULT_FOV_H_DEG}°)</p>
                      </div>
                    )}
                  </div>

                  <p className="pt-1">Sensor pitch at capture: {capturePitchDeg.toFixed(1)}°</p>
                  <p>
                    Capture roll:{" "}
                    {captureRollDeg == null ? "n/a" : `${captureRollDeg.toFixed(1)}°`}
                  </p>
                  <p>
                    Geometry model:{" "}
                    {marks.some((b) => qaFor(b.status === "marked" ? b.point : null)?.perspective)
                      ? "Perspective"
                      : "Flat fallback"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowQaDetail((v) => !v)}
                    className="underline"
                  >
                    {showQaDetail ? "Hide" : "Show"} image coordinates
                  </button>
                  {showQaDetail && jack && (
                    <div className="text-amber-200/80">
                      <p>
                        Jack centre: {jack.point.x.toFixed(4)} / {jack.point.y.toFixed(4)}
                      </p>
                      <p>Jack radius (norm. width): {jack.radius.toFixed(4)}</p>
                      {marks.map((b) =>
                        b.point ? (
                          <p key={b.number}>
                            Bowl {b.number} edge: {b.point.x.toFixed(4)} / {b.point.y.toFixed(4)}
                          </p>
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
              )}
              </div>
              {/* DEVELOPER CALIBRATION (private diagnostics route only). */}
              {calibration && (
                <div className="mx-auto w-full max-w-xs space-y-2" onPointerDown={(e) => e.stopPropagation()}>
                  <label className="flex items-center justify-center gap-2 text-xs font-bold text-sky-200">
                    <input
                      type="checkbox"
                      checked={calibrationOn}
                      onChange={(e) => setCalibrationOn(e.target.checked)}
                    />
                    HEAD SCAN CALIBRATION
                  </label>
                  {calibrationActive && (
                    <HeadScanCalibrationPanel
                      geometry={calibrationGeometry}
                      fovOverride={fovOverride}
                      setFovOverride={setFovOverride}
                      fovVOverride={fovVOverride}
                      setFovVOverride={setFovVOverride}
                      groundTruth={groundTruth}
                      setGroundTruth={updateGroundTruth}
                      sweep={sweep}
                      setSweep={setSweep}
                      sweep2d={sweep2d}
                      setSweep2d={setSweep2d}
                      sweep2dFull={sweep2dFull}
                      setSweep2dFull={setSweep2dFull}
                      sweep3d={sweep3d}
                      setSweep3d={setSweep3d}
                      sweep4d={sweep4d}
                      setSweep4d={setSweep4d}
                      sweep5d={sweep5d}
                      setSweep5d={setSweep5d}
                      sweepIntrinsics={sweepIntrinsics}
                      setSweepIntrinsics={setSweepIntrinsics}
                      jackSensitivity={jackSensitivity}
                      setJackSensitivity={setJackSensitivity}
                      jackRefine={jackRefine}
                      setJackRefine={setJackRefine}
                      photoSrc={photo}
                      showRefineOverlay={showRefineOverlay}
                      setShowRefineOverlay={setShowRefineOverlay}
                      imageWidth={imgSize.w}
                      imageHeight={imgSize.h}
                      ppxOverride={calibPpxOverride}
                      setPpxOverride={setCalibPpxOverride}
                      captureRollDeg={captureRollDeg}
                      sensorPitchDeg={capturePitchDeg}
                      pitchOverride={calibPitchOverride}
                      setPitchOverride={setCalibPitchOverride}
                      onResetGroundTruth={resetGroundTruth}

                    />
                  )}
                </div>
              )}
              {HEAD_SCAN_MEASUREMENT_DEBUG && debugJson && (
                <div className="mx-auto w-full max-w-xs shrink-0 space-y-2" onPointerDown={(e) => e.stopPropagation()}>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyDebugJson(debugJson);
                        setDebugCopied(ok ? "\u2713 Debug JSON copied" : "Copy failed");
                        window.setTimeout(() => setDebugCopied(null), 2000);
                      }}
                      className="flex h-12 flex-1 items-center justify-center rounded-2xl border border-amber-400/50 bg-amber-400/20 px-2 text-xs font-extrabold text-amber-200 active:scale-[0.98]"
                    >
                      COPY JSON
                    </button>
                    {canShareDebugJson() && (
                      <button
                        type="button"
                        onClick={() => void shareDebugJson(debugJson)}
                        className="flex h-12 flex-1 items-center justify-center rounded-2xl border border-amber-400/50 bg-amber-400/20 px-2 text-xs font-extrabold text-amber-200 active:scale-[0.98]"
                      >
                        SHARE JSON
                      </button>
                    )}
                  </div>
                  {debugCopied && (
                    <p className="text-center text-xs font-bold text-amber-300">{debugCopied}</p>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <BarButton primary onClick={finish}>
                  <Check className="mr-1.5 inline h-4 w-4" /> Use these positions
                </BarButton>
                <BarButton onClick={undoLast}>
                  <Undo2 className="h-4 w-4" />
                </BarButton>
                <BarButton onClick={requestRetake}>
                  <RotateCcw className="h-4 w-4" />
                </BarButton>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <BarButton onClick={() => setStatus(activeIdx, "not_in_photo")}>
                <EyeOff className="mr-1.5 inline h-4 w-4" /> Not in photo
              </BarButton>
              <BarButton onClick={() => setStatus(activeIdx, "unidentified")}>
                <HelpCircle className="mr-1.5 inline h-4 w-4" /> Can’t identify
              </BarButton>
              <BarButton onClick={undoLast}>
                <Undo2 className="h-4 w-4" />
              </BarButton>
              <BarButton onClick={requestRetake}>
                <RotateCcw className="h-4 w-4" />
              </BarButton>
            </div>
          )}
        </div>

        {/*
          RETAKE CONFIRMATION — only shown once markings exist on this photo.
          It discards the temporary Head Scan markings for THIS photograph only:
          the practice, end, timer and any bowls already committed to the Visual
          Target are untouched.
        */}
        {confirmRetake && (
          <div
            className="absolute inset-0 z-30 grid place-items-center bg-black/70 px-6"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-xs space-y-3 rounded-2xl bg-card p-4 text-charcoal">
              <p className="text-sm font-bold">
                Retaking the photo will discard the Head Scan markings from this photo.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmRetake(false)}
                  className="h-11 flex-1 rounded-xl bg-secondary text-sm font-extrabold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={retake}
                  className="h-11 flex-1 rounded-xl bt-gradient-primary text-sm font-extrabold text-primary-foreground"
                >
                  Retake photo
                </button>
              </div>
            </div>
          </div>
        )}

        {/*
          LEVEL CAPTURE QUALITY CONTROL. Auto capture only fires level, so this
          can only follow a manual shutter pressed off-level. Nothing is thrown
          away automatically — the player retakes or accepts the photo.
        */}
        {levelWarn && (
          <div
            className="absolute inset-0 z-30 grid place-items-center bg-black/70 px-6"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-xs space-y-3 rounded-2xl bg-card p-4 text-charcoal">
              <p className="text-sm font-bold">Phone wasn't level</p>
              <p className="text-xs font-semibold text-muted-foreground">
                Photos taken at an angle can stretch the distances. Retake with the triangle guide
                centred for the most accurate scan.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLevelWarn(false);
                    setLowConfidenceCapture(true);
                  }}
                  className="h-11 flex-1 rounded-xl bg-secondary text-sm font-extrabold"
                >
                  Use anyway
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLevelWarn(false);
                    retake();
                  }}
                  className="h-11 flex-1 rounded-xl bt-gradient-primary text-sm font-extrabold text-primary-foreground"
                >
                  Retake photo
                </button>
              </div>
            </div>
          </div>
        )}



      </div>
    </div>
  );
}

function tryHaptic(ms = 12) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

function Shell({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <p className="font-display text-base font-extrabold uppercase tracking-wide">{title}</p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel Head Scan"
          className="grid h-10 w-10 place-items-center rounded-full"
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      {children}
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 space-y-2 border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}

function BigButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-14 w-full rounded-2xl bt-gradient-primary text-base font-extrabold uppercase tracking-wide text-primary-foreground bt-shadow-elevated transition active:scale-[0.99] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 w-full rounded-2xl bg-secondary px-3 text-sm font-bold text-charcoal transition active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

/** Compact button used inside the floating bar over the photo. */
function BarButton({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={disabled}
      className={`flex h-12 flex-1 items-center justify-center rounded-2xl px-2 text-xs font-extrabold transition active:scale-[0.98] disabled:opacity-50 sm:text-sm ${
        primary ? "bt-gradient-primary text-primary-foreground" : "bg-white/15 text-white"
      }`}
    >
      {children}
    </button>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold active:bg-secondary"
    >
      {children}
    </button>
  );
}

/** Zoom control overlaid on the photo frame (outside the view transform). */
function ZoomButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={label}
      className="grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white transition active:scale-95"
    >
      {children}
    </button>
  );
}
