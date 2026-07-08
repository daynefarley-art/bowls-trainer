import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Target, Trophy, ChevronRight } from "lucide-react";
import type { Drill } from "@/lib/bowls";

export const Route = createFileRoute("/_authenticated/drills")({
  component: DrillsPage,
});

function DrillsPage() {
  const { data: drills } = useQuery({
    queryKey: ["drills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drills")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Drill[];
    },
  });

  return (
    <>
      <PageHeader title="Drill Library" subtitle="Tap a drill for details and to record" />
      <main className="mx-auto -mt-4 max-w-md space-y-3 px-5">
        <Link
          to="/challenges"
          className="flex items-center gap-4 rounded-2xl bg-card p-4 bt-shadow-card active:opacity-90"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bt-gradient-primary text-white">
            <Trophy className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Challenges</p>
            <p className="font-display text-base font-bold">Try a challenge</p>
            <p className="text-xs text-muted-foreground">Separate from drills — doesn't affect BSI</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>

        {drills?.map((d) => (
          <article key={d.id} className="overflow-hidden rounded-2xl bg-card bt-shadow-card">
            <div className="flex items-start gap-4 p-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bt-gradient-primary text-white">
                <Target className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  {d.category ?? "Drill"}
                </p>
                <h3 className="font-display text-lg font-bold leading-tight">{d.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
              </div>
            </div>

            {d.setup && (
              <div className="border-t border-border/60 px-5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Setup</p>
                <p className="mt-1 text-sm">{d.setup}</p>
              </div>
            )}

            <div className="border-t border-border/60 px-5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Scoring</p>
              <ul className="mt-1.5 space-y-1">
                {d.scoring_config.categories.map((c) => (
                  <li key={c.key} className="flex items-center justify-between text-sm">
                    <span>{c.label}</span>
                    <span
                      className="font-display font-bold"
                      style={{ color: c.points >= 0 ? "var(--color-primary)" : "var(--color-destructive)" }}
                    >
                      {c.points > 0 ? `+${c.points}` : c.points} pts
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                {(d.scoring_config.ends ?? 1) * d.bowls_per_end} bowls{(d.scoring_config.ends ?? 1) > 1 ? ` • ${d.scoring_config.ends} ends × ${d.bowls_per_end} bowls` : ""} • Range {d.min_score} to {d.max_score} pts
              </p>
            </div>

            <Link
              to="/drill/$slug"
              params={{ slug: d.slug }}
              className="flex h-14 items-center justify-center gap-2 bt-gradient-primary text-base font-bold text-primary-foreground active:opacity-90"
            >
              View drill
              <ChevronRight className="h-5 w-5" />
            </Link>
          </article>
        ))}
      </main>
    </>
  );
}
