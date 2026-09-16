/**
 * Camera startup + permission helper (Head Scan only).
 *
 * This module deals ONLY with getting a camera stream running. It contains no
 * measurement, geometry, scoring, analytics or versioning logic.
 *
 * iOS notes:
 *  - Inside a Capacitor WKWebView, `getUserMedia` only prompts when the native
 *    app declares `NSCameraUsageDescription` in Info.plist. Without it iOS
 *    rejects the request instantly, the native dialog never appears, and the
 *    app never shows up under Settings → Privacy & Security → Camera.
 *  - `navigator.permissions.query({ name: 'camera' })` is unsupported on iOS
 *    Safari/WKWebView, so "not determined" is inferred rather than queried.
 */

export type CameraFailureReason =
  | "permission_prompt_pending"
  | "permission_denied"
  | "camera_unavailable"
  | "camera_in_use"
  | "init_failed"
  | "insecure_context";

export type CameraStartResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: CameraFailureReason; detail?: string };

const LOG = "[HeadScan:camera]";

function log(...args: unknown[]) {
  // Temporary diagnostics for the iOS camera-permission investigation.
  console.log(LOG, ...args);
}

/** Camera permission states. Deliberately SEPARATE from motion permission. */
export type CameraPermissionState = "not_determined" | "granted" | "denied" | "unknown";

/** True inside the Capacitor native shell (iOS / Android app). */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * NATIVE AUTHORITY.
 *
 * On iOS/Android the OS permission — not the WKWebView per-request prompt — is
 * the source of truth. `@capacitor/camera` reads AVCaptureDevice's real
 * authorisation status, which persists across ends, app restarts and installs
 * until the user changes it in Settings.
 *
 * Returns null on the web (no native bridge), where the browser stays
 * authoritative.
 */
async function nativeCameraState(): Promise<CameraPermissionState | null> {
  if (!isNativeApp()) return null;
  try {
    const { Camera } = await import("@capacitor/camera");
    const status = await Camera.checkPermissions();
    log("native checkPermissions →", status.camera);
    switch (status.camera) {
      case "granted":
      case "limited":
        return "granted";
      case "denied":
        return "denied";
      default:
        return "not_determined"; // "prompt" | "prompt-with-rationale"
    }
  } catch (err) {
    log("native checkPermissions unavailable:", err);
    return null;
  }
}

/**
 * Requests the OS camera permission ONCE via the native plugin. Already-granted
 * or already-denied states short-circuit, so no prompt is shown again.
 * Never grants blindly — the OS answer is always respected.
 */
async function requestNativeCamera(): Promise<CameraPermissionState | null> {
  const current = await nativeCameraState();
  if (current === null || current === "granted" || current === "denied") return current;
  try {
    const { Camera } = await import("@capacitor/camera");
    const status = await Camera.requestPermissions({ permissions: ["camera"] });
    log("native requestPermissions →", status.camera);
    if (status.camera === "granted" || status.camera === "limited") return "granted";
    if (status.camera === "denied") return "denied";
    return "not_determined";
  } catch (err) {
    log("native requestPermissions failed:", err);
    return "unknown";
  }
}

/**
 * Best-effort permission read WITHOUT prompting.
 * Native → OS status. Web → Permissions API where supported (Chrome/Android),
 * "unknown" on iOS Safari where the API does not exist.
 */
export async function queryCameraPermission(): Promise<CameraPermissionState> {
  const native = await nativeCameraState();
  if (native) return native;
  try {
    const perms = (
      navigator as Navigator & {
        permissions?: { query: (d: { name: string }) => Promise<{ state: string }> };
      }
    ).permissions;
    if (!perms?.query) {
      log("permissions API unavailable (expected on iOS) → unknown");
      return "unknown";
    }
    const status = await perms.query({ name: "camera" });
    log("permission state:", status.state);
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    return "not_determined";
  } catch (err) {
    log("permission query threw:", err);
    return "unknown";
  }
}


