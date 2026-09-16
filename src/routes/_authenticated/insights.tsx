import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import {
  collectVisualTaps,
  drawLengthForSlug,
  performanceZones,
  missAnalysis,
  handAccuracy,
  weightVsLine,
  coachingFocus,
  smartCoachingInsights,
  trendDelta,
  type DrawLength,
  type Drill,
  type Result,
  type VisualTapPoint,
} from "@/lib/bowls";

export const Route = createFileRoute("/_authenticated/insights")({
  component: InsightsPage,
});

type Bucket = "short" | "long" | "narrow" | "wide";
type HandFilter = "all" | "forehand" | "backhand";

// On Target zone: within 1 mat sideways of jack, and between 1 mat short and
// 2 mats past the jack. Everything else is a "miss" and gets classified.
function isOnTarget(t: VisualTapPoint): boolean {
  return Math.abs(t.x) <= 1 && t.y >= -1 && t.y <= 2;
}

function classifyMiss(t: VisualTapPoint): Bucket {
  // Distance outside each boundary (0 if inside)
  const shortAmt = Math.max(0, -1 - t.y);
  const longAmt = Math.max(0, t.y - 2);
  const sideAmt = Math.max(0, Math.abs(t.x) - 1);
  const winner = Math.max(shortAmt, longAmt, sideAmt);
  if (winner === sideAmt && sideAmt > 0) {
    return t.line === "narrow" ? "narrow" : "wide";
  }
  return shortAmt >= longAmt ? "short" : "long";
}

type MissBreakdown = {
  onTargetPct: number;
  missPct: number;
  shortPct: number;
  longPct: number;
  narrowPct: number;
  widePct: number;
  count: number;
  missCount: number;
  dominant: Bucket | null;
};

