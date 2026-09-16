import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Sparkles, TrendingUp, TrendingDown, Minus, Flame, Snowflake, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { BSIBadge } from "@/components/bowls/BSIBadge";
import {
  achievementProgress,
  bsiLevel,
  bsiMovement,
  coachSummary,
  collectVisualTaps,
  consistencyRating,
  currentForm,
  drawLengthForSlug,
  handAccuracy,
  missAnalysis,
  overallBSI,
  performanceZones,
  personalBests,
  practicePriorities,
  recommendedDrillV2,
  skillAreaScores,
  weightVsLine,
  type DrawLength,
  type Drill,
  type FormState,
  type Result,
} from "@/lib/bowls";
import { BowlsDNA } from "@/components/bowls/BowlsDNA";


export const Route = createFileRoute("/_authenticated/performance/")({
  component: PerformanceDashboard,
});

function PerformanceDashboard() {
  const navigate = useNavigate();

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

  const bsi = useMemo(() => overallBSI(results, drills), [results, drills]);
  const level = useMemo(() => bsiLevel(bsi), [bsi]);
  const areas = useMemo(() => skillAreaScores(results, drills), [results, drills]);
  const form = useMemo(() => currentForm(results), [results]);
  const consistency = useMemo(() => consistencyRating(results), [results]);
  const priorities = useMemo(() => practicePriorities(results, drills), [results, drills]);
  const rec = useMemo(() => recommendedDrillV2(results, drills), [results, drills]);
  const summary = useMemo(() => coachSummary(results, drills), [results, drills]);
  const movement = useMemo(() => bsiMovement(results, drills), [results, drills]);
  const pb = useMemo(() => personalBests(results, drills), [results, drills]);
  const achievements = useMemo(() => achievementProgress(results, drills), [results, drills]);

  // Bowls DNA inputs — computed from Visual Target taps.
  const dnaData = useMemo(() => {
    const idToSlug = new Map<string, string>();
    const slugToLen = new Map<string, DrawLength>();
    for (const d of drills) {
      idToSlug.set(d.id, d.slug);
      const l = drawLengthForSlug(d.slug);
      if (l) slugToLen.set(d.slug, l);
    }
    const taps = collectVisualTaps(results, slugToLen, idToSlug);
    const zones = performanceZones(taps);
    const miss = missAnalysis(taps);
    const hands = handAccuracy(taps);
    const wvl = weightVsLine(miss);
    return { zones, miss, hands, wvl };
  }, [results, drills]);
  const weakestSkillLabel = useMemo(() => {
    const ranked = areas
      .filter((a) => a.score != null)
      .sort((a, b) => (a.score ?? 100) - (b.score ?? 100));
    return ranked[0]?.label ?? null;
  }, [areas]);

  return (
    <>
      <PageHeader
        title="Performance Dashboard"
        subtitle="Your coach-eye view"
        action={
          <Link
            to="/dashboard"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        }
      />

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-10">
        {/* 1. Overall BSI */}
        <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
          <div className="flex items-center gap-4">
            <BSIBadge bsi={bsi} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Bowls Skill Index
              </p>
              <p className="mt-0.5 font-display text-3xl font-extrabold leading-none">
                {bsi.toFixed(1)}
                <span className="text-base text-muted-foreground">/100</span>
              </p>
              <p className="mt-1 text-sm font-semibold">{level.label}</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Your Bowls Skill Index reflects your long-term bowling ability across all areas of the game.
            It reflects your performance and the difficulty of the skill, so attacking shots are judged
            against what good execution looks like in those skills.
          </p>

        </section>

        {/* 2. AI Coach Summary */}
        <section className="rounded-3xl bg-primary/10 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-primary">
              Coach Summary
            </h2>
          </div>
          <p className="text-sm leading-relaxed">{summary}</p>
        </section>

        {/* 3 + 4. Form + Consistency */}
        <section className="grid grid-cols-2 gap-3">
          <FormCard form={form} />
          <ConsistencyCard c={consistency} />
        </section>

        {/* Bowls DNA */}
        <BowlsDNA
          zones={dnaData.zones}
          miss={dnaData.miss}
          wvl={dnaData.wvl}
          hands={dnaData.hands}
          weakestSkillLabel={weakestSkillLabel}
        />

        {/* 5. Skill Areas */}
        <section className="space-y-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Skill Areas
          </h2>
          <div className="space-y-2">
            {areas.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() =>
                  navigate({ to: "/performance/$skill", params: { skill: a.key } })
                }
                className="block w-full rounded-2xl bg-card p-3 text-left bt-shadow-card active:scale-[0.99] transition"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{a.label}</p>
                      {a.trend && <TrendBadge trend={a.trend} />}
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bt-gradient-primary"
                        style={{ width: `${a.score ?? 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-display text-lg font-extrabold text-primary">
                      {a.score == null ? "—" : Math.round(a.score)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* 10. BSI Movement */}
        <section className="rounded-3xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            This Week
          </h2>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <MoveStat label="Previous" value={movement.previous == null ? "—" : movement.previous.toFixed(1)} />
            <MoveStat label="Current" value={movement.current.toFixed(1)} highlight />
            <MoveStat
              label="Change"
              value={
                movement.weeklyChange == null
                  ? "—"
                  : (movement.weeklyChange > 0 ? "+" : "") + movement.weeklyChange.toFixed(1)
              }
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {movement.weeklyChange == null
              ? "Your movement will appear here once you've been recording for a week."
              : movement.weeklyChange > 0
                ? movement.drivers.length
                  ? `Your improvement this week was mainly driven by ${movement.drivers.join(" and ")}.`
                  : "You've edged up this week — nice work."
                : movement.weeklyChange < 0
                  ? movement.drivers.length
                    ? `Your dip this week was mainly driven by ${movement.drivers.join(" and ")}.`
                    : "A small dip this week — the next session will help reset."
                  : "You held your ground this week."}
          </p>
        </section>

        {/* 9. Recommended Drill */}
        {rec && (
          <section className="rounded-3xl bg-secondary p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Recommended Drill
            </p>
            <h3 className="mt-1 font-display text-lg font-extrabold">{rec.drill.name}</h3>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{rec.skillAreaLabel}</span>
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

        {/* 11. Practice Priorities */}
        <section className="rounded-3xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Practice Priorities
          </h2>
          <ul className="mt-2 space-y-1.5">
            {priorities.map((p) => (
              <li key={p.key} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate font-semibold">{p.label}</span>
                <span className="ml-3 font-mono text-primary" aria-label={`${p.stars} of 5`}>
                  {"★".repeat(p.stars)}
                  <span className="text-muted-foreground">{"☆".repeat(5 - p.stars)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* 12. Personal Bests */}
        <section className="rounded-3xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Personal Bests
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <PBCell label="Highest BSI" value={pb.overall == null ? "—" : pb.overall.toFixed(1)} />
            <PBCell label="Highest Draw Rating" value={pb.drawRating == null ? "—" : pb.drawRating.toFixed(1)} />
            <PBCell label="Best Consistency" value={pb.bestConsistency == null ? "—" : String(pb.bestConsistency)} />
            <PBCell
              label="Improving Streak"
              value={pb.improvingStreakWeeks > 0 ? `${pb.improvingStreakWeeks} wk` : "—"}
            />
          </div>
        </section>

        {/* 13. Achievements */}
        <section className="rounded-3xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Achievement Progress
          </h2>
          <ul className="mt-2 space-y-3">
            {achievements.map((a, i) => (
              <li key={i}>
                <div className="flex items-center justify-between text-sm">
                  <span className="min-w-0 truncate font-semibold">{a.label}</span>
                  <span className="ml-3 text-xs font-bold text-muted-foreground">
                    {a.progress} / {a.target}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full ${a.done ? "bg-success" : "bt-gradient-primary"}`}
                    style={{ width: `${Math.min(100, (a.progress / a.target) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}

function FormCard({ form }: { form: ReturnType<typeof currentForm> }) {
  const label = form?.label ?? "—";
  const { Icon, color } = formVisual(form?.label);
  return (
    <div className="rounded-2xl bg-card p-4 bt-shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Current Form
      </p>
      <div className="mt-1 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${color}`} />
        <p className="font-display text-xl font-extrabold">{label}</p>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {formBlurb(form?.label)}
      </p>
    </div>
  );
}

function ConsistencyCard({ c }: { c: ReturnType<typeof consistencyRating> }) {
  return (
    <div className="rounded-2xl bg-card p-4 bt-shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Consistency
      </p>
      <p className="mt-1 font-display text-xl font-extrabold">
        {c?.score == null ? "—" : c.score}
        {c && <span className="ml-1 text-xs text-muted-foreground">/100</span>}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{c?.label ?? "Not enough data"}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Rewards repeatable, dependable bowling — not just occasional brilliance.
      </p>
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

function formBlurb(label?: FormState): string {
  switch (label) {
    case "Hot":
      return "Recent sessions well above your baseline.";
    case "Improving":
      return "Trending upward over your last few sessions.";
    case "Stable":
      return "Performing in line with your usual level.";
    case "Declining":
      return "Recent sessions a touch below baseline.";
    case "Cold":
      return "Well below your baseline recently — reset with a short session.";
    default:
      return "Record more sessions to reveal your form.";
  }
}

function TrendBadge({ trend }: { trend: "Improving" | "Stable" | "Declining" }) {
  const Icon = trend === "Improving" ? TrendingUp : trend === "Declining" ? TrendingDown : Minus;
  const cls =
    trend === "Improving"
      ? "text-success"
      : trend === "Declining"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold uppercase ${cls}`}>
      <Icon className="h-3 w-3" />
      {trend}
    </span>
  );
}

function MoveStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-2 ${highlight ? "bg-primary/10" : "bg-secondary/60"}`}>
      <p className={`font-display text-lg font-extrabold ${highlight ? "text-primary" : ""}`}>{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function PBCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-2.5 text-center">
      <p className="font-display text-lg font-extrabold">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

