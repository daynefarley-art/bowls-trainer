export type ScoringCategory = { key: string; label: string; points: number };
export type Drill = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  setup: string | null;
  weight: number;
  sort_order: number;
  max_score: number;
  min_score: number;
  bowls_per_end: number;
  scoring_config: { categories: ScoringCategory[]; ends?: number; bowl_hands?: string[]; per_bowl?: boolean };
};

export type Result = {
  id: string;
  user_id: string;
  drill_id: string;
  drill_name: string | null;
  category: string | null;
  score: number;
  max_score: number | null;
  min_score: number | null;
  percentage: number | null;
  bsi: number;
  breakdown: Record<string, number>;
  notes: string | null;
  conditions: string | null;
  green_speed: string | null;
  location: string | null;
  played_at: string;
  created_at: string;
  drill_started_at?: string | null;
  drill_completed_at?: string | null;
  duration_minutes?: number | null;
};

// --- Training time helpers ---

export function formatHM(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Mon=0..Sun=6
  x.setDate(x.getDate() - day);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function durationsFor(results: Pick<Result, "played_at" | "duration_minutes">[]) {
  return results.filter((r) => typeof r.duration_minutes === "number" && r.duration_minutes! > 0);
}

export function minutesInRange(
  results: Pick<Result, "played_at" | "duration_minutes">[],
  from: Date,
  to?: Date,
): number {
  const fromMs = from.getTime();
  const toMs = to ? to.getTime() : Infinity;
  return durationsFor(results).reduce((sum, r) => {
    const t = new Date(r.played_at).getTime();
    return t >= fromMs && t < toMs ? sum + (r.duration_minutes ?? 0) : sum;
  }, 0);
}

export type TrainingStats = {
  thisWeek: number;
  thisMonth: number;
  allTime: number;
  avgPerSession: number;
  sessions: number;
};

export function trainingStats(
  results: Pick<Result, "played_at" | "duration_minutes">[],
  now = new Date(),
): TrainingStats {
  const withDur = durationsFor(results);
  const thisWeek = minutesInRange(withDur, startOfWeek(now));
  const thisMonth = minutesInRange(withDur, startOfMonth(now));
  const allTime = withDur.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
  const sessions = withDur.length;
  const avgPerSession = sessions ? Math.round(allTime / sessions) : 0;
  return { thisWeek, thisMonth, allTime, avgPerSession, sessions };
}

export function weeklyMinutes(
  results: Pick<Result, "played_at" | "duration_minutes">[],
  now = new Date(),
): { day: string; minutes: number }[] {
  const start = startOfWeek(now);
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return labels.map((day, i) => {
    const from = new Date(start);
    from.setDate(start.getDate() + i);
    const to = new Date(from);
    to.setDate(from.getDate() + 1);
    return { day, minutes: minutesInRange(results, from, to) };
  });
}

export function monthlyTrend(
  results: Pick<Result, "played_at" | "duration_minutes">[],
  weeks = 8,
  now = new Date(),
): { week: string; hours: number }[] {
  const thisWeekStart = startOfWeek(now);
  const out: { week: string; hours: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = new Date(thisWeekStart);
    from.setDate(thisWeekStart.getDate() - i * 7);
    const to = new Date(from);
    to.setDate(from.getDate() + 7);
    const mins = minutesInRange(results, from, to);
    out.push({
      week: from.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      hours: Math.round((mins / 60) * 10) / 10,
    });
  }
  return out;
}

export function bestTrainingWeek(
  results: Pick<Result, "played_at" | "duration_minutes">[],
): { minutes: number; weekStart: Date } | null {
  const withDur = durationsFor(results);
  if (!withDur.length) return null;
  const buckets = new Map<number, number>();
  for (const r of withDur) {
    const ws = startOfWeek(new Date(r.played_at)).getTime();
    buckets.set(ws, (buckets.get(ws) ?? 0) + (r.duration_minutes ?? 0));
  }
  let bestTs = 0;
  let bestMin = 0;
  buckets.forEach((m, ts) => {
    if (m > bestMin) {
      bestMin = m;
      bestTs = ts;
    }
  });
  return { minutes: bestMin, weekStart: new Date(bestTs) };
}

export function weeklyAverage(
  results: Pick<Result, "played_at" | "duration_minutes">[],
): number {
  const withDur = durationsFor(results);
  if (!withDur.length) return 0;
  const buckets = new Map<number, number>();
  for (const r of withDur) {
    const ws = startOfWeek(new Date(r.played_at)).getTime();
    buckets.set(ws, (buckets.get(ws) ?? 0) + (r.duration_minutes ?? 0));
  }
  const totals = Array.from(buckets.values());
  return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
}

export function trainingStreak(
  results: Pick<Result, "played_at" | "duration_minutes">[],
  now = new Date(),
): number {
  const days = new Set<number>();
  for (const r of durationsFor(results)) {
    days.add(startOfDay(new Date(r.played_at)).getTime());
  }
  if (!days.size) return 0;
  let streak = 0;
  const cursor = startOfDay(now);
  if (!days.has(cursor.getTime())) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(cursor.getTime())) return 0;
  }
  while (days.has(cursor.getTime())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function percentageOf(score: number, min: number, max: number): number {
  if (max === min) return 0;
  const pct = ((score - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}

export const calcBSI = percentageOf;

/**
 * Per-bowl BSI value for draw drills. Rewards precision on a curve so that
 * even reliably-hitting one-mat bowls score near "Advanced".
 *   5pts (Half Mat)     → 95  (Elite)
 *   3pts (One Mat)      → 82  (Advanced)
 *   1pt  (Two Mats)     → 60  (Club)
 *   0pts (Outside)      → 0
 */
export function bsiValueForBowlPoints(points: number): number {
  if (points >= 5) return 95;
  if (points >= 3) return 82;
  if (points >= 1) return 60;
  return 0;
}

/**
 * Draw-drill BSI = average of per-bowl BSI values. This is the preferred
 * calculation when the breakdown includes an individual `bowls` array.
 */
export function drawBSIFromBowls(bowls: Array<{ points: number }>): number {
  if (!bowls.length) return 0;
  const sum = bowls.reduce((s, b) => s + bsiValueForBowlPoints(Number(b.points ?? 0)), 0);
  return Math.round((sum / bowls.length) * 10) / 10;
}

/**
 * Fallback: convert a raw draw-drill percentage into BSI using a piecewise
 * curve calibrated to the same anchors as `bsiValueForBowlPoints`:
 *   - all bowls at 2 mats (raw 20%) → BSI 60 (Club)
 *   - all bowls at 1 mat  (raw 60%) → BSI 82 (Advanced)
 *   - all bowls at half mat (raw 100%) → BSI 95 (Elite)
 * Used only when a bowl-by-bowl breakdown is unavailable.
 */
export function drawBSIFromPercentage(pct: number): number {
  const p = Math.max(0, Math.min(100, pct));
  let bsi: number;
  if (p <= 20) bsi = p * 3;                                // 0 → 0, 20 → 60
  else if (p <= 60) bsi = 60 + (p - 20) * (22 / 40);       // 20 → 60, 60 → 82
  else bsi = 82 + (p - 60) * (13 / 40);                    // 60 → 82, 100 → 95
  return Math.round(bsi * 10) / 10;
}

export function bsiFromPercentage(pct: number, drillSlug?: string | null): number {
  if (drillSlug && isDrawDrillSlug(drillSlug)) return drawBSIFromPercentage(pct);
  return Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10;
}

/**
 * Preferred BSI helper for draw drills — uses the per-bowl breakdown when
 * available and falls back to the percentage-based curve otherwise.
 */
export function bsiFromBreakdown(
  drillSlug: string | null | undefined,
  breakdown: unknown,
  pct: number,
): number {
  if (drillSlug && isDrawDrillSlug(drillSlug)) {
    const bd = (breakdown ?? {}) as Record<string, unknown>;
    const raw = bd.bowls;
    if (Array.isArray(raw) && raw.length) {
      const bowls = (raw as Array<{ points?: number }>).filter(
        (b) => b && typeof b.points === "number",
      ) as Array<{ points: number }>;
      if (bowls.length) return drawBSIFromBowls(bowls);
    }
    return drawBSIFromPercentage(pct);
  }
  return Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10;
}

/**
 * Weighted overall BSI. Each drill contributes its average percentage,
 * weighted by drill.weight. Drills without recorded results are excluded
 * and remaining weights are renormalised.
 */
export function overallBSI(
  results: Pick<Result, "drill_id" | "percentage" | "bsi">[],
  drills: Pick<Drill, "id" | "weight">[],
): number {
  const byDrill = new Map<string, number[]>();
  for (const r of results) {
    const v = r.bsi != null ? Number(r.bsi) : r.percentage != null ? Number(r.percentage) : null;
    if (v == null) continue;
    const arr = byDrill.get(r.drill_id) ?? [];
    arr.push(v);
    byDrill.set(r.drill_id, arr);
  }
  let totalWeight = 0;
  let weighted = 0;
  for (const d of drills) {
    const vals = byDrill.get(d.id);
    if (!vals?.length) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    weighted += avg * Number(d.weight);
    totalWeight += Number(d.weight);
  }
  if (totalWeight === 0) return 0;
  return Math.round((weighted / totalWeight) * 10) / 10;
}


export type BSILevel = {
  label: string;
  color: string;
  min: number;
  max: number;
  blurb: string;
};

export const BSI_LEVELS: BSILevel[] = [
  { label: "Beginner",    min: 0,  max: 39,  color: "oklch(0.65 0.12 50)",  blurb: "Learning the fundamentals of delivery, line and length." },
  { label: "Developing",  min: 40, max: 54,  color: "oklch(0.65 0.14 90)",  blurb: "Building basic consistency — bowls regularly finish in the head." },
  { label: "Club",        min: 55, max: 69,  color: "oklch(0.6 0.14 150)",  blurb: "Solid club-level accuracy with reliable draw and weight control." },
  { label: "Competitive", min: 70, max: 79,  color: "oklch(0.55 0.16 220)", blurb: "Strong precision — most bowls finish within one mat of the jack." },
  { label: "Advanced",    min: 80, max: 89,  color: "oklch(0.5 0.2 280)",   blurb: "High-level consistency across draw, weight, line and shot execution." },
  { label: "Elite",       min: 90, max: 100, color: "oklch(0.55 0.22 350)", blurb: "Exceptional accuracy — bowls repeatedly finish within half a mat of the jack." },
];

/**
 * Single source of truth for BSI level labels.
 * Rounds to the nearest integer so the label always matches the number
 * shown on badges/cards (which also display a rounded value).
 * Ranges: 0–39 Beginner · 40–54 Developing · 55–69 Club · 70–79 Competitive · 80–89 Advanced · 90–100 Elite.
 */
export function bsiLevel(bsi: number | null | undefined): BSILevel {
  const n = Number(bsi);
  if (!Number.isFinite(n)) return BSI_LEVELS[0];
  const b = Math.round(Math.max(0, Math.min(100, n)));
  for (const l of BSI_LEVELS) {
    if (b >= l.min && b <= l.max) return l;
  }
  return b >= 90 ? BSI_LEVELS[BSI_LEVELS.length - 1] : BSI_LEVELS[0];
}

// Alias for clarity when imported elsewhere.
export const getBSILevel = bsiLevel;

export function pointsToNextLevel(bsi: number): { next: BSILevel | null; points: number } {
  const current = bsiLevel(bsi);
  const idx = BSI_LEVELS.indexOf(current);
  const next = idx >= 0 && idx < BSI_LEVELS.length - 1 ? BSI_LEVELS[idx + 1] : null;
  if (!next) return { next: null, points: 0 };
  return { next, points: Math.max(0, Math.ceil(next.min - bsi)) };
}

// --- Category groupings ---

export type CategoryKey = "draw" | "weight" | "conversion" | "jack";
export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  draw: "Draw Skills",
  weight: "Length Control",
  conversion: "Conversion Shots",
  jack: "Jack Control",
};

const DRILL_CATEGORY: Record<string, CategoryKey> = {
  "short-draw": "draw",
  "medium-draw": "draw",
  "long-draw": "draw",
  "weight-control-ladder": "weight",
  "upshot-drill": "conversion",
  "running-shot-drill": "conversion",
  "drive-accuracy": "conversion",
  "jack-in-ditch": "weight",
  "jack-delivery-accuracy": "jack",
};

export const DRAW_DRILL_SLUGS = [
  "short-draw",
  "medium-draw",
  "long-draw",
  "weight-control-ladder", // Length Control Drill — same draw scoring categories
] as const;
export type DrawDrillSlug = (typeof DRAW_DRILL_SLUGS)[number];

export function isDrawDrillSlug(slug: string): slug is DrawDrillSlug {
  return (DRAW_DRILL_SLUGS as readonly string[]).includes(slug);
}

export type DrawLength = "short" | "medium" | "long";

export type BowlDetail = {
  end: number;
  bowl: number;
  hand: "forehand" | "backhand";
  key: string;
  points: number;
  // Optional visual-target fields (mat units relative to jack)
  x?: number;
  y?: number;
  distance?: number;
  drill_length?: DrawLength;
};

export function drawLengthForSlug(slug: string | null | undefined): DrawLength | null {
  if (slug === "short-draw") return "short";
  if (slug === "medium-draw") return "medium";
  if (slug === "long-draw") return "long";
  // weight-control-ladder cycles through all lengths per bowl — no single length
  return null;
}

/** Hand-based stats across draw drill results. */
export function handStats(
  results: Pick<Result, "drill_id" | "breakdown">[],
  drawDrillIds: Set<string>,
): { fhPct: number | null; bhPct: number | null; fhBowls: number; bhBowls: number } {
  let fhPoints = 0, fhCount = 0, bhPoints = 0, bhCount = 0;
  const maxPerBowl = 5;
  for (const r of results) {
    if (!drawDrillIds.has(r.drill_id)) continue;
    const bd = (r.breakdown ?? {}) as Record<string, unknown>;
    const raw = bd.bowls;
    if (!Array.isArray(raw)) continue;
    for (const b of raw as BowlDetail[]) {
      if (b.hand === "forehand") { fhPoints += b.points; fhCount += 1; }
      else if (b.hand === "backhand") { bhPoints += b.points; bhCount += 1; }
    }
  }
  return {
    fhPct: fhCount ? Math.round((fhPoints / (fhCount * maxPerBowl)) * 1000) / 10 : null,
    bhPct: bhCount ? Math.round((bhPoints / (bhCount * maxPerBowl)) * 1000) / 10 : null,
    fhBowls: fhCount,
    bhBowls: bhCount,
  };
}

// --- Visual target analytics ---

export type LineClass = "narrow" | "online" | "wide";
export type WeightClass = "short" | "jack_high" | "past_jack";

// Exclusion rule: bowls finishing within one mat sideways of the jack are
// considered good bowls and are NOT counted as narrow or wide.
export const LINE_TOL = 1.0;
export const WEIGHT_TOL = 0.25;

/**
 * Classify a bowl's line based on x coordinate and hand.
 * Bowls within one mat (LINE_TOL) of the centre line are treated as "online"
 * and excluded from narrow/wide error metrics.
 * Viewing the target from mat → jack:
 *   Forehand: x < 0 = narrow/crossed, x > 0 = wide
 *   Backhand: x > 0 = narrow/crossed, x < 0 = wide
 */
export function classifyLine(x: number, hand: "forehand" | "backhand"): LineClass {
  if (Math.abs(x) <= LINE_TOL) return "online";
  if (hand === "forehand") return x < 0 ? "narrow" : "wide";
  return x > 0 ? "narrow" : "wide";
}

export function classifyWeight(y: number): WeightClass {
  if (y < -WEIGHT_TOL) return "short";
  if (y > WEIGHT_TOL) return "past_jack";
  return "jack_high";
}

export type VisualTapPoint = {
  x: number;
  y: number;
  distance: number;
  hand: "forehand" | "backhand";
  length: DrawLength | null;
  played_at: string;
  drill_id: string;
  line: LineClass;
  weight: WeightClass;
};

export function collectVisualTaps(
  results: Pick<Result, "drill_id" | "breakdown" | "played_at">[],
  drillsBySlug: Map<string, DrawLength>,
  drillIdToSlug: Map<string, string>,
): VisualTapPoint[] {
  const out: VisualTapPoint[] = [];
  for (const r of results) {
    const slug = drillIdToSlug.get(r.drill_id);
    const length = slug ? drillsBySlug.get(slug) ?? null : null;
    const bd = (r.breakdown ?? {}) as Record<string, unknown>;
    const raw = bd.bowls;
    if (!Array.isArray(raw)) continue;
    for (const b of raw as BowlDetail[]) {
      if (typeof b.x !== "number" || typeof b.y !== "number") continue;
      out.push({
        x: b.x,
        y: b.y,
        distance: typeof b.distance === "number" ? b.distance : Math.sqrt(b.x * b.x + b.y * b.y),
        hand: b.hand,
        length: b.drill_length ?? length,
        played_at: r.played_at,
        drill_id: r.drill_id,
        line: classifyLine(b.x, b.hand),
        weight: classifyWeight(b.y),
      });
    }
  }
  return out;
}

export type MissPattern = {
  count: number;
  leftPct: number;
  rightPct: number;
  shortPct: number;
  longPct: number;
  avgX: number;
  avgY: number;
};

export function missPattern(taps: VisualTapPoint[]): MissPattern {
  if (!taps.length) {
    return { count: 0, leftPct: 0, rightPct: 0, shortPct: 0, longPct: 0, avgX: 0, avgY: 0 };
  }
  let l = 0, r = 0, s = 0, lo = 0, sx = 0, sy = 0;
  for (const t of taps) {
    if (t.x < 0) l += 1; else if (t.x > 0) r += 1;
    if (t.y < 0) s += 1; else if (t.y > 0) lo += 1;
    sx += t.x;
    sy += t.y;
  }
  const n = taps.length;
  return {
    count: n,
    leftPct: Math.round((l / n) * 1000) / 10,
    rightPct: Math.round((r / n) * 1000) / 10,
    shortPct: Math.round((s / n) * 1000) / 10,
    longPct: Math.round((lo / n) * 1000) / 10,
    avgX: Math.round((sx / n) * 100) / 100,
    avgY: Math.round((sy / n) * 100) / 100,
  };
}

export type AccuracyPattern = {
  count: number;
  narrowPct: number;
  onlinePct: number;
  widePct: number;
  shortPct: number;
  jackHighPct: number;
  pastJackPct: number;
};

function pctOf(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
}

export function accuracyPattern(taps: VisualTapPoint[]): AccuracyPattern {
  let n = 0, o = 0, w = 0, s = 0, jh = 0, pj = 0;
  for (const t of taps) {
    if (t.line === "narrow") n += 1;
    else if (t.line === "wide") w += 1;
    else o += 1;
    if (t.weight === "short") s += 1;
    else if (t.weight === "jack_high") jh += 1;
    else pj += 1;
  }
  const total = taps.length;
  return {
    count: total,
    narrowPct: pctOf(n, total),
    onlinePct: pctOf(o, total),
    widePct: pctOf(w, total),
    shortPct: pctOf(s, total),
    jackHighPct: pctOf(jh, total),
    pastJackPct: pctOf(pj, total),
  };
}

export type HandAccuracy = {
  forehand: AccuracyPattern;
  backhand: AccuracyPattern;
};

export function handAccuracy(taps: VisualTapPoint[]): HandAccuracy {
  return {
    forehand: accuracyPattern(taps.filter((t) => t.hand === "forehand")),
    backhand: accuracyPattern(taps.filter((t) => t.hand === "backhand")),
  };
}

export type LengthAccuracy = Record<
  DrawLength,
  { overall: AccuracyPattern; forehand: AccuracyPattern; backhand: AccuracyPattern }
>;

export function lengthAccuracy(taps: VisualTapPoint[]): LengthAccuracy {
  const lengths: DrawLength[] = ["short", "medium", "long"];
  const out = {} as LengthAccuracy;
  for (const len of lengths) {
    const subset = taps.filter((t) => t.length === len);
    out[len] = {
      overall: accuracyPattern(subset),
      forehand: accuracyPattern(subset.filter((t) => t.hand === "forehand")),
      backhand: accuracyPattern(subset.filter((t) => t.hand === "backhand")),
    };
  }
  return out;
}

/** Recent N-days vs older delta for a metric. Returns null if insufficient data. */
export function trendDelta(
  taps: VisualTapPoint[],
  metric: (p: AccuracyPattern) => number,
  recentDays = 30,
): number | null {
  if (taps.length < 6) return null;
  const cutoff = Date.now() - recentDays * 86_400_000;
  const recent = taps.filter((t) => new Date(t.played_at).getTime() >= cutoff);
  const older = taps.filter((t) => new Date(t.played_at).getTime() < cutoff);
  if (recent.length < 3 || older.length < 3) return null;
  return Math.round((metric(accuracyPattern(recent)) - metric(accuracyPattern(older))) * 10) / 10;
}

export function visualInsights(taps: VisualTapPoint[]): string[] {
  if (taps.length < 5) return [];
  const out: string[] = [];
  const overall = accuracyPattern(taps);
  const hands = handAccuracy(taps);

  if (hands.forehand.count >= 5 && hands.forehand.narrowPct >= 30) {
    out.push(`Your forehand is crossing the line ${hands.forehand.narrowPct}% of the time.`);
  }
  if (hands.forehand.count >= 5 && hands.forehand.widePct >= 30) {
    out.push(`Your forehand is missing wide ${hands.forehand.widePct}% of the time.`);
  }
  if (hands.backhand.count >= 5 && hands.backhand.narrowPct >= 30) {
    out.push(`Your backhand is crossing the line ${hands.backhand.narrowPct}% of the time.`);
  }
  if (hands.backhand.count >= 5 && hands.backhand.widePct >= 30) {
    out.push(`Your backhand is missing wide ${hands.backhand.widePct}% of the time.`);
  }

  if (overall.shortPct - overall.pastJackPct >= 15) {
    out.push(`Most of your misses are short (${overall.shortPct}%). Long is a preferable miss.`);
  }
  if (overall.jackHighPct >= 40) {
    out.push(`You are reaching within a mat consistently (${overall.jackHighPct}% within a mat).`);
  }

  const longTaps = taps.filter((t) => t.length === "long");
  if (longTaps.length >= 5) {
    const lp = accuracyPattern(longTaps);
    if (lp.shortPct >= 40) out.push(`Most of your long-draw misses are short (${lp.shortPct}%).`);
    const lh = handAccuracy(longTaps);
    if (lh.backhand.count >= 4 && lh.backhand.widePct >= 35) {
      out.push(`Your backhand is missing wide more often on long ends (${lh.backhand.widePct}%).`);
    }
  }

  const shortTrend = trendDelta(taps, (p) => p.shortPct, 30);
  if (shortTrend != null && shortTrend <= -10) {
    out.push(`Your short bowls have reduced by ${Math.abs(shortTrend)}% over the last 30 days.`);
  }
  const jackHighTrend = trendDelta(taps, (p) => p.jackHighPct, 30);
  if (jackHighTrend != null && jackHighTrend >= 10) {
    out.push(`Your within a mat accuracy is improving (+${jackHighTrend}% over 30 days).`);
  }

  const fh = taps.filter((t) => t.hand === "forehand");
  const bh = taps.filter((t) => t.hand === "backhand");
  if (fh.length >= 3 && bh.length >= 3) {
    const fhAvg = fh.reduce((a, t) => a + t.distance, 0) / fh.length;
    const bhAvg = bh.reduce((a, t) => a + t.distance, 0) / bh.length;
    if (Math.abs(fhAvg - bhAvg) >= 0.15) {
      out.push(
        fhAvg < bhAvg
          ? "Your forehand is more accurate than your backhand."
          : "Your backhand is more accurate than your forehand.",
      );
    }
  }
  return out;
}

export function categoryForDrill(slug: string): CategoryKey | null {
  return DRILL_CATEGORY[slug] ?? null;
}

/** Weighted BSI per category. Returns null score if no results in category. */
export function categoryScores(
  results: Pick<Result, "drill_id" | "percentage" | "bsi">[],
  drills: Pick<Drill, "id" | "slug" | "weight">[],
): Record<CategoryKey, { score: number | null; label: string }> {
  const byDrill = new Map<string, number[]>();
  for (const r of results) {
    const v = r.bsi != null ? Number(r.bsi) : r.percentage != null ? Number(r.percentage) : null;
    if (v == null) continue;
    const arr = byDrill.get(r.drill_id) ?? [];
    arr.push(v);
    byDrill.set(r.drill_id, arr);
  }
  const out = {} as Record<CategoryKey, { score: number | null; label: string }>;
  (Object.keys(CATEGORY_LABELS) as CategoryKey[]).forEach((k) => {
    out[k] = { score: null, label: CATEGORY_LABELS[k] };
  });
  const acc: Record<CategoryKey, { weighted: number; total: number }> = {
    draw: { weighted: 0, total: 0 },
    weight: { weighted: 0, total: 0 },
    conversion: { weighted: 0, total: 0 },
    jack: { weighted: 0, total: 0 },
  };
  for (const d of drills) {
    const cat = categoryForDrill(d.slug);
    if (!cat) continue;
    const vals = byDrill.get(d.id);
    if (!vals?.length) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    acc[cat].weighted += avg * Number(d.weight);
    acc[cat].total += Number(d.weight);
  }
  (Object.keys(acc) as CategoryKey[]).forEach((k) => {
    if (acc[k].total > 0) out[k].score = Math.round((acc[k].weighted / acc[k].total) * 10) / 10;
  });
  return out;

}

// --- Time-window helpers ---

function withinDays(played_at: string, days: number, now = Date.now()): boolean {
  return now - new Date(played_at).getTime() <= days * 86_400_000;
}

export function bsiInWindow(
  results: Result[],
  drills: Pick<Drill, "id" | "weight">[],
  days: number | null,
): number | null {
  const subset = days == null ? results : results.filter((r) => withinDays(r.played_at, days));
  if (!subset.length) return null;
  return overallBSI(subset, drills);
}

export function bsiChange(
  results: Result[],
  drills: Pick<Drill, "id" | "weight">[],
  days: number,
): number | null {
  const recent = bsiInWindow(results, drills, days);
  const all = bsiInWindow(results, drills, null);
  if (recent == null || all == null) return null;
  return Math.round((recent - all) * 10) / 10;
}

export type TrendStatus = "Improving" | "Stable" | "Declining";
export function trendStatus(change: number | null): TrendStatus | null {
  if (change == null) return null;
  if (change > 3) return "Improving";
  if (change < -3) return "Declining";
  return "Stable";
}

export function personalBestBSI(results: Result[]): number | null {
  const vals = results
    .map((r) => (r.bsi != null ? Number(r.bsi) : r.percentage != null ? Number(r.percentage) : null))
    .filter((p): p is number => p != null);
  if (!vals.length) return null;
  return Math.round(Math.max(...vals) * 10) / 10;
}

/** Form rating: compares last 5 sessions to all-time average BSI. */
export function formRating(results: Result[]): { label: "Hot" | "Steady" | "Cooling"; delta: number } | null {
  const vals = results
    .slice()
    .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
    .map((r) => (r.bsi != null ? Number(r.bsi) : r.percentage != null ? Number(r.percentage) : null))
    .filter((p): p is number => p != null);
  if (vals.length < 3) return null;
  const recent = vals.slice(0, 5);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const allAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const delta = Math.round((recentAvg - allAvg) * 10) / 10;
  const label = delta > 3 ? "Hot" : delta < -3 ? "Cooling" : "Steady";
  return { label, delta };
}


/** BSI computed for each played_at date, sorted ascending — for the journey graph. */
export function bsiTimeSeries(
  results: Result[],
  drills: Pick<Drill, "id" | "weight">[],
): { date: string; ts: number; bsi: number }[] {
  const sorted = results.slice().sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());
  const running: Result[] = [];
  const out: { date: string; ts: number; bsi: number }[] = [];
  for (const r of sorted) {
    running.push(r);
    const b = overallBSI(running, drills);
    out.push({ date: new Date(r.played_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }), ts: new Date(r.played_at).getTime(), bsi: b });
  }
  return out;
}

