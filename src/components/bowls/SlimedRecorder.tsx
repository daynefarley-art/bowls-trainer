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
import { ACTIVE_SESSION_QK, SESSIONS_QK, attachActivity, getActiveSession } from "@/lib/sessions";
import { Trophy, BarChart3, Check, X, Sparkles, RotateCcw } from "lucide-react";
import { ChallengeResultMeta } from "@/components/bowls/ChallengeResultMeta";
import { toast } from "sonner";
import { isDemoMode } from "@/lib/demo-mode";

const MAX_BOWLS = 32;
const MAX_SCORE = 64;
// Within one mat sideways of the jack is treated as on-line and excluded
// from narrow/wide stats (good bowl).
const ON_LINE_THRESHOLD = 1.0; // mat units
const JACK_HIGH_THRESHOLD = 0.25; // mat units

function classifyLine(x: number, hand: SlimedHand): SlimedLine {
  if (Math.abs(x) <= ON_LINE_THRESHOLD) return "on";
  // FH: left (x<0) = narrow, right = wide
  // BH: right (x>0) = narrow, left = wide
  if (hand === "forehand") return x < 0 ? "narrow" : "wide";
  return x > 0 ? "narrow" : "wide";
}

function classifyWeight(y: number): SlimedWeight {
  if (y > JACK_HIGH_THRESHOLD) return "past";
  if (y < -JACK_HIGH_THRESHOLD) return "short";
  return "jack-high";
}

function scoreFromTap(tap: VisualTap): 0 | 1 | 2 {
  if (tap.band === "half") return 2;
  if (tap.band === "one") return 1;
  return 0;
}

// 32-bowl sequence builder: 4 circuits × 4 targets × 2 bowls
type Slot = { bowl_number: number; circuit: number; hand: SlimedHand; target: SlimedTarget; subBowl: 1 | 2 };
const SEQUENCE: Slot[] = (() => {
  const out: Slot[] = [];
  let n = 1;
  for (let c = 1 as 1 | 2 | 3 | 4; c <= 4; c = ((c + 1) as 1 | 2 | 3 | 4)) {
    const hand = SLIMED_CIRCUIT_HAND[c];
    for (const t of SLIMED_TARGETS) {
      out.push({ bowl_number: n++, circuit: c, hand, target: t, subBowl: 1 });
      out.push({ bowl_number: n++, circuit: c, hand, target: t, subBowl: 2 });
    }
  }
  return out;
})();

