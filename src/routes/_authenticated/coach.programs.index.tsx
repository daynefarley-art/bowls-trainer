import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import {
  COACH_PROGRAMS_QK,
  deleteOrArchiveProgram,
  listOwnedPrograms,
  programTypeLabel,
} from "@/lib/programs";

export const Route = createFileRoute("/_authenticated/coach/programs/")({
  component: CoachProgramsPage,
});

function CoachProgramsPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const { data: programs = [], isLoading } = useQuery({
    queryKey: COACH_PROGRAMS_QK(user.id),
    queryFn: () => listOwnedPrograms(user.id),
  });

  const groups = [
    { label: "Drafts", rows: programs.filter((p) => p.status === "draft") },
    { label: "Active", rows: programs.filter((p) => p.status === "active") },
    { label: "Completed", rows: programs.filter((p) => p.status === "completed") },
    { label: "Archived", rows: programs.filter((p) => p.status === "archived") },
  ];

  async function remove(id: string) {
    try {
      const outcome = await deleteOrArchiveProgram(id);
      toast.success(outcome === "deleted" ? "Draft deleted." : "Program archived — history kept.");
      qc.invalidateQueries({ queryKey: COACH_PROGRAMS_QK(user.id) });
    } catch (e) {
      console.error("[coach] remove program failed", e);
      toast.error("Couldn't remove that program.");
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-5 pb-10">
      <Link
        to="/coach/programs/new"
        className="flex items-center gap-3 rounded-2xl bg-card p-4 bt-shadow-card active:opacity-90"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bt-gradient-primary text-primary-foreground">
          <Plus className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold">Create a program</span>
          <span className="block text-xs text-muted-foreground">
            Build sessions from the existing drills and challenges
          </span>
        </span>
      </Link>

      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : programs.length === 0 ? (
        <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground bt-shadow-card">
          You haven't created any programs yet.
        </p>
      ) : (
        groups
          .filter((g) => g.rows.length > 0)
          .map((g) => (
            <section key={g.label} className="space-y-2">
              <h3 className="px-1 font-display text-base font-bold">{g.label}</h3>
              {g.rows.map((p) => (
                <div key={p.id} className="rounded-2xl bg-card p-4 bt-shadow-card">
                  <Link
                    to="/coach/programs/$programId"
                    params={{ programId: p.id }}
                    className="flex items-center gap-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-primary">
                        {programTypeLabel(p.program_type)}
                      </span>
                      <span className="block truncate font-display text-base font-bold">{p.name}</span>
                      {p.end_date ? (
                        <span className="block text-xs text-muted-foreground">Ends {p.end_date}</span>
                      ) : null}
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </Link>
                  {p.status !== "archived" ? (
                    <Button
                      variant="ghost"
                      className="mt-2 h-9 w-full text-xs text-muted-foreground"
                      onClick={() => remove(p.id)}
                    >
                      {p.status === "draft" ? "Delete draft" : "Archive program"}
                    </Button>
                  ) : null}
                </div>
              ))}
            </section>
          ))
      )}
    </main>
  );
}