/** Recommends the drill in the weakest category with the lowest avg percentage (or no data). */
export function recommendedDrill(
  results: Result[],
  drills: Drill[],
): { drill: Drill; reasonCategory: string } | null {
  if (!drills.length) return null;
  const cats = categoryScores(results, drills);
  let weakestKey: CategoryKey | null = null;
  let weakestScore = Infinity;
  (Object.keys(cats) as CategoryKey[]).forEach((k) => {
    const s = cats[k].score;
    if (s == null) {
      // untested categories are highest priority
      if (weakestScore !== -1) {
        weakestScore = -1;
        weakestKey = k;
      }
    } else if (weakestScore !== -1 && s < weakestScore) {
      weakestScore = s;
      weakestKey = k;
    }
  });
  if (!weakestKey) return null;
  const categoryDrills = drills.filter((d) => categoryForDrill(d.slug) === weakestKey);
  if (!categoryDrills.length) return null;
  // pick the drill in that category with lowest avg pct (or no data)
  let best = categoryDrills[0];
  let bestScore = Infinity;
  for (const d of categoryDrills) {
    const pcts = results.filter((r) => r.drill_id === d.id && r.percentage != null).map((r) => Number(r.percentage));
    const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : -1;
    if (avg < bestScore) {
      bestScore = avg;
      best = d;
    }
  }
  return { drill: best, reasonCategory: CATEGORY_LABELS[weakestKey] };
}