function computeBreakdown(taps: VisualTapPoint[]): MissBreakdown {
  const total = taps.length;
  if (!total) {
    return {
      onTargetPct: 0, missPct: 0,
      shortPct: 0, longPct: 0, narrowPct: 0, widePct: 0,
      count: 0, missCount: 0, dominant: null,
    };
  }
  let onTarget = 0;
  const buckets: Record<Bucket, number> = { short: 0, long: 0, narrow: 0, wide: 0 };
  for (const t of taps) {
    if (isOnTarget(t)) onTarget += 1;
    else buckets[classifyMiss(t)] += 1;
  }
  const missCount = total - onTarget;
  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
  const entries = Object.entries(buckets) as [Bucket, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const dominant = missCount > 0 && entries[0][1] > 0 ? entries[0][0] : null;
  return {
    count: total,
    missCount,
    onTargetPct: pct(onTarget, total),
    missPct: pct(missCount, total),
    shortPct: pct(buckets.short, missCount),
    longPct: pct(buckets.long, missCount),
    narrowPct: pct(buckets.narrow, missCount),
    widePct: pct(buckets.wide, missCount),
    dominant,
  };
}

const MISS_LABEL: Record<Bucket, string> = {
  short: "Short",
  long: "Long",
  narrow: "Narrow",
  wide: "Wide",
};

function InsightsPage() {
  const [hand, setHand] = useState<HandFilter>("all");

  const { data: drills = [] } = useQuery({
    queryKey: ["drills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drills").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Drill[];
    },
  });

  const { data: results = [] } = useQuery({
    queryKey: ["insights-results"],
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

  const { idToSlug, slugToLen, drillBySlug } = useMemo(() => {
    const idToSlug = new Map<string, string>();
    const slugToLen = new Map<string, DrawLength>();
    const drillBySlug = new Map<string, Drill>();
    for (const d of drills) {
      idToSlug.set(d.id, d.slug);
      drillBySlug.set(d.slug, d);
      const l = drawLengthForSlug(d.slug);
      if (l) slugToLen.set(d.slug, l);
    }
    return { idToSlug, slugToLen, drillBySlug };
  }, [drills]);

  const allTaps = useMemo(
    () => collectVisualTaps(results, slugToLen, idToSlug),
    [results, slugToLen, idToSlug],
  );

  const taps = useMemo(
    () => (hand === "all" ? allTaps : allTaps.filter((t) => t.hand === hand)),
    [allTaps, hand],
  );

  const overall = useMemo(() => computeBreakdown(allTaps), [allTaps]);
  const fh = useMemo(() => computeBreakdown(allTaps.filter((t) => t.hand === "forehand")), [allTaps]);
  const bh = useMemo(() => computeBreakdown(allTaps.filter((t) => t.hand === "backhand")), [allTaps]);

  // 30-day trend on the on-target rate (higher is better) and each miss bucket
  const cutoff = Date.now() - 30 * 86_400_000;
  const recent = useMemo(() => allTaps.filter((t) => new Date(t.played_at).getTime() >= cutoff), [allTaps, cutoff]);
  const older = useMemo(() => allTaps.filter((t) => new Date(t.played_at).getTime() < cutoff), [allTaps, cutoff]);
  const recentBd = useMemo(() => computeBreakdown(recent), [recent]);
  const olderBd = useMemo(() => computeBreakdown(older), [older]);

  const zones = useMemo(() => performanceZones(allTaps), [allTaps]);
  const legacyMiss = useMemo(() => missAnalysis(allTaps), [allTaps]);
  const hands = useMemo(() => handAccuracy(allTaps), [allTaps]);
  const wvl = useMemo(() => weightVsLine(legacyMiss), [legacyMiss]);
  const focus = useMemo(() => coachingFocus(legacyMiss, wvl, hands), [legacyMiss, wvl, hands]);
  const smartTips = useMemo(() => smartCoachingInsights(legacyMiss, wvl, hands), [legacyMiss, wvl, hands]);
  const jackHighTrend = useMemo(() => trendDelta(allTaps, (p) => p.jackHighPct, 30), [allTaps]);

  const insightSentence = useMemo(() => buildInsight(overall, hands), [overall, hands]);

  const recommendedDrill = focus.recommendedDrillSlugs
    .map((s) => drillBySlug.get(s))
    .find(Boolean) as Drill | undefined;

  return (
    <>
      <PageHeader
        title="Shot Pattern Insights"
        subtitle="Why you're missing — and what to do about it"
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
        {allTaps.length < 5 ? (
          <section className="rounded-3xl bg-card p-6 text-center bt-shadow-card">
            <p className="font-display text-lg font-extrabold">Not enough shot data yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Record a few draw drills with Visual Target scoring to unlock shot pattern analysis.
            </p>
            <Link
              to="/drills"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-primary-foreground"
            >
              Choose a drill
            </Link>
          </section>
        ) : (
          <>
            {/* On Target */}
            <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                On Target
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="font-display text-5xl font-extrabold text-primary">
                  {Math.round(overall.onTargetPct)}
                  <span className="text-2xl text-muted-foreground">%</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {overall.count} bowl{overall.count === 1 ? "" : "s"}
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bt-gradient-primary"
                  style={{ width: `${overall.onTargetPct}%` }}
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                On target = within one mat short of the jack, up to two mats past — and within one mat of the centre line.
              </p>
            </section>

            {/* Miss Breakdown + Dominant Miss */}
            <section className="rounded-3xl bg-card p-5 bt-shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Miss Breakdown
                </h2>
                {overall.dominant && (
                  <span className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
                    Dominant: {MISS_LABEL[overall.dominant]}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Of the {overall.missCount} bowl{overall.missCount === 1 ? "" : "s"} outside the target zone.
              </p>
              <div className="mt-3 space-y-2">
                <MissRow label="Short" pct={overall.shortPct} highlight={overall.dominant === "short"} />
                <MissRow label="Long" pct={overall.longPct} highlight={overall.dominant === "long"} />
                <MissRow label="Wide" pct={overall.widePct} highlight={overall.dominant === "wide"} />
                <MissRow label="Narrow" pct={overall.narrowPct} highlight={overall.dominant === "narrow"} />
              </div>
            </section>

            {/* Forehand vs Backhand */}
            <section className="grid grid-cols-2 gap-3">
              <HandCard title="Forehand" bd={fh} />
              <HandCard title="Backhand" bd={bh} />
            </section>

            {/* Heat Map */}
            <section className="rounded-3xl bg-card p-5 bt-shadow-card">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Heat Map
              </h2>
              <div className="mt-2 flex gap-1.5">
                {(["all", "forehand", "backhand"] as HandFilter[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setHand(k)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition ${
                      hand === k
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {k === "all" ? "All" : k[0].toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
              <HeatMap taps={taps} />
              <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                <LegendDot color="bg-success" label="On target" />
                <LegendDot color="bg-warning" label="Close miss" />
                <LegendDot color="bg-destructive" label="Poor miss" />
              </div>
            </section>

            {/* 30-day trend */}
            <section className="rounded-3xl bg-card p-5 bt-shadow-card">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Last 30 Days
              </h2>
              {olderBd.count < 5 || recentBd.count < 5 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Trend unlocks once you have data from both the last 30 days and earlier.
                </p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  <TrendRow label="On Target" recent={recentBd.onTargetPct} older={olderBd.onTargetPct} betterHigher />
                  <TrendRow label="Short misses" recent={recentBd.shortPct} older={olderBd.shortPct} />
                  <TrendRow label="Long misses" recent={recentBd.longPct} older={olderBd.longPct} />
                  <TrendRow label="Wide misses" recent={recentBd.widePct} older={olderBd.widePct} />
                  <TrendRow label="Narrow misses" recent={recentBd.narrowPct} older={olderBd.narrowPct} />
                </ul>
              )}
              {jackHighTrend != null && (
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Weight sharpness has moved {jackHighTrend > 0 ? "up" : jackHighTrend < 0 ? "down" : "sideways"} by {Math.abs(jackHighTrend)}% in the last 30 days.
                </p>
              )}
            </section>

            {/* Coach's Insight */}
            <section className="rounded-3xl bg-primary/10 p-5">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-primary">
                  Coach's Insight
                </h2>
              </div>
              <p className="text-sm leading-relaxed">{insightSentence}</p>
              {smartTips.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {smartTips.slice(0, 2).map((t, i) => (
                    <li key={i}>• {t}</li>
                  ))}
                </ul>
              )}
            </section>

            {/* Recommended drill */}
            {recommendedDrill && (
              <section className="rounded-3xl bg-secondary p-5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Recommended Drill
                </p>
                <h3 className="mt-1 font-display text-lg font-extrabold">{recommendedDrill.name}</h3>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{focus.title}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> 15 min
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed">{focus.why}</p>
                <Link
                  to="/drill/$slug"
                  params={{ slug: recommendedDrill.slug }}
                  className="mt-3 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-primary-foreground"
                >
                  Start drill
                </Link>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

function buildInsight(overall: MissBreakdown, hands: ReturnType<typeof handAccuracy>): string {
  if (overall.count < 5) {
    return "Record a few more visual-target sessions and your coaching insight will appear here.";
  }
  if (overall.missCount === 0) {
    return "Every bowl is landing inside the target zone — outstanding shape.";
  }
  const dominant = overall.dominant;
  if (dominant === "short") {
    return `${Math.round(overall.shortPct)}% of your misses are finishing short. Your line looks good — focus on adding a touch of weight.`;
  }
  if (dominant === "long") {
    return `${Math.round(overall.longPct)}% of your misses are running past the jack. Ease the weight off half a mat.`;
  }
  if (dominant === "narrow") {
    return `Most misses are finishing narrow (${Math.round(overall.narrowPct)}%). Your weight is honest — allow more green.`;
  }
  if (dominant === "wide") {
    return `Most misses are drifting wide (${Math.round(overall.widePct)}%). Tighten your line before touching the weight.`;
  }
  // Hand asymmetry fallback
  if (hands.forehand.count >= 5 && hands.backhand.count >= 5) {
    const fh = hands.forehand.onlinePct + hands.forehand.jackHighPct;
    const bh = hands.backhand.onlinePct + hands.backhand.jackHighPct;
    if (Math.abs(fh - bh) >= 15) {
      return fh > bh
        ? "Your forehand is doing more of the heavy lifting — a focused backhand session will lift your average."
        : "Your backhand is your stronger hand right now — spending time on the forehand will pay off quickly.";
    }
  }
  return "Your shot patterns are balanced. Small consistency gains on either weight or line will lift your On Target rate.";
}

function MissRow({ label, pct, highlight }: { label: string; pct: number; highlight?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className={`font-semibold ${highlight ? "text-primary" : ""}`}>{label}</span>
        <span className={`font-display font-extrabold ${highlight ? "text-primary" : ""}`}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full ${highlight ? "bg-primary" : "bg-muted-foreground/60"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function HandCard({ title, bd }: { title: string; bd: MissBreakdown }) {
  return (
    <div className="rounded-2xl bg-card p-4 bt-shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">
        {bd.count === 0 ? "—" : `${Math.round(bd.onTargetPct)}%`}
      </p>
      <p className="text-[11px] text-muted-foreground">On target</p>
      <p className="mt-2 text-[11px]">
        <span className="text-muted-foreground">Dominant:</span>{" "}
        <span className="font-semibold">{bd.dominant ? MISS_LABEL[bd.dominant] : "—"}</span>
      </p>
      {bd.dominant && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {Math.round(
            bd.dominant === "short" ? bd.shortPct
            : bd.dominant === "long" ? bd.longPct
            : bd.dominant === "wide" ? bd.widePct
            : bd.narrowPct,
          )}
          % of misses
        </p>
      )}
    </div>
  );
}

function HeatMap({ taps }: { taps: VisualTapPoint[] }) {
  // Coordinate range: x ∈ roughly [-4, 4] mats, y ∈ [-4, 6] mats
  const W = 260, H = 320;
  const X_MIN = -4, X_MAX = 4;
  const Y_MIN = -4, Y_MAX = 6;
  const sx = (x: number) => ((x - X_MIN) / (X_MAX - X_MIN)) * W;
  const sy = (y: number) => H - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * H; // flip: past jack = up

  const jackX = sx(0);
  const jackY = sy(0);

  return (
    <div className="mt-3 flex justify-center">
      <svg
        width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        className="rounded-2xl bg-secondary/40 transition-opacity duration-300"
      >
        {/* competitive zone (within 1 mat) */}
        <rect
          x={sx(-1)} y={sy(1)}
          width={sx(1) - sx(-1)} height={sy(-1) - sy(1)}
          fill="hsl(var(--primary) / 0.10)"
          stroke="hsl(var(--primary) / 0.5)"
          strokeDasharray="4 4"
        />
        <text
          x={jackX} y={sy(1) + 12}
          textAnchor="middle" fontSize="10"
          fill="hsl(var(--primary))" fontWeight="700"
        >
          Competitive Zone
        </text>
        <text
          x={jackX} y={sy(1) + 24}
          textAnchor="middle" fontSize="9"
          fill="hsl(var(--muted-foreground))"
        >
          (Within 1 mat)
        </text>
        {/* jack line (across) */}
        <line x1={0} x2={W} y1={jackY} y2={jackY} stroke="hsl(var(--muted-foreground) / 0.3)" strokeDasharray="4 4" />
        {/* centre line */}
        <line x1={jackX} x2={jackX} y1={0} y2={H} stroke="hsl(var(--muted-foreground) / 0.3)" strokeDasharray="4 4" />
        {/* jack */}
        <circle cx={jackX} cy={jackY} r={5} fill="hsl(var(--foreground))" />
        {/* axis labels */}
        <text x={jackX} y={12} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">↑ Long</text>
        <text x={jackX} y={H - 4} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">↓ Short</text>
        <text x={6} y={jackY - 4} fontSize="10" fill="hsl(var(--muted-foreground))">← Left</text>
        <text x={W - 6} y={jackY - 4} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">Right →</text>
        {/* bowls */}
        {taps.map((t, i) => {
          const onTarget = isOnTarget(t);
          const d = Math.max(0, Math.max(Math.abs(t.x) - 1, -1 - t.y, t.y - 2));
          const color = onTarget
            ? "hsl(var(--success))"
            : d < 1
              ? "hsl(var(--warning, 38 92% 50%))"
              : "hsl(var(--destructive))";
          return (
            <circle key={i} cx={sx(t.x)} cy={sy(t.y)} r={4} fill={color} fillOpacity={0.75} />
          );
        })}
      </svg>
    </div>
  );
}


function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function TrendRow({
  label, recent, older, betterHigher,
}: {
  label: string; recent: number; older: number; betterHigher?: boolean;
}) {
  const delta = Math.round((recent - older) * 10) / 10;
  const improving = betterHigher ? delta > 0 : delta < 0;
  const worsening = betterHigher ? delta < 0 : delta > 0;
  const Icon = improving ? TrendingUp : worsening ? TrendingDown : Minus;
  const cls = improving ? "text-success" : worsening ? "text-destructive" : "text-muted-foreground";
  return (
    <li className="flex items-center justify-between">
      <span className="font-semibold">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {Math.round(older)}% → {Math.round(recent)}%
        </span>
        <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${cls}`}>
          <Icon className="h-3.5 w-3.5" />
          {Math.abs(delta)}%
        </span>
      </span>
    </li>
  );
}
