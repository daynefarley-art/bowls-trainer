/**
 * Startup diagnostics for the native iOS/Android shell and the web app.
 *
 * The native wrapper loads the live site over the network on every cold
 * launch, so a slow or failed first load used to look like a blank screen.
 * These helpers record timestamped startup milestones and report anything
 * that stalls or throws in the first few seconds, so a white launch always
 * leaves a trail instead of vanishing silently.
 *
 * Nothing here changes app behaviour: it only observes, plus one small
 * timeout helper used to stop a network auth check hanging forever.
 */
import { reportLovableError } from "./lovable-error-reporting";

export type StartupMark =
  | "client_boot"
  | "root_render"
  | "first_paint"
  | "auth_check_start"
  | "auth_check_done"
  | "auth_check_failed"
  | "auth_check_timeout";

type MarkRecord = { mark: StartupMark; at: number; detail?: string };

const marks: MarkRecord[] = [];
const startedAt = typeof performance !== "undefined" ? performance.now() : 0;

/** Milliseconds since the web app's own scripts started running. */
function sinceBoot(): number {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  return Math.round(now - startedAt);
}

export function markStartup(mark: StartupMark, detail?: string): void {
  marks.push({ mark, at: sinceBoot(), ...(detail ? { detail } : {}) });
  if (typeof console !== "undefined") {
    console.info(`[startup] ${mark} +${sinceBoot()}ms${detail ? ` (${detail})` : ""}`);
  }
}

export function startupTimeline(): MarkRecord[] {
  return [...marks];
}

/** True inside the Capacitor native shell (iOS / Android app). */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * Resolves with `undefined` instead of hanging forever.
 *
 * Used for the startup auth check: on a flaky mobile connection the request
 * can stall, and the router then waits with nothing on screen. A bounded
 * wait sends the person to the sign-in screen rather than a blank page.
 */
export async function withStartupTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          markStartup("auth_check_timeout", label);
          reportLovableError(new Error(`Startup step timed out: ${label} (${ms}ms)`), {
            boundary: "startup_timeout",
            timeline: JSON.stringify(startupTimeline()),
          });
          resolve(undefined);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let watching = false;

/**
 * Reports uncaught errors and rejected promises during the first seconds of
 * startup, with the milestone timeline attached.
 */
export function watchStartupFailures(windowMs = 10_000): void {
  if (watching || typeof window === "undefined") return;
  watching = true;

  const onError = (event: ErrorEvent) => {
    reportLovableError(event.error ?? new Error(event.message), {
      boundary: "startup_window_error",
      timeline: JSON.stringify(startupTimeline()),
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportLovableError(event.reason ?? new Error("Unhandled rejection during startup"), {
      boundary: "startup_unhandled_rejection",
      timeline: JSON.stringify(startupTimeline()),
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  setTimeout(() => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  }, windowMs);
}

let splashHidden = false;

/**
 * Hides the native splash screen once the app has actually painted.
 *
 * The splash is configured not to auto-hide, so the person keeps seeing
 * branding until real UI exists — never a white gap.
 */
export function hideNativeSplash(): void {
  if (splashHidden || !isNativeShell()) return;
  splashHidden = true;
  import("@capacitor/splash-screen")
    .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 }))
    .catch(() => {
      /* Splash plugin unavailable (web) — nothing to hide. */
    });
}