export function strongestCategory(
  results: Pick<Result, "drill_id" | "percentage" | "bsi">[],
  drills: Pick<Drill, "id" | "slug" | "weight">[],
): { key: CategoryKey; label: string; score: number } | null {
  const cats = categoryScores(results, drills);
  let best: { key: CategoryKey; label: string; score: number } | null = null;
  (Object.keys(cats) as CategoryKey[]).forEach((k) => {
    const s = cats[k].score;
    if (s == null) return;
    if (!best || s > best.score) best = { key: k, label: cats[k].label, score: s };
  });
  return best;
}

export function weakestCategory(
  results: Pick<Result, "drill_id" | "percentage" | "bsi">[],
  drills: Pick<Drill, "id" | "slug" | "weight">[],
): { key: CategoryKey; label: string; score: number } | null {
  const cats = categoryScores(results, drills);
  let worst: { key: CategoryKey; label: string; score: number } | null = null;
  (Object.keys(cats) as CategoryKey[]).forEach((k) => {
    const s = cats[k].score;
    if (s == null) return;
    if (!worst || s < worst.score) worst = { key: k, label: cats[k].label, score: s };
  });
  return worst;
}

// ============================================================================
// PERFORMANCE INSIGHTS — shared analytics engine (Miss Analysis, Zones,
// Weight vs Line, Coaching Focus, Bowling DNA). Used by both the player's
// Progress → Performance Insights view and Coach's Corner.
//
// A "Miss" for analytics purposes is any bowl that finishes outside one mat
// of the jack (distance > 1.0). This includes 1-point bowls at two mats and
// 0-point bowls outside two mats. Half-mat and one-mat bowls are excluded.
// ============================================================================

