import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Pencil, Trash2 } from "lucide-react";
import { DeleteResultDialog } from "@/components/bowls/DeleteResultDialog";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { user } = Route.useRouteContext();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data: results } = useQuery({
    queryKey: ["results", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader title="Results History" subtitle={`${results?.length ?? 0} session${results?.length === 1 ? "" : "s"}`} />
      <main className="mx-auto -mt-4 max-w-md space-y-3 px-5">
        {results?.length === 0 && (
          <div className="rounded-2xl bg-card p-8 text-center text-muted-foreground bt-shadow-card">
            No results yet.
          </div>
        )}
        {results?.map((r) => (
          <article key={r.id} className="rounded-2xl bg-card p-5 bt-shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {new Date(r.played_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  {r.category ? ` • ${r.category}` : ""}
                </p>
                <h3 className="mt-1 font-display text-lg font-bold">{r.drill_name ?? "Drill"}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.percentage != null ? `${Number(r.percentage).toFixed(1)}% • ` : ""}
                  Range {r.min_score ?? "?"} to {r.max_score ?? "?"}
                </p>
                {typeof r.duration_minutes === "number" && r.duration_minutes > 0 && (
                  <p className="mt-0.5 text-xs font-semibold text-primary">
                    Duration: {r.duration_minutes} minute{r.duration_minutes === 1 ? "" : "s"}
                  </p>
                )}
                {r.last_edited_at && (
                  <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                    Edited {new Date(r.last_edited_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-3xl font-extrabold text-primary">{r.score}</p>
                <p className="text-[11px] font-bold uppercase text-muted-foreground">BSI {Number(r.bsi).toFixed(1)}</p>
              </div>
            </div>
            {(r.location || r.conditions || r.green_speed) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.location && <Chip>{r.location}</Chip>}
                {r.conditions && <Chip>{r.conditions}</Chip>}
                {r.green_speed && <Chip>Green {r.green_speed}</Chip>}
              </div>
            )}
            {r.notes && <p className="mt-3 text-sm text-muted-foreground">{r.notes}</p>}
            <div className="mt-4 flex items-center gap-4 border-t border-border pt-3">
              <Link
                to="/record"
                search={{ id: r.id }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
              <button
                onClick={() => setPendingDelete(r.id)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Result
              </button>
            </div>
          </article>
        ))}
      </main>

      {pendingDelete && (
        <DeleteResultDialog
          open={!!pendingDelete}
          onOpenChange={(o) => !o && setPendingDelete(null)}
          kind="drill"
          resultId={pendingDelete}
          email={user.email ?? ""}
          onDeleted={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-charcoal">{children}</span>;
}

