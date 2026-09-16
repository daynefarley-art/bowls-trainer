import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ChevronLeft, Clock, Sparkles, TrendingUp, TrendingDown, Minus, Flame, Snowflake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import {
  recommendedDrillV2,
  skillDetail,
  SKILL_AREA_LABELS,
  type Drill,
  type FormState,
  type Result,
  type SkillAreaKey,
} from "@/lib/bowls";

const VALID: SkillAreaKey[] = ["draw", "weight", "upshots", "running", "driving", "jack"];

export const Route = createFileRoute("/_authenticated/performance/$skill")({
  loader: ({ params }) => {
    if (!VALID.includes(params.skill as SkillAreaKey)) throw notFound();
    return null;
  },
  component: SkillDetailPage,
  notFoundComponent: () => (
    <main className="mx-auto max-w-md p-6 text-center">
      <p className="text-sm text-muted-foreground">Skill area not found.</p>
      <Link to="/performance" className="mt-3 inline-block text-sm font-semibold text-primary">
        Back to dashboard
      </Link>
    </main>
  ),
});

function SkillDetailPage() {
  const { skill } = Route.useParams();
  const key = skill as SkillAreaKey;

  const { data: drills = [] } = useQuery({
    queryKey: ["drills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drills").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Drill[];
    },
  });

  const { data: results = [] } = useQuery({
    queryKey: ["performance-results"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("results")
        .select("id,user_id,drill_id,drill_name,percentage,bsi,played_at,breakdown")
        .eq("user_id", uid)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Result[];
    },
  });

  const detail = useMemo(() => skillDetail(key, results, drills), [key, results, drills]);
  const rec = useMemo(() => recommendedDrillV2(results, drills), [results, drills]);

  const { Icon: FormIcon, color: formColor } = formVisual(detail.form?.label);

  return (
    <>
      <PageHeader
        title={SKILL_AREA_LABELS[key]}
        subtitle="Skill diagnostics"
        action={
          <Link
            to="/performance"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        }
      />

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-10">
        {/* Overall for area */}
        <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Overall {detail.label} Rating
          </p>
          <p className="mt-1 font-display text-4xl font-extrabold text-primary">
            {detail.overall == null ? "—" : detail.overall.toFixed(1)}
            <span className="text-base text-muted-foreground">/100</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-secondary/60 p-2.5">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Current Form</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <FormIcon className={`h-4 w-4 ${formColor}`} />
                <p className="font-semibold">{detail.form?.label ?? "—"}</p>
              </div>
            </div>
            <div className="rounded-xl bg-secondary/60 p-2.5">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Consistency</p>
              <p className="font-semibold">
                {detail.consistency ? `${detail.consistency.score} · ${detail.consistency.label}` : "—"}
              </p>
            </div>
          </div>
        </section>

        {/* Diagnostics per drill (Short/Medium/Long or drill list) */}
        {detail.drills.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Recent Performance
            </h2>
            {detail.drills.map((d) => (
              <div key={d.drill_id} className="rounded-2xl bg-card p-3 bt-shadow-card">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{d.drill_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.sessions} session{d.sessions === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                  <MiniStat label="Latest" value={d.latest} />
                  <MiniStat label="30-day" value={d.avg30d} />
                  <MiniStat label="Lifetime" value={d.lifetimeAvg} />
                  <MiniStat label="Best" value={d.lifetimeBest} />
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Forehand / Backhand (draw only) */}
        {key === "draw" && detail.handSplit && (
          <section className="rounded-3xl bg-card p-5 bt-shadow-card">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Hand Diagnostic
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Diagnostic view of accuracy by hand — not separate skills.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <HandBar label="Forehand" value={detail.handSplit.forehand} />
              <HandBar label="Backhand" value={detail.handSplit.backhand} />
            </div>
          </section>
        )}

        {/* Coach's Insight */}
        {detail.insight && (
          <section className="rounded-3xl bg-primary/10 p-5">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-primary">
                Coach's Insight
              </h2>
            </div>
            <p className="text-sm leading-relaxed">{detail.insight}</p>
          </section>
        )}

        {/* Recommended drill for this area (if it matches) */}
        {rec && rec.skillArea === key && (
          <section className="rounded-3xl bg-secondary p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Recommended Drill
            </p>
            <h3 className="mt-1 font-display text-lg font-extrabold">{rec.drill.name}</h3>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {rec.estimatedMinutes} min
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed">{rec.reason}</p>
            <Link
              to="/drill/$slug"
              params={{ slug: rec.drill.slug }}
              className="mt-3 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-primary-foreground"
            >
              Start drill
            </Link>
          </section>
        )}
      </main>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-secondary/60 p-1.5">
      <p className="font-display text-sm font-extrabold">{value == null ? "—" : value.toFixed(1)}</p>
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function HandBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{label}</span>
        <span className="font-display text-sm font-bold text-primary">
          {value == null ? "—" : `${value.toFixed(0)}%`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/60">
        <div className="h-full rounded-full bt-gradient-primary" style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

function formVisual(label?: FormState) {
  switch (label) {
    case "Hot":
      return { Icon: Flame, color: "text-orange-500" };
    case "Improving":
      return { Icon: TrendingUp, color: "text-success" };
    case "Declining":
      return { Icon: TrendingDown, color: "text-destructive" };
    case "Cold":
      return { Icon: Snowflake, color: "text-blue-500" };
    default:
      return { Icon: Minus, color: "text-muted-foreground" };
  }
}
