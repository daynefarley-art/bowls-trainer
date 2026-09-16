# Intermittent white screen on iOS cold launch — investigation report

No changes made. Findings first, recommended fix at the end, awaiting approval.

## A. What actually happens from tapping the icon to the first screen

1. iOS shows the launch screen, then the Bowls Trainer splash image.
2. The app opens a web view. It does **not** open files stored inside the app — it opens the live website `https://app.bowlstrainer.com` over the internet (set in `capacitor.config.ts` under `server.url`). Every cold start is a fresh website load.
3. The splash image hides automatically after 1.2 seconds (`SplashScreen.launchShowDuration: 1200`), whether or not the website has finished loading.
4. The website returns its first page, then downloads its program files and starts up.
5. For a signed-in person, the home address immediately checks the login with the login service over the internet, then sends them to the dashboard. The dashboard area is marked "no server-rendered content", so **nothing at all is drawn until that login check finishes** (`src/routes/index.tsx` beforeLoad, `src/routes/_authenticated/route.tsx` `ssr: false` + beforeLoad).
6. Dashboard content then loads its own data and renders.

## B. Suspicious things found (exact places)

- `capacitor.config.ts` — `server.url` points at the live site and `webDir: "dist"` is never produced by this project's build (there is no `dist` folder; the build output is a server bundle). So there is **no offline copy to fall back on**: any hiccup in the first network load leaves an empty web view.
- `capacitor.config.ts` — splash hides after 1.2s with no spinner and no "wait for the app to say it's ready" setting. On a slow first load the user sees a plain white web view.
- `src/routes/_authenticated/route.tsx` — `ssr: false` plus a `beforeLoad` that awaits `supabase.auth.getUser()` (a network call). There is **no loading screen** for this wait: while it is pending the page is genuinely empty. If the call is slow or stalls (flaky mobile network, token refresh, DNS/TLS cold start), the screen stays white.
- `src/routes/index.tsx` — same pattern: awaits `supabase.auth.getSession()` before deciding to redirect, again with nothing drawn.
- `src/router.tsx` — no `defaultPendingComponent`, `defaultPendingMs`, or `defaultErrorComponent`. So every pending navigation and any startup failure outside a rendered boundary is a blank page.
- `src/routes/__root.tsx` — the error screen only catches errors **after** the app's program code has started. If a program file fails to download (intermittently possible over mobile data), nothing renders and no error screen appears.
- `ios/App/App/BowlsBridgeViewController.swift` — the safety-net screen only appears at 12s and 25s, and only if the page has literally no text. During the white login wait it may be dismissed as "still loading", so the user sits on white in the meantime.
- `ios/App/App/AppDelegate.swift` / `Info.plist` — nothing wrong; no custom navigation blocking, no App Transport Security overrides needed (all HTTPS).

## C. Most likely causes, ranked by evidence

1. **Remote-URL startup with no offline fallback and no visible loading state.** Every cold launch depends on a full network page load plus program-file downloads. Roughly 1-in-3/4 failures match a flaky first request. Evidence: `server.url` set, no `dist` bundle, no pending UI anywhere.
2. **Login-check race with nothing drawn.** The very first thing a signed-in user's app does is a network login check with no loading screen; a stalled or slow call renders literally nothing, and force-quitting (fresh token/connection) fixes it — exactly the reported behaviour.
3. **Splash hides on a timer instead of when the app is ready.** Guarantees a white gap on any load slower than 1.2s, and turns cause 1 or 2 into "white screen" rather than "still splashing".
4. **No safety net for a failed program-file download.** Turns a transient network failure into a permanent white screen until force-quit.
5. Native side: nothing found that would intermittently blank the web view on its own; the current fallback overlay is too slow and too easily dismissed.

## D. Instrumentation to confirm conclusively

- Log, from the app's own startup, timestamped milestones: first page received, program code started, login check started/finished/failed, first screen painted; send these to the existing error reporting so a white launch leaves a trail.
- Native side: log web view navigation start/finish/fail plus HTTP status, and capture the page's rendered text length at 2s/5s/10s.
- Report unhandled errors and rejected promises during the first 10 seconds explicitly.

## E. Recommended fix (for approval — not yet applied)

1. Show a branded loading screen instead of nothing: add a router-level pending screen (BT logo on the brand green) and a short pending delay, so no wait can ever look blank.
2. Stop the login check from being able to hang: bound it with a timeout and fall back to the sign-in screen rather than waiting forever.
3. Keep the splash up until the app says it is ready (disable auto-hide, hide it from the app once the first screen paints), so there is no white gap.
4. Make the native safety net faster and stricter: first check at ~4s, and treat a failed navigation as an immediate "couldn't load / Try again", not a silent blank.
5. Add the startup milestone logging from section D so any remaining case is diagnosable.

Not touched by any of the above: build pipeline, signing, provisioning, certificates, bundle IDs, the app icon, drills, scoring, BSI, challenges, clubs, squads, coaching, password reset, or the mail/auth domains.
