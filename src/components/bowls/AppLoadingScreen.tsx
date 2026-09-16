import { BTLogo } from "@/components/bowls/BTLogo";

/**
 * Branded loading screen shown while a route is still resolving.
 *
 * Registered as the router's default pending component so no wait — a slow
 * network, a pending auth check — can ever look like a blank white page.
 */
export function AppLoadingScreen({ label = "Loading Bowls Trainer…" }: { label?: string }) {
  return (
    <div className="bt-gradient-hero flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-white">
      <BTLogo size={72} variant="onDark" />
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
        <p className="text-sm font-semibold text-white/90">{label}</p>
      </div>
    </div>
  );
}