export type PerformanceZones = {
  count: number;
  elitePct: number;      // Half Mat (5 pt)
  competitivePct: number; // One Mat (3 pt)
  recoveryPct: number;    // Two Mat (1 pt)
  missPct: number;        // Outside one mat (0 or 1 pt, distance > 1.0)
};

export function performanceZones(taps: VisualTapPoint[]): PerformanceZones {
  if (!taps.length) {
    return { count: 0, elitePct: 0, competitivePct: 0, recoveryPct: 0, missPct: 0 };
  }
  let elite = 0, comp = 0, rec = 0, miss = 0;
  for (const t of taps) {
    if (t.distance <= 0.5) elite += 1;
    else if (t.distance <= 1.0) comp += 1;
    else if (t.distance <= 2.0) rec += 1;
    else miss += 1;
  }
  // Miss (analytics) = anything beyond one mat = recovery + outside-two-mat
  const missCount = rec + miss;
  const n = taps.length;
  return {
    count: n,
    elitePct: Math.round((elite / n) * 1000) / 10,
    competitivePct: Math.round((comp / n) * 1000) / 10,
    recoveryPct: Math.round((rec / n) * 1000) / 10,
    missPct: Math.round((missCount / n) * 1000) / 10,
  };
}

/** Bowls that finished outside one mat of the jack. */
export function missedTaps(taps: VisualTapPoint[]): VisualTapPoint[] {
  return taps.filter((t) => t.distance > 1.0);
}

