import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/bowls/BottomNav";
import { SessionBanner } from "@/components/bowls/SessionBanner";
import { DemoModeBanner } from "@/components/bowls/DemoModeBanner";
import { DemoReminderDialog } from "@/components/bowls/DemoReminderDialog";
import { WhatsNewDialog } from "@/components/bowls/WhatsNewDialog";
import { SquadInviteDialog } from "@/components/bowls/SquadInviteDialog";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div data-auth-layout className="min-h-screen bg-background pb-24">
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
  );
}