export function SlimedRecorder({ challenge, start }: { challenge: Challenge; start?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [mode, setMode] = useState<SlimedScoringMode | null>(null);
  const [bowls, setBowls] = useState<SlimedBowl[]>([]);
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

  const idx = bowls.length;
  const current = idx < SEQUENCE.length ? SEQUENCE[idx] : null;
  const total = bowls.reduce((s, b) => s + b.score, 0);
  const circuitScores = useMemo(() => {
    const arr = [0, 0, 0, 0];
    for (const b of bowls) arr[b.circuit - 1] += b.score;
    return arr;
  }, [bowls]);

  const hasUnsaved = !savedOk && bowls.length > 0;
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved && !finished,
    enableBeforeUnload: hasUnsaved && !finished,
    withResolver: true,
  });

  function recordSimple(score: 0 | 1 | 2) {
    if (!current) return;
    const bowl: SlimedBowl = {
      bowl_number: current.bowl_number,
      circuit: current.circuit,
      hand: current.hand,
      target: current.target,
      score,
    };
    const next = [...bowls, bowl];
    setBowls(next);
    if (next.length >= MAX_BOWLS) setFinished(true);
  }

  function recordVisual(tap: VisualTap) {
    if (!current) return;
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
    if (next.length >= MAX_BOWLS) setFinished(true);
  }

  function undo() {
    if (bowls.length === 0) return;
    setBowls(bowls.slice(0, -1));
    setFinished(false);
  }

  async function handleSave(repeat = false) {
    if (!userId) return toast.error("Not signed in");
    setSaving(true);
    const completedAt = new Date();
    const startIso = startedAt ?? ensureChallengeStart(challenge.id);
    const durationMinutes = Math.max(
      1,
      Math.round((completedAt.getTime() - new Date(startIso).getTime()) / 60000),
    );
    const breakdown: SlimedBreakdown = {
      type: "slimed",
      mode: mode ?? "simple",
      bowls,
      total_score: total,
      max_score: MAX_SCORE,
      circuit_scores: circuitScores,
    };
    const activeSession = await getActiveSession(userId);

    if (isDemoMode()) {
      setSaving(false);
      clearChallengeStart(challenge.id);
      setSavedOk(true);
      if (activeSession) await attachActivity(activeSession.id, "challenge", challenge.category);
      toast.success(`Demo result — not saved (${total}/${MAX_SCORE})`);
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
    toast.success(activeSession ? "Added to session" : `Saved — ${total} / ${MAX_SCORE}`);
    if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
    else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
    else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
  }

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
            onClick={() => setMode("simple")}
            className="block w-full rounded-2xl bg-card p-5 text-left bt-shadow-card hover:bt-shadow-elevated"
          >
            <p className="font-display text-lg font-bold">Simple Scoring</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap one of three buttons per bowl: 2 pts toucher inside ½ mat · 1 pt inside 1 mat · 0 outside.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode("visual")}
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
      <PageHeader title={challenge.name} subtitle={`${challenge.category} Challenge`} />

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
          <div className="flex items-center justify-around text-center">
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Bowl</p>
              <p className="font-display text-3xl font-extrabold">
                {Math.min(bowls.length + (finished ? 0 : 1), MAX_BOWLS)}
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
                <p className="text-[10px] text-muted-foreground">/16</p>
              </div>
            ))}
          </div>
        </section>

        {!finished && current ? (
          <section className="rounded-2xl bg-card p-5 bt-shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Circuit {current.circuit} of 4 · {current.hand === "forehand" ? "Forehand" : "Backhand"}
                </p>
                <h3 className="font-display text-xl font-bold">
                  Target: {SLIMED_TARGET_LABEL[current.target]} ({current.target})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Bowl {current.subBowl} of 2 at this target
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={undo}
                disabled={bowls.length === 0}
                className="gap-1 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Undo
              </Button>
            </div>

            {mode === "simple" ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                <SimpleButton
                  onClick={() => recordSimple(2)}
                  icon={<Sparkles className="h-5 w-5" />}
                  label="Toucher"
                  sub="½ mat · 2"
                  tone="primary"
                />
                <SimpleButton
                  onClick={() => recordSimple(1)}
                  icon={<Check className="h-5 w-5" />}
                  label="1 Mat"
                  sub="within · 1"
                  tone="accent"
                />
                <SimpleButton
                  onClick={() => recordSimple(0)}
                  icon={<X className="h-5 w-5" />}
                  label="Miss"
                  sub="outside · 0"
                  tone="destructive"
                />
              </div>
            ) : (
              <div className="mt-4">
                <VisualTarget onSelect={recordVisual} hand={current.hand} />
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Tap where the bowl finished — score is calculated automatically.
                </p>
              </div>
            )}
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
              {saving ? "Saving…" : `Save result • ${total} / ${MAX_SCORE}`}
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
      tally[b.target].max += 2;
    }
    return tally;
  }, [bowls]);

  const perHand = useMemo(() => {
    const out = { forehand: { score: 0, max: 0 }, backhand: { score: 0, max: 0 } };
    for (const b of bowls) {
      out[b.hand].score += b.score;
      out[b.hand].max += 2;
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
            <p className="text-[10px] text-muted-foreground">/16</p>
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
            <Cell label="Within a Mat" value={`${visualBreakdown.jackHigh}%`} tone="primary" />
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
              fill={b.score === 2 ? "var(--color-primary)" : b.score === 1 ? "var(--color-charcoal, #333)" : "var(--color-destructive)"}
              fillOpacity={0.75}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