function classify(err: unknown): CameraFailureReason {
  const e = err as { name?: string; message?: string };
  const name = e?.name ?? "";
  const msg = (e?.message ?? "").toLowerCase();
  if (name === "NotAllowedError" || name === "SecurityError" || msg.includes("denied")) {
    return "permission_denied";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "camera_unavailable";
  if (name === "NotReadableError" || name === "TrackStartError") return "camera_in_use";
  return "init_failed";
}

/**
 * Ensures the app HAS camera permission before any stream is opened.
 *
 * Native: the OS permission is requested once through the plugin and then
 * persists in iOS/Android Settings, so later Head Scans are silent.
 * Web: no-op — the browser prompt on `getUserMedia` remains authoritative.
 */
export async function ensureCameraPermission(): Promise<CameraPermissionState> {
  const native = await requestNativeCamera();
  if (native) return native;
  return queryCameraPermission();
}

/**
 * Starts a camera stream for Head Scan.
 *
 * The stream is intentionally short-lived: the caller stops every track when
 * Head Scan closes. Silent re-opening comes from the persisted OS/browser
 * permission, never from keeping the camera alive between ends.
  */
/**
 * SOURCE RESOLUTION FOR MEASUREMENT.
 *
 * Head Scan calibrates absolute scale from the jack (63.5 mm). At Safari's
 * default 480x640 stream the jack is only ~17 px across, so a single pixel of
 * fitting error is >10% of the scale reference. These are IDEAL constraints
 * only — the browser is free to negotiate down, and no device-specific mode is
 * demanded — but on capable phones they yield a far larger jack in pixels.
 */
export const HEAD_SCAN_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1440 },
};

export async function startCamera(): Promise<CameraStartResult> {

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    const insecure = typeof window !== "undefined" && !window.isSecureContext;
    log("getUserMedia missing. secureContext =", !insecure);
    return { ok: false, reason: insecure ? "insecure_context" : "camera_unavailable" };
  }

  // Native authority first: if the OS says denied, do not fire getUserMedia
  // (which would produce a second, confusing WebKit prompt/rejection).
  const before = await ensureCameraPermission();
  log("requesting camera. permission state =", before);
  if (before === "denied") return { ok: false, reason: "permission_denied" };


  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: HEAD_SCAN_VIDEO_CONSTRAINTS,
      audio: false,
    });
    log("camera started, tracks =", stream.getVideoTracks().length);
    return { ok: true, stream };

  } catch (err) {
    const reason = classify(err);
    log("getUserMedia failed:", (err as Error)?.name, (err as Error)?.message, "→", reason);

    if (reason === "camera_unavailable") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        log("fallback unconstrained camera started");
        return { ok: true, stream };
      } catch (err2) {
        const r2 = classify(err2);
        log("fallback failed:", (err2 as Error)?.name, "→", r2);
        return { ok: false, reason: r2, detail: (err2 as Error)?.name };
      }
    }
    return { ok: false, reason, detail: (err as Error)?.name };
  }
}

export function cameraFailureCopy(reason: CameraFailureReason): {
  title: string;
  body: string;
  showSettings: boolean;
} {
  switch (reason) {
    case "permission_denied":
      return {
        title: "Camera access is off",
        body: "Bowls Trainer needs camera access to photograph the head. Turn it on in Settings → Bowls Trainer → Camera, then come back and try again. Photos are never saved or uploaded.",
        showSettings: true,
      };
    case "camera_in_use":
      return {
        title: "Camera is busy",
        body: "Another app is using the camera. Close it and try again.",
        showSettings: false,
      };
    case "camera_unavailable":
      return {
        title: "No camera found",
        body: "This device doesn't have a camera available (simulators don't). Use the Visual Target instead.",
        showSettings: false,
      };
    case "insecure_context":
      return {
        title: "Camera blocked",
        body: "The camera can only run over a secure connection. Reopen the app and try again.",
        showSettings: false,
      };
    case "permission_prompt_pending":
      return {
        title: "Waiting for permission",
        body: "Allow camera access when iOS asks, then Head Scan will open the camera.",
        showSettings: false,
      };
    default:
      return {
        title: "Couldn't start the camera",
        body: "Something stopped the camera from starting. Try again, or use the Visual Target instead.",
        showSettings: true,
      };
  }
}

/** Deep-links to this app's iOS Settings page (no-op on the web). */
export async function openAppSettings(): Promise<void> {
  try {
    const { App } = await import("@capacitor/app");
    const opener = (App as unknown as { openUrl?: (o: { url: string }) => Promise<unknown> })
      .openUrl;
    if (opener) await opener({ url: "app-settings:" });
    else window.open("app-settings:", "_self");
    log("opened app settings");
  } catch (err) {
    log("openAppSettings failed:", err);
    try {
      window.open("app-settings:", "_self");
    } catch {
      /* ignore */
    }
  }
}
