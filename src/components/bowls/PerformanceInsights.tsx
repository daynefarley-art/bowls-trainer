import { useMemo, useState } from "react";
import { BarChart3, Target, TrendingUp, TrendingDown, Minus, Sparkles, Compass, Dumbbell } from "lucide-react";
import {
  collectVisualTaps,
  handAccuracy,
  lengthAccuracy,
  performanceZones,
  missAnalysis,
  weightVsLine,
  coachingFocus,
  bowlingDNA,
  smartCoachingInsights,
  whatIfMissesConverted,
  trendDelta,
  drawLengthForSlug,
  type DrawLength,
  type Drill,
  type Result,
} from "@/lib/bowls";

type Props = {
  results: Result[];
  drills: Drill[];
  /** When true, hide the "coach note prompt" call-to-action (coach view shows its own). */
  hideNoteCta?: boolean;
  /** Coach view: name to reference in insights ("Alex's misses…"). */
  subjectName?: string;
};

type LengthFilter = DrawLength | "all";
type HandFilter = "forehand" | "backhand" | "all";
type TimeFilter = "last10" | "30d" | "all";

export function PerformanceInsights({ results, drills, subjectName }: Props) {
  const [lengthF, setLengthF] = useState<LengthFilter>("all");
  const [handF, setHandF] = useState<HandFilter>("all");
  const [timeF, setTimeF] = useState<TimeFilter>("all");

  const { idToSlug, slugToLen } = useMemo(() => {
    const idToSlug = new Map<string, string>();
    const slugToLen = new Map<string, DrawLength>();
    for (const d of drills) {
      idToSlug.set(d.id, d.slug);
      const l = drawLengthForSlug(d.slug);
      if (l) slugToLen.set(d.slug, l);
    }
    return { idToSlug, slugToLen };
  }, [drills]);

  const allTaps = useMemo(
    () => collectVisualTaps(results, slugToLen, idToSlug),
    [results, slugToLen, idToSlug],
  );

  const taps = useMemo(() => {
    let arr = allTaps.slice();
    if (lengthF !== "all") arr = arr.filter((t) => t.length === lengthF);
    if (handF !== "all") arr = arr.filter((t) => t.hand === handF);
    if (timeF === "30d") {
      const cutoff = Date.now() - 30 * 86_400_000;
      arr = arr.filter((t) => new Date(t.played_at).getTime() >= cutoff);
    } else if (timeF === "last10") {
      const sessions = Array.from(new Set(arr.map((t) => t.played_at)))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        .slice(0, 10);
      const set = new Set(sessions);
      arr = arr.filter((t) => set.has(t.played_at));
    }
    return arr;
  }, [allTaps, lengthF, handF, timeF]);

  const zones = performanceZones(taps);
  const miss = missAnalysis(taps);
  const wvl = weightVsLine(miss);
  const hands = handAccuracy(taps);
  const byLength = lengthAccuracy(taps);
  const focus = coachingFocus(miss, wvl, hands);
  const dna = bowlingDNA(wvl, zones, null);
  const insights = smartCoachingInsights(miss, wvl, hands);
  const shortTrend = trendDelta(taps, (p) => p.shortPct, 30);
  const narrowTrend = trendDelta(taps, (p) => p.narrowPct, 30);
  const wideTrend = trendDelta(taps, (p) => p.widePct, 30);
  const jackHighTrend = trendDelta(taps, (p) => p.jackHighPct, 30);

  const whatIfShort = whatIfMissesConverted(taps, "short", 0.5);
  const whatIfNarrow = whatIfMissesConverted(taps, "narrow", 0.5);

  const drillBySlug = useMemo(() => {
    const m = new Map<string, Drill>();
    for (const d of drills) m.set(d.slug, d);
    return m;
  }, [drills]);

  if (!allTaps.length) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-bold">Performance Insights</h2>
        </div>
        <div className="rounded-2xl bg-card p-5 bt-shadow-card text-center text-sm text-muted-foreground">
          Record a few draw drills using Visual Target scoring to unlock Miss Analysis, Performance Zones and coaching focus.
        </div>
      </section>
    );
  }

  const subject = subjectName ?? "Your";
  const yourOrTheir = subjectName ? `${subjectName}'s` : "Your";

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-bold">Performance Insights</h2>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-card p-4 bt-shadow-card space-y-3">
        <FilterRow label="Length" value={lengthF} options={[
          { v: "all", l: "All" },
          { v: "short", l: "Short" },
          { v: "medium", l: "Medium" },
          { v: "long", l: "Long" },
        ]} onChange={(v) => setLengthF(v as LengthFilter)} />
        <FilterRow label="Hand" value={handF} options={[
          { v: "all", l: "All" },
          { v: "forehand", l: "FH" },
          { v: "backhand", l: "BH" },
        ]} onChange={(v) => setHandF(v as HandFilter)} />
        <FilterRow label="Period" value={timeF} options={[
          { v: "last10", l: "Last 10" },
          { v: "30d", l: "30 days" },
          { v: "all", l: "All time" },
        ]} onChange={(v) => setTimeF(v as TimeFilter)} />
      </div>

      {/* Current Coaching Focus */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 bt-shadow-card">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">Current Coaching Focus</p>
        </div>
        <h3 className="mt-2 font-display text-xl font-extrabold">{focus.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{focus.why}</p>
        {focus.recommendedDrillSlugs.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Recommended Training</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {focus.recommendedDrillSlugs.map((slug) => {
                const d = drillBySlug.get(slug);
                return (
                  <li key={slug} className="rounded-full bg-card px-3 py-1 text-xs font-semibold border border-border">
                    {d?.name ?? slug.replace(/-/g, " ")}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {focus.estimatedBSIImpact != null && (
          <p className="mt-3 text-xs">
            <span className="text-muted-foreground">Estimated BSI impact: </span>
            <span className="font-bold text-primary">+{focus.estimatedBSIImpact}</span>
          </p>
        )}
      </div>

      {/* Bowling DNA */}
      <div className="rounded-2xl bg-card p-5 bt-shadow-card">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">{yourOrTheir} Bowling DNA</p>
        </div>
        <h3 className="mt-1 font-display text-xl font-extrabold">{dna.label}</h3>
        <p className="text-sm text-muted-foreground">{dna.explanation}</p>
      </div>

      {/* Performance Zones */}
      <div className="rounded-2xl bg-card p-5 bt-shadow-card">
        <h3 className="font-display font-bold">Performance Zones</h3>
        <p className="text-xs text-muted-foreground">Where {subject.toLowerCase()} bowls finish, out of {zones.count} recorded.</p>
        <div className="mt-3 space-y-2">
          <ZoneBar label="Elite (½ mat)" pct={zones.elitePct} color="var(--color-primary)" />
          <ZoneBar label="Competitive (1 mat)" pct={zones.competitivePct} color="var(--color-bowl-forehand)" />
          <ZoneBar label="Recovery (2 mat)" pct={zones.recoveryPct} color="var(--color-bowl-backhand)" />
          <ZoneBar label="Misses (outside 1 mat)" pct={zones.missPct} color="var(--color-destructive)" />
        </div>
      </div>

      {/* Miss Analysis */}
      <div className="rounded-2xl bg-card p-5 bt-shadow-card">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="font-display font-bold">Miss Analysis</h3>
        </div>
        <p className="text-xs text-muted-foreground">Bowls outside one mat of the jack: <b>{miss.count}</b></p>
        {miss.count === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No misses in this window — great work.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <MissPct label="Short" pct={miss.shortPct} trend={shortTrend} invert />
            <MissPct label="Long" pct={miss.longPct} />
            <MissPct label="Narrow" pct={miss.narrowPct} trend={narrowTrend} invert />
            <MissPct label="Wide" pct={miss.widePct} trend={wideTrend} invert />
            <MissPct label="Left" pct={miss.leftPct} />
            <MissPct label="Right" pct={miss.rightPct} />
          </div>
        )}
      </div>

      {/* Weight vs Line */}
      <div className="rounded-2xl bg-card p-5 bt-shadow-card">
        <h3 className="font-display font-bold">Weight vs Line</h3>
        <div className="mt-2 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-secondary/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Weight errors</p>
            <p className="font-display text-2xl font-extrabold">{wvl.weightErrorPct}%</p>
          </div>
          <div className="rounded-xl bg-secondary/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Line errors</p>
            <p className="font-display text-2xl font-extrabold">{wvl.lineErrorPct}%</p>
          </div>
        </div>
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">Primary Issue: </span>
          <b className="text-foreground">{wvl.primary}</b>
        </p>
        <p className="text-xs text-muted-foreground">{wvl.reason}</p>
      </div>

      {/* Forehand vs Backhand */}
      {(hands.forehand.count > 0 || hands.backhand.count > 0) && (
        <div className="rounded-2xl bg-card p-5 bt-shadow-card">
          <h3 className="font-display font-bold">Forehand vs Backhand</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <HandCard title="Forehand" count={hands.forehand.count} narrow={hands.forehand.narrowPct} wide={hands.forehand.widePct} short={hands.forehand.shortPct} pastJack={hands.forehand.pastJackPct} online={hands.forehand.onlinePct} />
            <HandCard title="Backhand" count={hands.backhand.count} narrow={hands.backhand.narrowPct} wide={hands.backhand.widePct} short={hands.backhand.shortPct} pastJack={hands.backhand.pastJackPct} online={hands.backhand.onlinePct} />
          </div>
        </div>
      )}

      {/* Length breakdown */}
      <div className="rounded-2xl bg-card p-5 bt-shadow-card">
        <h3 className="font-display font-bold">Length Analysis</h3>
        <div className="mt-3 space-y-2">
          {(["short", "medium", "long"] as const).map((len) => {
            const p = byLength[len].overall;
            if (!p.count) return null;
            return (
              <div key={len} className="rounded-xl bg-secondary/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-semibold capitalize">{len} draw</p>
                  <span className="text-xs text-muted-foreground">{p.count} bowls</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                  <span>Short: <b>{p.shortPct}%</b></span>
                  <span>Within a Mat: <b>{p.jackHighPct}%</b></span>
                  <span>Long: <b>{p.pastJackPct}%</b></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trends */}
      {(shortTrend != null || narrowTrend != null || wideTrend != null || jackHighTrend != null) && (
        <div className="rounded-2xl bg-card p-5 bt-shadow-card">
          <h3 className="font-display font-bold">Improvement Tracking (30d)</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <TrendRow label="Short misses" delta={shortTrend} invert />
            <TrendRow label="Within a Mat" delta={jackHighTrend} />
            <TrendRow label="Narrow" delta={narrowTrend} invert />
            <TrendRow label="Wide" delta={wideTrend} invert />
          </div>
        </div>
      )}

      {/* Smart insights */}
      {insights.length > 0 && (
        <div className="rounded-2xl bg-card p-5 bt-shadow-card">
          <h3 className="font-display font-bold">Smart Coaching Insights</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {insights.map((i, idx) => <li key={idx}>{i}</li>)}
          </ul>
        </div>
      )}

      {/* What if */}
      {(whatIfShort.deltaBSI > 0 || whatIfNarrow.deltaBSI > 0) && (
        <div className="rounded-2xl bg-card p-5 bt-shadow-card">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" />
            <h3 className="font-display font-bold">What Would Happen If…</h3>
          </div>
          <ul className="mt-2 space-y-2 text-sm">
            {whatIfShort.deltaBSI > 0 && (
              <li className="rounded-xl bg-secondary/40 p-3">
                If half of {yourOrTheir.toLowerCase()} short bowls reached within one mat, BSI could rise by
                <b> +{whatIfShort.deltaBSI}</b>.
              </li>
            )}
            {whatIfNarrow.deltaBSI > 0 && (
              <li className="rounded-xl bg-secondary/40 p-3">
                If narrow misses were reduced by 50%, BSI could rise by
                <b> +{whatIfNarrow.deltaBSI}</b>.
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

function FilterRow({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex gap-1 rounded-lg bg-secondary/40 p-1">
        {options.map((o) => {
          const active = o.v === value;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(o.v)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                active ? "bg-card text-foreground bt-shadow-card" : "text-muted-foreground"
              }`}
            >
              {o.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ZoneBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">{label}</span>
        <span className="font-bold">{pct}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary/60">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

function MissPct({ label, pct, trend, invert }: { label: string; pct: number; trend?: number | null; invert?: boolean }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-extrabold">{pct}%</p>
      {trend != null && Math.abs(trend) >= 1 && (
        <TrendPill delta={trend} invert={invert} />
      )}
    </div>
  );
}

function TrendPill({ delta, invert }: { delta: number; invert?: boolean }) {
  const good = invert ? delta < 0 : delta > 0;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const color = delta === 0 ? "text-muted-foreground" : good ? "text-success" : "text-destructive";
  return (
    <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold ${color}`}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? `+${delta}` : delta}%
    </span>
  );
}

function TrendRow({ label, delta, invert }: { label: string; delta: number | null; invert?: boolean }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      {delta == null ? (
        <p className="text-xs text-muted-foreground">Not enough data</p>
      ) : (
        <TrendPill delta={delta} invert={invert} />
      )}
    </div>
  );
}

function HandCard({
  title, count, narrow, wide, short, pastJack, online,
}: {
  title: string;
  count: number;
  narrow: number;
  wide: number;
  short: number;
  pastJack: number;
  online: number;
}) {
  return (
    <div className="rounded-xl bg-secondary/40 p-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{title}</p>
        <span className="text-muted-foreground">{count} bowls</span>
      </div>
      <div className="mt-2 space-y-0.5">
        <p>Online: <b>{online}%</b></p>
        <p>Narrow: <b>{narrow}%</b> · Wide: <b>{wide}%</b></p>
        <p>Short: <b>{short}%</b> · Long: <b>{pastJack}%</b></p>
      </div>
    </div>
  );
}
