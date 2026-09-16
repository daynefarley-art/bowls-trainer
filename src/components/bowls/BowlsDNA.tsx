import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type {
  AccuracyPattern,
  HandAccuracy,
  MissAnalysis,
  PerformanceZones,
  WeightVsLine,
} from "@/lib/bowls";

type Props = {
  zones: PerformanceZones;
  miss: MissAnalysis;
  wvl: WeightVsLine;
  hands: HandAccuracy;
  weakestSkillLabel?: string | null;
};

function lineRating(overall: AccuracyPattern): string {
  if (overall.count < 5) return "—";
  if (overall.onlinePct >= 60) return "Sharp";
  if (overall.onlinePct >= 40) return "Solid";
  if (overall.onlinePct >= 25) return "Developing";
  return "Needs work";
}

function weightRating(overall: AccuracyPattern): string {
  if (overall.count < 5) return "—";
  if (overall.jackHighPct >= 40) return "Sharp";
  if (overall.jackHighPct >= 25) return "Solid";
  if (overall.jackHighPct >= 15) return "Developing";
  return "Needs work";
}

function consistencyRatingFromZones(zones: PerformanceZones): string {
  if (zones.count < 10) return "—";
  const good = zones.elitePct + zones.competitivePct;
  if (good >= 60) return "Very consistent";
  if (good >= 45) return "Consistent";
  if (good >= 30) return "Building";
  return "Variable";
}

function strongestHand(hands: HandAccuracy): string {
  const fh = hands.forehand;
  const bh = hands.backhand;
  if (fh.count < 5 && bh.count < 5) return "—";
  if (fh.count < 5) return "Backhand";
  if (bh.count < 5) return "Forehand";
  const fhScore = fh.onlinePct + fh.jackHighPct;
  const bhScore = bh.onlinePct + bh.jackHighPct;
  if (Math.abs(fhScore - bhScore) < 5) return "Balanced";
  return fhScore > bhScore ? "Forehand" : "Backhand";
}

function dominantMissLabel(miss: MissAnalysis): string {
  if (miss.count < 5) return "—";
  const entries: Array<[string, number]> = [
    ["Short", miss.shortPct],
    ["Long", miss.longPct],
    ["Narrow", miss.narrowPct],
    ["Wide", miss.widePct],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][1] > 0 ? entries[0][0] : "—";
}

function biggestOpportunity(
  miss: MissAnalysis,
  wvl: WeightVsLine,
  weakestSkillLabel?: string | null,
): string {
  if (weakestSkillLabel) return weakestSkillLabel;
  if (miss.count < 5) return "Record more sessions";
  if (wvl.primary === "Weight") {
    return miss.shortPct >= miss.longPct ? "Add weight" : "Ease off weight";
  }
  if (wvl.primary === "Line") {
    return miss.narrowPct >= miss.widePct ? "Wider line" : "Tighter line";
  }
  return "Overall consistency";
}

export function BowlsDNA({ zones, miss, wvl, hands, weakestSkillLabel }: Props) {
  const rows: Array<{ emoji: string; label: string; value: string }> = [
    { emoji: "🎯", label: "Line", value: lineRating({
      count: zones.count,
      narrowPct: 0,
      onlinePct: zones.count ? Math.round((100 - miss.narrowPct - miss.widePct) * 10) / 10 : 0,
      widePct: 0,
      shortPct: 0,
      jackHighPct: 0,
      pastJackPct: 0,
    }) },
    { emoji: "⚖️", label: "Weight", value: weightRating({
      count: zones.count,
      narrowPct: 0,
      onlinePct: 0,
      widePct: 0,
      shortPct: 0,
      jackHighPct: zones.count ? Math.round((100 - miss.shortPct - miss.longPct) * 10) / 10 : 0,
      pastJackPct: 0,
    }) },
    { emoji: "🔄", label: "Consistency", value: consistencyRatingFromZones(zones) },
    { emoji: "💪", label: "Strongest Hand", value: strongestHand(hands) },
    { emoji: "⚠️", label: "Dominant Miss", value: dominantMissLabel(miss) },
    { emoji: "🎯", label: "Biggest Opportunity", value: biggestOpportunity(miss, wvl, weakestSkillLabel) },
  ];

  return (
    <section className="rounded-3xl bg-card p-5 bt-shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Your Bowls DNA
        </h2>
        <Link
          to="/insights"
          className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-primary"
        >
          Shot patterns <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2 font-semibold">
              <span className="text-base">{r.emoji}</span>
              <span>{r.label}</span>
            </span>
            <span className="font-display font-extrabold text-primary">{r.value}</span>
          </li>
        ))}
      </ul>
      {zones.count < 10 && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Record a few more visual-target sessions to sharpen your Bowls DNA.
        </p>
      )}
    </section>
  );
}