export type MissAnalysis = {
  count: number;
  shortPct: number;
  longPct: number;
  leftPct: number;
  rightPct: number;
  narrowPct: number;
  widePct: number;
};

/** Miss Analysis: only computed over bowls outside one mat. */
export function missAnalysis(taps: VisualTapPoint[]): MissAnalysis {
  const misses = missedTaps(taps);
  const n = misses.length;
  if (!n) {
    return { count: 0, shortPct: 0, longPct: 0, leftPct: 0, rightPct: 0, narrowPct: 0, widePct: 0 };
  }
  let s = 0, lo = 0, le = 0, ri = 0, na = 0, wi = 0;
  for (const t of misses) {
    if (t.y < 0) s += 1; else if (t.y > 0) lo += 1;
    if (t.x < 0) le += 1; else if (t.x > 0) ri += 1;
    if (t.line === "narrow") na += 1;
    else if (t.line === "wide") wi += 1;
  }
  return {
    count: n,
    shortPct: Math.round((s / n) * 1000) / 10,
    longPct: Math.round((lo / n) * 1000) / 10,
    leftPct: Math.round((le / n) * 1000) / 10,
    rightPct: Math.round((ri / n) * 1000) / 10,
    narrowPct: Math.round((na / n) * 1000) / 10,
    widePct: Math.round((wi / n) * 1000) / 10,
  };
}

