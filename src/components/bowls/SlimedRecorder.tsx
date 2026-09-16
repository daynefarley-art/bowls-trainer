import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import { ExitPracticeButton } from "@/components/practice/ExitPracticeButton";
import { PauseButton } from "@/components/practice/PauseButton";
import { useActivityAutosave, useBackgroundPauseGuard } from "@/hooks/use-practice-activity";
import { usePracticeTracker } from "@/hooks/use-practice-tracker";
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
import { TargetStage } from "@/components/bowls/TargetStage";
import { VisualTarget, type VisualTap } from "@/components/bowls/VisualTarget";
import { EndInstructionsScreen } from "@/components/bowls/end-flow/EndInstructionsScreen";
import {
  clearChallengeStart,
  ensureChallengeStart,
  SLIMED_CIRCUIT_HAND,
  SLIMED_TARGETS,
  SLIMED_TARGET_LABEL,
  type Challenge,
  type SlimedBowl,
  type SlimedBreakdown,
  type SlimedHand,
  type SlimedLine,
  type SlimedScoringMode,
  type SlimedTarget,
  type SlimedWeight,
} from "@/lib/challenges";
import { ACTIVE_SESSION_QK, SESSIONS_QK, attachActivity, getActiveSession, ensureActivePractice } from "@/lib/sessions";
import { Trophy, BarChart3, Check, X, Sparkles, RotateCcw } from "lucide-react";
import { ChallengeResultMeta } from "@/components/bowls/ChallengeResultMeta";
import { DeliveryOrderStrip, type DeliveryPill } from "@/components/bowls/DeliveryOrderStrip";
import { EndPickerStrip, type EndChip } from "@/components/bowls/EndPickerStrip";
import { toast } from "sonner";
import { isDemoMode } from "@/lib/demo-mode";

const BOWLS_PER_END = 4;
const TOTAL_ENDS = 4;
const MAX_BOWLS = BOWLS_PER_END * TOTAL_ENDS; // 16
const MAX_SCORE = MAX_BOWLS * 5; // 80 (all bowls within ½ mat)
const END_MAX_SCORE = BOWLS_PER_END * 5; // 20
// Within one mat sideways of the jack is treated as on-line and excluded
// from narrow/wide stats (good bowl).
const ON_LINE_THRESHOLD = 1.0; // mat units
const JACK_HIGH_THRESHOLD = 0.25; // mat units

function classifyLine(x: number, hand: SlimedHand): SlimedLine {
  if (Math.abs(x) <= ON_LINE_THRESHOLD) return "on";
  if (hand === "forehand") return x < 0 ? "narrow" : "wide";
  return x > 0 ? "narrow" : "wide";
}

function classifyWeight(y: number): SlimedWeight {
  if (y > JACK_HIGH_THRESHOLD) return "past";
  if (y < -JACK_HIGH_THRESHOLD) return "short";
  return "jack-high";
}

// v3 scoring: ½ mat = 5, 1 mat = 3, 2 mats = 1, outside = 0. No toucher bonus.
function scoreFromTap(tap: VisualTap): 0 | 1 | 3 | 5 {
  if (tap.band === "half") return 5;
  if (tap.band === "one") return 3;
  if (tap.band === "two") return 1;
  return 0;
}

// 16-bowl sequence: 4 ends, one target per end (S, L, M, D), 4 bowls per end.
// Hand alternates per end following SLIMED_CIRCUIT_HAND (FH, BH, FH, BH).
type Slot = { bowl_number: number; circuit: number; hand: SlimedHand; target: SlimedTarget; subBowl: number };
const SEQUENCE: Slot[] = (() => {
  const out: Slot[] = [];
  let n = 1;
  for (let c = 1; c <= TOTAL_ENDS; c++) {
    const hand = SLIMED_CIRCUIT_HAND[c as 1 | 2 | 3 | 4];
    const target = SLIMED_TARGETS[c - 1];
    for (let b = 1; b <= BOWLS_PER_END; b++) {
      out.push({ bowl_number: n++, circuit: c, hand, target, subBowl: b });
    }
  }
  return out;
})();

