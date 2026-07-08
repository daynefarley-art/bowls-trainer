import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  BSI_LEVELS,
  bsiChange,
  bsiInWindow,
  bsiLevel,
  bsiTimeSeries,
  categoryScores,
  formRating,
  overallBSI,
  personalBestBSI,
  pointsToNextLevel,
  recommendedDrill,
  strongestCategory,
  trendStatus,
  weakestCategory,
  type Drill,
  type Result,
} from "@/lib/bowls";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: Result[];
  drills: Drill[];
};

export function BSIModal({ open, onOpenChange, results, drills }: Props) {
  const [window, setWindow] = useState<30 | 90 | null>(null);

  const bsi = overallBSI(results, drills);
  const level = bsiLevel(bsi);
  const avg30 = bsiInWindow(results, drills, 30);
  const avg90 = bsiInWindow(results, drills, 90);
  const allTime = bsiInWindow(results, drills, null);
  const pb = personalBestBSI(results);
  const form = formRating(results);
  const change30 = bsiChange(results, drills, 30);
  const change90 = bsiChange(results, drills, 90);
  const change180 = bsiChange(results, drills, 180);
  const trend = trendStatus(change30);
  const cats = categoryScores(results, drills);
  const strong = strongestCategory(results, drills);
  const weak = weakestCategory(results, drills);
  const rec = recommendedDrill(results, drills);
  const { next, points } = pointsToNextLevel(bsi);

  const timeSeries = useMemo(() => bsiTimeSeries(results, drills), [results, drills]);
  const filteredSeries = useMemo(() => {
    if (window == null) return timeSeries;
    const cutoff = Date.now() - window * 86_400_000;
    return timeSeries.filter((p) => p.ts >= cutoff);
  }, [timeSeries, window]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">About Your Bowls Skill Index</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Your Bowls Skill Index, or BSI, is designed to measure your current bowling skill based on structured
            drill results. It is not a handicap and it does not measure whether you win or lose games. Instead,
            it reflects how accurately and consistently you perform key bowling skills during drills.
          </DialogDescription>
        </DialogHeader>

        {/* What BSI is built from */}
        <section className="rounded-2xl bg-secondary/60 p-4 text-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">BSI is built from</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-foreground">
            <li>• Draw accuracy</li>
            <li>• Weight control</li>
            <li>• Line consistency</li>
            <li>• Conversion shots</li>
            <li>• Driving accuracy</li>
            <li>• Jack control</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            For draw drills, a bowl within one mat of the jack is considered a strong result, especially at longer
            lengths. A bowl within half a mat is excellent. A bowl within two mats is useful but leaves room for
            improvement. BSI rewards precision, and also recognises that consistent one-mat accuracy is a
            high-quality performance.
          </p>
        </section>

        {/* Headline */}
        <section className="rounded-2xl bg-secondary p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current BSI</p>
              <p className="font-display text-4xl font-extrabold text-primary leading-none">
                {bsi.toFixed(1)}<span className="text-base text-muted-foreground">/100</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Level</p>
              <p className="font-display text-base font-bold">{level.label}</p>
            </div>
          </div>
        </section>

        {/* Stats grid */}
        <section className="grid grid-cols-3 gap-2">
          <Stat label="30d avg" value={avg30 != null ? avg30.toFixed(1) : "—"} />
          <Stat label="90d avg" value={avg90 != null ? avg90.toFixed(1) : "—"} />
          <Stat label="All-time" value={allTime != null ? allTime.toFixed(1) : "—"} />
          <Stat label="Personal best" value={pb != null ? pb.toFixed(1) : "—"} />
          <Stat label="Form" value={form ? form.label : "—"} />
          <Stat label="Sessions" value={results.length} />
        </section>

        {/* Category scores */}
        <section className="space-y-2">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Category scores</h3>
          <div className="space-y-2">
            {Object.entries(cats).map(([key, c]) => (
              <CategoryBar key={key} label={c.label} score={c.score} />
            ))}
          </div>
        </section>

        {/* BSI Journey */}
        <section className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold">Your BSI Journey</h3>
            {trend && <TrendBadge trend={trend} />}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <SmallStat label="30d change" value={fmtChange(change30)} />
            <SmallStat label="90d change" value={fmtChange(change90)} />
            <SmallStat label="180d change" value={fmtChange(change180)} />
          </div>
          <div className="flex gap-1.5">
            {([
              { v: 30 as const, l: "30d" },
              { v: 90 as const, l: "90d" },
              { v: null, l: "All" },
            ]).map((o) => (
              <button
                key={o.l}
                onClick={() => setWindow(o.v)}
                className={`flex-1 rounded-xl py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                  window === o.v ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          {filteredSeries.length < 2 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Not enough sessions in this window yet.</p>
          ) : (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredSeries} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="bsi" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Levels */}
        <section className="space-y-2">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">BSI Levels</h3>
          <ul className="space-y-1.5">
            {BSI_LEVELS.map((l) => {
              const active = l.label === level.label;
              return (
                <li
                  key={l.label}
                  className={`rounded-xl border p-2.5 ${active ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-display text-sm font-bold">
                      {l.min}–{l.max} {l.label}
                    </p>
                    {active && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                        You
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{l.blurb}</p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Improvement */}
        <section className="space-y-2 rounded-2xl bg-secondary p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base font-bold">How to Improve Your BSI</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-background p-2">
              <p className="font-bold uppercase tracking-wide text-muted-foreground text-[10px]">Strongest</p>
              <p className="font-semibold">{strong ? `${strong.label} (${strong.score.toFixed(0)})` : "—"}</p>
            </div>
            <div className="rounded-lg bg-background p-2">
              <p className="font-bold uppercase tracking-wide text-muted-foreground text-[10px]">Weakest</p>
              <p className="font-semibold">{weak ? `${weak.label} (${weak.score.toFixed(0)})` : "—"}</p>
            </div>
          </div>
          {rec && weak && (
            <p className="text-sm leading-relaxed">
              Your weakest area is <strong>{weak.label}</strong>. Practising the{" "}
              <strong>{rec.drill.name}</strong> may have the biggest impact on your BSI.
            </p>
          )}
          {next ? (
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{points} BSI point{points === 1 ? "" : "s"}</strong> to reach{" "}
              <strong className="text-foreground">{next.label}</strong>.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">You're at the top level — keep it up!</p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-2.5 text-center bt-shadow-card">
      <p className="font-display text-lg font-extrabold leading-tight">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="font-display text-base font-bold">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function CategoryBar({ label, score }: { label: string; score: number | null }) {
  const pct = score ?? 0;
  return (
    <div className="rounded-xl bg-card p-2.5 bt-shadow-card">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-display font-bold text-primary">{score == null ? "—" : score.toFixed(0)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bt-gradient-primary"
          style={{ width: `${score == null ? 0 : pct}%` }}
        />
      </div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: "Improving" | "Stable" | "Declining" }) {
  const Icon = trend === "Improving" ? TrendingUp : trend === "Declining" ? TrendingDown : Minus;
  const color =
    trend === "Improving" ? "text-success bg-success/15" : trend === "Declining" ? "text-destructive bg-destructive/15" : "text-muted-foreground bg-secondary";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      {trend}
    </span>
  );
}

function fmtChange(v: number | null): string {
  if (v == null) return "—";
  if (v > 0) return `+${v.toFixed(1)}`;
  return v.toFixed(1);
}
