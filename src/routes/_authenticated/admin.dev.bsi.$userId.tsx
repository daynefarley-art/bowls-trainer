import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import {
  bsiBreakdown,
  categoryScores,
  CATEGORY_LABELS,
  overallBSI,
  sessionImpacts,
  type CategoryKey,
  type Drill,
  type Result,
} from "@/lib/bowls";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dev/bsi/$userId")({
  component: BSIDiagnostic,
});

function BSIDiagnostic() {
  const { userId } = Route.useParams();

  const { data: drills = [] } = useQuery({
    queryKey: ["drills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drills").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Drill[];
    },
  });

  const { data: results = [] } = useQuery({
    queryKey: ["dev-user-results-full", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("id,user_id,drill_id,drill_name,percentage,bsi,played_at,session_id")
        .eq("user_id", userId)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<
        Pick<Result, "id" | "user_id" | "drill_id" | "drill_name" | "percentage" | "bsi" | "played_at"> & {
          session_id: string | null;
        }
      >;
    },
  });

  const breakdown = useMemo(() => bsiBreakdown(results, drills), [results, drills]);
  const cats = useMemo(() => categoryScores(results, drills), [results, drills]);
  const impacts = useMemo(() => sessionImpacts(results, drills), [results, drills]);
  const overall = useMemo(() => overallBSI(results, drills), [results, drills]);

  const catKeys = Object.keys(CATEGORY_LABELS) as CategoryKey[];

  return (
    <>
      <PageHeader title="BSI Diagnostic" subtitle="Weighted decomposition" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <Link
          to="/admin/dev/users/$userId"
          params={{ userId }}
          className="inline-flex items-center text-xs font-semibold text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to user
        </Link>

        {/* Overall */}
        <Section title="Overall">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Overall BSI" value={overall.toFixed(1)} />
            <Stat label="Results" value={breakdown.totalResults} />
            <Stat label="Sessions" value={impacts.length} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Overall BSI aggregates each drill's all-time average across the drills the player has recorded.
            Drills without results are excluded.
          </p>

        </Section>

        {/* Category rollup */}
        <Section title="Category BSI">
          {catKeys.map((k) => (
            <Row key={k} label={cats[k].label} value={cats[k].score == null ? "—" : cats[k].score!.toFixed(1)} />
          ))}
        </Section>

        {/* Per-drill contributions */}
        <Section title="Per-Drill Contribution">
          {breakdown.rows.length === 0 && (
            <p className="text-xs text-muted-foreground">No results yet.</p>
          )}
          {breakdown.rows.map((r) => (
            <div key={r.drill_id} className="rounded-xl bg-muted p-2.5 text-xs">
              <div className="flex justify-between font-semibold">
                <span className="truncate">{r.drill_name}</span>
                <span>{r.avg.toFixed(1)}</span>
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{r.categoryLabel ?? "—"} · n={r.n}</span>
                <span>contribution +{r.contribution.toFixed(1)}</span>
              </div>

            </div>
          ))}
        </Section>

        {/* Session impact */}
        <Section title="Session Impact (newest first)">
          {impacts.length === 0 && <p className="text-xs text-muted-foreground">No sessions yet.</p>}
          {impacts.map((s, i) => (
            <div key={`${s.session_id ?? "solo"}-${i}`} className="rounded-xl bg-muted p-2.5 text-xs">
              <div className="flex justify-between font-semibold">
                <span>{new Date(s.played_at).toLocaleString()}</span>
                <span
                  className={
                    s.delta > 0
                      ? "text-primary"
                      : s.delta < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }
                >
                  {s.delta > 0 ? "+" : ""}
                  {s.delta.toFixed(1)}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                <span>Session {s.sessionBSI.toFixed(1)}</span>
                <span>Before {s.overallBefore.toFixed(1)}</span>
                <span>After {s.overallAfter.toFixed(1)}</span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {s.drills.length} drill{s.drills.length === 1 ? "" : "s"} · cumulative n={s.cumulativeResults}
              </div>
              <ul className="mt-1 space-y-0.5 text-[10px]">
                {s.drills.map((d, j) => (
                  <li key={j} className="flex justify-between">
                    <span className="truncate">{d.drill_name}</span>
                    <span>{d.bsi.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-2xl bg-card p-4 bt-shadow-elevated">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-muted p-2 text-center">
      <p className="font-display text-lg font-extrabold">{value}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