export type PrimaryIssue = "Weight" | "Line" | "Mixed" | "None";

export type WeightVsLine = {
  weightErrorPct: number; // short + long as % of misses
  lineErrorPct: number;   // narrow + wide as % of misses
  primary: PrimaryIssue;
  reason: string;
};

export function weightVsLine(miss: MissAnalysis): WeightVsLine {
  if (!miss.count) {
    return { weightErrorPct: 0, lineErrorPct: 0, primary: "None", reason: "Not enough miss data yet." };
  }
  const weightErr = Math.round((miss.shortPct + miss.longPct) * 10) / 10;
  const lineErr = Math.round((miss.narrowPct + miss.widePct) * 10) / 10;
  let primary: PrimaryIssue;
  let reason: string;
  const gap = Math.abs(weightErr - lineErr);
  if (gap < 15) {
    primary = "Mixed";
    reason = `Misses are split between weight (${weightErr}%) and line (${lineErr}%).`;
  } else if (weightErr > lineErr) {
    primary = "Weight";
    reason = `${weightErr}% of bowls outside one mat finished short or long.`;
  } else {
    primary = "Line";
    reason = `${lineErr}% of bowls outside one mat missed narrow or wide.`;
  }
  return { weightErrorPct: weightErr, lineErrorPct: lineErr, primary, reason };
}

