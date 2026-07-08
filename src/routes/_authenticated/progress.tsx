import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { LineChart, Line, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ScatterChart, Scatter, ZAxis, ReferenceArea } from "recharts";
import { TrendingUp, TrendingDown, Minus, Clock, Target, ListChecks, Trophy, Gamepad2, ChevronRight } from "lucide-react";

import { ChallengeMasterySection } from "@/components/bowls/ChallengeAchievements";
import { PerformanceInsights } from "@/components/bowls/PerformanceInsights";
import {
  formatHM,
  trainingStats,
  weeklyMinutes,
  monthlyTrend,
  collectVisualTaps,
  missPattern,
  visualInsights,
  drawLengthForSlug,
  handAccuracy,
  lengthAccuracy,
  accuracyPattern,
  trendDelta,
  type DrawLength,
  type Drill,
  type Result,
} from "@/lib/bowls";

const searchSchema = z.object({ drill: z.string().optional() });

export const Route = createFileRoute("/_authenticated/progress")({
  validateSearch: searchSchema,
  component: ProgressPage,
});

function ProgressPage() {
  const { user } = Route.useRouteContext();
  const { drill: selectedSlug } = Route.useSearch();
  const navigate = useNavigate();

  const { data: drills } = useQuery({
    queryKey: ["drills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drills").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Drill[];
    },
  });

  const { data: results } = useQuery({
    queryKey: ["results", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results").select("*").eq("user_id", user.id).order("played_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Result[];
    },
  });

  const drill = useMemo(() => {
    if (!drills?.length) return null;
    return drills.find((d) => d.slug === selectedSlug) ?? drills[0];
  }, [drills, selectedSlug]);

  const filtered = useMemo(() => {
    if (!drill || !results) return [];
    return results.filter((r) => r.drill_id === drill.id);
  }, [drill, results]);

  const chartData = filtered.map((r, i) => ({
    name: `#${i + 1}`,
    date: new Date(r.played_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    score: r.score,
  }));

  const scores = filtered.map((r) => r.score);
  const best = scores.length ? Math.max(...scores) : null;
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const latest = scores.length ? scores[scores.length - 1] : null;
  const improvement = scores.length >= 2 ? scores[scores.length - 1] - scores[0] : null;

  return (
    <>
      <PageHeader title="Progress" subtitle="Track each drill over time" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5">
        {/* Manage history hub — links to screens where individual items can be deleted */}
        <section className="rounded-2xl bg-card p-4 bt-shadow-card">
          <h2 className="font-display text-base font-bold">Manage history</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Open a session, drill or challenge to view detail and delete entries.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <HistoryLink to="/sessions" icon={ListChecks} label="Sessions" hint="Tap a session → Delete Session" />
            <HistoryLink to="/history" icon={Target} label="Drill Results" hint="Per-result Delete" />
            <HistoryLink to="/challenge-history" icon={Trophy} label="Challenges" hint="All attempts → Delete" />
            <div className="flex items-center gap-3 rounded-xl bg-secondary/40 px-3 py-2.5 text-left opacity-60">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                <Gamepad2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Games</p>
                <p className="text-[11px] text-muted-foreground">Coming soon</p>
              </div>
            </div>
          </div>
        </section>

        {/* Drill filter */}
        <section className="rounded-2xl bg-card p-4 bt-shadow-card">
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Drill</label>
          <select
            value={drill?.slug ?? ""}
            onChange={(e) => navigate({ to: "/progress", search: { drill: e.target.value } })}
            className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-base font-semibold"
          >
            {drills?.map((d) => (
              <option key={d.id} value={d.slug}>{d.name}</option>
            ))}
          </select>
        </section>

        <section className="rounded-2xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-lg font-bold">{drill?.name} — score trend</h2>
          {chartData.length < 1 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No results yet for this drill.</p>
          ) : (
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <YAxis domain={[drill?.min_score ?? 0, drill?.max_score ?? 40]} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 13,
                    }}
                  />
                  <Line type="monotone" dataKey="score" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 4, fill: "var(--color-primary)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Best" value={best ?? "—"} />
          <Stat label="Average" value={avg != null ? avg.toFixed(1) : "—"} />
          <Stat label="Latest" value={latest ?? "—"} />
          <Stat
            label="Change"
            value={
              improvement == null ? "—" :
              <span className="inline-flex items-center gap-1">
                {improvement > 0 ? <TrendingUp className="h-5 w-5 text-success" /> : improvement < 0 ? <TrendingDown className="h-5 w-5 text-destructive" /> : <Minus className="h-5 w-5" />}
                {improvement > 0 ? `+${improvement}` : improvement}
              </span>
            }
          />
        </div>

        <PerformanceInsights results={results ?? []} drills={drills ?? []} />

        <VisualScatterSection results={results ?? []} drills={drills ?? []} />

        <ChallengeMasterySection userId={user.id} />

        <TrainingTimeSection results={results ?? []} />
      </main>


    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-4 bt-shadow-card">
      <p className="font-display text-2xl font-extrabold">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function HistoryLink({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: "/sessions" | "/history" | "/challenge-history";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl bg-secondary/60 px-3 py-2.5 text-left transition active:scale-[0.99]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}


function TrainingTimeSection({ results }: { results: Result[] }) {
  const stats = trainingStats(results);
  const week = weeklyMinutes(results);
  const trend = monthlyTrend(results, 8);
  const hasAny = stats.allTime > 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Clock className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-bold">Training Time</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="This week" value={formatHM(stats.thisWeek)} />
        <Stat label="This month" value={formatHM(stats.thisMonth)} />
        <Stat label="Avg / session" value={stats.sessions ? formatHM(stats.avgPerSession) : "—"} />
        <Stat label="All time" value={formatHM(stats.allTime)} />
      </div>

      <div className="rounded-2xl bg-card p-5 bt-shadow-card">
        <h3 className="font-display font-bold">This week — minutes per day</h3>
        {!hasAny ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No training time logged yet.
          </p>
        ) : (
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 13,
                  }}
                  formatter={(v: number) => [`${v} min`, "Minutes"]}
                />
                <Bar dataKey="minutes" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-card p-5 bt-shadow-card">
        <h3 className="font-display font-bold">Monthly trend — hours per week</h3>
        {!hasAny ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No training time logged yet.
          </p>
        ) : (
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 13,
                  }}
                  formatter={(v: number) => [`${v} h`, "Hours"]}
                />
                <Line
                  type="monotone"
                  dataKey="hours"
                  stroke="var(--color-primary)"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "var(--color-primary)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

type LengthFilter = DrawLength | "all";
type HandFilter = "forehand" | "backhand" | "all";
type TimeFilter = "last10" | "30d" | "all";

function VisualScatterSection({ results, drills }: { results: Result[]; drills: Drill[] }) {
  const [lengthF, setLengthF] = useState<LengthFilter>("all");
  const [handF, setHandF] = useState<HandFilter>("all");
  const [timeF, setTimeF] = useState<TimeFilter>("all");

  const { drillIdToSlug, drillsBySlug } = useMemo(() => {
    const idToSlug = new Map<string, string>();
    const slugToLen = new Map<string, DrawLength>();
    for (const d of drills) {
      idToSlug.set(d.id, d.slug);
      const l = drawLengthForSlug(d.slug);
      if (l) slugToLen.set(d.slug, l);
    }
    return { drillIdToSlug: idToSlug, drillsBySlug: slugToLen };
  }, [drills]);

  const allTaps = useMemo(
    () => collectVisualTaps(results, drillsBySlug, drillIdToSlug),
    [results, drillsBySlug, drillIdToSlug],
  );

  const filtered = useMemo(() => {
    let arr = allTaps.slice();
    if (lengthF !== "all") arr = arr.filter((t) => t.length === lengthF);
    if (handF !== "all") arr = arr.filter((t) => t.hand === handF);
    if (timeF === "30d") {
      const cutoff = Date.now() - 30 * 86_400_000;
      arr = arr.filter((t) => new Date(t.played_at).getTime() >= cutoff);
    } else if (timeF === "last10") {
      // Sort by played_at desc, group by result session — taps already per-bowl;
      // approximate "last 10 sessions" by unique played_at timestamps.
      const sessions = Array.from(new Set(arr.map((t) => t.played_at)))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        .slice(0, 10);
      const set = new Set(sessions);
      arr = arr.filter((t) => set.has(t.played_at));
    }
    return arr;
  }, [allTaps, lengthF, handF, timeF]);

  const pattern = missPattern(filtered);
  const insights = visualInsights(filtered);
  const hands = handAccuracy(filtered);
  const byLength = lengthAccuracy(filtered);
  const overallAcc = accuracyPattern(filtered);
  const trends = {
    fhNarrow: trendDelta(filtered.filter((t) => t.hand === "forehand"), (p) => p.narrowPct, 30),
    bhNarrow: trendDelta(filtered.filter((t) => t.hand === "backhand"), (p) => p.narrowPct, 30),
    short: trendDelta(filtered, (p) => p.shortPct, 30),
    pastJack: trendDelta(filtered, (p) => p.pastJackPct, 30),
    narrow: trendDelta(filtered, (p) => p.narrowPct, 30),
    wide: trendDelta(filtered, (p) => p.widePct, 30),
  };


  if (!allTaps.length) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-bold">Visual Target Analytics</h2>
        </div>
        <div className="rounded-2xl bg-card p-5 bt-shadow-card text-center text-sm text-muted-foreground">
          Switch to Visual Target scoring when recording a draw drill to see where your bowls finish around the jack.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Target className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-bold">Visual Target Analytics</h2>
      </div>

      <div className="rounded-2xl bg-card p-4 bt-shadow-card space-y-3">
        <FilterRow label="Length" value={lengthF} options={[
          { v: "all", l: "All" },
          { v: "short", l: "Short" },
          { v: "medium", l: "Medium" },
          { v: "long", l: "Long" },
        ]} onChange={(v) => setLengthF(v as LengthFilter)} />
        <FilterRow label="Hand" value={handF} options={[
          { v: "all", l: "All" },
          { v: "forehand", l: "Forehand" },
          { v: "backhand", l: "Backhand" },
        ]} onChange={(v) => setHandF(v as HandFilter)} />
        <FilterRow label="Period" value={timeF} options={[
          { v: "last10", l: "Last 10" },
          { v: "30d", l: "30 days" },
          { v: "all", l: "All time" },
        ]} onChange={(v) => setTimeF(v as TimeFilter)} />
      </div>

      <div className="rounded-2xl bg-card p-4 bt-shadow-card">
        <h3 className="font-display font-bold">Bowl finish positions</h3>
        <p className="text-xs text-muted-foreground">Each dot is a bowl. Centre = jack.</p>
        <div className="mt-3 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" domain={[-2.4, 2.4]} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} label={{ value: "← Left / Right →", position: "insideBottom", offset: -5, fontSize: 10, fill: "var(--color-muted-foreground)" }} />
              <YAxis type="number" dataKey="y" domain={[-2.4, 2.4]} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} label={{ value: "Short / Long", angle: -90, position: "insideLeft", fontSize: 10, fill: "var(--color-muted-foreground)" }} />
              <ZAxis range={[40, 40]} />
              <ReferenceArea x1={-0.5} x2={0.5} y1={-0.5} y2={0.5} stroke="var(--color-primary)" strokeOpacity={0.3} fill="var(--color-primary)" fillOpacity={0.05} />
              <Tooltip
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }}
                formatter={(v: number) => v.toFixed(2)}
              />
              <Scatter data={filtered} fill="var(--color-primary)" fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Left miss" value={`${pattern.leftPct}%`} />
        <Stat label="Right miss" value={`${pattern.rightPct}%`} />
        <Stat label="Short miss" value={`${pattern.shortPct}%`} />
        <Stat label="Long miss" value={`${pattern.longPct}%`} />
      </div>

      {/* Forehand vs Backhand accuracy */}
      <div className="grid grid-cols-2 gap-3">
        <HandCard title="Forehand" pattern={hands.forehand} />
        <HandCard title="Backhand" pattern={hands.backhand} />
      </div>

      {/* Length-specific accuracy */}
      <div className="space-y-3">
        {(["short", "medium", "long"] as DrawLength[]).map((len) => (
          <LengthCard key={len} length={len} data={byLength[len]} />
        ))}
      </div>

      {/* Draw Accuracy Patterns / trends */}
      <div className="rounded-2xl bg-card p-5 bt-shadow-card space-y-3">
        <h3 className="font-display font-bold">Draw Accuracy Patterns</h3>
        <p className="text-xs text-muted-foreground">Change over last 30 days vs older data (percentage points).</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <TrendRow label="Forehand line (narrow)" delta={trends.fhNarrow} invert />
          <TrendRow label="Backhand line (narrow)" delta={trends.bhNarrow} invert />
          <TrendRow label="Short bowls" delta={trends.short} invert />
          <TrendRow label="Long" delta={trends.pastJack} />
          <TrendRow label="Narrow overall" delta={trends.narrow} invert />
          <TrendRow label="Wide overall" delta={trends.wide} invert />
        </div>
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60">
          <MiniStat label="Narrow" value={`${overallAcc.narrowPct}%`} />
          <MiniStat label="On line" value={`${overallAcc.onlinePct}%`} />
          <MiniStat label="Wide" value={`${overallAcc.widePct}%`} />
          <MiniStat label="Short" value={`${overallAcc.shortPct}%`} />
          <MiniStat label="Within a Mat" value={`${overallAcc.jackHighPct}%`} />
          <MiniStat label="Long" value={`${overallAcc.pastJackPct}%`} />
        </div>
      </div>


      {insights.length > 0 && (
        <div className="rounded-2xl bg-card p-5 bt-shadow-card space-y-2">
          <h3 className="font-display font-bold">Insights</h3>
          <ul className="space-y-1.5 text-sm text-charcoal">
            {insights.map((i, idx) => (
              <li key={idx} className="flex gap-2"><span className="text-primary">•</span><span>{i}</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function FilterRow({
  label, value, options, onChange,
}: {
  label: string; value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              value === o.v ? "bt-gradient-primary text-white" : "bg-secondary text-charcoal"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

function HandCard({ title, pattern }: { title: string; pattern: import("@/lib/bowls").AccuracyPattern }) {
  return (
    <div className="rounded-2xl bg-card p-4 bt-shadow-card space-y-1">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      {pattern.count === 0 ? (
        <p className="text-xs text-muted-foreground">No bowls yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
          <span className="text-muted-foreground">Narrow</span><span className="text-right font-bold">{pattern.narrowPct}%</span>
          <span className="text-muted-foreground">On line</span><span className="text-right font-bold">{pattern.onlinePct}%</span>
          <span className="text-muted-foreground">Wide</span><span className="text-right font-bold">{pattern.widePct}%</span>
          <span className="text-muted-foreground">Short</span><span className="text-right font-bold">{pattern.shortPct}%</span>
          <span className="text-muted-foreground">Within a Mat</span><span className="text-right font-bold">{pattern.jackHighPct}%</span>
          <span className="text-muted-foreground">Long</span><span className="text-right font-bold">{pattern.pastJackPct}%</span>
        </div>
      )}
    </div>
  );
}

function LengthCard({
  length,
  data,
}: {
  length: DrawLength;
  data: { overall: import("@/lib/bowls").AccuracyPattern; forehand: import("@/lib/bowls").AccuracyPattern; backhand: import("@/lib/bowls").AccuracyPattern };
}) {
  const title = length === "short" ? "Short Draw" : length === "medium" ? "Medium Draw" : "Long Draw";
  if (data.overall.count === 0) return null;
  return (
    <div className="rounded-2xl bg-card p-4 bt-shadow-card space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display font-bold">{title}</h3>
        <span className="text-[11px] text-muted-foreground">{data.overall.count} bowls</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <MiniStat label="FH narrow" value={`${data.forehand.narrowPct}%`} />
        <MiniStat label="FH wide" value={`${data.forehand.widePct}%`} />
        <MiniStat label="FH on line" value={`${data.forehand.onlinePct}%`} />
        <MiniStat label="BH narrow" value={`${data.backhand.narrowPct}%`} />
        <MiniStat label="BH wide" value={`${data.backhand.widePct}%`} />
        <MiniStat label="BH on line" value={`${data.backhand.onlinePct}%`} />
        <MiniStat label="Short" value={`${data.overall.shortPct}%`} />
        <MiniStat label="Within a Mat" value={`${data.overall.jackHighPct}%`} />
        <MiniStat label="Long" value={`${data.overall.pastJackPct}%`} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-2 py-1.5 text-center">
      <p className="font-bold leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

/**
 * TrendRow shows pp delta. `invert` flips the colour semantics so that
 * lower-is-better metrics (narrow %, wide %, short %) read green when reduced.
 */
function TrendRow({ label, delta, invert }: { label: string; delta: number | null; invert?: boolean }) {
  if (delta == null) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">—</span>
      </div>
    );
  }
  const good = invert ? delta < 0 : delta > 0;
  const flat = delta === 0;
  const color = flat ? "text-muted-foreground" : good ? "text-success" : "text-destructive";
  const sign = delta > 0 ? "+" : "";
  return (
    <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${color}`}>{sign}{delta}pp</span>
    </div>
  );
}

