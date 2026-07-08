import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { BSIBadge } from "@/components/bowls/BSIBadge";
import { BSIModal } from "@/components/bowls/BSIModal";
import { categoryScores, overallBSI, trainingStats, formatHM, handStats, DRAW_DRILL_SLUGS, type Drill, type Result } from "@/lib/bowls";
import { challengeStats, type ChallengeResult } from "@/lib/challenges";
import { Target, Trophy, Info, Clock, ChevronRight, BookOpen } from "lucide-react";
import { StartSessionButton } from "@/components/bowls/StartSessionButton";
import { OnboardingDialog } from "@/components/bowls/OnboardingDialog";
import { HelpInfoButton } from "@/components/bowls/HelpInfoButton";
import { GettingStartedGuide, hasSeenGettingStarted } from "@/components/bowls/GettingStartedGuide";
import {
  getShowGettingStartedCard,
  setShowGettingStartedCard,
  hasAnsweredSmartPrompt,
  markSmartPromptAnswered,
} from "@/lib/dashboard-prefs";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { SESSIONS_QK, formatMinutes, type TrainingSession } from "@/lib/sessions";
import { useDemoMode } from "@/lib/demo-mode";
import { SquadDashboardCard } from "@/components/bowls/SquadDashboardCard";


export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const [bsiOpen, setBsiOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [showGSCard, setShowGSCard] = useState(true);
  const [smartPromptOpen, setSmartPromptOpen] = useState(false);

  useEffect(() => {
    setShowGSCard(getShowGettingStartedCard());
    if (!hasSeenGettingStarted()) setGuideOpen(true);
  }, []);



  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

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
        .from("results")
        .select("*")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Result[];
    },
  });

  const { data: challengeResults } = useQuery({
    queryKey: ["challenge_results", user.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenge_results")
        .select("*")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChallengeResult[];
    },
  });

  const { data: recentSessions } = useQuery({
    queryKey: SESSIONS_QK(user.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("training_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "complete")
        .order("session_started_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as TrainingSession[];
    },
  });

  const { data: completedSessionCount } = useQuery({
    queryKey: ["training_sessions_count", user.id],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("training_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "complete");
      return count ?? 0;
    },
  });

  const allResults = results ?? [];

  useEffect(() => {
    if (!showGSCard) return;
    if (hasAnsweredSmartPrompt()) return;
    const drillCount = allResults.length;
    const sessionCount = completedSessionCount ?? 0;
    if (drillCount >= 10 || sessionCount >= 5) {
      setSmartPromptOpen(true);
    }
  }, [showGSCard, allResults.length, completedSessionCount]);

  const allDrills = drills ?? [];
  const allChallengeResults = challengeResults ?? [];
  const bsi = overallBSI(allResults, allDrills);
  const latest = allResults[0];
  const displayName = profile?.full_name ?? user.email?.split("@")[0] ?? "Bowler";
  const cats = categoryScores(allResults, allDrills);
  const tStats = trainingStats(allResults);

  // Challenge stats (do NOT contribute to BSI)
  const chStats = challengeStats(allChallengeResults);
  const challengeMinutes = allChallengeResults.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
  const latestPB = (() => {
    if (allChallengeResults.length === 0) return null;
    let best = allChallengeResults[0];
    for (const r of allChallengeResults) {
      if (r.score > best.score || (r.score === best.score && new Date(r.played_at) > new Date(best.played_at))) {
        best = r;
      }
    }
    return best;
  })();
  const favouriteChallenge = (() => {
    if (allChallengeResults.length === 0) return null;
    const counts = new Map<string, { name: string; n: number }>();
    for (const r of allChallengeResults) {
      const entry = counts.get(r.challenge_id) ?? { name: r.challenge_name, n: 0 };
      entry.n += 1;
      counts.set(r.challenge_id, entry);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n)[0];
  })();

  // Group results by drill
  const byDrill = new Map<string, Result[]>();
  for (const r of allResults) {
    const arr = byDrill.get(r.drill_id) ?? [];
    arr.push(r);
    byDrill.set(r.drill_id, arr);
  }

  // Draw-skills hand stats (FH vs BH across Short/Medium/Long Draw)
  const drawDrillIds = new Set(
    allDrills.filter((d) => (DRAW_DRILL_SLUGS as readonly string[]).includes(d.slug)).map((d) => d.id),
  );
  const hStats = handStats(allResults, drawDrillIds);
  const strongestHand =
    hStats.fhPct == null && hStats.bhPct == null
      ? null
      : (hStats.fhPct ?? -1) >= (hStats.bhPct ?? -1)
        ? "Forehand"
        : "Backhand";
  const weakestHand = strongestHand == null ? null : strongestHand === "Forehand" ? "Backhand" : "Forehand";

  return (
    <>
      <PageHeader title={`Hi, ${displayName.split(" ")[0]}`} subtitle="Ready to train today?" />

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5">
        <DashboardDemoBanner />
        <button
          type="button"
          onClick={() => setBsiOpen(true)}
          className="block w-full rounded-3xl bg-card p-6 text-left bt-shadow-elevated active:scale-[0.99] transition"
        >
          <div className="flex items-center gap-5">
            <BSIBadge bsi={bsi} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Overall BSI <Info className="h-3 w-3" />
              </p>
              <p className="mt-1 font-display text-3xl font-extrabold">
                {bsi.toFixed(1)}<span className="text-base text-muted-foreground">/100</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {allResults.length} session{allResults.length === 1 ? "" : "s"} across {byDrill.size} drill{byDrill.size === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-xs font-semibold text-primary">Tap for breakdown</p>
            </div>
          </div>
        </button>

        {showGSCard && (
          <div className="rounded-3xl bg-card p-5 bt-shadow-card">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BookOpen className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-extrabold leading-tight">Getting Started</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Learn how BSI, Drills, Challenges, Training Sessions and Progress Tracking work together.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground active:scale-[0.98] transition"
                  >
                    View Guide
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowGettingStartedCard(false);
                      setShowGSCard(false);
                    }}
                    className="rounded-xl bg-secondary px-4 py-2 text-xs font-bold text-foreground active:scale-[0.98] transition"
                  >
                    Hide Card
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}



        <div className="flex items-center justify-between px-1">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Quick actions
          </h2>
          <HelpInfoButton />
        </div>

        <StartSessionButton />

        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/drills"
            className="flex flex-col items-start gap-1 rounded-2xl bt-gradient-primary p-3 text-left text-primary-foreground bt-shadow-elevated active:scale-[0.99] transition"
          >
            <Target className="h-5 w-5" />
            <p className="font-display text-sm font-extrabold leading-tight">BSI Drills</p>
            <p className="text-[11px] opacity-90 leading-tight">Contributes to BSI</p>
          </Link>
          <Link
            to="/challenges"
            className="flex flex-col items-start gap-1 rounded-2xl bt-gradient-primary p-3 text-left text-primary-foreground bt-shadow-elevated active:scale-[0.99] transition"
          >
            <Trophy className="h-5 w-5" />
            <p className="font-display text-sm font-extrabold leading-tight">Challenges</p>
            <p className="text-[11px] opacity-90 leading-tight">Does not affect BSI</p>
          </Link>
        </div>

        <SquadDashboardCard />


        {recentSessions && recentSessions.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-end justify-between px-1">
              <h2 className="font-display text-lg font-bold">Recent training sessions</h2>
              <Link to="/sessions" className="flex items-center text-sm font-semibold text-primary">
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-2">
              {recentSessions.map((s) => (
                <Link
                  key={s.id}
                  to="/sessions/$id"
                  params={{ id: s.id }}
                  className="flex items-center gap-3 rounded-2xl bg-card p-3 bt-shadow-card active:scale-[0.99] transition"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {new Date(s.session_started_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {formatMinutes(s.total_duration_minutes)}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.total_activities} activit{s.total_activities === 1 ? "y" : "ies"} · {s.drills_completed} drill{s.drills_completed === 1 ? "" : "s"} · {s.challenges_completed} challenge{s.challenges_completed === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <Link
          to="/progress"
          className="flex items-center gap-4 rounded-2xl bg-card p-4 bt-shadow-card active:scale-[0.99] transition"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <Clock className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Training This Week
            </p>
            <p className="mt-0.5 font-display text-2xl font-extrabold">
              {tStats.thisWeek > 0 ? formatHM(tStats.thisWeek) : "0m"}
            </p>
          </div>
          <p className="text-xs font-semibold text-primary">View</p>
        </Link>

        {/* Challenges (separate from BSI) */}
        <section className="space-y-2">
          <div className="flex items-end justify-between px-1">
            <h2 className="font-display text-lg font-bold">Challenges</h2>
            <Link to="/challenges" className="flex items-center text-sm font-semibold text-primary">
              View all <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {chStats.attempts === 0 ? (
            <Link
              to="/challenges"
              className="flex items-center gap-4 rounded-2xl bg-card p-4 bt-shadow-card active:scale-[0.99] transition"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bt-gradient-primary text-white">
                <Trophy className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Try a challenge
                </p>
                <p className="mt-0.5 font-display text-base font-extrabold">Keep It Up</p>
                <p className="text-xs text-muted-foreground">Doesn't affect your BSI</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Sessions" value={String(chStats.attempts)} />
              <StatCard
                label="Latest PB"
                value={latestPB ? `${latestPB.score}` : "—"}
                sub={latestPB?.challenge_name}
              />
              <StatCard
                label="Favourite"
                value={favouriteChallenge?.name ?? "—"}
                sub={favouriteChallenge ? `${favouriteChallenge.n} session${favouriteChallenge.n === 1 ? "" : "s"}` : undefined}
                small
              />
              <StatCard
                label="Challenge time"
                value={challengeMinutes > 0 ? formatHM(challengeMinutes) : "0m"}
              />
            </div>
          )}
        </section>


        {/* Draw skills: per-length scores + FH/BH */}
        <section className="space-y-2">
          <h2 className="px-1 font-display text-lg font-bold">Draw skills</h2>
          <div className="grid grid-cols-3 gap-2">
            {(DRAW_DRILL_SLUGS as readonly string[]).map((slug) => {
              const d = allDrills.find((x) => x.slug === slug);
              const vals = d ? (byDrill.get(d.id) ?? []).map((r) => Number(r.bsi ?? r.percentage ?? 0)) : [];
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
              const label = slug === "short-draw" ? "Short" : slug === "medium-draw" ? "Medium" : "Long";
              return (
                <div key={slug} className="rounded-2xl bg-card p-3 text-center bt-shadow-card">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-1 font-display text-2xl font-extrabold text-primary">
                    {avg == null ? "—" : avg.toFixed(0)}
                  </p>
                </div>
              );
            })}

          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-card p-3 bt-shadow-card">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Forehand</p>
              <p className="mt-1 font-display text-2xl font-extrabold text-primary">
                {hStats.fhPct == null ? "—" : `${hStats.fhPct.toFixed(0)}%`}
              </p>
              <p className="text-[10px] text-muted-foreground">{hStats.fhBowls} bowl{hStats.fhBowls === 1 ? "" : "s"}</p>
            </div>
            <div className="rounded-2xl bg-card p-3 bt-shadow-card">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Backhand</p>
              <p className="mt-1 font-display text-2xl font-extrabold text-primary">
                {hStats.bhPct == null ? "—" : `${hStats.bhPct.toFixed(0)}%`}
              </p>
              <p className="text-[10px] text-muted-foreground">{hStats.bhBowls} bowl{hStats.bhBowls === 1 ? "" : "s"}</p>
            </div>
          </div>
          {strongestHand && (
            <div className="flex items-center justify-between rounded-2xl bg-secondary/40 px-4 py-2 text-xs">
              <span><span className="font-bold text-primary">Strongest:</span> {strongestHand}</span>
              <span><span className="font-bold">Weakest:</span> {weakestHand}</span>
            </div>
          )}
        </section>

        {/* Category scores */}
        <section className="space-y-2">



          <h2 className="px-1 font-display text-lg font-bold">Category scores</h2>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(cats).map(([key, c]) => (
              <div key={key} className="rounded-2xl bg-card p-4 bt-shadow-card">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <p className="mt-1 font-display text-2xl font-extrabold text-primary">
                  {c.score == null ? "—" : c.score.toFixed(0)}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bt-gradient-primary"
                    style={{ width: `${c.score ?? 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Per-drill cards */}
        <section className="space-y-3">
          <h2 className="px-1 font-display text-lg font-bold">Drill scores</h2>
          {allDrills.map((d) => {
            const drillResults = byDrill.get(d.id) ?? [];
            const vals = drillResults
              .map((r) => (r.bsi != null ? Number(r.bsi) : r.percentage != null ? Number(r.percentage) : null))
              .filter((p): p is number => p != null);
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

            const bestScore = drillResults.length
              ? Math.max(...drillResults.map((r) => r.score))
              : null;
            const latestForDrill = drillResults[0];

            return (
              <Link
                key={d.id}
                to="/progress"
                search={{ drill: d.slug }}
                className="block rounded-2xl bg-card p-4 bt-shadow-card active:scale-[0.99] transition"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                    <Target className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {d.category ?? "Drill"}
                    </p>
                    <h3 className="font-display font-bold leading-tight">{d.name}</h3>
                    {avg == null ? (
                      <p className="mt-1 text-sm text-muted-foreground">No data yet</p>
                    ) : (
                      <div className="mt-1.5 flex items-center gap-3 text-xs">
                        <span className="font-semibold">
                          <Trophy className="mr-1 inline h-3 w-3 text-primary" />
                          Best {bestScore}
                        </span>
                        <span className="text-muted-foreground">
                          Latest {latestForDrill.score}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-2xl font-extrabold text-primary">
                      {avg == null ? "—" : avg.toFixed(0)}
                    </p>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">BSI</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>

        {/* Latest result */}
        <section className="rounded-2xl bg-card p-5 bt-shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Latest result</h2>
            <Link to="/history" className="text-sm font-semibold text-primary">View all</Link>
          </div>
          {latest ? (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold">{latest.drill_name ?? "Drill"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(latest.played_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  {latest.location ? ` • ${latest.location}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-extrabold text-primary">{latest.score}</p>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">
                  BSI {latest.bsi != null ? Number(latest.bsi).toFixed(0) : latest.percentage != null ? Number(latest.percentage).toFixed(0) : "—"}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No sessions yet — record your first one!</p>
          )}
        </section>
      </main>

      <BSIModal open={bsiOpen} onOpenChange={setBsiOpen} results={allResults} drills={allDrills} />
      <OnboardingDialog />
      <GettingStartedGuide open={guideOpen} onOpenChange={setGuideOpen} />
      <Dialog
        open={smartPromptOpen}
        onOpenChange={(v) => {
          if (!v) {
            markSmartPromptAnswered();
            setSmartPromptOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogTitle className="font-display text-xl font-extrabold">Nice progress!</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            You seem to know your way around the app. Would you like to hide the Getting Started card?
          </DialogDescription>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowGettingStartedCard(false);
                setShowGSCard(false);
                markSmartPromptAnswered();
                setSmartPromptOpen(false);
              }}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground active:scale-[0.98] transition"
            >
              Hide Card
            </button>
            <button
              type="button"
              onClick={() => {
                markSmartPromptAnswered();
                setSmartPromptOpen(false);
              }}
              className="flex-1 rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-foreground active:scale-[0.98] transition"
            >
              Keep Showing
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <div className="rounded-2xl bg-card p-4 bt-shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display font-extrabold text-primary ${small ? "text-base leading-tight" : "text-2xl"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function DashboardDemoBanner() {
  const { enabled, setEnabled } = useDemoMode();
  if (!enabled) return null;
  return (
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-100 bt-shadow-card">
      <p className="font-display text-base font-extrabold">🎯 Demo Mode Active</p>
      <p className="mt-0.5 text-xs">Training activity is not being saved.</p>
      <button
        onClick={() => setEnabled(false)}
        className="mt-3 h-10 w-full rounded-xl bg-amber-600 text-sm font-bold text-white hover:bg-amber-700"
      >
        Turn Off Demo Mode
      </button>
    </section>
  );
}

