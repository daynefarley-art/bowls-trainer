import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/bowls/BottomNav";
import { SessionBanner } from "@/components/bowls/SessionBanner";
import { DemoModeBanner } from "@/components/bowls/DemoModeBanner";
import { DemoReminderDialog } from "@/components/bowls/DemoReminderDialog";
import { WhatsNewDialog } from "@/components/bowls/WhatsNewDialog";
import { SquadInviteDialog } from "@/components/bowls/SquadInviteDialog";
import { ClubProvider } from "@/components/bowls/ClubProvider";
import { ClubThemeProvider } from "@/components/bowls/ClubThemeProvider";
import { ClubPreviewBanner } from "@/components/bowls/ClubPreviewBanner";
import { markStartup, withStartupTimeout } from "@/lib/startup-diagnostics";


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Bounded wait: on a flaky mobile connection this network check can stall,
    // and the app would sit on an empty screen indefinitely.
    markStartup("auth_check_start", "authenticated_layout");
    const result = await withStartupTimeout(supabase.auth.getUser(), 8000, "auth.getUser");
    if (!result) {
      // Network check stalled. Fall back to the session already stored on the
      // device (no network) so an offline/flaky launch still shows the app;
      // every server read is still authorised server-side. With no stored
      // session there is nothing to show, so sign in.
      const { data: stored } = await supabase.auth.getSession();
      if (stored.session?.user) return { user: stored.session.user };
      throw redirect({ to: "/auth" });
    }
    const { data, error } = result;
    if (error || !data.user) {
      markStartup("auth_check_failed", "authenticated_layout");
      throw redirect({ to: "/auth" });
    }
    markStartup("auth_check_done", "authenticated_layout");
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <ClubProvider>
      <ClubThemeProvider>
        <div data-auth-layout className="min-h-screen bg-background pb-24">
          <ClubPreviewBanner />
          <DemoModeBanner />
          <SessionBanner />

          <Outlet />
          <div data-bottom-nav>
            <BottomNav />
          </div>
          <DemoReminderDialog />
          <WhatsNewDialog />
          <SquadInviteDialog />
        </div>
      </ClubThemeProvider>
    </ClubProvider>
  );
}

