import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";

export const Route = createFileRoute("/_authenticated/coach")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return {};
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const ok = (roles ?? []).some((r) => r.role === "coach" || r.role === "admin");
    if (!ok) throw redirect({ to: "/dashboard" });
    return {};
  },
  component: CoachLayout,
});

function CoachLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/coach", label: "Requests" },
    { to: "/coach/players", label: "Players" },
  ];
  return (
    <>
      <PageHeader title="Coach's Corner" subtitle="Review and support your players" />
      <div className="mx-auto max-w-md px-5">
        <div className="mb-3 flex gap-2 rounded-xl bg-secondary/40 p-1">
          {tabs.map((t) => {
            const active = pathname === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold ${
                  active ? "bg-card text-foreground bt-shadow-card" : "text-muted-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <Outlet />
    </>
  );
}
