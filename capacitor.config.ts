import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config — Bowls Trainer iOS (TestFlight beta, v0.9).
 *
 * Bowls Trainer is a TanStack Start app that depends on server functions
 * (createServerFn, requireSupabaseAuth, admin functions). It is NOT a static
 * SPA, so it cannot be shipped as an offline bundle inside Capacitor.
 *
 * We therefore point the iOS WebView at the existing production deployment.
 * This preserves everything as-is:
 *   • Same Supabase project (no new database, no migration)
 *   • Existing users keep login, BSI, history, sessions, challenges,
 *     My Squad and Coach access
 *   • Auth tokens are stored in the WebView's localStorage on device
 *
 * If Apple App Review flags this as a "thin web wrapper" (guideline 4.2),
 * the mitigation is native features already wired via Capacitor plugins
 * (haptics, status bar, splash screen) plus offline-capable PWA behavior.
 */
const config: CapacitorConfig = {
  appId: "com.bowlstrainer.app",
  appName: "Bowls Trainer",
  webDir: "dist",
  ios: {
    contentInset: "always",
  },
  android: {
    // Uses the same live-web model as iOS
  },
  server: {
    // Canonical production origin (see src/lib/canonical-url.ts).
    url: "https://app.bowlstrainer.com",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    // Allow navigation to Supabase auth endpoints without leaving the app.
    // The Lovable host stays allowed as a transition-only fallback.
    allowNavigation: [
      "app.bowlstrainer.com",
      "bowlmate-progress-tracker.lovable.app",
      "*.supabase.co",
      "*.lovable.app",
    ],
  },
  plugins: {
    SplashScreen: {
      // The web app is loaded over the network on every cold launch, so the old
      // 1.2s auto-hide could reveal an empty WebView. The app now hides the
      // splash itself after the first real paint (hideNativeSplash in
      // src/lib/startup-diagnostics.ts). The long duration below is only a
      // native backstop so the splash can never become permanent — the native
      // "couldn't load / Try again" screen takes over from there.
      launchShowDuration: 10000,
      launchAutoHide: true,
      backgroundColor: "#0F5132",
      showSpinner: true,
      iosSpinnerStyle: "large",
      spinnerColor: "#FFFFFF",
    },
  },
};

export default config;
