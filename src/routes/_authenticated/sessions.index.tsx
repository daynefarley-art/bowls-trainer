import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { SESSIONS_QK, formatMinutes, type TrainingSession } from "@/lib/sessions";
import { Clock, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sessions/")({
  component: SessionsListPage,
});

function SessionsListPage() {
  const { user } = Route.useRouteContext();

  const { data: sessions, isLoading } = useQuery({
    queryKey: SESSIONS_QK(user.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("training_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("session_started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrainingSession[];
    },
  });

  const completed = (sessions ?? []).filter((s) => s.status === "complete");
  const active = (sessions ?? []).find((s) => s.status === "active");

  // Aggregates
  const totalMinutes = completed.reduce((s, x) => s + (x.total_duration_minutes ?? 0), 0);
  const totalActivities = completed.reduce((s, x) => s + (x.total_activities ?? 0), 0);

  return (
    <>
      <PageHeader title="Training sessions" subtitle="Your full training history" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        {active && (
          <Link
            to="/sessions/$id"
            params={{ id: active.id }}
            className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground bt-shadow-elevated"
          >
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">In progress</p>
              <p className="font-display text-base font-extrabold">Active session</p>
            </div>
            <ChevronRight className="h-5 w-5" />
          </Link>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Sessions" value={String(completed.length)} />
          <Stat label="Activities" value={String(totalActivities)} />
          <Stat label="Time" value={formatMinutes(totalMinutes)} />
        </div>

        <section className="space-y-2">
          <h2 className="px-1 font-display text-lg font-bold">History</h2>
          {isLoading ? (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground bt-shadow-card">Loading…</p>
          ) : completed.length === 0 ? (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground bt-shadow-card">
              No completed sessions yet. Tap “Start Training Session” from the dashboard.
            </p>
          ) : (
            completed.map((s) => (
              <Link
                key={s.id}
                to="/sessions/$id"
                params={{ id: s.id }}
                className="flex items-center gap-3 rounded-2xl bg-card p-3 bt-shadow-card active:scale-[0.99] transition"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    {new Date(s.session_started_at).toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {formatMinutes(s.total_duration_minutes)}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.total_activities} activit{s.total_activities === 1 ? "y" : "ies"} ·{" "}
                    {s.drills_completed} drill{s.drills_completed === 1 ? "" : "s"} ·{" "}
                    {s.challenges_completed} challenge{s.challenges_completed === 1 ? "" : "s"}
                  </p>
                  {((s as any).club || (s as any).green) && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[(s as any).club, (s as any).green].filter(Boolean).join(" · ")}
                    </p>
                  )}

                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))
          )}
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-3 text-center bt-shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-extrabold text-primary">{value}</p>
    </div>
  );
}
