import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { BTLogo } from "@/components/bowls/BTLogo";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { startupTimeline } from "@/lib/startup-diagnostics";

/**
 * Default error screen for any route that fails to load.
 *
 * Registered on the router so a failure never leaves a blank page, and the
 * startup timeline is attached to the report for diagnosis.
 */
export function StartupErrorScreen({ error, reset }: { error: Error; reset?: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
    reportLovableError(error, {
      boundary: "router_default_error_component",
      timeline: JSON.stringify(startupTimeline()),
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <BTLogo size={64} />
      <h1 className="font-display text-xl font-bold">This screen didn't load</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Check your connection and try again. Your account and training history are safe.
      </p>
      <button
        onClick={() => {
          router.invalidate();
          reset?.();
        }}
        className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}
