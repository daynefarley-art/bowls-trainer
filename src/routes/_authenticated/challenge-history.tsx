import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Trash2, Trophy, ChevronRight } from "lucide-react";
import { DeleteResultDialog } from "@/components/bowls/DeleteResultDialog";

export const Route = createFileRoute("/_authenticated/challenge-history")({
  component: ChallengeHistoryPage,
});

type Row = {
  id: string;
  score: number | null;
  played_at: string;
  challenge_id: string;
  challenges: { name: string; slug: string } | null;
};

function ChallengeHistoryPage() {
  const { user } = Route.useRouteContext();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["challenge_history", user.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenge_results")
        .select("id, score, played_at, challenge_id, challenges(name, slug)")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  return (
    <>
      <PageHeader
        title="Challenge History"
        subtitle={`${rows?.length ?? 0} attempt${rows?.length === 1 ? "" : "s"}`}
      />
      <main className="mx-auto -mt-4 max-w-md space-y-3 px-5">
        {rows?.length === 0 && (
          <div className="rounded-2xl bg-card p-8 text-center text-muted-foreground bt-shadow-card">
            No challenge attempts yet.
          </div>
        )}
        {rows?.map((r) => (
          <article key={r.id} className="rounded-2xl bg-card p-4 bt-shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {new Date(r.played_at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <h3 className="mt-1 flex items-center gap-1.5 font-display text-base font-bold">
                  <Trophy className="h-4 w-4 text-primary" />
                  {r.challenges?.name ?? "Challenge"}
                </h3>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-2xl font-extrabold text-primary">{r.score ?? "—"}</p>
                <p className="text-[11px] font-bold uppercase text-muted-foreground">Score</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              {r.challenges?.slug ? (
                <Link
                  to="/challenge-progress/$slug"
                  params={{ slug: r.challenges.slug }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  View progress <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : <span />}
              <button
                onClick={() => setPendingDelete(r.id)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </article>
        ))}
      </main>

      {pendingDelete && (
        <DeleteResultDialog
          open={!!pendingDelete}
          onOpenChange={(o) => !o && setPendingDelete(null)}
          kind="challenge"
          resultId={pendingDelete}
          onDeleted={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