export type CoachingFocus = {
  title: string;
  why: string;
  recommendedDrillSlugs: string[];
  estimatedBSIImpact: number | null;
};

/**
 * Recommend drills based on the dominant miss pattern.
 * Drill lists mirror the app's actual drill slugs.
 */
export function coachingFocus(
  miss: MissAnalysis,
  wvl: WeightVsLine,
  hands: HandAccuracy,
): CoachingFocus {
  if (miss.count < 5) {
    return {
      title: "Build a baseline",
      why: "Record a few more visual-target sessions so we can pinpoint your biggest miss.",
      recommendedDrillSlugs: ["long-draw", "medium-draw", "short-draw"],
      estimatedBSIImpact: null,
    };
  }
  // Weight-dominant
  if (wvl.primary === "Weight") {
    if (miss.shortPct >= miss.longPct) {
      return {
        title: "Weight Control — reduce short bowls",
        why: `${miss.shortPct}% of your bowls outside one mat finished short.`,
        recommendedDrillSlugs: ["long-draw", "weight-control-ladder", "keep-it-up"],
        estimatedBSIImpact: 2.8,
      };
    }
    return {
      title: "Weight Control — reduce past-jack bowls",
      why: `${miss.longPct}% of your bowls outside one mat finished long.`,
      recommendedDrillSlugs: ["short-draw", "weight-control-ladder", "keep-it-up"],
      estimatedBSIImpact: 2.4,
    };
  }
  // Line-dominant
  if (wvl.primary === "Line") {
    if (miss.narrowPct >= miss.widePct) {
      return {
        title: "Line Control — reduce narrow bowls",
        why: `${miss.narrowPct}% of your bowls outside one mat missed narrow.`,
        recommendedDrillSlugs: ["traffic-jam", "switch-32", "short-draw"],
        estimatedBSIImpact: 2.6,
      };
    }
    return {
      title: "Line Control — reduce wide bowls",
      why: `${miss.widePct}% of your bowls outside one mat missed wide.`,
      recommendedDrillSlugs: ["traffic-jam", "medium-draw", "switch-32"],
      estimatedBSIImpact: 2.5,
    };
  }
  // Mixed — pick weakest hand's dominant issue
  const weakest = (hands.forehand.count && hands.backhand.count)
    ? (hands.forehand.narrowPct + hands.forehand.widePct + hands.forehand.shortPct
       < hands.backhand.narrowPct + hands.backhand.widePct + hands.backhand.shortPct
       ? "backhand" : "forehand")
    : "forehand";
  return {
    title: weakest === "backhand" ? "Balance your Backhand" : "Refine Overall Consistency",
    why: `Misses are split between weight (${wvl.weightErrorPct}%) and line (${wvl.lineErrorPct}%). Focus on your ${weakest}.`,
    recommendedDrillSlugs: ["medium-draw", "slimed", "switch-32"],
    estimatedBSIImpact: 2.0,
  };
}

