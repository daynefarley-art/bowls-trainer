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
    url: "https://bowlmate-progress-tracker.lovable.app",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    // Allow navigation to Supabase auth endpoints without leaving the app.
    allowNavigation: [
      "bowlmate-progress-tracker.lovable.app",
      "*.supabase.co",
      "*.lovable.app",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0F5132",
      showSpinner: false,
    },
  },
};

export default config;
