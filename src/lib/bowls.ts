import { measureVersionOf, type MeasureVersion } from "@/lib/measurement";
import { computeBSI, aggregateOverallBSI } from "@/lib/bsi";

export type ScoringCategory = { key: string; label: string; points: number; note?: string };
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

/**
 * Per-activity active-time cap. A single drill/challenge cannot legitimately
 * exceed this many minutes of active practice; values above this indicate
 * corrupt wall-clock durations (paused/backgrounded overnight etc.) and are
 * clamped so weekly/lifetime totals stay truthful.
 */
export const MAX_ACTIVITY_MINUTES = 60;

export function clampActivityMinutes(m: number | null | undefined): number {
  if (!m || m <= 0) return 0;
  return Math.min(m, MAX_ACTIVITY_MINUTES);
}

export function durationsFor(results: Pick<Result, "played_at" | "duration_minutes">[]) {
  return results
    .filter((r) => typeof r.duration_minutes === "number" && r.duration_minutes! > 0)
    .map((r) => ({ ...r, duration_minutes: clampActivityMinutes(r.duration_minutes) }));
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
  return computeBSI(drillSlug, null, pct);
}

/**
 * Canonical BSI for a saved result.
 *
 * This is a thin adapter over the single BSI engine in `@/lib/bsi`.
 * Draw drills keep their established per-bowl curve (the engine's
 * baseline); every other skill is normalised through the same
 * outcome + difficulty model. No BSI mathematics lives here.
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
  return computeBSI(drillSlug, breakdown, pct);
}


/**
 * Weighted overall BSI. Each drill contributes its mean result BSI,
 * weighted by drill.weight. Drills without recorded results are excluded
 * and remaining weights are renormalised.
 *
 * Aggregation (including the low-sample confidence shrinkage that stops
 * a single first attempt at a hard skill from dominating the index)
 * lives in the canonical engine, `@/lib/bsi`.
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
  return aggregateOverallBSI(
    drills.flatMap((d) => {
      const vals = byDrill.get(d.id);
      if (!vals?.length) return [];
      return [{
        drillId: d.id,
        weight: Number(d.weight),
        mean: vals.reduce((a, b) => a + b, 0) / vals.length,
        count: vals.length,
      }];
    }),
  );
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
  "lead-drill": "draw",
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
  "lead-drill", // Lead Drill — two jacks, same draw scoring categories
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
  /** How the coordinate was entered. Diagnostic only — scoring is identical. */
  entry_method?: "visual_target" | "head_scan";
  /**
   * Internal Head Scan measurement (edge-to-edge, millimetres). Diagnostic and
   * scoring precision only — never rendered to the user, who sees mats.
   */
  gap_mm?: number;
};

