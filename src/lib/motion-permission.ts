/**
 * Motion / device-orientation permission (Head Scan level guidance only).
 *
 * iOS Safari + WKWebView require `DeviceOrientationEvent.requestPermission()`
 * to be called from inside a USER GESTURE.
 *
 * IMPORTANT (diagnostic finding): on iOS the grant is scoped to the *document*,
 * not persisted across page loads. Remembering "granted" in localStorage and
 * then SKIPPING requestPermission() on the next page load leaves the listener
 * attached but starved of events — exactly the reported symptom. So we now call
 * requestPermission() at least once per page load, from a gesture; iOS resolves
 * it silently (no prompt) when the user already granted it for this origin.
 *
 * Safari exposes two separate gates: DeviceOrientationEvent.requestPermission()
 * and DeviceMotionEvent.requestPermission(). We request BOTH from the same
 * gesture so the diagnostic can tell which stream is actually available.
 *
 * This module contains NO measurement, scoring, geometry or versioning logic.
 */

export type MotionPermissionState = "not_requested" | "granted" | "denied" | "unsupported";
export type MotionPermissionResult = "granted" | "denied" | "unknown";

export type MotionPermissionDiagnostic = {
  supported: boolean;
  requestPermissionAvailable: boolean;
  /** DeviceOrientationEvent.requestPermission available (iOS gate). */
  orientationRequestAvailable: boolean;
  /** DeviceMotionEvent.requestPermission available (iOS gate). */
  motionRequestAvailable: boolean;
  storedState: MotionPermissionState;
  currentResult: MotionPermissionResult;
  /** Raw string returned by DeviceMotionEvent.requestPermission(). */
  motionResult: string;
  /** Whether requestPermission() has run in THIS page load. */
  calledThisSession: boolean;
  calledWithUserActivation: boolean | null;
};

const STORAGE_KEY = "bt.motionPermission.v1";
const LOG = "[HeadScan:motion]";

/** In-memory cache so a single app session never asks twice. */
let cached: MotionPermissionState | null = null;
let currentResult: MotionPermissionResult = "unknown";
let motionResult = "not_called";
let calledThisSession = false;
let calledWithUserActivation: boolean | null = null;

type WithPermission = {
  requestPermission?: () => Promise<PermissionState | string>;
};

function doe(): (typeof DeviceOrientationEvent & WithPermission) | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { DeviceOrientationEvent?: typeof DeviceOrientationEvent & WithPermission })
    .DeviceOrientationEvent;
}

function dme(): (typeof DeviceMotionEvent & WithPermission) | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { DeviceMotionEvent?: typeof DeviceMotionEvent & WithPermission })
    .DeviceMotionEvent;
}

function read(): MotionPermissionState {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "granted" || raw === "denied") cached = raw;
  } catch {
    /* private mode — fall through to in-memory only */
  }
  return cached ?? "not_requested";
}

/** Live, read-only values used by the temporary on-device Head Scan diagnostic. */
export function getMotionPermissionDiagnostic(): MotionPermissionDiagnostic {
  const api = doe();
  const motionApi = dme();
  const orientationRequestAvailable = typeof api?.requestPermission === "function";
  const motionRequestAvailable = typeof motionApi?.requestPermission === "function";
  return {
    supported: Boolean(api),
    requestPermissionAvailable: orientationRequestAvailable,
    orientationRequestAvailable,
    motionRequestAvailable,
    storedState: api ? (orientationRequestAvailable ? read() : "granted") : "unsupported",
    currentResult,
    motionResult,
    calledThisSession,
    calledWithUserActivation,
  };
}

function write(state: MotionPermissionState) {
  cached = state;
  try {
    if (state === "granted" || state === "denied") localStorage.setItem(STORAGE_KEY, state);
  } catch {
    /* ignore */
  }
}

/** Current known state. Never prompts. */
export function getMotionPermission(): MotionPermissionState {
  const api = doe();
  if (!api) return "unsupported";
  if (typeof api.requestPermission !== "function") return "granted"; // Android/desktop: no gate
  return read();
}

/**
 * PER-DOCUMENT permission state. iOS grants motion access to the current
 * document only, so this is the authoritative value for this page load.
 * localStorage is diagnostics only and never substitutes for a real request.
 */
export function getMotionPermissionThisLoad(): MotionPermissionState {
  const api = doe();
  if (!api) return "unsupported";
  if (typeof api.requestPermission !== "function") return "granted";
  if (currentResult === "granted") return "granted";
  if (currentResult === "denied") return "denied";
  return "not_requested";
}

/** In-flight request, so overlapping gestures never produce two prompts. */
let pending: Promise<MotionPermissionState> | null = null;

/**
 * MUST be called synchronously from a user gesture handler (e.g. the Head Scan
 * button tap).
 *
 * Requested AT MOST ONCE PER PAGE LOAD. Once this document has an answer
 * (granted or denied) every later Head Scan attaches listeners directly with
 * no further requestPermission() call, so ends 2, 3, 4… never re-prompt.
 * A full page reload starts a new document and may prompt again — that is an
 * iOS/WebKit limitation, and we deliberately do NOT fake persistence.
 */
export async function ensureMotionPermission(): Promise<MotionPermissionState> {
  const api = doe();
  const motionApi = dme();
  if (!api) {
    currentResult = "unknown";
    return "unsupported";
  }
  if (typeof api.requestPermission !== "function") {
    currentResult = "granted";
    calledThisSession = true;
    return "granted";
  }

  // Already answered in THIS document — the live grant is still in effect.
  if (currentResult === "granted") return "granted";
  if (currentResult === "denied") return "denied";
  if (pending) return pending;

  calledWithUserActivation =
    typeof navigator !== "undefined" && "userActivation" in navigator
      ? navigator.userActivation.isActive
      : null;

  pending = (async (): Promise<MotionPermissionState> => {
    // Request the motion gate too (same gesture); Safari treats it separately.
    if (typeof motionApi?.requestPermission === "function") {
      try {
        motionResult = String(await motionApi.requestPermission());
      } catch (err) {
        motionResult = `threw: ${String(err)}`;
      }
    } else {
      motionResult = "unavailable";
    }

    try {
      const result = await api.requestPermission!();
      const state: MotionPermissionState = result === "granted" ? "granted" : "denied";
      currentResult = state;
      calledThisSession = true;
      console.log(LOG, "prompt result:", result, "motion:", motionResult, "→", state);
      write(state);
      return state;
    } catch (err) {
      // Thrown when called outside a gesture, or the user dismissed it. Do NOT
      // persist and do NOT latch — a later genuine gesture may still succeed.
      console.log(LOG, "requestPermission threw:", err);
      currentResult = "unknown";
      return read();
    }
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

