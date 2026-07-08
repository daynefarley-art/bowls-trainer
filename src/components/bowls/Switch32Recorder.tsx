import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VisualTarget, type VisualTap } from "@/components/bowls/VisualTarget";
import {
  clearChallengeStart,
  ensureChallengeStart,
  SWITCH32_BOWLS_PER_END,
  SWITCH32_MAX_SCORE,
  SWITCH32_TARGETS,
  SWITCH32_TARGET_LABEL,
  SWITCH32_TOTAL_BOWLS,
  SWITCH32_TOTAL_ENDS,
  type Challenge,
  type Switch32Bowl,
  type Switch32Breakdown,
  type Switch32End,
  type Switch32Hand,
  type Switch32ScoringMode,
  type Switch32Target,
} from "@/lib/challenges";
import {
  ACTIVE_SESSION_QK,
  SESSIONS_QK,
  attachActivity,
  getActiveSession,
} from "@/lib/sessions";
import { Trophy, BarChart3, Check, X, Sparkles, RotateCcw, Play } from "lucide-react";
import { ChallengeResultMeta } from "@/components/bowls/ChallengeResultMeta";
import { toast } from "sonner";
import { isDemoMode } from "@/lib/demo-mode";

const ON_LINE_THRESHOLD = 1.0;
const JACK_HIGH_THRESHOLD = 0.25;

function classifyLine(x: number, hand: Switch32Hand): "narrow" | "on" | "wide" {
  if (Math.abs(x) <= ON_LINE_THRESHOLD) return "on";
  if (hand === "forehand") return x < 0 ? "narrow" : "wide";
  return x > 0 ? "narrow" : "wide";
}
function classifyWeight(y: number): "short" | "jack-high" | "past" {
  if (y > JACK_HIGH_THRESHOLD) return "past";
  if (y < -JACK_HIGH_THRESHOLD) return "short";
  return "jack-high";
}
function scoreFromTap(tap: VisualTap): 0 | 1 | 3 | 5 {
  if (tap.band === "half") return 5;
  if (tap.band === "one") return 3;
  if (tap.band === "two") return 1;
  return 0;
}

function pickTarget(prev?: Switch32Target): Switch32Target {
  // Avoid three in a row on the same target where possible.
  const pool = SWITCH32_TARGETS.slice();
  const t = pool[Math.floor(Math.random() * pool.length)];
  if (prev && t === prev && Math.random() < 0.4) {
    const rest = pool.filter((x) => x !== prev);
    return rest[Math.floor(Math.random() * rest.length)];
  }
  return t;
}
function pickHand(): Switch32Hand {
  return Math.random() < 0.5 ? "forehand" : "backhand";
}

type PlannedEnd = { target: Switch32Target; hands: Switch32Hand[] };

function buildPlan(): PlannedEnd[] {
  const ends: PlannedEnd[] = [];
  let prev: Switch32Target | undefined;
  for (let i = 0; i < SWITCH32_TOTAL_ENDS; i++) {
    const target = pickTarget(prev);
    prev = target;
    const hands: Switch32Hand[] = [];
    for (let b = 0; b < SWITCH32_BOWLS_PER_END; b++) hands.push(pickHand());
    // Guarantee at least one of each hand per end for balance.
    if (!hands.includes("forehand")) hands[0] = "forehand";
    if (!hands.includes("backhand")) hands[hands.length - 1] = "backhand";
    ends.push({ target, hands });
  }
  return ends;
}