export type BowlingDNA = {
  label:
    | "Weight Specialist"
    | "Line Specialist"
    | "Balanced Player"
    | "Fast Improver"
    | "Developing Player";
  explanation: string;
};

export function bowlingDNA(
  wvl: WeightVsLine,
  zones: PerformanceZones,
  bsiChg30d: number | null,
): BowlingDNA {
  if (bsiChg30d != null && bsiChg30d >= 5) {
    return {
      label: "Fast Improver",
      explanation: `Your BSI has improved by ${bsiChg30d} points recently — keep the momentum going.`,
    };
  }
  if (zones.count < 10) {
    return {
      label: "Developing Player",
      explanation: "Record a few more visual sessions to unlock your bowling DNA.",
    };
  }
  if (wvl.primary === "Weight") {
    return {
      label: "Line Specialist",
      explanation: "Your line is more consistent than your weight — weight errors are costing points.",
    };
  }
  if (wvl.primary === "Line") {
    return {
      label: "Weight Specialist",
      explanation: "Your weight control is strong, but line errors are costing points.",
    };
  }
  return {
    label: "Balanced Player",
    explanation: "Weight and line are roughly balanced — small gains on either side lift your BSI.",
  };
}

export function smartCoachingInsights(
  miss: MissAnalysis,
  wvl: WeightVsLine,
  hands: HandAccuracy,
): string[] {
  const out: string[] = [];
  if (miss.count === 0) return out;

  if (miss.shortPct >= 40) {
    out.push(`Most of your bowls outside one mat are finishing short (${miss.shortPct}%). Focus on weight before changing your line.`);
  } else if (miss.longPct >= 40) {
    out.push(`Most of your misses are past-jack (${miss.longPct}%). Ease off the weight.`);
  }
  if (wvl.primary === "Line" && miss.narrowPct >= miss.widePct + 10) {
    out.push(`Your line is drifting narrow — ${miss.narrowPct}% of misses cross the line.`);
  }
  if (wvl.primary === "Line" && miss.widePct >= miss.narrowPct + 10) {
    out.push(`Your line is drifting wide — ${miss.widePct}% of misses miss wide of the head.`);
  }
  if (hands.forehand.count >= 5 && hands.backhand.count >= 5) {
    const fhStrong = hands.forehand.jackHighPct + hands.forehand.onlinePct;
    const bhStrong = hands.backhand.jackHighPct + hands.backhand.onlinePct;
    if (fhStrong - bhStrong >= 15) out.push("Your forehand is stronger than your backhand.");
    else if (bhStrong - fhStrong >= 15) out.push("Your backhand is stronger than your forehand.");
  }
  if (wvl.primary === "Weight" && wvl.lineErrorPct <= 20) {
    out.push("Your line is consistent, but weight control is limiting your scores.");
  }
  return out;
}

/** What-If simulator: if a fraction of misses were converted to one-mat bowls. */
export function whatIfMissesConverted(
  taps: VisualTapPoint[],
  missKind: "short" | "long" | "narrow" | "wide",
  fraction: number,
): { deltaAvgPoints: number; deltaBSI: number } {
  if (!taps.length) return { deltaAvgPoints: 0, deltaBSI: 0 };
  const misses = missedTaps(taps);
  const eligible = misses.filter((t) => {
    if (missKind === "short") return t.y < 0;
    if (missKind === "long") return t.y > 0;
    if (missKind === "narrow") return t.line === "narrow";
    return t.line === "wide";
  });
  const convert = Math.round(eligible.length * fraction);
  if (!convert) return { deltaAvgPoints: 0, deltaBSI: 0 };
  // Approximate: each converted bowl gains ~2 points on average (miss ~0/1 → one-mat = 3)
  const pointGain = convert * 2;
  const deltaAvgPoints = Math.round((pointGain / taps.length) * 10) / 10;
  // Rough BSI mapping: +1 avg point ≈ +2 BSI in the mid-range
  const deltaBSI = Math.round(deltaAvgPoints * 2 * 10) / 10;
  return { deltaAvgPoints, deltaBSI };
}

