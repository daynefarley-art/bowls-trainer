import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/bowls/PageHeader";
import { ProgramCard } from "@/components/bowls/ProgramCard";
import { MY_PROGRAMS_QK, listMyPrograms, getProgramDetail } from "@/lib/programs";
import { Plus, Loader2, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/training/")({
  head: () => ({
    meta: [
      { title: "Training Plans — Bowls Trainer" },
      {
        name: "description",
        content:
          "Your tournament preparation and coach-assigned training programs, built from the Bowls Trainer drill and challenge library.",
      },
      { property: "og:title", content: "Training Plans — Bowls Trainer" },
      {
        property: "og:description",
        content: "Tournament preparation and coach programs in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrainingPlansPage,
});

function TrainingPlansPage() {
  const { user } = Route.useRouteContext();

  const { data, isLoading } = useQuery({
    queryKey: MY_PROGRAMS_QK(user.id),
    queryFn: async () => {
      const rows = await listMyPrograms(user.id);
      const withProgress = await Promise.all(
        rows.map(async (r) => {
          const detail = await getProgramDetail(r.program.id, user.id);
          return { ...r, detail };
        }),
      );
      return withProgress;
    },
  });

  const active = (data ?? []).filter((r) => r.program.status === "active" || r.program.status === "draft");
  const past = (data ?? []).filter((r) => r.program.status === "completed" || r.program.status === "archived");

  return (
    <>
      <PageHeader title="Training Plans" subtitle="Tournament preparation and coach programs" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-10">
        <Link
          to="/training/tournament"
          className="flex items-center gap-3 rounded-2xl bg-card p-4 bt-shadow-card active:opacity-90"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bt-gradient-primary text-primary-foreground">
            <Plus className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold">Plan for a tournament</span>
            <span className="block text-xs text-muted-foreground">
              Build a preparation plan for your next event
            </span>
          </span>
        </Link>

        {isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            {active.length === 0 ? (
              <section className="rounded-2xl bg-card p-6 text-center bt-shadow-card">
                <ClipboardList className="mx-auto h-8 w-8 text-primary" />
                <h2 className="mt-3 font-display text-lg font-bold">No training plans yet</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Plan for a tournament above, or your coach can assign you a program. Your normal
                  drills, challenges and progress are unchanged.
                </p>
              </section>
            ) : (
              <section className="space-y-3">
                {active.map((r) => (
                  <ProgramCard
                    key={r.program.id}
                    programId={r.program.id}
                    name={r.program.name}
                    programType={r.program.program_type}
                    status={r.program.status}
                    endDate={r.program.end_date}
                    ownerName={r.ownerName}
                    position={(r.program.settings?.['position'] as string | undefined) ?? null}
                    completedSessions={r.detail?.completedSessions ?? 0}
                    totalSessions={r.detail?.totalSessions ?? 0}
                  />
                ))}
              </section>
            )}

            {past.length > 0 ? (
              <section className="space-y-3">
                <h2 className="px-1 font-display text-base font-bold">Finished</h2>
                {past.map((r) => (
                  <ProgramCard
                    key={r.program.id}
                    programId={r.program.id}
                    name={r.program.name}
                    programType={r.program.program_type}
                    status={r.program.status}
                    endDate={r.program.end_date}
                    ownerName={r.ownerName}
                    completedSessions={r.detail?.completedSessions ?? 0}
                    totalSessions={r.detail?.totalSessions ?? 0}
                    ctaLabel="View summary"
                  />
                ))}
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