export function SlimedRecorder({ challenge, start, resume }: { challenge: Challenge; start?: string; resume?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [mode, setMode] = useState<SlimedScoringMode | null>(null);
  const [bowls, setBowls] = useState<SlimedBowl[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [savedResultId, setSavedResultId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [practiceHydrated, setPracticeHydrated] = useState(false);
  // End-based flow: user reads instructions, hits NEXT to play the end, places
  // all 4 bowls, then SUBMITs the end to advance. Prevents auto-advance while
  // still allowing autosave on every bowl.
  const [submittedEnds, setSubmittedEnds] = useState(0);
  const [endPhase, setEndPhase] = useState<"instructions" | "recording">("instructions");
  const persistPromiseRef = useRef<Promise<{ ok: boolean; error?: string; activeSessionId?: string | null; resultId?: string | null }> | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (start !== "1" && !resume) {
      navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
      return;
    }
    setStartedAt((current) => current ?? ensureChallengeStart(challenge.id));
  }, [challenge.id, challenge.slug, start, resume, navigate]);

  const currentEnd = Math.min(submittedEnds + 1, TOTAL_ENDS);
  const bowlsInCurrentEnd = bowls.filter((b) => b.circuit === currentEnd).length;
  const currentSlotIndex = (currentEnd - 1) * BOWLS_PER_END + bowlsInCurrentEnd;
  const current =
    !finished && bowlsInCurrentEnd < BOWLS_PER_END && currentSlotIndex < SEQUENCE.length
      ? SEQUENCE[currentSlotIndex]
      : null;
  const endReadyToSubmit = !finished && bowlsInCurrentEnd >= BOWLS_PER_END;
  const total = bowls.reduce((s, b) => s + b.score, 0);
  const circuitScores = useMemo(() => {
    const arr = [0, 0, 0, 0];
    for (const b of bowls) arr[b.circuit - 1] += b.score;
    return arr;
  }, [bowls]);

  const hasUnsaved = !savedOk && bowls.length > 0;
  const practiceState = useMemo(
    () => ({ mode, bowls, finished, startedAt, total, maxScore: MAX_SCORE, submittedEnds, endPhase }),
    [mode, bowls, finished, startedAt, total, submittedEnds, endPhase],
  );
  const {
    activity: practiceActivity,
    saveState: savePracticeState,
    markCompleted: markPracticeCompleted,
    measureVersion,
  } = usePracticeTracker({
    userId: userId ?? undefined,
    kind: "challenge",
    slug: challenge.slug,
    challengeId: challenge.id,
    title: challenge.name,
    initialState: practiceState,
    bowlsDelivered: bowls.length,
    enabled: start === "1" || !!resume,
    resumeId: resume ?? null,
  });

  useEffect(() => {
    if (!practiceActivity || practiceHydrated) return;
    const s = (practiceActivity.state ?? {}) as Record<string, any>;
    if (s.mode === "simple" || s.mode === "visual") setMode(s.mode);
    let hydratedBowls: SlimedBowl[] = [];
    if (Array.isArray(s.bowls)) {
      hydratedBowls = s.bowls as SlimedBowl[];
      setBowls(hydratedBowls);
    }
    if (typeof s.finished === "boolean") setFinished(s.finished);
    if (typeof s.startedAt === "string") setStartedAt(s.startedAt);
    else setStartedAt(practiceActivity.started_at);
    if (typeof s.submittedEnds === "number") {
      setSubmittedEnds(Math.min(TOTAL_ENDS, Math.max(0, s.submittedEnds)));
    } else {
      // Legacy resume: derive from bowls, assuming any completed end was submitted.
      setSubmittedEnds(Math.min(TOTAL_ENDS, Math.floor(hydratedBowls.length / BOWLS_PER_END)));
    }
    if (s.endPhase === "instructions" || s.endPhase === "recording") {
      setEndPhase(s.endPhase);
    } else {
      const inEnd = hydratedBowls.filter((b) => b.circuit === Math.floor(hydratedBowls.length / BOWLS_PER_END) + 1).length;
      setEndPhase(inEnd > 0 ? "recording" : "instructions");
    }
    setPracticeHydrated(true);
  }, [practiceActivity, practiceHydrated]);

  useActivityAutosave(practiceActivity?.id, practiceState, {
    debounceMs: 250,
    bowlsDelivered: bowls.length,
  });
  useBackgroundPauseGuard(practiceActivity);

  async function flushPracticeState(
    nextBowls = bowls,
    nextFinished = finished,
    nextSubmittedEnds = submittedEnds,
    nextEndPhase: "instructions" | "recording" = endPhase,
  ) {
    await savePracticeState(
      {
        mode,
        bowls: nextBowls,
        finished: nextFinished,
        startedAt,
        total: nextBowls.reduce((s, b) => s + b.score, 0),
        maxScore: MAX_SCORE,
        submittedEnds: nextSubmittedEnds,
        endPhase: nextEndPhase,
      },
      nextBowls.length,
    );
  }

  async function chooseMode(nextMode: SlimedScoringMode) {
    setMode(nextMode);
    await savePracticeState(
      {
        mode: nextMode,
        bowls,
        finished,
        startedAt,
        total,
        maxScore: MAX_SCORE,
        submittedEnds,
        endPhase,
      },
      bowls.length,
    );
  }
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved && !finished,
    enableBeforeUnload: hasUnsaved && !finished,
    withResolver: true,
  });

  function startEnd() {
    setEndPhase("recording");
    flushPracticeState(bowls, finished, submittedEnds, "recording").catch(() => {});
  }

  /**
   * Edit a previously submitted end. Decrements the submitted counter so
   * the chosen end becomes current again; existing bowls for that end stay
   * in the bowls[] array so markers reappear and totals recompute
   * automatically. Once the user re-submits, subsequent ends whose bowls
   * are already present will fast-forward through the ready-to-submit
   * panel.
   */
  function jumpToEnd(target: number) {
    if (target < 1 || target > TOTAL_ENDS) return;
    const nextSubmitted = Math.max(0, target - 1);
    setSubmittedEnds(nextSubmitted);
    setEndPhase("recording");
    setFinished(false);
    flushPracticeState(bowls, false, nextSubmitted, "recording").catch(() => {});
  }


  function submitEnd() {
    if (!endReadyToSubmit) return;
    const isLast = currentEnd >= TOTAL_ENDS;
    const nextSubmitted = submittedEnds + 1;
    const nextFinished = isLast;
    const nextPhase: "instructions" | "recording" = isLast ? "recording" : "instructions";
    setSubmittedEnds(nextSubmitted);
    setEndPhase(nextPhase);
    if (nextFinished) setFinished(true);
    flushPracticeState(bowls, nextFinished, nextSubmitted, nextPhase).catch(() => {});
  }

  function recordSimple(score: 0 | 1 | 3 | 5) {
    if (!current || endPhase !== "recording") return;
    const bowl: SlimedBowl = {
      bowl_number: current.bowl_number,
      circuit: current.circuit,
      hand: current.hand,
      target: current.target,
      score,
    };
    const next = [...bowls, bowl];
    setBowls(next);
    flushPracticeState(next, finished, submittedEnds, endPhase).catch(() => {});
  }

  function recordVisual(tap: VisualTap) {
    if (!current || endPhase !== "recording") return;
    const score = scoreFromTap(tap);
    const bowl: SlimedBowl = {
      bowl_number: current.bowl_number,
      circuit: current.circuit,
      hand: current.hand,
      target: current.target,
      score,
      x: tap.x,
      y: tap.y,
      line: classifyLine(tap.x, current.hand),
      weight: classifyWeight(tap.y),
    };
    const next = [...bowls, bowl];
    setBowls(next);
    flushPracticeState(next, finished, submittedEnds, endPhase).catch(() => {});
  }

  function undo() {
    if (bowlsInCurrentEnd === 0) return;
    // Only undo bowls from the current end so submitted ends stay locked.
    const next = [...bowls];
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].circuit === currentEnd) {
        next.splice(i, 1);
        break;
      }
    }
    setBowls(next);
    flushPracticeState(next, finished, submittedEnds, endPhase).catch(() => {});
  }

  function clearEnd() {
    const next = bowls.filter((b) => b.circuit !== currentEnd);
    if (next.length === bowls.length) return;
    setBowls(next);
    flushPracticeState(next, finished, submittedEnds, endPhase).catch(() => {});
  }

  function moveBowl(bowlNumber: number, tap: VisualTap) {
    const score = scoreFromTap(tap);
    const next = bowls.map((b) => {
      if (b.bowl_number !== bowlNumber) return b;
      return {
        ...b,
        score,
        x: tap.x,
        y: tap.y,
        line: classifyLine(tap.x, b.hand),
        weight: classifyWeight(tap.y),
      };
    });
    setBowls(next);
    flushPracticeState(next, finished).catch(() => {});
  }

  const currentEndMarkers = useMemo(() => {
    return bowls
      .filter((b) => b.circuit === currentEnd && b.x != null && b.y != null)
      .map((b) => ({ x: b.x!, y: b.y!, number: b.bowl_number, hand: b.hand }));
  }, [bowls, currentEnd]);




  async function persistResult(): Promise<{ ok: boolean; error?: string; activeSessionId?: string | null; resultId?: string | null }> {
    if (!userId) return { ok: false, error: "Not signed in" };
    if (savedOk && savedResultId) return { ok: true, resultId: savedResultId };
    if (persistPromiseRef.current) return persistPromiseRef.current;
    persistPromiseRef.current = persistResultOnce().finally(() => {
      persistPromiseRef.current = null;
    });
    return persistPromiseRef.current;
  }

  async function persistResultOnce(): Promise<{ ok: boolean; error?: string; activeSessionId?: string | null; resultId?: string | null }> {
    const uid = userId;
    if (!uid) return { ok: false, error: "Not signed in" };
    const completedAt = new Date();
    const startIso = startedAt ?? ensureChallengeStart(challenge.id);
    const durationMinutes = Math.min(60, Math.max(1, Math.round((completedAt.getTime() - new Date(startIso).getTime()) / 60000)));
    const breakdown: SlimedBreakdown = {
      measure_v: measureVersion,
      type: "slimed",
      mode: mode ?? "simple",
      bowls,
      total_score: total,
      max_score: MAX_SCORE,
      circuit_scores: circuitScores,
    };
    let activeSession: Awaited<ReturnType<typeof ensureActivePractice>> | null = null;
    try {
      activeSession = await ensureActivePractice(uid);
    } catch (error) {
      console.warn("[SLiMeD] practice session unavailable; saving challenge result without session", error);
    }

    if (isDemoMode()) {
      clearChallengeStart(challenge.id);
      if (activeSession) await attachActivity(activeSession.id, "challenge", challenge.category);
      return { ok: true, activeSessionId: activeSession?.id ?? null };
    }

    // Up to 3 attempts (handles transient network failures).
    let lastError: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await (supabase as any)
        .from("challenge_results")
        .insert({
          user_id: uid,
          challenge_id: challenge.id,
          challenge_name: challenge.name,
          category: challenge.category,
          score: total,
          breakdown,
          played_at: completedAt.toISOString(),
          challenge_started_at: startIso,
          challenge_completed_at: completedAt.toISOString(),
          duration_minutes: durationMinutes,
          session_id: activeSession?.id ?? null,
        })
        .select("id")
        .single();
      if (!error && data) {
        clearChallengeStart(challenge.id);
        try {
          await markPracticeCompleted({ challengeResultId: data.id });
        } catch (activityError) {
          console.warn("[SLiMeD] result saved but practice activity completion failed", activityError);
        }
        if (activeSession) {
          try {
            await attachActivity(activeSession.id, "challenge", challenge.category);
          } catch (sessionError) {
            console.warn("[SLiMeD] result saved but practice session attach failed", sessionError);
          }
          qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(uid) });
          qc.invalidateQueries({ queryKey: SESSIONS_QK(uid) });
          qc.invalidateQueries({ queryKey: ["training_session", activeSession.id] });
          qc.invalidateQueries({ queryKey: ["session_challenges", activeSession.id] });
        }
        qc.invalidateQueries({ queryKey: ["challenge_results"] });
        qc.invalidateQueries({ queryKey: ["challenge_results", uid] });
        qc.invalidateQueries({ queryKey: ["challenge_results", uid, challenge.slug] });
        qc.invalidateQueries({ queryKey: ["challenge_history", uid] });
        setSavedResultId(data.id);
        return { ok: true, activeSessionId: activeSession?.id ?? null, resultId: data.id };
      }
      lastError = error?.message ?? "Save failed";
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    return { ok: false, error: lastError, activeSessionId: activeSession?.id ?? null };
  }

  async function handleSave(repeat = false) {
    if (!userId) return toast.error("Not signed in");
    if (savedOk) {
      if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
      else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
      return;
    }
    setSaving(true);
    const res = await persistResult();
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Save failed — tap Save to retry");
      return;
    }
    setSavedOk(true);
    setSavedResultId(res.resultId ?? savedResultId);
    if (isDemoMode()) {
      toast.success(`Demo result — not saved (${total}/${MAX_SCORE})`);
    } else {
      toast.success(res.activeSessionId ? "Added to session" : `Saved — ${total} / ${MAX_SCORE}`);
    }
    if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
    else if (res.activeSessionId) navigate({ to: "/sessions/$id", params: { id: res.activeSessionId } });
    else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
  }

  // Auto-save the moment the challenge finishes so a completed attempt is
  // never lost if the user navigates away without pressing "Save result".
  useEffect(() => {
    if (!finished || savedOk || saving || !userId) return;
    let cancelled = false;
    (async () => {
      setSaving(true);
      const res = await persistResult();
      if (cancelled) return;
      setSaving(false);
      if (res.ok) setSavedOk(true);
      else toast.error(res.error ?? "Auto-save failed — tap Save to retry");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, userId]);


  // Scoring mode picker
  if (mode === null) {
    return (
      <>
        <PageHeader title={challenge.name} subtitle={`${challenge.category} Challenge`} />
        <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
          <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Choose Scoring</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold">How will you score?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Simple is fastest. Visual Target tracks where each bowl lands and unlocks line + weight analytics.
            </p>
          </section>

          <button
            type="button"
            onClick={() => chooseMode("simple")}
            className="block w-full rounded-2xl bg-card p-5 text-left bt-shadow-card hover:bt-shadow-elevated"
          >
            <p className="font-display text-lg font-bold">Simple Scoring</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap one of four buttons per bowl: 5 pts within ½ mat · 3 pts within 1 mat · 1 pt within 2 mats · 0 outside.
            </p>
          </button>

          <button
            type="button"
            onClick={() => chooseMode("visual")}
            className="block w-full rounded-2xl bg-card p-5 text-left bt-shadow-card hover:bt-shadow-elevated"
          >
            <p className="font-display text-lg font-bold">Visual Target Scoring</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap where each bowl finished on a target diagram. Adds narrow/wide and short/within a mat/long analytics.
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

  return (
    <>
      <PageHeader
        title={challenge.name}
        subtitle={`${challenge.category} Challenge`}
        leading={
          <ExitPracticeButton
            activity={practiceActivity}
            onBeforePause={() => flushPracticeState()}
            onBeforeDiscard={() => flushPracticeState()}
            hasCurrentStats={bowls.length > 0}
            onSaved={() => navigate({ to: "/dashboard" })}
            onDiscarded={() => navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } })}
          />
        }
      />

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
          <div className="flex items-center justify-around text-center">
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Bowl</p>
              <p className="font-display text-3xl font-extrabold">
                {Math.min(bowls.length + (finished || endPhase === "instructions" ? 0 : 1), MAX_BOWLS)}
                <span className="text-base text-muted-foreground">/{MAX_BOWLS}</span>
              </p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Score</p>
              <p className="font-display text-3xl font-extrabold text-primary">
                {total}
                <span className="text-base text-muted-foreground">/{MAX_SCORE}</span>
              </p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Mode</p>
              <p className="font-display text-base font-extrabold capitalize">
                {mode}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {circuitScores.map((s, i) => (
              <div
                key={i}
                className={`rounded-xl p-2 ${current && current.circuit === i + 1 && !finished ? "bg-primary/10" : "bg-secondary/40"}`}
              >
                <p className="text-[10px] font-bold uppercase text-muted-foreground">
                  C{i + 1} · {SLIMED_CIRCUIT_HAND[i + 1] === "forehand" ? "FH" : "BH"}
                </p>
                <p className="mt-0.5 font-display text-lg font-extrabold text-primary">{s}</p>
                <p className="text-[10px] text-muted-foreground">/{END_MAX_SCORE}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Always-visible ends navigator — tap a submitted end to edit it. */}
        {!finished && (
          <section className="rounded-2xl bg-card p-3 bt-shadow-card">
            <EndPickerStrip
              ends={Array.from({ length: TOTAL_ENDS }, (_, i): EndChip => ({
                end: i + 1,
                submitted: i + 1 <= submittedEnds,
                current: i + 1 === currentEnd,
                reachable: i + 1 <= submittedEnds || i + 1 === currentEnd,
                score: i + 1 <= submittedEnds ? circuitScores[i] : null,
              }))}
              onJump={jumpToEnd}
            />
          </section>
        )}


        {!finished && endPhase === "instructions" ? (
          <EndInstructionsScreen
            endNumber={currentEnd}
            totalEnds={TOTAL_ENDS}
            hand={SLIMED_CIRCUIT_HAND[currentEnd as 1 | 2 | 3 | 4]}
            targetLabel={`${SLIMED_TARGET_LABEL[SLIMED_TARGETS[currentEnd - 1]]} (${SLIMED_TARGETS[currentEnd - 1]})`}
            targetSub={`Play all ${BOWLS_PER_END} bowls to the ${SLIMED_TARGET_LABEL[SLIMED_TARGETS[currentEnd - 1]]} target.`}
            bowlsPerEnd={BOWLS_PER_END}
            description={
              mode === "visual"
                ? "Tap the visual target to place each bowl. Drag a placed bowl to adjust it before you submit the end."
                : "Choose the score band for each bowl. You can undo any bowl before you submit the end."
            }
            bullets={[
              `Hand: ${SLIMED_CIRCUIT_HAND[currentEnd as 1 | 2 | 3 | 4] === "forehand" ? "Forehand" : "Backhand"} for the whole end`,
              `Scoring: ½ mat = 5 · 1 mat = 3 · 2 mats = 1 · miss = 0`,
              `Submit the end when all ${BOWLS_PER_END} bowls are placed.`,
            ]}
            onNext={startEnd}
          />
        ) : !finished && current ? (
          <section className="rounded-2xl bg-card p-5 bt-shadow-card">
            <PauseButton
              activity={practiceActivity}
              label="Pause"
              onBeforePause={() => flushPracticeState()}
              onBeforeDiscard={() => flushPracticeState()}
              hasCurrentStats={bowls.length > 0}
              onSaved={() => navigate({ to: "/dashboard" })}
              onDiscarded={() => navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } })}
              className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground active:scale-[0.99] transition"
            />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  End {current.circuit} of {TOTAL_ENDS} · {current.hand === "forehand" ? "Forehand" : "Backhand"}
                </p>
                <h3 className="font-display text-xl font-bold">
                  Target: {SLIMED_TARGET_LABEL[current.target]} ({current.target})
                </h3>
              </div>
            </div>

            <div className="mt-3">
              <DeliveryOrderStrip
                bowls={Array.from({ length: BOWLS_PER_END }, (_, i): DeliveryPill => ({
                  number: i + 1,
                  hand: current.hand,
                  label: `${SLIMED_TARGET_LABEL[current.target]}`,
                  placed: i < bowlsInCurrentEnd,
                  current: i === bowlsInCurrentEnd,
                }))}
              />
            </div>


            {mode === "simple" ? (
              <div className="mt-4 grid grid-cols-4 gap-2">
                <SimpleButton
                  onClick={() => recordSimple(5)}
                  icon={<Sparkles className="h-5 w-5" />}
                  label="½ Mat"
                  sub="5 pts"
                  tone="primary"
                />
                <SimpleButton
                  onClick={() => recordSimple(3)}
                  icon={<Check className="h-5 w-5" />}
                  label="1 Mat"
                  sub="3 pts"
                  tone="accent"
                />
                <SimpleButton
                  onClick={() => recordSimple(1)}
                  icon={<Check className="h-5 w-5" />}
                  label="2 Mats"
                  sub="1 pt"
                  tone="accent"
                />
                <SimpleButton
                  onClick={() => recordSimple(0)}
                  icon={<X className="h-5 w-5" />}
                  label="Miss"
                  sub="0"
                  tone="destructive"
                />
              </div>
            ) : (
              <TargetStage
                className="mt-4"
                onSelect={recordVisual}
                onMoveMarker={moveBowl}
                hand={current.hand}
                markers={currentEndMarkers}
                currentNumber={current.bowl_number}
              />
            )}

            <div className="mt-5 space-y-2">
              <Button
                type="button"
                variant="secondary"
                onClick={undo}
                disabled={bowlsInCurrentEnd === 0}
                className="h-11 w-full gap-1.5 rounded-2xl text-sm font-bold"
              >
                <RotateCcw className="h-4 w-4" /> Undo Last Bowl
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={clearEnd}
                disabled={bowlsInCurrentEnd === 0}
                className="h-11 w-full gap-1.5 rounded-2xl text-sm font-bold text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" /> Clear End
              </Button>
            </div>
          </section>
        ) : !finished && endReadyToSubmit ? (
          <section className="rounded-2xl bg-card p-5 bt-shadow-card">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
              End {currentEnd} of {TOTAL_ENDS} — Ready to submit
            </p>
            <h3 className="mt-1 font-display text-xl font-bold">
              All {BOWLS_PER_END} bowls placed
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the target, then submit this end to lock the score and move on.
              You can still undo or clear before you submit.
            </p>

            {mode === "visual" && (
              <TargetStage
                className="mt-4"
                caption="Drag a bowl to fine-tune its position before submitting."
                onSelect={() => {}}
                onMoveMarker={moveBowl}
                hand={SLIMED_CIRCUIT_HAND[currentEnd as 1 | 2 | 3 | 4]}
                markers={currentEndMarkers}
              />
            )}

            <div className="mt-5 space-y-2">
              <Button
                onClick={submitEnd}
                className="h-14 w-full gap-2 rounded-2xl text-base font-bold bt-shadow-elevated"
              >
                {currentEnd >= TOTAL_ENDS ? "Submit End & Finish" : `Submit End · Continue to End ${currentEnd + 1}`}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={undo}
                className="h-11 w-full gap-1.5 rounded-2xl text-sm font-bold"
              >
                <RotateCcw className="h-4 w-4" /> Undo Last Bowl
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={clearEnd}
                className="h-11 w-full gap-1.5 rounded-2xl text-sm font-bold text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" /> Clear End
              </Button>
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-3xl bg-card p-6 text-center bt-shadow-elevated">
              <Trophy className="mx-auto h-10 w-10 text-primary" />
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Challenge complete
              </p>
              <p className="mt-1 font-display text-5xl font-extrabold">
                {total}
                <span className="text-2xl text-muted-foreground">/{MAX_SCORE}</span>
              </p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {Math.round((total / MAX_SCORE) * 100)}% accuracy
              </p>
            </section>

            {userId && (
              <ChallengeResultMeta challenge={challenge} score={total} userId={userId} />
            )}

            <SlimedSummary bowls={bowls} circuitScores={circuitScores} mode={mode} />


            <Button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated"
            >
              {saving
                ? "Saving…"
                : savedOk
                  ? `Saved ✓ · Continue • ${total} / ${MAX_SCORE}`
                  : `Save result • ${total} / ${MAX_SCORE}`}
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
        )}

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
              You haven't saved this challenge yet. Leaving now will discard your progress and the training time won't be recorded.
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
  tone: "primary" | "destructive" | "accent";
}) {
  const palette = {
    primary: "bt-gradient-primary text-white",
    accent: "bg-charcoal text-white",
    destructive: "bg-destructive text-destructive-foreground",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-20 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold bt-shadow-card ${palette}`}
    >
      {icon}
      <span>{label}</span>
      <span className="text-[10px] font-semibold opacity-80">{sub}</span>
    </button>
  );
}

function SlimedSummary({
  bowls,
  circuitScores,
  mode,
}: {
  bowls: SlimedBowl[];
  circuitScores: number[];
  mode: SlimedScoringMode;
}) {
  // Per-length accuracy (% of max points per target = bowls_at_target × 2)
  const perLength = useMemo(() => {
    const tally: Record<string, { score: number; max: number }> = {};
    for (const t of SLIMED_TARGETS) tally[t] = { score: 0, max: 0 };
    for (const b of bowls) {
      tally[b.target].score += b.score;
      tally[b.target].max += 5;
    }
    return tally;
  }, [bowls]);

  const perHand = useMemo(() => {
    const out = { forehand: { score: 0, max: 0 }, backhand: { score: 0, max: 0 } };
    for (const b of bowls) {
      out[b.hand].score += b.score;
      out[b.hand].max += 5;
    }
    return out;
  }, [bowls]);

  const visualBreakdown = useMemo(() => {
    if (mode !== "visual") return null;
    const visual = bowls.filter((b) => b.line && b.weight);
    if (visual.length === 0) return null;
    const n = visual.length;
    const count = (pred: (b: SlimedBowl) => boolean) =>
      Math.round((visual.filter(pred).length / n) * 100);
    return {
      narrow: count((b) => b.line === "narrow"),
      on: count((b) => b.line === "on"),
      wide: count((b) => b.line === "wide"),
      short: count((b) => b.weight === "short"),
      jackHigh: count((b) => b.weight === "jack-high"),
      past: count((b) => b.weight === "past"),
    };
  }, [bowls, mode]);

  const ranked = SLIMED_TARGETS
    .map((t) => ({ t, pct: perLength[t].max ? (perLength[t].score / perLength[t].max) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  return (
    <section className="rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base font-bold">Breakdown</h3>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {circuitScores.map((s, i) => (
          <div key={i} className="rounded-xl bg-secondary/40 p-2">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Circuit {i + 1}</p>
            <p className="mt-1 font-display text-xl font-extrabold text-primary">{s}</p>
            <p className="text-[10px] text-muted-foreground">/40</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">By length</p>
      <div className="mt-1 grid grid-cols-4 gap-2 text-center">
        {SLIMED_TARGETS.map((t) => {
          const v = perLength[t];
          const pct = v.max ? Math.round((v.score / v.max) * 100) : 0;
          return (
            <div key={t} className="rounded-xl bg-secondary/40 p-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">{SLIMED_TARGET_LABEL[t]}</p>
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

      {best && worst && best.t !== worst.t && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-xl bg-primary/10 p-2">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Strongest</p>
            <p className="mt-0.5 font-display text-base font-extrabold text-primary">
              {SLIMED_TARGET_LABEL[best.t]}
            </p>
          </div>
          <div className="rounded-xl bg-destructive/10 p-2">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Weakest</p>
            <p className="mt-0.5 font-display text-base font-extrabold text-destructive">
              {SLIMED_TARGET_LABEL[worst.t]}
            </p>
          </div>
        </div>
      )}

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
            <Cell label="Within 1 mat" value={`${visualBreakdown.jackHigh}%`} tone="primary" />
            <Cell label="Long" value={`${visualBreakdown.past}%`} />
          </div>
          <ScatterChart bowls={bowls.filter((b) => b.x != null && b.y != null)} />
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

function ScatterChart({ bowls }: { bowls: SlimedBowl[] }) {
  if (bowls.length === 0) return null;
  const VB = 200;
  const HALF = VB / 2;
  const UNIT = 40; // 1 mat = 40 units; viewport spans ±2.5 mats
  return (
    <div className="mt-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bowl scatter</p>
      <div className="mt-1 mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl border border-border bg-secondary/40">
        <svg viewBox={`${-HALF} ${-HALF} ${VB} ${VB}`} className="h-full w-full">
          <circle cx={0} cy={0} r={2 * UNIT} fill="none" stroke="var(--color-border)" strokeWidth={1} />
          <circle cx={0} cy={0} r={1 * UNIT} fill="none" stroke="var(--color-border)" strokeWidth={1} />
          <circle cx={0} cy={0} r={0.5 * UNIT} fill="none" stroke="var(--color-border)" strokeWidth={1} />
          <line x1={-HALF} y1={0} x2={HALF} y2={0} stroke="var(--color-border)" strokeDasharray="3 3" strokeWidth={0.5} />
          <line x1={0} y1={-HALF} x2={0} y2={HALF} stroke="var(--color-border)" strokeDasharray="3 3" strokeWidth={0.5} />
          <circle cx={0} cy={0} r={4} fill="var(--color-primary)" />
          {bowls.map((b, i) => (
            <circle
              key={i}
              cx={(b.x ?? 0) * UNIT}
              cy={-(b.y ?? 0) * UNIT}
              r={3.5}
              fill={b.score >= 5 ? "var(--color-primary)" : b.score >= 3 ? "var(--color-charcoal, #333)" : b.score >= 1 ? "var(--color-accent, #999)" : "var(--color-destructive)"}
              fillOpacity={0.75}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