export function Switch32Recorder({ challenge, start }: { challenge: Challenge; start?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Switch32ScoringMode | null>(null);
  const [plan] = useState<PlannedEnd[]>(() => buildPlan());
  const [endIdx, setEndIdx] = useState(0);
  const [bowlsThisEnd, setBowlsThisEnd] = useState<Switch32Bowl[]>([]);
  const [completedEnds, setCompletedEnds] = useState<Switch32End[]>([]);
  const [endReady, setEndReady] = useState(false); // gates the "END X — TARGET — BEGIN" splash
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (start !== "1") {
      navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
      return;
    }
    setStartedAt(ensureChallengeStart(challenge.id));
  }, [challenge.id, challenge.slug, start, navigate]);

  const currentEnd = plan[endIdx];
  const bowlIdx = bowlsThisEnd.length;
  const currentHand = currentEnd?.hands[bowlIdx];
  const totalBowls = completedEnds.reduce((s, e) => s + e.bowls.length, 0) + bowlsThisEnd.length;
  const totalScore =
    completedEnds.reduce((s, e) => s + e.end_score, 0) +
    bowlsThisEnd.reduce((s, b) => s + b.score, 0);

  const hasUnsaved = !savedOk && (completedEnds.length > 0 || bowlsThisEnd.length > 0);
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved && !finished,
    enableBeforeUnload: hasUnsaved && !finished,
    withResolver: true,
  });

  function commitBowl(score: 0 | 1 | 3 | 5, extra?: Partial<Switch32Bowl>) {
    if (!currentEnd || !currentHand) return;
    const bowl: Switch32Bowl = {
      bowl_number: totalBowls + 1,
      end_number: endIdx + 1,
      bowl_in_end: bowlIdx + 1,
      hand: currentHand,
      target: currentEnd.target,
      score,
      ...extra,
    };
    const nextBowls = [...bowlsThisEnd, bowl];
    if (nextBowls.length >= SWITCH32_BOWLS_PER_END) {
      const finishedEnd: Switch32End = {
        end_number: endIdx + 1,
        target: currentEnd.target,
        bowls: nextBowls,
        end_score: nextBowls.reduce((s, b) => s + b.score, 0),
      };
      const nextCompleted = [...completedEnds, finishedEnd];
      setCompletedEnds(nextCompleted);
      setBowlsThisEnd([]);
      if (nextCompleted.length >= SWITCH32_TOTAL_ENDS) {
        setFinished(true);
      } else {
        setEndIdx((i) => i + 1);
        setEndReady(false);
      }
    } else {
      setBowlsThisEnd(nextBowls);
    }
  }

  function recordSimple(score: 0 | 1 | 3 | 5) {
    commitBowl(score);
  }
  function recordVisual(tap: VisualTap) {
    if (!currentHand) return;
    commitBowl(scoreFromTap(tap), {
      x: tap.x,
      y: tap.y,
      line: classifyLine(tap.x, currentHand),
      weight: classifyWeight(tap.y),
    });
  }

  function undoBowl() {
    if (bowlsThisEnd.length > 0) {
      setBowlsThisEnd(bowlsThisEnd.slice(0, -1));
      return;
    }
    if (completedEnds.length === 0) return;
    // Roll back into the previous end so the last bowl can be re-entered.
    const prev = completedEnds[completedEnds.length - 1];
    setCompletedEnds(completedEnds.slice(0, -1));
    setEndIdx(prev.end_number - 1);
    setBowlsThisEnd(prev.bowls.slice(0, -1));
    setEndReady(true);
    setFinished(false);
  }

  function clearEnd() {
    setBowlsThisEnd([]);
  }

  const visualMarkers = useMemo(
    () =>
      bowlsThisEnd
        .filter((b) => b.x != null && b.y != null)
        .map((b) => ({
          x: b.x as number,
          y: b.y as number,
          number: b.bowl_in_end,
          hand: b.hand,
        })),
    [bowlsThisEnd],
  );

  async function handleSave(repeat = false) {
    if (!userId) return toast.error("Not signed in");
    setSaving(true);
    const completedAt = new Date();
    const startIso = startedAt ?? ensureChallengeStart(challenge.id);
    const durationMinutes = Math.max(
      1,
      Math.round((completedAt.getTime() - new Date(startIso).getTime()) / 60000),
    );

    // Summary aggregates
    const all = completedEnds.flatMap((e) => e.bowls);
    const by_length: Switch32Breakdown["by_length"] = {
      S: { score: 0, max: 0 },
      M: { score: 0, max: 0 },
      L: { score: 0, max: 0 },
    };
    const by_hand: Switch32Breakdown["by_hand"] = {
      forehand: { score: 0, max: 0 },
      backhand: { score: 0, max: 0 },
    };
    for (const b of all) {
      by_length[b.target].score += b.score;
      by_length[b.target].max += 5;
      by_hand[b.hand].score += b.score;
      by_hand[b.hand].max += 5;
    }

    const breakdown: Switch32Breakdown = {
      type: "switch-32",
      mode: mode ?? "simple",
      ends: completedEnds,
      total_score: totalScore,
      max_score: SWITCH32_MAX_SCORE,
      end_scores: completedEnds.map((e) => e.end_score),
      by_length,
      by_hand,
    };

    const activeSession = await getActiveSession(userId);

    if (isDemoMode()) {
      setSaving(false);
      clearChallengeStart(challenge.id);
      setSavedOk(true);
      if (activeSession) await attachActivity(activeSession.id, "challenge", challenge.category);
      toast.success(`Demo result — not saved (${totalScore}/${SWITCH32_MAX_SCORE})`);
      if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
      else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
      else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
      return;
    }

    const { data, error } = await (supabase as any)
      .from("challenge_results")
      .insert({
        user_id: userId,
        challenge_id: challenge.id,
        challenge_name: challenge.name,
        category: challenge.category,
        score: totalScore,
        breakdown,
        played_at: completedAt.toISOString(),
        challenge_started_at: startIso,
        challenge_completed_at: completedAt.toISOString(),
        duration_minutes: durationMinutes,
        session_id: activeSession?.id ?? null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) return toast.error(error?.message ?? "Save failed");
    clearChallengeStart(challenge.id);
    setSavedOk(true);
    if (activeSession) {
      await attachActivity(activeSession.id, "challenge", challenge.category);
      qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(userId) });
      qc.invalidateQueries({ queryKey: SESSIONS_QK(userId) });
      qc.invalidateQueries({ queryKey: ["training_session", activeSession.id] });
      qc.invalidateQueries({ queryKey: ["session_challenges", activeSession.id] });
    }
    qc.invalidateQueries({ queryKey: ["challenge_results"] });
    qc.invalidateQueries({ queryKey: ["challenge_results", userId] });
    toast.success(activeSession ? "Added to session" : `Saved — ${totalScore} / ${SWITCH32_MAX_SCORE}`);
    if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
    else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
    else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
  }

  // ---------- Scoring mode picker ----------
  if (mode === null) {
    return (
      <>
        <PageHeader title={challenge.name} subtitle={`${challenge.category} Challenge`} />
        <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
          <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Choose Scoring</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold">How will you score?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Simple is fastest. Visual Target places every bowl on a target diagram and unlocks line + weight analytics.
            </p>
          </section>

          <button
            type="button"
            onClick={() => setMode("simple")}
            className="block w-full rounded-2xl bg-card p-5 text-left bt-shadow-card hover:bt-shadow-elevated"
          >
            <p className="font-display text-lg font-bold">Simple Scoring</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap one of four buttons per bowl: 5 · 3 · 1 · 0.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode("visual")}
            className="block w-full rounded-2xl bg-card p-5 text-left bt-shadow-card hover:bt-shadow-elevated"
          >
            <p className="font-display text-lg font-bold">Visual Target Scoring</p>
            <p className="mt-1 text-xs text-muted-foreground">
              One target per end — tap where each of the four bowls finished.
            </p>
          </button>

          <Link
            to="/challenge/$slug"
            params={{ slug: challenge.slug }}
            className="block py-2 text-center text-xs font-semibold text-muted-foreground"
          >
            View instructions
          </Link>
        </main>
      </>
    );
  }

  // ---------- End splash (before each end) ----------
  if (!finished && currentEnd && !endReady && bowlsThisEnd.length === 0) {
    return (
      <>
        <PageHeader title={challenge.name} subtitle={`${challenge.category} Challenge`} />
        <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
          <section className="rounded-3xl bg-card p-8 text-center bt-shadow-elevated">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Ready</p>
            <p className="mt-1 font-display text-3xl font-extrabold">END {endIdx + 1}</p>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Target Length
            </p>
            <p className="mt-1 font-display text-5xl font-extrabold text-primary">
              {SWITCH32_TARGET_LABEL[currentEnd.target].toUpperCase()}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Four bowls at this target. Hands change bowl-by-bowl.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {currentEnd.hands.map((h, i) => (
                <span
                  key={i}
                  className="rounded-full bg-secondary/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
                >
                  {i + 1}: {h === "forehand" ? "FH" : "BH"}
                </span>
              ))}
            </div>
            <Button
              onClick={() => setEndReady(true)}
              className="mt-6 h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated"
            >
              <Play className="mr-2 h-5 w-5" /> Begin End {endIdx + 1}
            </Button>
          </section>
          <div className="text-center text-xs text-muted-foreground">
            Progress · {completedEnds.length} / {SWITCH32_TOTAL_ENDS} ends · {totalScore} pts
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader title={challenge.name} subtitle={`${challenge.category} Challenge`} />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
          <div className="flex items-center justify-around text-center">
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Bowl</p>
              <p className="font-display text-3xl font-extrabold">
                {Math.min(totalBowls + (finished ? 0 : 1), SWITCH32_TOTAL_BOWLS)}
                <span className="text-base text-muted-foreground">/{SWITCH32_TOTAL_BOWLS}</span>
              </p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Score</p>
              <p className="font-display text-3xl font-extrabold text-primary">
                {totalScore}
                <span className="text-base text-muted-foreground">/{SWITCH32_MAX_SCORE}</span>
              </p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">End</p>
              <p className="font-display text-3xl font-extrabold">
                {Math.min(endIdx + 1, SWITCH32_TOTAL_ENDS)}
                <span className="text-base text-muted-foreground">/{SWITCH32_TOTAL_ENDS}</span>
              </p>
            </div>
          </div>
        </section>

        {!finished && currentEnd && currentHand ? (
          <section className="rounded-2xl bg-card p-5 bt-shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  End {endIdx + 1} · Target {SWITCH32_TARGET_LABEL[currentEnd.target]}
                </p>
                <h3 className="font-display text-xl font-bold">
                  Bowl {bowlIdx + 1} of {SWITCH32_BOWLS_PER_END} · {currentHand === "forehand" ? "Forehand" : "Backhand"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  End score so far: {bowlsThisEnd.reduce((s, b) => s + b.score, 0)}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={undoBowl}
                  disabled={totalBowls === 0}
                  className="gap-1 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Undo
                </Button>
                {bowlsThisEnd.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearEnd}
                    className="gap-1 text-xs text-destructive"
                  >
                    <X className="h-3.5 w-3.5" /> Clear end
                  </Button>
                )}
              </div>
            </div>

            {mode === "simple" ? (
              <div className="mt-4 grid grid-cols-4 gap-2">
                <SimpleButton onClick={() => recordSimple(5)} icon={<Sparkles className="h-5 w-5" />} label="Half Mat" sub="5" tone="primary" />
                <SimpleButton onClick={() => recordSimple(3)} icon={<Check className="h-5 w-5" />} label="One Mat" sub="3" tone="accent" />
                <SimpleButton onClick={() => recordSimple(1)} icon={<Check className="h-5 w-5" />} label="Two Mats" sub="1" tone="muted" />
                <SimpleButton onClick={() => recordSimple(0)} icon={<X className="h-5 w-5" />} label="Miss" sub="0" tone="destructive" />
              </div>
            ) : (
              <div className="mt-4">
                <VisualTarget
                  onSelect={recordVisual}
                  hand={currentHand}
                  markers={visualMarkers}
                  currentNumber={bowlIdx + 1}
                />
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Tap where bowl {bowlIdx + 1} finished — score is calculated automatically.
                </p>
              </div>
            )}
          </section>
        ) : finished ? (
          <>
            <section className="rounded-3xl bg-card p-6 text-center bt-shadow-elevated">
              <Trophy className="mx-auto h-10 w-10 text-primary" />
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Challenge complete
              </p>
              <p className="mt-1 font-display text-5xl font-extrabold">
                {totalScore}
                <span className="text-2xl text-muted-foreground">/{SWITCH32_MAX_SCORE}</span>
              </p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {Math.round((totalScore / SWITCH32_MAX_SCORE) * 100)}% accuracy
              </p>
            </section>

            {userId && (
              <ChallengeResultMeta challenge={challenge} score={totalScore} userId={userId} />
            )}

            <Switch32Summary ends={completedEnds} mode={mode} />

            <Button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated"
            >
              {saving ? "Saving…" : `Save result • ${totalScore} / ${SWITCH32_MAX_SCORE}`}
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={saving}
              variant="outline"
              className="h-14 w-full rounded-2xl text-sm font-bold"
            >
              Save & Repeat Challenge
            </Button>
          </>
        ) : null}

        <Link
          to="/challenge/$slug"
          params={{ slug: challenge.slug }}
          className="block py-2 text-center text-xs font-semibold text-muted-foreground"
        >
          View instructions
        </Link>
      </main>

      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quit this challenge?</AlertDialogTitle>
            <AlertDialogDescription>
              You haven't saved this challenge yet. Leaving now will discard your progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep playing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearChallengeStart(challenge.id);
                blocker.proceed?.();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Quit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SimpleButton({
  onClick,
  icon,
  label,
  sub,
  tone,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
  tone: "primary" | "destructive" | "accent" | "muted";
}) {
  const palette = {
    primary: "bt-gradient-primary text-white",
    accent: "bg-charcoal text-white",
    muted: "bg-secondary text-charcoal",
    destructive: "bg-destructive text-destructive-foreground",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-20 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold bt-shadow-card ${palette}`}
    >
      {icon}
      <span>{label}</span>
      <span className="text-[10px] font-semibold opacity-80">{sub} pts</span>
    </button>
  );
}

function Switch32Summary({
  ends,
  mode,
}: {
  ends: Switch32End[];
  mode: Switch32ScoringMode;
}) {
  const allBowls = ends.flatMap((e) => e.bowls);

  const perLength = useMemo(() => {
    const out: Record<Switch32Target, { score: number; max: number }> = {
      S: { score: 0, max: 0 },
      M: { score: 0, max: 0 },
      L: { score: 0, max: 0 },
    };
    for (const b of allBowls) {
      out[b.target].score += b.score;
      out[b.target].max += 5;
    }
    return out;
  }, [allBowls]);

  const perHand = useMemo(() => {
    const out = { forehand: { score: 0, max: 0 }, backhand: { score: 0, max: 0 } };
    for (const b of allBowls) {
      out[b.hand].score += b.score;
      out[b.hand].max += 5;
    }
    return out;
  }, [allBowls]);

  const bestEnd = ends.reduce((best, e) => (e.end_score > (best?.end_score ?? -1) ? e : best), ends[0]);
  const worstEnd = ends.reduce((w, e) => (e.end_score < (w?.end_score ?? Infinity) ? e : w), ends[0]);

  const visualBreakdown = useMemo(() => {
    if (mode !== "visual") return null;
    const visual = allBowls.filter((b) => b.line && b.weight);
    if (visual.length === 0) return null;
    const n = visual.length;
    const pct = (pred: (b: Switch32Bowl) => boolean) =>
      Math.round((visual.filter(pred).length / n) * 100);
    return {
      narrow: pct((b) => b.line === "narrow"),
      on: pct((b) => b.line === "on"),
      wide: pct((b) => b.line === "wide"),
      short: pct((b) => b.weight === "short"),
      jackHigh: pct((b) => b.weight === "jack-high"),
      past: pct((b) => b.weight === "past"),
    };
  }, [allBowls, mode]);

  return (
    <section className="rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base font-bold">Breakdown</h3>
      </div>

      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">End by end</p>
      <div className="mt-1 grid grid-cols-4 gap-2 text-center">
        {ends.map((e) => (
          <div key={e.end_number} className="rounded-xl bg-secondary/40 p-2">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">
              E{e.end_number} · {SWITCH32_TARGET_LABEL[e.target][0]}
            </p>
            <p className="mt-0.5 font-display text-lg font-extrabold text-primary">{e.end_score}</p>
            <p className="text-[10px] text-muted-foreground">/20</p>
          </div>
        ))}
      </div>

      {bestEnd && worstEnd && bestEnd.end_number !== worstEnd.end_number && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-xl bg-primary/10 p-2">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Best End</p>
            <p className="mt-0.5 font-display text-base font-extrabold text-primary">
              End {bestEnd.end_number} · {bestEnd.end_score}
            </p>
          </div>
          <div className="rounded-xl bg-destructive/10 p-2">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Worst End</p>
            <p className="mt-0.5 font-display text-base font-extrabold text-destructive">
              End {worstEnd.end_number} · {worstEnd.end_score}
            </p>
          </div>
        </div>
      )}

      <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">By length</p>
      <div className="mt-1 grid grid-cols-3 gap-2 text-center">
        {SWITCH32_TARGETS.map((t) => {
          const v = perLength[t];
          const pct = v.max ? Math.round((v.score / v.max) * 100) : 0;
          return (
            <div key={t} className="rounded-xl bg-secondary/40 p-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">{SWITCH32_TARGET_LABEL[t]}</p>
              <p className="mt-1 font-display text-lg font-extrabold text-primary">{pct}%</p>
              <p className="text-[10px] text-muted-foreground">{v.score}/{v.max}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">By hand</p>
      <div className="mt-1 grid grid-cols-2 gap-2 text-center">
        {(["forehand", "backhand"] as const).map((h) => {
          const v = perHand[h];
          const pct = v.max ? Math.round((v.score / v.max) * 100) : 0;
          return (
            <div key={h} className="rounded-xl bg-secondary/40 p-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">{h}</p>
              <p className="mt-1 font-display text-lg font-extrabold text-primary">{pct}%</p>
              <p className="text-[10px] text-muted-foreground">{v.score}/{v.max}</p>
            </div>
          );
        })}
      </div>

      {visualBreakdown && (
        <>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Line</p>
          <div className="mt-1 grid grid-cols-3 gap-2 text-center">
            <Cell label="Narrow" value={`${visualBreakdown.narrow}%`} />
            <Cell label="On Line" value={`${visualBreakdown.on}%`} tone="primary" />
            <Cell label="Wide" value={`${visualBreakdown.wide}%`} />
          </div>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Weight</p>
          <div className="mt-1 grid grid-cols-3 gap-2 text-center">
            <Cell label="Short" value={`${visualBreakdown.short}%`} />
            <Cell label="Within a Mat" value={`${visualBreakdown.jackHigh}%`} tone="primary" />
            <Cell label="Long" value={`${visualBreakdown.past}%`} />
          </div>
        </>
      )}
    </section>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "primary" }) {
  return (
    <div className={`rounded-xl p-2 ${tone === "primary" ? "bg-primary/10" : "bg-secondary/40"}`}>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-extrabold text-primary">{value}</p>
    </div>
  );
}