export function drawLengthForSlug(slug: string | null | undefined): DrawLength | null {
  if (slug === "short-draw") return "short";
  if (slug === "medium-draw") return "medium";
  if (slug === "long-draw") return "long";
  // weight-control-ladder and lead-drill cycle lengths per bowl — no single length
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
  /**
   * Measurement version of the result this bowl came from.
   * 1 = legacy (absent measure_v), 2 = edge-to-edge physical model.
   *
   * V1 and V2 share the SAME mat-unit coordinate space and the SAME band
   * boundaries (0.5 / 1.0 / 2.0 mats), so every geometry-derived analytic
   * below produces byte-identical output for legacy data. This field exists so
   * that any future V2-only interpretation can branch explicitly instead of
   * silently reinterpreting legacy coordinates.
   */
  measure_v: MeasureVersion;
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
    const measure_v = measureVersionOf(bd);
    for (const b of raw as BowlDetail[]) {
      if (typeof b.x !== "number" || typeof b.y !== "number") continue;
      out.push({
        measure_v,
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

// --- Diagnostic helpers: BSI decomposition & per-session impact ---

export type BSIDrillContribution = {
  drill_id: string;
  drill_name: string;
  category: CategoryKey | null;
  categoryLabel: string | null;
  n: number;
  avg: number;
  weight: number;
  weightShare: number;
  contribution: number;
};

export type BSIBreakdown = {
  rows: BSIDrillContribution[];
  overall: number;
  activeWeight: number;
  totalWeight: number;
  totalResults: number;
};

/** Decompose overall BSI into per-drill contributions (matches overallBSI). */
export function bsiBreakdown(
  results: Pick<Result, "drill_id" | "percentage" | "bsi">[],
  drills: Pick<Drill, "id" | "slug" | "weight" | "name">[],
): BSIBreakdown {
  const byDrill = new Map<string, number[]>();
  for (const r of results) {
    const v = r.bsi != null ? Number(r.bsi) : r.percentage != null ? Number(r.percentage) : null;
    if (v == null) continue;
    const arr = byDrill.get(r.drill_id) ?? [];
    arr.push(v);
    byDrill.set(r.drill_id, arr);
  }
  let activeWeight = 0;
  let totalWeight = 0;
  const raw: Array<Omit<BSIDrillContribution, "weightShare" | "contribution">> = [];
  for (const d of drills) {
    totalWeight += Number(d.weight);
    const vals = byDrill.get(d.id);
    if (!vals?.length) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const cat = categoryForDrill(d.slug);
    activeWeight += Number(d.weight);
    raw.push({
      drill_id: d.id,
      drill_name: d.name,
      category: cat,
      categoryLabel: cat ? CATEGORY_LABELS[cat] : null,
      n: vals.length,
      avg: Math.round(avg * 10) / 10,
      weight: Number(d.weight),
    });
  }
  const rows: BSIDrillContribution[] = raw.map((r) => {
    const share = activeWeight ? r.weight / activeWeight : 0;
    return { ...r, weightShare: share, contribution: Math.round(r.avg * share * 10) / 10 };
  });
  const overall = rows.reduce((s, r) => s + r.avg * r.weightShare, 0);
  return {
    rows: rows.sort((a, b) => b.contribution - a.contribution),
    overall: Math.round(overall * 10) / 10,
    activeWeight,
    totalWeight,
    totalResults: results.length,
  };
}

export type BSISessionImpact = {
  session_id: string | null;
  played_at: string;
  drills: { drill_name: string; bsi: number }[];
  sessionBSI: number;
  overallBefore: number;
  overallAfter: number;
  delta: number;
  cumulativeResults: number;
};

/** For each session (grouped by session_id, or single-result when null),
 *  compute session BSI and the overall BSI before/after that session's
 *  results were included. Returns newest-first. */
export function sessionImpacts(
  results: Array<Pick<Result, "id" | "drill_id" | "drill_name" | "percentage" | "bsi" | "played_at"> & { session_id?: string | null }>,
  drills: Pick<Drill, "id" | "slug" | "weight" | "name">[],
): BSISessionImpact[] {
  const chrono = [...results].sort(
    (a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime(),
  );
  const groups = new Map<string, typeof chrono>();
  const order: string[] = [];
  for (const r of chrono) {
    const key = r.session_id ?? `solo::${r.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(r);
  }
  const acc: typeof chrono = [];
  const out: BSISessionImpact[] = [];
  for (const key of order) {
    const g = groups.get(key)!;
    const overallBefore = overallBSI(acc, drills);
    for (const r of g) acc.push(r);
    const overallAfter = overallBSI(acc, drills);
    const bsis = g
      .map((r) => (r.bsi != null ? Number(r.bsi) : r.percentage != null ? Number(r.percentage) : null))
      .filter((v): v is number => v != null);
    const sessionBSI = bsis.length ? bsis.reduce((a, b) => a + b, 0) / bsis.length : 0;
    out.push({
      session_id: g[0].session_id ?? null,
      played_at: g[0].played_at,
      drills: g.map((r) => ({
        drill_name: r.drill_name ?? "—",
        bsi: r.bsi != null ? Number(r.bsi) : Number(r.percentage ?? 0),
      })),
      sessionBSI: Math.round(sessionBSI * 10) / 10,
      overallBefore: Math.round(overallBefore * 10) / 10,
      overallAfter: Math.round(overallAfter * 10) / 10,
      delta: Math.round((overallAfter - overallBefore) * 10) / 10,
      cumulativeResults: acc.length,
    });
  }
  return out.reverse();
}

// ============================================================================
// PERFORMANCE DASHBOARD 2.0 — coaching-focused helpers
// Deliberately hides weightings/formulas from the UI. Consumers should only
// surface the values below and never the underlying weight math.
// ============================================================================

export type SkillAreaKey =
  | "draw"
  | "weight"
  | "upshots"
  | "running"
  | "driving"
  | "jack";

export const SKILL_AREA_LABELS: Record<SkillAreaKey, string> = {
  draw: "Draw Bowling",
  weight: "Weight Control",
  upshots: "Upshots",
  running: "Running Shots",
  driving: "Driving",
  jack: "Jack Delivery",
};

const DRILL_SKILL_AREA: Record<string, SkillAreaKey> = {
  "short-draw": "draw",
  "medium-draw": "draw",
  "long-draw": "draw",
  "lead-drill": "draw",
  "weight-control-ladder": "weight",
  "keep-it-up": "weight",
  "upshot-drill": "upshots",
  "running-shot-drill": "running",
  "drive-accuracy": "driving",
  "jack-in-ditch": "driving",
  "jack-delivery-accuracy": "jack",
};

export function skillAreaForDrill(slug: string): SkillAreaKey | null {
  return DRILL_SKILL_AREA[slug] ?? null;
}

type MinResult = Pick<Result, "drill_id" | "percentage" | "bsi" | "played_at">;
type MinDrill = Pick<Drill, "id" | "slug" | "weight" | "name">;

function resultValue(r: Pick<Result, "bsi" | "percentage">): number | null {
  const v = r.bsi != null ? Number(r.bsi) : r.percentage != null ? Number(r.percentage) : null;
  return Number.isFinite(v as number) ? (v as number) : null;
}

function weightedAvgByDrill(
  results: MinResult[],
  drills: MinDrill[],
): number | null {
  const byDrill = new Map<string, number[]>();
  for (const r of results) {
    const v = resultValue(r);
    if (v == null) continue;
    const arr = byDrill.get(r.drill_id) ?? [];
    arr.push(v);
    byDrill.set(r.drill_id, arr);
  }
  let w = 0, tot = 0;
  for (const d of drills) {
    const vals = byDrill.get(d.id);
    if (!vals?.length) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    w += avg * Number(d.weight);
    tot += Number(d.weight);
  }
  if (!tot) return null;
  return Math.round((w / tot) * 10) / 10;
}

export type SkillAreaScore = {
  key: SkillAreaKey;
  label: string;
  score: number | null;
  trend: TrendStatus | null;
  sessions: number;
};

/** Skill-area BSI (weighted average of contributing drills) + 30d vs older trend. */
export function skillAreaScores(
  results: MinResult[],
  drills: MinDrill[],
): SkillAreaScore[] {
  const drillsByArea = new Map<SkillAreaKey, MinDrill[]>();
  for (const d of drills) {
    const a = skillAreaForDrill(d.slug);
    if (!a) continue;
    const arr = drillsByArea.get(a) ?? [];
    arr.push(d);
    drillsByArea.set(a, arr);
  }
  const areaKeys = Object.keys(SKILL_AREA_LABELS) as SkillAreaKey[];
  const now = Date.now();
  return areaKeys.map((k) => {
    const areaDrills = drillsByArea.get(k) ?? [];
    const areaDrillIds = new Set(areaDrills.map((d) => d.id));
    const areaResults = results.filter((r) => areaDrillIds.has(r.drill_id));
    const score = weightedAvgByDrill(areaResults, areaDrills);
    let trend: TrendStatus | null = null;
    if (areaResults.length >= 3) {
      const recent = areaResults.filter((r) => now - new Date(r.played_at).getTime() <= 30 * 86_400_000);
      const older = areaResults.filter((r) => {
        const t = now - new Date(r.played_at).getTime();
        return t > 30 * 86_400_000 && t <= 90 * 86_400_000;
      });
      const rAvg = weightedAvgByDrill(recent, areaDrills);
      const oAvg = weightedAvgByDrill(older, areaDrills);
      if (rAvg != null && oAvg != null) trend = trendStatus(Math.round((rAvg - oAvg) * 10) / 10);
      else if (rAvg != null && score != null) trend = trendStatus(Math.round((rAvg - score) * 10) / 10);
    }
    return { key: k, label: SKILL_AREA_LABELS[k], score, trend, sessions: areaResults.length };
  });
}

// ---------- Form (5 states) ----------

export type FormState = "Hot" | "Improving" | "Stable" | "Declining" | "Cold";

export type FormReading = {
  label: FormState;
  delta: number;
  sample: number;
};

export function currentForm(results: MinResult[]): FormReading | null {
  const vals = results
    .slice()
    .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
    .map((r) => resultValue(r))
    .filter((v): v is number => v != null);
  if (vals.length < 3) return null;
  const recent = vals.slice(0, 5);
  const rest = vals.slice(5, 15);
  const baseline = rest.length ? rest : vals;
  const rAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const bAvg = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  const delta = Math.round((rAvg - bAvg) * 10) / 10;
  let label: FormState;
  if (delta >= 6) label = "Hot";
  else if (delta >= 2) label = "Improving";
  else if (delta > -2) label = "Stable";
  else if (delta > -6) label = "Declining";
  else label = "Cold";
  return { label, delta, sample: recent.length };
}

// ---------- Consistency ----------

export type ConsistencyReading = {
  score: number;
  label: "Excellent" | "Strong" | "Steady" | "Variable" | "Erratic";
  sample: number;
};

export function consistencyRating(results: MinResult[]): ConsistencyReading | null {
  const vals = results
    .slice()
    .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
    .map((r) => resultValue(r))
    .filter((v): v is number => v != null)
    .slice(0, 15);
  if (vals.length < 3) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  const sd = Math.sqrt(variance);
  const score = Math.max(0, Math.min(100, Math.round(100 - sd * 4)));
  let label: ConsistencyReading["label"];
  if (score >= 85) label = "Excellent";
  else if (score >= 70) label = "Strong";
  else if (score >= 55) label = "Steady";
  else if (score >= 40) label = "Variable";
  else label = "Erratic";
  return { score, label, sample: vals.length };
}

// ---------- Personal bests ----------

export type PersonalBests = {
  overall: number | null;
  drawRating: number | null;
  bestConsistency: number | null;
  improvingStreakWeeks: number;
};

export function personalBests(
  results: MinResult[],
  drills: MinDrill[],
): PersonalBests {
  const overall = personalBestBSI(results as Result[]);
  const drawDrillIds = new Set(
    drills.filter((d) => skillAreaForDrill(d.slug) === "draw").map((d) => d.id),
  );
  const drawResults = results.filter((r) => drawDrillIds.has(r.drill_id));
  const drawVals = drawResults.map(resultValue).filter((v): v is number => v != null);
  const drawRating = drawVals.length ? Math.round(Math.max(...drawVals) * 10) / 10 : null;

  let bestC: number | null = null;
  const sorted = results
    .slice()
    .sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());
  for (let i = 15; i <= sorted.length; i++) {
    const c = consistencyRating(sorted.slice(i - 15, i));
    if (c && (bestC == null || c.score > bestC)) bestC = c.score;
  }

  const byWeek = new Map<number, number[]>();
  for (const r of sorted) {
    const v = resultValue(r);
    if (v == null) continue;
    const wk = startOfWeek(new Date(r.played_at)).getTime();
    const arr = byWeek.get(wk) ?? [];
    arr.push(v);
    byWeek.set(wk, arr);
  }
  const weekKeys = Array.from(byWeek.keys()).sort((a, b) => a - b);
  let streak = 0, best = 0, prev: number | null = null;
  for (const k of weekKeys) {
    const arr = byWeek.get(k)!;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (prev == null || avg >= prev - 0.5) streak += 1;
    else streak = 1;
    if (streak > best) best = streak;
    prev = avg;
  }

  return { overall, drawRating, bestConsistency: bestC, improvingStreakWeeks: best };
}

// ---------- Weekly BSI movement ----------

export type BSIMovement = {
  previous: number | null;
  current: number;
  weeklyChange: number | null;
  drivers: string[];
};

export function bsiMovement(
  results: MinResult[],
  drills: MinDrill[],
): BSIMovement {
  const now = Date.now();
  const current = overallBSI(results as Result[], drills);
  const weekAgo = now - 7 * 86_400_000;
  const priorResults = results.filter((r) => new Date(r.played_at).getTime() <= weekAgo);
  const previous = priorResults.length ? overallBSI(priorResults as Result[], drills) : null;
  const weeklyChange = previous == null ? null : Math.round((current - previous) * 10) / 10;

  const drivers: string[] = [];
  if (weeklyChange != null && Math.abs(weeklyChange) >= 0.2) {
    const areas = skillAreaScores(results as Result[], drills);
    for (const a of areas) {
      if (a.score == null) continue;
      const areaDrillIds = new Set(
        drills.filter((d) => skillAreaForDrill(d.slug) === a.key).map((d) => d.id),
      );
      const recent = results.filter(
        (r) => areaDrillIds.has(r.drill_id) && new Date(r.played_at).getTime() >= weekAgo,
      );
      if (recent.length < 1) continue;
      const rVals = recent.map(resultValue).filter((v): v is number => v != null);
      if (!rVals.length) continue;
      const rAvg = rVals.reduce((s, v) => s + v, 0) / rVals.length;
      const diff = rAvg - a.score;
      if (weeklyChange > 0 && diff >= 2) drivers.push(`stronger ${a.label.toLowerCase()}`);
      if (weeklyChange < 0 && diff <= -2) drivers.push(`weaker ${a.label.toLowerCase()}`);
    }
  }
  return { previous, current, weeklyChange, drivers: drivers.slice(0, 3) };
}

// ---------- Practice priorities ----------

export type PracticePriority = {
  key: SkillAreaKey;
  label: string;
  stars: 1 | 2 | 3 | 4 | 5;
  reason: string;
};

export function practicePriorities(
  results: MinResult[],
  drills: MinDrill[],
): PracticePriority[] {
  const areas = skillAreaScores(results as Result[], drills);
  const scored = areas.map((a) => {
    let priority = 0;
    if (a.score == null) priority = 60;
    else priority = Math.max(0, 90 - a.score);
    if (a.trend === "Declining") priority += 15;
    if (a.trend === "Improving") priority -= 8;
    if (a.sessions < 3) priority += 5;
    return { area: a, priority };
  });
  const sorted = scored.slice().sort((a, b) => b.priority - a.priority);
  const max = sorted[0]?.priority ?? 1;
  return sorted.map((s) => {
    const ratio = max > 0 ? s.priority / max : 0;
    const stars = (Math.max(1, Math.min(5, Math.round(ratio * 5))) as 1 | 2 | 3 | 4 | 5);
    let reason: string;
    if (s.area.score == null) reason = "Not enough data yet — record a session.";
    else if (s.area.trend === "Declining") reason = "Recent form has dipped.";
    else if (s.area.score < 55) reason = "Currently your weakest skill area.";
    else if (s.area.score < 70) reason = "Room to grow here.";
    else reason = "Maintenance — keep it sharp.";
    return { key: s.area.key, label: s.area.label, stars, reason };
  });
}

// ---------- Recommended drill (v2) ----------

export type RecommendedDrillV2 = {
  drill: Drill;
  skillArea: SkillAreaKey;
  skillAreaLabel: string;
  estimatedMinutes: number;
  reason: string;
};

const DEFAULT_DRILL_MINUTES = 15;

export function recommendedDrillV2(
  results: MinResult[],
  drills: Drill[],
): RecommendedDrillV2 | null {
  if (!drills.length) return null;
  const priorities = practicePriorities(results, drills);
  const now = Date.now();
  const recentDrillIds = new Map<string, number>();
  for (const r of results) {
    const t = new Date(r.played_at).getTime();
    const prev = recentDrillIds.get(r.drill_id) ?? 0;
    if (t > prev) recentDrillIds.set(r.drill_id, t);
  }
  for (const p of priorities) {
    const candidates = drills.filter((d) => skillAreaForDrill(d.slug) === p.key);
    if (!candidates.length) continue;
    const ranked = candidates
      .map((d) => {
        const drillResults = results.filter((r) => r.drill_id === d.id);
        const vals = drillResults.map(resultValue).filter((v): v is number => v != null);
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        const lastAt = recentDrillIds.get(d.id) ?? 0;
        const daysSince = lastAt ? (now - lastAt) / 86_400_000 : 9999;
        return { d, avg: avg ?? -1, daysSince, sessions: vals.length };
      })
      .sort((a, b) => {
        if ((a.sessions === 0) !== (b.sessions === 0)) return a.sessions === 0 ? -1 : 1;
        if (a.daysSince >= 3 && b.daysSince < 3) return -1;
        if (b.daysSince >= 3 && a.daysSince < 3) return 1;
        return a.avg - b.avg;
      });
    const pick = ranked[0].d;
    return {
      drill: pick,
      skillArea: p.key,
      skillAreaLabel: p.label,
      estimatedMinutes: DEFAULT_DRILL_MINUTES,
      reason:
        p.stars >= 4
          ? "This drill currently offers the greatest opportunity to improve your overall performance."
          : "A focused session here will nudge your overall game forward.",
    };
  }
  return null;
}

// ---------- Coach summary ----------

export function coachSummary(
  results: MinResult[],
  drills: Drill[],
): string {
  if (!results.length) {
    return "Record a few drill sessions and your coach summary will appear here — the more data, the sharper the advice.";
  }
  const overall = overallBSI(results as Result[], drills);
  const level = bsiLevel(overall).label.toLowerCase();
  const areas = skillAreaScores(results as Result[], drills);
  const rated = areas.filter((a) => a.score != null) as (SkillAreaScore & { score: number })[];
  const strongest = rated.slice().sort((a, b) => b.score - a.score)[0];
  const weakest = rated.slice().sort((a, b) => a.score - b.score)[0];
  const form = currentForm(results);
  const rec = recommendedDrillV2(results, drills);

  const parts: string[] = [];
  parts.push(
    overall >= 70
      ? `You're bowling at a ${level} level and the fundamentals are holding up well.`
      : overall >= 55
        ? `You're settling into a solid ${level} game.`
        : `You're building the foundations — every recorded session is sharpening your ${level} game.`,
  );
  if (strongest) parts.push(`Your ${strongest.label.toLowerCase()} remains a strength.`);
  if (weakest && (!strongest || weakest.key !== strongest.key)) {
    if (weakest.trend === "Declining") parts.push(`Recent ${weakest.label.toLowerCase()} has slipped a little.`);
    else parts.push(`Your ${weakest.label.toLowerCase()} is the biggest area to improve.`);
  }
  if (form) {
    if (form.label === "Hot") parts.push("Form is red hot — keep riding the wave.");
    else if (form.label === "Improving") parts.push("Form is trending up.");
    else if (form.label === "Declining") parts.push("Form has cooled recently — a focused session will help reset.");
    else if (form.label === "Cold") parts.push("Recent form has dipped — start with a short, achievable session to rebuild rhythm.");
  }
  if (rec) parts.push(`A focused ${rec.drill.name} session this week is likely to have the biggest impact.`);
  return parts.join(" ");
}

// ---------- Skill detail ----------

export type SkillDrillStat = {
  drill_id: string;
  drill_name: string;
  latest: number | null;
  avg30d: number | null;
  lifetimeAvg: number | null;
  lifetimeBest: number | null;
  sessions: number;
};

export type SkillDetail = {
  key: SkillAreaKey;
  label: string;
  overall: number | null;
  form: FormReading | null;
  consistency: ConsistencyReading | null;
  drills: SkillDrillStat[];
  handSplit: { forehand: number | null; backhand: number | null } | null;
  insight: string;
};

function drillStat(drill: MinDrill, results: MinResult[]): SkillDrillStat {
  const drillResults = results
    .filter((r) => r.drill_id === drill.id)
    .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());
  const vals = drillResults.map(resultValue).filter((v): v is number => v != null);
  const now = Date.now();
  const recent = drillResults.filter((r) => now - new Date(r.played_at).getTime() <= 30 * 86_400_000);
  const recentVals = recent.map(resultValue).filter((v): v is number => v != null);
  return {
    drill_id: drill.id,
    drill_name: drill.name,
    latest: vals.length ? Math.round(vals[0] * 10) / 10 : null,
    avg30d: recentVals.length ? Math.round((recentVals.reduce((a, b) => a + b, 0) / recentVals.length) * 10) / 10 : null,
    lifetimeAvg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null,
    lifetimeBest: vals.length ? Math.round(Math.max(...vals) * 10) / 10 : null,
    sessions: vals.length,
  };
}

export function skillDetail(
  key: SkillAreaKey,
  results: (MinResult & { breakdown?: unknown })[],
  drills: Drill[],
): SkillDetail {
  const areaDrills = drills.filter((d) => skillAreaForDrill(d.slug) === key);
  const areaDrillIds = new Set(areaDrills.map((d) => d.id));
  const areaResults = results.filter((r) => areaDrillIds.has(r.drill_id));
  const overall = weightedAvgByDrill(areaResults, areaDrills);
  const form = currentForm(areaResults);
  const consistency = consistencyRating(areaResults);
  const drillStats = areaDrills.map((d) => drillStat(d, areaResults));

  let handSplit: SkillDetail["handSplit"] = null;
  if (key === "draw") {
    const drawIds = new Set(areaDrills.filter((d) => isDrawDrillSlug(d.slug)).map((d) => d.id));
    let fhP = 0, fhN = 0, bhP = 0, bhN = 0;
    const MAX = 5;
    for (const r of areaResults) {
      if (!drawIds.has(r.drill_id)) continue;
      const bd = (r.breakdown ?? {}) as Record<string, unknown>;
      const raw = bd.bowls;
      if (!Array.isArray(raw)) continue;
      for (const b of raw as BowlDetail[]) {
        if (b.hand === "forehand") { fhP += b.points; fhN += 1; }
        else if (b.hand === "backhand") { bhP += b.points; bhN += 1; }
      }
    }
    handSplit = {
      forehand: fhN ? Math.round((fhP / (fhN * MAX)) * 1000) / 10 : null,
      backhand: bhN ? Math.round((bhP / (bhN * MAX)) * 1000) / 10 : null,
    };
  }

  let insight = "";
  if (!areaResults.length) {
    insight = `Record a session in ${SKILL_AREA_LABELS[key]} to unlock diagnostics and coaching guidance.`;
  } else {
    const bits: string[] = [];
    if (overall != null && overall >= 75) bits.push(`Your ${SKILL_AREA_LABELS[key].toLowerCase()} remains one of your stronger areas.`);
    else if (overall != null && overall >= 60) bits.push(`Your ${SKILL_AREA_LABELS[key].toLowerCase()} is steady and reliable.`);
    else if (overall != null) bits.push(`Your ${SKILL_AREA_LABELS[key].toLowerCase()} has room to grow.`);
    if (form?.label === "Declining" || form?.label === "Cold") bits.push("Recent sessions show reduced consistency here.");
    else if (form?.label === "Improving" || form?.label === "Hot") bits.push("Recent sessions show real momentum — keep it going.");
    if (handSplit) {
      const { forehand: fh, backhand: bh } = handSplit;
      if (fh != null && bh != null && Math.abs(fh - bh) >= 8) {
        bits.push(fh > bh
          ? "Backhand accuracy trails your forehand — that's the fastest path to lift your draw game."
          : "Forehand accuracy trails your backhand — sharpening the forehand will lift your overall draw game.");
      }
    }
    const rated = drillStats.filter((d) => d.lifetimeAvg != null);
    if (rated.length >= 2) {
      const weak = rated.slice().sort((a, b) => (a.lifetimeAvg ?? 0) - (b.lifetimeAvg ?? 0))[0];
      bits.push(`Improving ${weak.drill_name} accuracy is currently the best opportunity here.`);
    }
    insight = bits.join(" ");
  }

  return {
    key,
    label: SKILL_AREA_LABELS[key],
    overall: overall != null ? Math.round(overall * 10) / 10 : null,
    form,
    consistency,
    drills: drillStats,
    handSplit,
    insight,
  };
}

// ---------- Achievement progress ----------

export type AchievementProgress = {
  label: string;
  progress: number;
  target: number;
  done: boolean;
};

export function achievementProgress(
  results: MinResult[],
  drills: MinDrill[],
): AchievementProgress[] {
  const areas = skillAreaScores(results as Result[], drills);
  const drawArea = areas.find((a) => a.key === "draw");
  const weakest = areas
    .filter((a) => a.score != null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];

  const drawTarget = 80;
  const drawProgress = drawArea?.score != null ? Math.min(drawTarget, Math.round(drawArea.score)) : 0;

  const mediumDrillId = drills.find((d) => d.slug === "medium-draw")?.id;
  const mediumSessions = mediumDrillId
    ? results.filter((r) => r.drill_id === mediumDrillId).length
    : 0;

  const out: AchievementProgress[] = [
    {
      label: `Improve ${SKILL_AREA_LABELS.draw} to ${drawTarget}`,
      progress: drawProgress,
      target: drawTarget,
      done: drawProgress >= drawTarget,
    },
    {
      label: "Complete 5 Medium Draw sessions",
      progress: Math.min(5, mediumSessions),
      target: 5,
      done: mediumSessions >= 5,
    },
  ];
  if (weakest) {
    const targ = 70;
    const prog = weakest.score != null ? Math.min(targ, Math.round(weakest.score)) : 0;
    out.push({
      label: `Lift ${weakest.label} to ${targ}`,
      progress: prog,
      target: targ,
      done: prog >= targ,
    });
  }
  return out;
}


// ============================================================================
// FINISH ZONES — revised zone taxonomy.
//   Elite       : within ½ mat of the jack
//   Competitive : within 1 mat of the jack (short or long)
//   Good Miss   : long only, more than 1 mat past the jack but within 2 mats,
//                 AND within 1 mat of the centre line (line still honest)
//   Miss        : everything else (short outside 1 mat, long outside 2 mats,
//                 or more than 1 mat wide regardless of weight)
// ============================================================================

export type FinishZones = {
  count: number;
  elitePct: number;
  competitivePct: number;
  goodMissPct: number;
  missPct: number;
  eliteCount: number;
  competitiveCount: number;
  goodMissCount: number;
  missCount: number;
};

export function finishZones(taps: VisualTapPoint[]): FinishZones {
  const n = taps.length;
  if (!n) {
    return {
      count: 0, elitePct: 0, competitivePct: 0, goodMissPct: 0, missPct: 0,
      eliteCount: 0, competitiveCount: 0, goodMissCount: 0, missCount: 0,
    };
  }
  let elite = 0, comp = 0, good = 0, miss = 0;
  for (const t of taps) {
    const sideOff = Math.abs(t.x); // mats off centre
    if (sideOff > 1) { miss += 1; continue; } // more than 1 mat wide is always Miss
    if (t.distance <= 0.5) { elite += 1; continue; }
    if (t.distance <= 1.0) { comp += 1; continue; }
    // outside 1 mat: check long-only "Good Miss" band
    if (t.y > 1 && t.y <= 2) { good += 1; continue; }
    miss += 1;
  }
  const pct = (v: number) => Math.round((v / n) * 1000) / 10;
  return {
    count: n,
    elitePct: pct(elite),
    competitivePct: pct(comp),
    goodMissPct: pct(good),
    missPct: pct(miss),
    eliteCount: elite,
    competitiveCount: comp,
    goodMissCount: good,
    missCount: miss,
  };
}

// ============================================================================
// COACH'S SUMMARY — actionable bullets built from Visual Target data.
// ============================================================================

export function coachSummaryBullets(taps: VisualTapPoint[]): string[] {
  if (taps.length < 5) return [];
  const zones = finishZones(taps);
  const miss = missAnalysis(taps);
  const wvl = weightVsLine(miss);
  const outsidePct = Math.round((zones.goodMissPct + zones.missPct) * 10) / 10;
  const bullets: string[] = [];

  bullets.push(
    `${outsidePct}% of your bowls finished outside the scoring zones (more than one mat from the jack).`,
  );

  if (miss.count > 0) {
    // Weight involvement in misses = short + long (each miss has weight error if outside 1 mat vertically)
    // Line involvement = narrow or wide classification.
    const weightInvolved = Math.min(100, Math.round((miss.shortPct + miss.longPct) * 10) / 10);
    const lineInvolved = Math.round((miss.narrowPct + miss.widePct) * 10) / 10;
    if (weightInvolved >= 95) {
      bullets.push("Every miss involved incorrect weight.");
    } else if (weightInvolved > 0) {
      bullets.push(`Weight was involved in ${weightInvolved}% of misses.`);
    }
    if (lineInvolved > 0) {
      bullets.push(`Line was involved in ${lineInvolved}% of misses.`);
    }
    // Dominant weight direction
    if (miss.shortPct >= miss.longPct + 10) {
      bullets.push("Most misses finished short of the jack.");
    } else if (miss.longPct >= miss.shortPct + 10) {
      bullets.push("Most misses ran past the jack.");
    }
    // Line quality
    if (lineInvolved < 30 && miss.count >= 5) {
      bullets.push("Your line consistency is strong.");
    } else if (miss.narrowPct >= miss.widePct + 15) {
      bullets.push("Your line tends to drift narrow.");
    } else if (miss.widePct >= miss.narrowPct + 15) {
      bullets.push("Your line tends to drift wide.");
    }
  }

  // Actionable focus
  if (wvl.primary === "Weight") {
    bullets.push("Focus your next practice session on length control rather than changing your line.");
  } else if (wvl.primary === "Line") {
    bullets.push("Focus your next practice session on line control — your weight is honest.");
  } else if (wvl.primary === "Mixed") {
    bullets.push("Alternate short weight-control ends with narrow-target line drills to attack both areas.");
  }
  return bullets;
}

// Actionable "Bowling DNA" insight — plain English, tells the player what to do.
export function bowlingDNAActionable(taps: VisualTapPoint[]): string {
  if (taps.length < 10) {
    return "Record a few more visual-target sessions to unlock personalised Bowling DNA coaching.";
  }
  const miss = missAnalysis(taps);
  const wvl = weightVsLine(miss);
  const zones = finishZones(taps);
  if (zones.elitePct + zones.competitivePct >= 65) {
    return "You're finishing inside scoring range consistently. Sharpen your half-mat weight to lift more bowls into the Elite zone.";
  }
  if (wvl.primary === "Weight") {
    return "Your line is consistently stronger than your weight. Improving your length control will produce the biggest improvement in scoring.";
  }
  if (wvl.primary === "Line") {
    return "Your weight is consistently stronger than your line. Working on line control will produce the biggest improvement in scoring.";
  }
  if (wvl.primary === "Mixed") {
    return "Weight and line errors are appearing in roughly equal measure. Alternate short weight-control and line-control drills to attack both.";
  }
  return "Keep recording sessions — as your pattern settles we'll tell you exactly what to work on.";
}

// ============================================================
// HAND-SWITCH ANALYSIS
// Detects whether players lose weight (or line) on the first bowl
// delivered immediately after switching hands within a single
// continuous activity. Only compares consecutive deliveries inside
// the same result — never across activities.
// ============================================================

export type HandSwitchDirectionStats = {
  n: number;             // number of transitions in this direction
  shortPct: number;      // % finishing short (y < 0)
  longPct: number;       // % finishing long (y > 0)
  narrowPct: number;     // % of misses missing narrow
  widePct: number;       // % of misses missing wide
  onlinePct: number;     // % within one mat of the centre line
  jackHighPct: number;   // % within weight tol of jack
  competitivePct: number;// % within one mat (weight OR line) of jack
  avgPoints: number;     // 0–5 average
};

export type HandSwitchAnalysis = {
  fhToBh: HandSwitchDirectionStats;
  bhToFh: HandSwitchDirectionStats;
  sameHand: HandSwitchDirectionStats; // baseline: consecutive bowls on same hand
  overall: HandSwitchDirectionStats;  // all switched bowls combined
  totalTransitions: number;
};

const EMPTY_HS_STATS: HandSwitchDirectionStats = {
  n: 0, shortPct: 0, longPct: 0, narrowPct: 0, widePct: 0,
  onlinePct: 0, jackHighPct: 0, competitivePct: 0, avgPoints: 0,
};

type HSSample = {
  x?: number; y?: number;
  hand: "forehand" | "backhand";
  points: number;
};

function summariseHS(samples: HSSample[]): HandSwitchDirectionStats {
  if (!samples.length) return { ...EMPTY_HS_STATS };
  let short = 0, long = 0, narrow = 0, wide = 0, online = 0, jackHigh = 0, competitive = 0;
  let visual = 0, pts = 0;
  for (const s of samples) {
    pts += s.points;
    if (typeof s.x === "number" && typeof s.y === "number") {
      visual += 1;
      const w = classifyWeight(s.y);
      const l = classifyLine(s.x, s.hand);
      if (s.y < -WEIGHT_TOL) short += 1;
      else if (s.y > WEIGHT_TOL) long += 1;
      if (l === "narrow") narrow += 1;
      else if (l === "wide") wide += 1;
      else online += 1;
      if (w === "jack_high") jackHigh += 1;
      if (w === "jack_high" || l === "online") competitive += 1;
    }
  }
  const denom = visual || 1;
  return {
    n: samples.length,
    shortPct: pctOf(short, denom),
    longPct: pctOf(long, denom),
    narrowPct: pctOf(narrow, denom),
    widePct: pctOf(wide, denom),
    onlinePct: pctOf(online, denom),
    jackHighPct: pctOf(jackHigh, denom),
    competitivePct: pctOf(competitive, denom),
    avgPoints: Math.round((pts / samples.length) * 10) / 10,
  };
}

/**
 * Analyse hand-switch performance across recorded draw drill results.
 * Only consecutive deliveries WITHIN the same result are compared.
 */
export function handSwitchAnalysis(
  results: Pick<Result, "drill_id" | "breakdown">[],
  drawDrillIds: Set<string>,
): HandSwitchAnalysis {
  const fhToBh: HSSample[] = [];
  const bhToFh: HSSample[] = [];
  const sameHand: HSSample[] = [];
  for (const r of results) {
    if (!drawDrillIds.has(r.drill_id)) continue;
    const bd = (r.breakdown ?? {}) as Record<string, unknown>;
    const raw = bd.bowls;
    if (!Array.isArray(raw)) continue;
    // Sort by end asc then bowl asc to reconstruct delivery order.
    const ordered = (raw as BowlDetail[]).slice().sort((a, b) => {
      if (a.end !== b.end) return a.end - b.end;
      return a.bowl - b.bowl;
    });
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const cur = ordered[i];
      if (!prev?.hand || !cur?.hand) continue;
      const sample: HSSample = { x: cur.x, y: cur.y, hand: cur.hand, points: cur.points ?? 0 };
      if (prev.hand !== cur.hand) {
        if (prev.hand === "forehand") fhToBh.push(sample);
        else bhToFh.push(sample);
      } else {
        sameHand.push(sample);
      }
    }
  }
  const all = fhToBh.concat(bhToFh);
  return {
    fhToBh: summariseHS(fhToBh),
    bhToFh: summariseHS(bhToFh),
    sameHand: summariseHS(sameHand),
    overall: summariseHS(all),
    totalTransitions: all.length,
  };
}

/**
 * Produce coach-voiced insights from a HandSwitchAnalysis.
 * Uses sample-size thresholds:
 *   < 5 transitions  → no insight
 *   5–9 transitions  → cautious language only if signal is large
 *   10+ transitions  → confident language when the gap vs same-hand is meaningful
 */
export function handSwitchCoachInsights(a: HandSwitchAnalysis): string[] {
  const out: string[] = [];
  const baseline = a.sameHand.n >= 5 ? a.sameHand.shortPct : null;

  function directionInsight(
    dir: HandSwitchDirectionStats,
    label: "forehand to backhand" | "backhand to forehand",
  ) {
    if (dir.n < 5) return;
    const gap = baseline != null ? dir.shortPct - baseline : null;
    const confident = dir.n >= 10;

    // Short-bowl weakness on switch
    if (dir.shortPct >= 45 && (gap == null || gap >= 10)) {
      if (confident) {
        out.push(
          baseline != null
            ? `Here's one to work on: when you switch from ${label}, ${dir.shortPct}% of the next bowl finishes short — well up on your normal short rate of ${baseline}%. Give yourself a moment to reset and commit to the same weight when you change your line.`
            : `Here's one to work on: ${dir.shortPct}% of your first bowls after switching from ${label} finish short. Commit to the weight as you reset the line.`
        );
      } else {
        out.push(
          `Something I've noticed — small sample so far, but you're leaving quite a few bowls short right after switching from ${label}. Worth keeping an eye on as more data comes in.`
        );
      }
      return;
    }
    // Long-bowl weakness on switch
    if (dir.longPct >= 45 && dir.longPct - dir.shortPct >= 15) {
      out.push(
        confident
          ? `When you switch from ${label} you're tending to overweight the first bowl — ${dir.longPct}% finish past the jack. Ease off just a touch as you reset the line.`
          : `Early signal: your first bowl after switching from ${label} is tending long. Worth watching over the next few practices.`
      );
      return;
    }
    // Positive — switching looks solid
    if (confident && baseline != null && Math.abs(dir.shortPct - baseline) <= 5 && dir.competitivePct >= 55) {
      out.push(
        `You're switching from ${label} really well — accuracy right after the change is almost identical to your normal draw.`
      );
    }
  }

  directionInsight(a.fhToBh, "forehand to backhand");
  directionInsight(a.bhToFh, "backhand to forehand");
  return out;
}

/**
 * Rewrites a set of coaching lines in the Bowl Trainer coach voice:
 * positive, casual, specific — never robotic. Purely stylistic; the
 * underlying facts and percentages are preserved.
 */
export function applyCoachVoice(lines: string[]): string[] {
  const openers = ["Nice work — ", "Good stuff — ", "Here's one to work on: ", "Something I've noticed — "];
  return lines.map((raw, i) => {
    let s = raw.trim();
    // Strip clinical prefixes
    s = s.replace(/^Analysis[:.]\s*/i, "").replace(/^Recommendation[:.]\s*/i, "");
    // Soften absolute negatives
    s = s.replace(/\bis poor\b/gi, "has room to grow")
         .replace(/\bis weak\b/gi, "is worth working on")
         .replace(/\bbelow average\b/gi, "costing you a few bowls at the moment");
    // Avoid stacked exclamation marks
    s = s.replace(/!+/g, ".");
    // Only prepend a natural opener if the line doesn't already start conversationally.
    const lower = s.toLowerCase();
    const alreadyCasual = /^(nice|good|here|something|that|your|you|keep|worth)\b/.test(lower);
    if (!alreadyCasual) s = openers[i % openers.length] + s.charAt(0).toLowerCase() + s.slice(1);
    return s;
  });
}








/**
 * LEAD DRILL — two jacks, alternating target each bowl.
 * Bowls 1 & 3 are measured against the FRONT jack, bowls 2 & 4 against the
 * BACK jack (one mat length behind). Scoring is the standard draw scoring.
 */
export const LEAD_DRILL_SLUG = "lead-drill";
export const LEAD_DRILL_BOWL_TARGETS = [
  "Front jack",
  "Back jack",
  "Front jack",
  "Back jack",
] as const;
export function leadDrillTargetFor(bowlIndex: number): string {
  return LEAD_DRILL_BOWL_TARGETS[bowlIndex % LEAD_DRILL_BOWL_TARGETS.length];
}
