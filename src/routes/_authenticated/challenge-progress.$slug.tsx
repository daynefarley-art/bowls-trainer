import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { DeleteResultDialog } from "@/components/bowls/DeleteResultDialog";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import {
  challengeStats,
  normalizeChallengeConfig,
  SLIMED_TARGETS,
  SLIMED_TARGET_LABEL,
  type Challenge,
  type ChallengeResult,
  type KeepItUpBreakdown,
  type FixedEndsBreakdown,
  type DriveDrawBreakdown,
  type JackInDitchBreakdown,
  type SlimedBreakdown,
} from "@/lib/challenges";
import { Trophy, TrendingUp, TrendingDown, Minus, ChevronRight, Clock } from "lucide-react";
import { formatHM } from "@/lib/bowls";
import { DifficultyBadge, AchievementBadge } from "@/components/bowls/ChallengeBadge";
import { getNextBadge, BADGE_META, getChallengeBestLabel, getChallengeRemainingUnit, formatChallengeScore } from "@/lib/challenges";

export const Route = createFileRoute("/_authenticated/challenge-progress/$slug")({
  component: ChallengeProgressPage,
});

function ChallengeProgressPage() {
  const { slug } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);


  const { data: challenge } = useQuery({
    queryKey: ["challenge", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenges").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data ? normalizeChallengeConfig(data as Challenge) : null;
    },
  });

  const { data: results } = useQuery({
    queryKey: ["challenge_results", user.id, slug],
    enabled: !!challenge,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenge_results")
        .select("*")
        .eq("challenge_id", challenge!.id)
        .eq("user_id", user.id)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChallengeResult[];
    },
  });

  const rs = results ?? [];
  const stats = challengeStats(rs);
  const latest = rs[0];

  // Aggregate per-bowl across all attempts
  const perBowl = useMemo(() => {
    const init = () => ({ attempts: 0, survived: 0, touchers: 0 });
    const agg = { bowl1: init(), bowl2: init(), bowl3: init(), bowl4: init() };
    for (const r of rs) {
      const b = (r.breakdown as KeepItUpBreakdown | undefined)?.per_bowl;
      if (!b) continue;
      (Object.keys(agg) as (keyof typeof agg)[]).forEach((k) => {
        agg[k].attempts += b[k]?.attempts ?? 0;
        agg[k].survived += b[k]?.survived ?? 0;
        agg[k].touchers += b[k]?.touchers ?? 0;
      });
    }
    return agg;
  }, [rs]);

  const bowlPcts = (["bowl1", "bowl2", "bowl3", "bowl4"] as const).map((k, i) => ({
    label: `Bowl ${i + 1}`,
    pct: perBowl[k].attempts ? (perBowl[k].survived / perBowl[k].attempts) * 100 : null,
    touchers: perBowl[k].touchers,
    attempts: perBowl[k].attempts,
  }));
  const ranked = bowlPcts.filter((b) => b.pct != null).sort((a, b) => (b.pct! - a.pct!));
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];

  const isDriveDraw = challenge?.config?.variant === "drive-draw";
  const isJackInDitch = challenge?.config?.variant === "jack-in-ditch";
  const isSlimed = challenge?.config?.variant === "slimed";
  const isFixedEnds = !isDriveDraw && !isJackInDitch && !isSlimed && challenge?.config?.type === "fixed-ends";
  const fxEnds = challenge?.config?.ends ?? 0;
  const fxBowlsPerEnd = challenge?.config?.bowls_per_end ?? 0;
  const fxMax = challenge?.config?.max_score ?? fxEnds * fxBowlsPerEnd;

  // SLiMeD aggregate stats
  const slimed = useMemo(() => {
    if (!isSlimed) return null;
    const lengthTally: Record<string, { score: number; max: number }> = {};
    for (const t of SLIMED_TARGETS) lengthTally[t] = { score: 0, max: 0 };
    const handTally = { forehand: { score: 0, max: 0 }, backhand: { score: 0, max: 0 } };
    let visualBowls = 0;
    let narrow = 0, on = 0, wide = 0, shortW = 0, jackHigh = 0, past = 0;
    let touchers = 0, oneMat = 0, miss = 0, totalBowls = 0;
    for (const r of rs) {
      const b = r.breakdown as SlimedBreakdown | undefined;
      if (!b || b.type !== "slimed") continue;
      for (const bowl of b.bowls ?? []) {
        totalBowls += 1;
        lengthTally[bowl.target].score += bowl.score;
        lengthTally[bowl.target].max += 2;
        handTally[bowl.hand].score += bowl.score;
        handTally[bowl.hand].max += 2;
        if (bowl.score === 2) touchers += 1;
        else if (bowl.score === 1) oneMat += 1;
        else miss += 1;
        if (bowl.line && bowl.weight) {
          visualBowls += 1;
          if (bowl.line === "narrow") narrow += 1;
          else if (bowl.line === "on") on += 1;
          else wide += 1;
          if (bowl.weight === "short") shortW += 1;
          else if (bowl.weight === "jack-high") jackHigh += 1;
          else past += 1;
        }
      }
    }
    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
    return {
      totalBowls,
      lengthPcts: SLIMED_TARGETS.map((t) => ({
        t,
        pct: pct(lengthTally[t].score, lengthTally[t].max),
      })),
      handPcts: (["forehand", "backhand"] as const).map((h) => ({
        h,
        pct: pct(handTally[h].score, handTally[h].max),
      })),
      toucherPct: pct(touchers, totalBowls),
      oneMatPct: pct(oneMat, totalBowls),
      missPct: pct(miss, totalBowls),
      visual: visualBowls > 0 ? {
        narrow: pct(narrow, visualBowls),
        on: pct(on, visualBowls),
        wide: pct(wide, visualBowls),
        short: pct(shortW, visualBowls),
        jackHigh: pct(jackHigh, visualBowls),
        past: pct(past, visualBowls),
      } : null,
    };
  }, [rs, isSlimed]);

  // Jack in the Ditch aggregate stats
  const jackInDitch = useMemo(() => {
    if (!isJackInDitch) return null;
    let totalEnds = 0;
    let perfectEnds = 0;
    let gateSuccesses = 0;
    let jackHits = 0;
    let firstBowlJack = 0;
    let endsWithJack = 0;
    for (const r of rs) {
      const b = r.breakdown as JackInDitchBreakdown | undefined;
      if (!b || b.type !== "jack-in-ditch") continue;
      for (const e of b.ends ?? []) {
        totalEnds += 1;
        if (e.perfect_end) perfectEnds += 1;
        // New-format ends carry per-bowl outcomes
        if (Array.isArray(e.bowls) && e.bowls.length) {
          for (const bw of e.bowls) {
            if (bw.outcome === "gate") gateSuccesses += 1;
            else if (bw.outcome === "jack") jackHits += 1;
          }
          if (e.jack_struck_on) endsWithJack += 1;
          if (e.jack_struck_on === 1) firstBowlJack += 1;
        } else if (e.bowl_to_ditch) {
          // Legacy format — count a single jack hit
          jackHits += 1;
          endsWithJack += 1;
          if (e.bowl_to_ditch === 1) firstBowlJack += 1;
        }
      }
    }
    return {
      totalEnds,
      perfectEnds,
      gateSuccesses,
      jackHits,
      jackHitRate: totalEnds ? (endsWithJack / totalEnds) * 100 : null,
      firstBowlRate: totalEnds ? (firstBowlJack / totalEnds) * 100 : null,
    };
  }, [rs, isJackInDitch]);

  // Drive Then Draw aggregate stats
  const driveDraw = useMemo(() => {
    if (!isDriveDraw) return null;
    let driveAttempts = 0;
    let driveScoring = 0; // 3 or 5 pts
    let driveHits = 0; // 5 pts
    let drawAttempts = 0;
    let drawPoints = 0;
    const endScores: number[] = [];
    for (const r of rs) {
      const b = r.breakdown as DriveDrawBreakdown | undefined;
      if (!b || b.type !== "drive-draw") continue;
      for (const e of b.ends ?? []) {
        endScores.push(e.end_score);
        for (const bowl of e.bowls ?? []) {
          if (bowl.kind === "drive") {
            driveAttempts += 1;
            if (bowl.points >= 3) driveScoring += 1;
            if (bowl.points >= 5) driveHits += 1;
          } else if (bowl.kind === "draw") {
            drawAttempts += 1;
            drawPoints += bowl.points;
          }
        }
      }
    }
    return {
      driveAccuracy: driveAttempts ? (driveScoring / driveAttempts) * 100 : null,
      driveHitRate: driveAttempts ? (driveHits / driveAttempts) * 100 : null,
      drawAccuracy: drawAttempts ? (drawPoints / (drawAttempts * 5)) * 100 : null,
      avgEnd: endScores.length ? endScores.reduce((s, n) => s + n, 0) / endScores.length : null,
      bestEnd: endScores.length ? Math.max(...endScores) : null,
    };
  }, [rs, isDriveDraw]);

  // Per-end-position success rate across all fixed-ends attempts
  const endStats = useMemo(() => {
    if (!isFixedEnds) return [];
    const arr: { attempts: number; sum: number }[] = Array.from(
      { length: fxEnds },
      () => ({ attempts: 0, sum: 0 }),
    );
    for (const r of rs) {
      const b = r.breakdown as FixedEndsBreakdown | undefined;
      if (!b || b.type !== "fixed-ends") continue;
      for (const e of b.ends ?? []) {
        const i = e.end_number - 1;
        if (i < 0 || i >= arr.length) continue;
        arr[i].attempts += 1;
        arr[i].sum += e.end_score;
      }
    }
    return arr.map((a, i) => ({
      label: `End ${i + 1}`,
      avg: a.attempts ? a.sum / a.attempts : null,
      attempts: a.attempts,
    }));
  }, [rs, isFixedEnds, fxEnds]);

  const successPct = useMemo(() => {
    if (!isFixedEnds || rs.length === 0 || fxMax === 0) return null;
    const totalPossible = rs.length * fxMax;
    const totalScored = rs.reduce((s, r) => s + r.score, 0);
    return (totalScored / totalPossible) * 100;
  }, [rs, isFixedEnds, fxMax]);

  // Per-target accuracy across all fixed-ends attempts (uses config.bowl_targets)
  const targets = challenge?.config?.bowl_targets ?? [];
  const targetAccuracy = useMemo(() => {
    if (!isFixedEnds || targets.length === 0) return null;
    const buckets: Record<string, { attempts: number; scored: number }> = {};
    for (const r of rs) {
      const b = r.breakdown as FixedEndsBreakdown | undefined;
      if (!b || b.type !== "fixed-ends") continue;
      for (const end of b.ends ?? []) {
        end.bowls.forEach((bowl, i) => {
          const t = targets[i];
          if (!t) return;
          if (!buckets[t]) buckets[t] = { attempts: 0, scored: 0 };
          buckets[t].attempts += 1;
          if (bowl) buckets[t].scored += 1;
        });
      }
    }
    const total = Object.values(buckets).reduce(
      (acc, b) => ({ attempts: acc.attempts + b.attempts, scored: acc.scored + b.scored }),
      { attempts: 0, scored: 0 },
    );
    return { buckets, total };
  }, [rs, isFixedEnds, targets]);


  const trainingMinutes = rs.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);

  // Monthly progress (last 6 months) — best score per month
  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rs) {
      const d = new Date(r.played_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, Math.max(map.get(key) ?? 0, r.score));
    }
    const now = new Date();
    const out: { key: string; label: string; best: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({ key, label: d.toLocaleDateString(undefined, { month: "short" }), best: map.get(key) ?? 0 });
    }
    return out;
  }, [rs]);
  const monthlyMax = Math.max(1, ...monthly.map((m) => m.best));

  if (!challenge) {
    return (
      <>
        <PageHeader title="Challenge progress" />
        <main className="mx-auto max-w-md px-5 py-10 text-center text-muted-foreground">Loading…</main>
      </>
    );
  }

  const TrendIcon = stats.trend === "up" ? TrendingUp : stats.trend === "down" ? TrendingDown : Minus;
  const trendTone = stats.trend === "up" ? "text-primary" : stats.trend === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <>
      <PageHeader title={challenge.name} subtitle="Challenge progress" />

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <DifficultyBadge slug={challenge.slug} size="md" />
            <AchievementBadge slug={challenge.slug} best={stats.best} size="md" showNone />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Latest</p>
              <p className="mt-1 font-display text-3xl font-extrabold">
                {latest ? formatChallengeScore(challenge.slug, latest.score) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">{getChallengeBestLabel(challenge.slug)}</p>
              <p className="mt-1 flex items-center justify-center gap-1 font-display text-3xl font-extrabold text-primary">
                <Trophy className="h-5 w-5" />
                {stats.best == null ? "—" : formatChallengeScore(challenge.slug, stats.best)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Average</p>
              <p className="mt-1 font-display text-3xl font-extrabold">{stats.average == null ? "—" : stats.average.toFixed(1)}</p>
            </div>
          </div>
          {(() => {
            const next = getNextBadge(challenge.slug, stats.best);
            if (!next) return null;
            const unit = getChallengeRemainingUnit(challenge.slug);
            return (
              <p className="mt-3 rounded-xl bg-secondary/40 p-2 text-center text-xs text-muted-foreground">
                Next: {BADGE_META[next.tier].emoji} {BADGE_META[next.tier].label} requires {next.required} ({next.remaining} {unit}{next.remaining === 1 ? "" : "s"} to go)
              </p>
            );
          })()}
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
            <span className={`flex items-center gap-1 font-semibold ${trendTone}`}>
              <TrendIcon className="h-4 w-4" />
              {stats.trend === "none" ? "No attempts yet" : `Trend ${stats.trend}`}
            </span>
            <span className="text-muted-foreground">{stats.attempts} attempt{stats.attempts === 1 ? "" : "s"}</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatHM(trainingMinutes)}
            </span>
          </div>
        </section>



        <Link
          to="/challenge-record/$slug"
          params={{ slug: challenge.slug }}
          search={{ start: "1" }}
          className="flex h-16 items-center justify-center gap-2 rounded-2xl bt-gradient-primary text-base font-bold text-primary-foreground bt-shadow-elevated"
        >
          Play again
          <ChevronRight className="h-5 w-5" />
        </Link>

        {isSlimed && slimed ? (
          <>
            <section className="rounded-2xl bg-card p-5 bt-shadow-card">
              <h3 className="font-display text-lg font-bold">SLiMeD breakdown</h3>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                By length
              </p>
              <div className="mt-1 grid grid-cols-4 gap-2 text-center">
                {slimed.lengthPcts.map((l) => (
                  <div key={l.t} className="rounded-xl bg-secondary/40 p-2">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      {SLIMED_TARGET_LABEL[l.t]}
                    </p>
                    <p className="mt-1 font-display text-lg font-extrabold text-primary">
                      {l.pct == null ? "—" : `${l.pct}%`}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                By hand
              </p>
              <div className="mt-1 grid grid-cols-2 gap-2 text-center">
                {slimed.handPcts.map((h) => (
                  <div key={h.h} className="rounded-xl bg-secondary/40 p-2">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground capitalize">
                      {h.h}
                    </p>
                    <p className="mt-1 font-display text-lg font-extrabold text-primary">
                      {h.pct == null ? "—" : `${h.pct}%`}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Results
              </p>
              <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                <StatCell label="Toucher" value={slimed.toucherPct} suffix="%" />
                <StatCell label="One Mat" value={slimed.oneMatPct} suffix="%" />
                <StatCell label="Miss" value={slimed.missPct} suffix="%" />
              </div>
            </section>
            {slimed.visual && (
              <section className="rounded-2xl bg-card p-5 bt-shadow-card">
                <h3 className="font-display text-lg font-bold">Visual analytics</h3>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Line
                </p>
                <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                  <StatCell label="Narrow" value={slimed.visual.narrow} suffix="%" />
                  <StatCell label="On Line" value={slimed.visual.on} suffix="%" />
                  <StatCell label="Wide" value={slimed.visual.wide} suffix="%" />
                </div>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Weight
                </p>
                <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                  <StatCell label="Short" value={slimed.visual.short} suffix="%" />
                  <StatCell label="Within a Mat" value={slimed.visual.jackHigh} suffix="%" />
                  <StatCell label="Long" value={slimed.visual.past} suffix="%" />
                </div>
              </section>
            )}
          </>
        ) : isJackInDitch && jackInDitch ? (
          <section className="rounded-2xl bg-card p-5 bt-shadow-card">
            <h3 className="font-display text-lg font-bold">Driving breakdown</h3>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <StatCell label="Perfect Ends" value={jackInDitch.perfectEnds} />
              <StatCell label="Jack Hits" value={jackInDitch.jackHits} />
              <StatCell label="Drive Gate" value={jackInDitch.gateSuccesses} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <StatCell label="Jack Hit Rate" value={jackInDitch.jackHitRate} suffix="%" />
              <StatCell label="1st-Bowl Strike" value={jackInDitch.firstBowlRate} suffix="%" />
            </div>
          </section>

        ) : isDriveDraw && driveDraw ? (
          <section className="rounded-2xl bg-card p-5 bt-shadow-card">
            <h3 className="font-display text-lg font-bold">Drive &amp; draw breakdown</h3>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <StatCell label="Drive Acc." value={driveDraw.driveAccuracy} suffix="%" />
              <StatCell label="Channel Hit" value={driveDraw.driveHitRate} suffix="%" />
              <StatCell label="Draw Acc." value={driveDraw.drawAccuracy} suffix="%" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <StatCell label="Avg End" value={driveDraw.avgEnd} digits={1} />
              <StatCell label="Best End" value={driveDraw.bestEnd} />
            </div>
          </section>
        ) : isFixedEnds ? (
          <section className="rounded-2xl bg-card p-5 bt-shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">End performance</h3>
              {successPct != null && (
                <span className="text-xs font-semibold text-muted-foreground">
                  Success {successPct.toFixed(0)}%
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-2 text-center" style={{ gridTemplateColumns: `repeat(${Math.max(1, endStats.length)}, minmax(0, 1fr))` }}>
              {endStats.map((e) => (
                <div key={e.label} className="rounded-xl bg-secondary/40 p-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">{e.label}</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-primary">
                    {e.avg == null ? "—" : e.avg.toFixed(1)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">avg / {fxBowlsPerEnd}</p>
                </div>
              ))}
            </div>
            {targetAccuracy && targetAccuracy.total.attempts > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {(["front", "centre"] as const).map((key) => {
                  const b = targetAccuracy.buckets[key];
                  const pct = b && b.attempts ? (b.scored / b.attempts) * 100 : null;
                  return (
                    <div key={key} className="rounded-xl bg-secondary/40 p-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">
                        {key === "front" ? "Front Jack" : "Centre Jack"}
                      </p>
                      <p className="mt-1 font-display text-xl font-extrabold text-primary">
                        {pct == null ? "—" : `${pct.toFixed(0)}%`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {b?.scored ?? 0}/{b?.attempts ?? 0}
                      </p>
                    </div>
                  );
                })}
                <div className="rounded-xl bg-primary/10 p-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Overall</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-primary">
                    {targetAccuracy.total.attempts
                      ? `${((targetAccuracy.total.scored / targetAccuracy.total.attempts) * 100).toFixed(0)}%`
                      : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {targetAccuracy.total.scored}/{targetAccuracy.total.attempts}
                  </p>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-2xl bg-card p-5 bt-shadow-card">
            <h3 className="font-display text-lg font-bold">Bowl survival %</h3>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {bowlPcts.map((b) => (
                <div key={b.label} className="rounded-xl bg-secondary/40 p-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">{b.label}</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-primary">
                    {b.pct == null ? "—" : `${b.pct.toFixed(0)}%`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{b.touchers} touch</p>
                </div>
              ))}
            </div>
            {strongest && weakest && strongest.label !== weakest.label && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-xl bg-primary/10 p-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Strongest</p>
                  <p className="mt-0.5 font-display text-base font-extrabold text-primary">{strongest.label}</p>
                </div>
                <div className="rounded-xl bg-destructive/10 p-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Weakest</p>
                  <p className="mt-0.5 font-display text-base font-extrabold text-destructive">{weakest.label}</p>
                </div>
              </div>
            )}
          </section>
        )}


        <section className="rounded-2xl bg-card p-5 bt-shadow-card">
          <h3 className="font-display text-lg font-bold">Monthly best</h3>
          <div className="mt-3 flex h-32 items-end gap-2">
            {monthly.map((m) => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bt-gradient-primary"
                    style={{ height: `${(m.best / monthlyMax) * 100}%`, minHeight: m.best > 0 ? 4 : 0 }}
                  />
                </div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">{m.label}</p>
                <p className="text-[10px] font-semibold">{m.best || "—"}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-card p-5 bt-shadow-card">
          <h3 className="font-display text-lg font-bold">Last 10 attempts</h3>
          {stats.last10.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No attempts yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {stats.last10.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {new Date(r.played_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.duration_minutes ? `${formatHM(r.duration_minutes)}` : ""}
                    </p>
                  </div>
                  <p className="font-display text-xl font-extrabold text-primary">{r.score}</p>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(r.id)}
                    aria-label="Delete challenge result"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link to="/challenges" className="block py-2 text-center text-xs font-semibold text-muted-foreground">
          Back to challenges
        </Link>
      </main>

      {pendingDelete && (
        <DeleteResultDialog
          open={!!pendingDelete}
          onOpenChange={(o) => !o && setPendingDelete(null)}
          kind="challenge"
          resultId={pendingDelete}
          email={user.email ?? ""}
          onDeleted={() => {
            setPendingDelete(null);
            qc.invalidateQueries({ queryKey: ["challenge_results", user.id, slug] });
          }}
        />
      )}
    </>
  );
}

function StatCell({
  label,
  value,
  suffix,
  digits = 0,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  digits?: number;
}) {
  return (
    <div className="rounded-xl bg-secondary/40 p-2">
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-extrabold text-primary">
        {value == null ? "—" : `${value.toFixed(digits)}${suffix ?? ""}`}
      </p>
    </div>
  );
}
