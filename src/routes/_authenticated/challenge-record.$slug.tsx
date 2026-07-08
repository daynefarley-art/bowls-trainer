import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
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
import {
  bowlsAfter,
  summariseKeepItUp,
  ensureChallengeStart,
  clearChallengeStart,
  DRIVE_THEN_DRAW_BOWLS_PER_END,
  DRIVE_THEN_DRAW_MAX_SCORE,
  DRIVE_THEN_DRAW_TOTAL_BOWLS,
  DRIVE_THEN_DRAW_TOTAL_ENDS,
  normalizeChallengeConfig,
  JACK_IN_DITCH_PERFECT_BONUS,
  JACK_IN_DITCH_POINTS_GATE,
  JACK_IN_DITCH_POINTS_JACK,
  type Challenge,
  type BowlOutcome,
  type KeepItUpEnd,
  type FixedEndsEnd,
  type DriveDrawBowl,
  type DriveDrawEnd,
  type JackInDitchBowl,
  type JackInDitchEnd,
  type JackInDitchOutcome,
} from "@/lib/challenges";
import { Trophy, Check, X, Sparkles, BarChart3, Target, Crosshair, Zap } from "lucide-react";
import { ChallengeResultMeta } from "@/components/bowls/ChallengeResultMeta";
import { toast } from "sonner";
import { ACTIVE_SESSION_QK, SESSIONS_QK, attachActivity, getActiveSession } from "@/lib/sessions";
import { isDemoMode } from "@/lib/demo-mode";
import { SlimedRecorder } from "@/components/bowls/SlimedRecorder";
import { Switch32Recorder } from "@/components/bowls/Switch32Recorder";
import { VisualTarget, type VisualTap } from "@/components/bowls/VisualTarget";
import { GhostBanner } from "@/components/bowls/GhostBanner";

type ScoringMode = "simple" | "visual";
const SCORING_MODE_KEY = "bowls.scoringMode";
function readScoringMode(): ScoringMode {
  if (typeof window === "undefined") return "simple";
  return localStorage.getItem(SCORING_MODE_KEY) === "visual" ? "visual" : "simple";
}
function writeScoringMode(m: ScoringMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SCORING_MODE_KEY, m);
}

function ScoringModeToggle({ mode, onChange }: { mode: ScoringMode; onChange: (m: ScoringMode) => void }) {
  return (
    <section className="rounded-2xl bg-card p-4 bt-shadow-card">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Scoring Mode</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["simple", "visual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
              mode === m ? "bt-gradient-primary text-white" : "bg-secondary text-charcoal"
            }`}
          >
            {m === "simple" ? "Simple" : "Visual Target"}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {mode === "simple"
          ? "Tap the outcome for each draw bowl."
          : "Tap where the bowl finished — outcome is derived from the band."}
      </p>
    </section>
  );
}

// Keep It Up visual mode is POSITION-ONLY — outcome stays driven by the
// Survived / Lost / Toucher buttons. We only label the depth band for the user.
function depthLabel(tap: VisualTap): string {
  if (tap.band === "outside" && tap.y < -1.5) return "Ditch / Lost";
  if (tap.y > 0.25) return "Past the jack";
  if (tap.y < -0.25) return "In front of the jack";
  return "Level with the jack";
}
// Map a visual tap to a fixed-ends scored/not-scored boolean
function tapToScored(tap: VisualTap): boolean {
  return tap.band === "half" || tap.band === "one";
}
// Map a visual tap to a Drive-Then-Draw draw bowl
const DRAW_BAND_TO_OPTION: Record<VisualTap["band"], { key: string; label: string; points: number }> = {
  half: { key: "draw_half", label: "Half Mat", points: 5 },
  one: { key: "draw_one", label: "One Mat", points: 3 },
  two: { key: "draw_two", label: "Two Mats", points: 1 },
  outside: { key: "draw_outside", label: "Outside Two Mats", points: 0 },
};


const optionalSearchString = z.preprocess(
  (value) => {
    if (value == null) return undefined;
    if (typeof value !== "string") return String(value);

    // TanStack Router may JSON-encode search values in generated links
    // (e.g. start=%221%22). Accept both encoded and plain values so the
    // Beat A Squad Member link cannot fail route validation.
    const trimmed = value.trim();
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        const parsed = JSON.parse(trimmed);
        return parsed == null ? undefined : String(parsed);
      } catch {
        return trimmed.slice(1, -1);
      }
    }

    return value;
  },
  z.string().optional(),
);

const searchSchema = z.object({
  start: optionalSearchString,
  ghost: optionalSearchString,
  ghostName: optionalSearchString,
  ghostScore: optionalSearchString,
});

export const Route = createFileRoute("/_authenticated/challenge-record/$slug")({
  validateSearch: searchSchema,
  component: ChallengeRecordPage,
});

function ChallengeRecordPage() {
  const { slug } = Route.useParams();
  const { start, ghost, ghostName, ghostScore } = Route.useSearch();
  const ghostScoreNumber = ghostScore == null ? null : Number(ghostScore);

  const { data: challenge } = useQuery({
    queryKey: ["challenge-detail", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenges")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeChallengeConfig(data as Challenge) : null;
    },
  });

  if (!challenge) {
    return (
      <>
        <PageHeader title="Challenge" />
        <main className="mx-auto max-w-md px-5 py-10 text-center text-muted-foreground">Loading…</main>
      </>
    );
  }

  const recorder = challenge.config?.variant === "slimed" ? (
    <SlimedRecorder challenge={challenge} start={start} />
  ) : challenge.config?.variant === "switch-32" ? (
    <Switch32Recorder challenge={challenge} start={start} />
  ) : challenge.config?.variant === "drive-draw" ? (
    <DriveDrawRecorder challenge={challenge} />
  ) : challenge.config?.variant === "jack-in-ditch" ? (
    <JackInDitchRecorder challenge={challenge} />
  ) : challenge.config?.type === "fixed-ends" ? (
    <FixedEndsRecorder challenge={challenge} />
  ) : (
    <KeepItUpRecorder challenge={challenge} />
  );

  return (
    <>
      {recorder}
      {ghost && (
        <GhostBanner
          challengeId={challenge.id}
          ghostUserId={ghost}
          fallbackName={ghostName}
          fallbackScore={Number.isFinite(ghostScoreNumber) ? ghostScoreNumber : null}
          isSurvival={challenge.slug === "keep-it-up"}
        />
      )}
    </>
  );
}

function KeepItUpRecorder({ challenge }: { challenge: Challenge }) {
  const { user } = Route.useRouteContext();
  const { start } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const startBowls = challenge.config.start_bowls ?? 4;
  const maxBowls = challenge.config.max_bowls ?? 4;

  const [completedEnds, setCompletedEnds] = useState<KeepItUpEnd[]>([]);
  const [currentOutcomes, setCurrentOutcomes] = useState<(BowlOutcome | null)[]>([]);
  const [currentTaps, setCurrentTaps] = useState<(VisualTap | null)[]>([]);
  const [bowlsAvailable, setBowlsAvailable] = useState<number>(startBowls);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [mode, setMode] = useState<ScoringMode>("simple");
  useEffect(() => { setMode(readScoringMode()); }, []);
  function changeMode(m: ScoringMode) { setMode(m); writeScoringMode(m); }

  // Background timer — only START when user explicitly tapped Start Challenge.
  const [startedAt, setStartedAt] = useState<string | null>(null);
  useEffect(() => {
    if (!challenge || start !== "1") return;
    setStartedAt(ensureChallengeStart(challenge.id));
    const n = challenge.config.start_bowls ?? 4;
    setBowlsAvailable(n);
    setCurrentOutcomes(Array(n).fill(null));
    setCurrentTaps(Array(n).fill(null));
  }, [challenge, start]);

  // If user navigates here without starting, send them to instructions.
  useEffect(() => {
    if (challenge && start !== "1") {
      navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
    }
  }, [challenge, start, navigate]);

  const allMarked = currentOutcomes.length > 0 && currentOutcomes.every((o) => o !== null);
  const currentEndNumber = completedEnds.length + 1;
  const endsSurvived = completedEnds.length;

  const hasUnsaved = !savedOk && (completedEnds.length > 0 || currentOutcomes.some((o) => o !== null));
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved && !finished,
    enableBeforeUnload: hasUnsaved && !finished,
    withResolver: true,
  });

  const perBowlPreview = useMemo(() => summariseKeepItUp(completedEnds), [completedEnds]);

  function setBowl(idx: number, outcome: BowlOutcome) {
    setCurrentOutcomes((prev) => {
      const next = [...prev];
      next[idx] = outcome;
      return next;
    });
    setCurrentTaps((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  }

  // Visual mode is position-only — outcome stays driven by the buttons.
  function setBowlPosition(idx: number, tap: VisualTap) {
    setCurrentTaps((prev) => {
      const next = [...prev];
      next[idx] = tap;
      return next;
    });
  }

  function completeEnd() {
    if (!allMarked) return;
    const outcomes = currentOutcomes as BowlOutcome[];
    const after = bowlsAfter(outcomes, maxBowls);
    const visualPoints = currentTaps.map((t) => t ? { x: t.x, y: t.y, band: t.band } : null);
    const hasVisual = visualPoints.some(Boolean);
    const end: KeepItUpEnd = {
      end_number: currentEndNumber,
      bowls_before: bowlsAvailable,
      bowls_after: after,
      outcomes,
      ...(hasVisual ? { outcomes_visual: visualPoints } : {}),
    };
    const nextEnds = [...completedEnds, end];
    setCompletedEnds(nextEnds);

    if (after === 0) {
      setFinished(true);
      setBowlsAvailable(0);
      setCurrentOutcomes([]);
      setCurrentTaps([]);
    } else {
      setBowlsAvailable(after);
      setCurrentOutcomes(Array(after).fill(null));
      setCurrentTaps(Array(after).fill(null));
    }
  }

  async function handleSave(repeat = false) {
    if (!challenge) return;
    setSaving(true);
    const completedAt = new Date();
    const startIso = startedAt ?? ensureChallengeStart(challenge.id);
    const durationMinutes = Math.max(
      1,
      Math.round((completedAt.getTime() - new Date(startIso).getTime()) / 60000),
    );
    const breakdown = {
      type: "keep-it-up" as const,
      ends_survived: completedEnds.length,
      ends: completedEnds,
      per_bowl: summariseKeepItUp(completedEnds),
      scoring_mode: mode,
    };
    const activeSession = await getActiveSession(user.id);
    if (isDemoMode()) {
      setSaving(false);
      clearChallengeStart(challenge.id);
      setSavedOk(true);
      if (activeSession) await attachActivity(activeSession.id, "challenge", challenge.category);
      toast.success(`Demo result — not saved (${completedEnds.length} ends)`);
      if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
      else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
      else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
      return;
    }
    const { data, error } = await (supabase as any)
      .from("challenge_results")
      .insert({
        user_id: user.id,
        challenge_id: challenge.id,
        challenge_name: challenge.name,
        category: challenge.category,
        score: completedEnds.length,
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
      qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(user.id) });
      qc.invalidateQueries({ queryKey: SESSIONS_QK(user.id) });
      qc.invalidateQueries({ queryKey: ["training_session", activeSession.id] });
      qc.invalidateQueries({ queryKey: ["session_challenges", activeSession.id] });
    }
    qc.invalidateQueries({ queryKey: ["challenge_results"] });
    qc.invalidateQueries({ queryKey: ["challenge_results", user.id] });
    toast.success(activeSession ? "Added to session" : `Saved — ${completedEnds.length} ends survived`);
    if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
    else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
    else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
  }

  if (!challenge) {
    return (
      <>
        <PageHeader title="Challenge" />
        <main className="mx-auto max-w-md px-5 py-10 text-center text-muted-foreground">Loading…</main>
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
              <p className="text-[11px] font-bold uppercase text-muted-foreground">End</p>
              <p className="font-display text-3xl font-extrabold">{finished ? endsSurvived : currentEndNumber}</p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Bowls</p>
              <p className="font-display text-3xl font-extrabold">{bowlsAvailable}<span className="text-base text-muted-foreground">/{maxBowls}</span></p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Survived</p>
              <p className="font-display text-3xl font-extrabold text-primary">{endsSurvived}</p>
            </div>
          </div>
        </section>

        {!finished ? (
          <>
            <ScoringModeToggle mode={mode} onChange={changeMode} />
            <section className="rounded-2xl bg-card p-5 bt-shadow-card">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold">End {currentEndNumber}</h3>
                <p className="text-xs font-semibold text-muted-foreground">{bowlsAvailable} bowl{bowlsAvailable === 1 ? "" : "s"} in play</p>
              </div>
              <div className="mt-3 space-y-2">
                {currentOutcomes.map((outcome, idx) => (
                  <div key={idx} className="rounded-xl bg-secondary/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-display font-bold">Bowl {idx + 1}</p>
                      {outcome && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                          {outcome}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <OutcomeButton
                        active={outcome === "survived"}
                        onClick={() => setBowl(idx, "survived")}
                        icon={<Check className="h-5 w-5" />}
                        label="Survived"
                        tone="primary"
                      />
                      <OutcomeButton
                        active={outcome === "lost"}
                        onClick={() => setBowl(idx, "lost")}
                        icon={<X className="h-5 w-5" />}
                        label="Lost"
                        tone="destructive"
                      />
                      <OutcomeButton
                        active={outcome === "toucher"}
                        onClick={() => setBowl(idx, "toucher")}
                        icon={<Sparkles className="h-5 w-5" />}
                        label="Toucher"
                        tone="accent"
                      />
                    </div>
                    {mode === "visual" && (
                      <div className="mt-3 border-t border-border/40 pt-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          Position (optional — not scored)
                        </p>
                        <VisualTarget
                          value={currentTaps[idx] ? { x: currentTaps[idx]!.x, y: currentTaps[idx]!.y } : null}
                          onSelect={(tap) => setBowlPosition(idx, tap)}
                        />
                        {currentTaps[idx] && (
                          <p className="mt-1 text-center text-[10px] font-semibold text-muted-foreground">
                            {depthLabel(currentTaps[idx]!)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <Button
              onClick={completeEnd}
              disabled={!allMarked}
              className="h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated"
            >
              {allMarked ? `Complete end • ${bowlsAfter(currentOutcomes.filter(Boolean) as BowlOutcome[], maxBowls)} bowls next` : "Mark every bowl"}
            </Button>
          </>
        ) : (
          <>
            <section className="rounded-3xl bg-card p-6 text-center bt-shadow-elevated">
              <Trophy className="mx-auto h-10 w-10 text-primary" />
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Challenge complete
              </p>
              <p className="mt-1 font-display text-5xl font-extrabold">{endsSurvived}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Ends Survived</p>
            </section>

            <ChallengeResultMeta challenge={challenge} score={endsSurvived} userId={user.id} />


            <section className="rounded-2xl bg-card p-5 bt-shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h3 className="font-display text-base font-bold">Bowl survival</h3>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {(["bowl1", "bowl2", "bowl3", "bowl4"] as const).map((k, i) => {
                  const s = perBowlPreview[k];
                  const pct = s.attempts ? Math.round((s.survived / s.attempts) * 100) : null;
                  return (
                    <div key={k} className="rounded-xl bg-secondary/40 p-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Bowl {i + 1}</p>
                      <p className="mt-1 font-display text-xl font-extrabold text-primary">
                        {pct == null ? "—" : `${pct}%`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{s.survived}/{s.attempts}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <Button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated"
            >
              {saving ? "Saving…" : `Save result • ${endsSurvived} ends`}
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
                if (challenge) clearChallengeStart(challenge.id);
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

function OutcomeButton({
  active,
  onClick,
  icon,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone: "primary" | "destructive" | "accent";
}) {
  const base = "flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold transition";
  const palette = {
    primary: active ? "bt-gradient-primary text-white bt-shadow-card" : "bg-card text-primary border border-border",
    destructive: active ? "bg-destructive text-destructive-foreground bt-shadow-card" : "bg-card text-destructive border border-border",
    accent: active ? "bg-charcoal text-white bt-shadow-card" : "bg-card text-charcoal border border-border",
  }[tone];
  return (
    <button type="button" onClick={onClick} className={`${base} ${palette}`}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================================
// Fixed-ends recorder (Traffic Jam): N ends × M bowls, each bowl
// scored 1 (Scored) or 0 (Did Not Score). Total /max_score.
// ============================================================
function FixedEndsRecorder({ challenge }: { challenge: Challenge }) {
  const { user } = Route.useRouteContext();
  const { start } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const cfg = challenge.config ?? {};
  const totalEnds = cfg.ends ?? 3;
  const bowlsPerEnd = cfg.bowls_per_end ?? 4;
  const maxScore = cfg.max_score ?? totalEnds * bowlsPerEnd;

  const [completedEnds, setCompletedEnds] = useState<FixedEndsEnd[]>([]);
  const [currentBowls, setCurrentBowls] = useState<(boolean | null)[]>(
    Array(bowlsPerEnd).fill(null),
  );
  const [currentTaps, setCurrentTaps] = useState<(VisualTap | null)[]>(
    Array(bowlsPerEnd).fill(null),
  );
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [mode, setMode] = useState<ScoringMode>("simple");
  useEffect(() => { setMode(readScoringMode()); }, []);
  function changeMode(m: ScoringMode) { setMode(m); writeScoringMode(m); }

  useEffect(() => {
    if (start !== "1") return;
    setStartedAt(ensureChallengeStart(challenge.id));
  }, [challenge.id, start]);

  useEffect(() => {
    if (start !== "1") {
      navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
    }
  }, [challenge.slug, start, navigate]);

  const currentEndNumber = completedEnds.length + 1;
  const allMarked = currentBowls.length > 0 && currentBowls.every((b) => b !== null);
  const runningTotal = completedEnds.reduce((s, e) => s + e.end_score, 0);

  const hasUnsaved =
    !savedOk && (completedEnds.length > 0 || currentBowls.some((b) => b !== null));
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved && !finished,
    enableBeforeUnload: hasUnsaved && !finished,
    withResolver: true,
  });

  function setBowl(idx: number, scored: boolean) {
    setCurrentBowls((prev) => {
      const next = [...prev];
      next[idx] = scored;
      return next;
    });
    setCurrentTaps((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  }

  function setBowlVisual(idx: number, tap: VisualTap) {
    const scored = tapToScored(tap);
    setCurrentBowls((prev) => {
      const next = [...prev];
      next[idx] = scored;
      return next;
    });
    setCurrentTaps((prev) => {
      const next = [...prev];
      next[idx] = tap;
      return next;
    });
  }

  function completeEnd() {
    if (!allMarked) return;
    const bowls = currentBowls as boolean[];
    const end_score = bowls.filter(Boolean).length;
    const visualPoints = currentTaps.map((t) => t ? { x: t.x, y: t.y, band: t.band } : null);
    const hasVisual = visualPoints.some(Boolean);
    const end: FixedEndsEnd = {
      end_number: currentEndNumber,
      bowls,
      end_score,
      ...(hasVisual ? { bowls_visual: visualPoints } : {}),
    };
    const next = [...completedEnds, end];
    setCompletedEnds(next);
    if (next.length >= totalEnds) {
      setFinished(true);
      setCurrentBowls([]);
      setCurrentTaps([]);
    } else {
      setCurrentBowls(Array(bowlsPerEnd).fill(null));
      setCurrentTaps(Array(bowlsPerEnd).fill(null));
    }
  }

  async function handleSave(repeat = false) {
    setSaving(true);
    const completedAt = new Date();
    const startIso = startedAt ?? ensureChallengeStart(challenge.id);
    const durationMinutes = Math.max(
      1,
      Math.round((completedAt.getTime() - new Date(startIso).getTime()) / 60000),
    );
    const total = completedEnds.reduce((s, e) => s + e.end_score, 0);
    const breakdown = {
      type: "fixed-ends" as const,
      ends: completedEnds,
      total_score: total,
      max_score: maxScore,
      accuracy_pct: maxScore > 0 ? Math.round((total / maxScore) * 1000) / 10 : 0,
      scoring_mode: mode,
    };
    const activeSession = await getActiveSession(user.id);
    if (isDemoMode()) {
      setSaving(false);
      clearChallengeStart(challenge.id);
      setSavedOk(true);
      if (activeSession) await attachActivity(activeSession.id, "challenge", challenge.category);
      toast.success(`Demo result — not saved (${total}/${maxScore})`);
      if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
      else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
      else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
      return;
    }
    const { data, error } = await (supabase as any)
      .from("challenge_results")
      .insert({
        user_id: user.id,
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
      qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(user.id) });
      qc.invalidateQueries({ queryKey: SESSIONS_QK(user.id) });
      qc.invalidateQueries({ queryKey: ["training_session", activeSession.id] });
      qc.invalidateQueries({ queryKey: ["session_challenges", activeSession.id] });
    }
    qc.invalidateQueries({ queryKey: ["challenge_results"] });
    qc.invalidateQueries({ queryKey: ["challenge_results", user.id] });
    toast.success(activeSession ? "Added to session" : `Saved — ${total} / ${maxScore}`);
    if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
    else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
    else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
  }

  const accuracyPct = maxScore > 0 ? Math.round((runningTotal / maxScore) * 100) : 0;

  return (
    <>
      <PageHeader title={challenge.name} subtitle={`${challenge.category} Challenge`} />

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
          <div className="flex items-center justify-around text-center">
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">End</p>
              <p className="font-display text-3xl font-extrabold">
                {finished ? totalEnds : currentEndNumber}
                <span className="text-base text-muted-foreground">/{totalEnds}</span>
              </p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Score</p>
              <p className="font-display text-3xl font-extrabold text-primary">
                {runningTotal}
                <span className="text-base text-muted-foreground">/{maxScore}</span>
              </p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Accuracy</p>
              <p className="font-display text-3xl font-extrabold">{accuracyPct}%</p>
            </div>
          </div>
        </section>

        {!finished ? (
          <>
            <ScoringModeToggle mode={mode} onChange={changeMode} />
            <section className="rounded-2xl bg-card p-5 bt-shadow-card">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold">
                  End {currentEndNumber} of {totalEnds}
                </h3>
                <p className="text-xs font-semibold text-muted-foreground">
                  {bowlsPerEnd} bowls
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {currentBowls.map((scored, idx) => {
                  const targetKey = cfg.bowl_targets?.[idx];
                  const targetLabel = targetKey === "front"
                    ? "Front Jack"
                    : targetKey === "centre"
                      ? "Centre Jack"
                      : null;
                  return (
                  <div key={idx} className="rounded-xl bg-secondary/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-display font-bold">
                        Bowl {idx + 1}
                        {targetLabel && (
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {targetLabel}
                          </span>
                        )}
                      </p>
                      {scored !== null && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                          {scored ? "Scored · 1" : "Did not score · 0"}
                        </span>
                      )}
                    </div>
                    {mode === "visual" ? (
                      <VisualTarget
                        value={currentTaps[idx] ? { x: currentTaps[idx]!.x, y: currentTaps[idx]!.y } : null}
                        onSelect={(tap) => setBowlVisual(idx, tap)}
                      />
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <OutcomeButton
                          active={scored === true}
                          onClick={() => setBowl(idx, true)}
                          icon={<Check className="h-5 w-5" />}
                          label="Scored"
                          tone="primary"
                        />
                        <OutcomeButton
                          active={scored === false}
                          onClick={() => setBowl(idx, false)}
                          icon={<X className="h-5 w-5" />}
                          label="Did Not Score"
                          tone="destructive"
                        />
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </section>

            {completedEnds.length > 0 && (
              <section className="rounded-2xl bg-card p-4 bt-shadow-card">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Ends so far
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {completedEnds.map((e) => (
                    <div key={e.end_number} className="rounded-xl bg-secondary/40 p-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">
                        End {e.end_number}
                      </p>
                      <p className="font-display text-xl font-extrabold text-primary">
                        {e.end_score}
                        <span className="text-xs text-muted-foreground">/{bowlsPerEnd}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <Button
              onClick={completeEnd}
              disabled={!allMarked}
              className="h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated"
            >
              {allMarked
                ? currentEndNumber >= totalEnds
                  ? "Finish challenge"
                  : `Complete end • next end ${currentEndNumber + 1}`
                : "Mark every bowl"}
            </Button>
          </>
        ) : (
          <>
            <section className="rounded-3xl bg-card p-6 text-center bt-shadow-elevated">
              <Trophy className="mx-auto h-10 w-10 text-primary" />
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Challenge complete
              </p>
              <p className="mt-1 font-display text-5xl font-extrabold">
                {runningTotal}
                <span className="text-2xl text-muted-foreground">/{maxScore}</span>
              </p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {accuracyPct}% accuracy
              </p>
            </section>

            <ChallengeResultMeta challenge={challenge} score={runningTotal} userId={user.id} />


            <section className="rounded-2xl bg-card p-5 bt-shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h3 className="font-display text-base font-bold">End breakdown</h3>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {completedEnds.map((e) => (
                  <div key={e.end_number} className="rounded-xl bg-secondary/40 p-2">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      End {e.end_number}
                    </p>
                    <p className="mt-1 font-display text-2xl font-extrabold text-primary">
                      {e.end_score}
                    </p>
                    <p className="text-[10px] text-muted-foreground">/ {bowlsPerEnd}</p>
                  </div>
                ))}
              </div>
            </section>

            <Button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated"
            >
              {saving ? "Saving…" : `Save result • ${runningTotal} / ${maxScore}`}
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

// ============================================================
// Drive Then Draw recorder: 4 ends × 4 bowls
// Each end alternates Drive/Draw/Drive/Draw with hands swapping per end.
// Max score: 4 ends × 4 bowls × 5 = 80.
// ============================================================
const DRIVE_OPTIONS: { key: string; label: string; points: number; tone: "primary" | "accent" | "destructive" }[] = [
  { key: "drive_hit", label: "Hit Drive Channel", points: 5, tone: "primary" },
  { key: "drive_miss", label: "Miss", points: 0, tone: "destructive" },
];
const DRAW_OPTIONS: { key: string; label: string; points: number; tone: "primary" | "accent" | "destructive" }[] = [
  { key: "draw_half", label: "Half Mat", points: 5, tone: "primary" },
  { key: "draw_one", label: "One Mat", points: 3, tone: "accent" },
  { key: "draw_two", label: "Two Mats", points: 1, tone: "accent" },
  { key: "draw_outside", label: "Outside Two Mats", points: 0, tone: "destructive" },
];

function buildDriveDrawSequence(bowlsPerEnd: number): ("drive" | "draw")[] {
  return Array.from({ length: bowlsPerEnd }, (_, idx) => (idx % 2 === 0 ? "drive" : "draw"));
}

// Hands alternate each end so both forehand and backhand get equal practice:
//   End 1 / 3 → Drive Forehand, Draw Backhand
//   End 2 / 4 → Drive Backhand, Draw Forehand
const DRIVE_DRAW_HANDS: Record<number, { drive: "forehand" | "backhand"; draw: "forehand" | "backhand" }> = {
  1: { drive: "forehand", draw: "backhand" },
  2: { drive: "backhand", draw: "forehand" },
};
function handsForEnd(endNumber: number) {
  const key = ((endNumber - 1) % 2) + 1;
  return DRIVE_DRAW_HANDS[key];
}
function handLabel(h: "forehand" | "backhand") {
  return h === "forehand" ? "Forehand" : "Backhand";
}

function DriveDrawRecorder({ challenge }: { challenge: Challenge }) {
  const { user } = Route.useRouteContext();
  const { start } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const totalEnds = DRIVE_THEN_DRAW_TOTAL_ENDS;
  const bowlsPerEnd = DRIVE_THEN_DRAW_BOWLS_PER_END;
  const totalBowls = DRIVE_THEN_DRAW_TOTAL_BOWLS;
  const maxEndScore = bowlsPerEnd * 5;
  const maxScore = DRIVE_THEN_DRAW_MAX_SCORE;
  const challengeSequence = useMemo(() => buildDriveDrawSequence(bowlsPerEnd), [bowlsPerEnd]);

  const [completedEnds, setCompletedEnds] = useState<DriveDrawEnd[]>([]);
  const [bowls, setBowls] = useState<(DriveDrawBowl | null)[]>(() => Array(DRIVE_THEN_DRAW_BOWLS_PER_END).fill(null));
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [mode, setMode] = useState<ScoringMode>("simple");
  useEffect(() => { setMode(readScoringMode()); }, []);
  function changeMode(m: ScoringMode) { setMode(m); writeScoringMode(m); }

  useEffect(() => {
    if (completedEnds.length > 0 || bowls.some(Boolean) || bowls.length === bowlsPerEnd) return;
    setBowls(Array(bowlsPerEnd).fill(null));
  }, [bowls, bowlsPerEnd, completedEnds.length]);

  function setBowlAt(idx: number, b: DriveDrawBowl) {
    setBowls((prev) => {
      const next = prev.slice();
      next[idx] = b;
      return next;
    });
  }

  function setDrawTapAt(idx: number, tap: VisualTap, drawHand: "forehand" | "backhand") {
    const opt = DRAW_BAND_TO_OPTION[tap.band];
    setBowlAt(idx, { kind: "draw", key: opt.key, points: opt.points, hand: drawHand, x: tap.x, y: tap.y, band: tap.band });
  }

  useEffect(() => {
    if (start !== "1") return;
    setStartedAt(ensureChallengeStart(challenge.id));
  }, [challenge.id, start]);

  useEffect(() => {
    if (start !== "1") {
      navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
    }
  }, [challenge.slug, start, navigate]);

  const currentEndNumber = completedEnds.length + 1;
  const completedBowlsInEnd = bowls.filter((b) => b !== null).length;
  const currentBowlIndex = bowls.findIndex((b) => b === null);
  const currentBowlNumber = currentBowlIndex === -1 ? bowlsPerEnd : currentBowlIndex + 1;
  const completedBowls = completedEnds.length * bowlsPerEnd + completedBowlsInEnd;
  const allMarked = bowls.length === bowlsPerEnd && bowls.every((b) => b !== null);
  const runningTotal = completedEnds.reduce((s, e) => s + e.end_score, 0);

  const hasUnsaved = !savedOk && (completedEnds.length > 0 || bowls.some((b) => b !== null));
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved && !finished,
    enableBeforeUnload: hasUnsaved && !finished,
    withResolver: true,
  });

  function completeEnd() {
    if (!allMarked) return;
    const endBowls = bowls.map((b) => b!) as DriveDrawBowl[];
    if (endBowls.length !== bowlsPerEnd) return;
    const end_score = endBowls.reduce((s, b) => s + b.points, 0);
    const end: DriveDrawEnd = { end_number: currentEndNumber, bowls: endBowls, end_score };
    const next = [...completedEnds, end];
    setCompletedEnds(next);
    setBowls(Array(bowlsPerEnd).fill(null));
    if (next.length >= totalEnds) setFinished(true);
  }

  async function handleSave(repeat = false) {
    setSaving(true);
    const completedAt = new Date();
    const startIso = startedAt ?? ensureChallengeStart(challenge.id);
    const durationMinutes = Math.max(
      1,
      Math.round((completedAt.getTime() - new Date(startIso).getTime()) / 60000),
    );
    const total = completedEnds.reduce((s, e) => s + e.end_score, 0);
    const breakdown = {
      type: "drive-draw" as const,
      total_ends: totalEnds,
      bowls_per_end: bowlsPerEnd,
      total_bowls: totalBowls,
      ends: completedEnds,
      total_score: total,
      max_score: maxScore,
      scoring_mode: mode,
    };
    const activeSession = await getActiveSession(user.id);
    if (isDemoMode()) {
      setSaving(false);
      clearChallengeStart(challenge.id);
      setSavedOk(true);
      if (activeSession) await attachActivity(activeSession.id, "challenge", challenge.category);
      toast.success(`Demo result — not saved (${total}/${maxScore})`);
      if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
      else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
      else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
      return;
    }
    const { data, error } = await (supabase as any)
      .from("challenge_results")
      .insert({
        user_id: user.id,
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
      qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(user.id) });
      qc.invalidateQueries({ queryKey: SESSIONS_QK(user.id) });
      qc.invalidateQueries({ queryKey: ["training_session", activeSession.id] });
      qc.invalidateQueries({ queryKey: ["session_challenges", activeSession.id] });
    }
    qc.invalidateQueries({ queryKey: ["challenge_results"] });
    qc.invalidateQueries({ queryKey: ["challenge_results", user.id] });
    toast.success(activeSession ? "Added to session" : `Saved — ${total} / ${maxScore}`);
    if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
    else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
    else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
  }

  const accuracyPct = maxScore > 0 ? Math.round((runningTotal / maxScore) * 100) : 0;

  return (
    <>
      <PageHeader title={challenge.name} subtitle={`${challenge.category} Challenge`} />

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
          <div className="flex items-center justify-around text-center">
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">End</p>
              <p className="font-display text-3xl font-extrabold">
                {finished ? totalEnds : currentEndNumber}
                <span className="text-base text-muted-foreground">/{totalEnds}</span>
              </p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Score</p>
              <p className="font-display text-3xl font-extrabold text-primary">
                {runningTotal}
                <span className="text-base text-muted-foreground">/{maxScore}</span>
              </p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Accuracy</p>
              <p className="font-display text-3xl font-extrabold">{accuracyPct}%</p>
            </div>
          </div>
        </section>

        {!finished ? (
          <>
            <ScoringModeToggle mode={mode} onChange={changeMode} />
            <section className="rounded-2xl bg-card p-5 bt-shadow-card">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold">
                  End {currentEndNumber} of {totalEnds}
                </h3>
                <p className="text-xs font-semibold text-muted-foreground">
                  Bowl {currentBowlNumber} of {bowlsPerEnd}
                </p>
              </div>
              <div className="mt-3 rounded-xl bg-secondary/40 px-3 py-2">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span>{completedBowls} of {totalBowls} bowls completed</span>
                  <span>{completedEnds.length} of {totalEnds} ends</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round((completedBowls / totalBowls) * 100)}%` }}
                  />
                </div>
              </div>
              {(() => {
                const hands = handsForEnd(currentEndNumber);
                if (mode !== "visual") {
                  // Simple mode: keep sequential per-bowl cards.
                  return (
                    <>
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Drive {handLabel(hands.drive)} · Draw {handLabel(hands.draw)}
                      </p>
                      {challengeSequence.map((kind, idx) => {
                        const bowlNumber = idx + 1;
                        const bowl = bowls[idx];
                        const isCurrentBowl = currentBowlIndex === idx;
                        const isFutureBowl = currentBowlIndex !== -1 && idx > currentBowlIndex;
                        const stateLabel = bowl ? "Completed" : isCurrentBowl ? "Current" : "Locked";
                        if (kind === "drive") {
                          return (
                            <DriveDrawBowlCard
                              key={idx}
                              bowlNumber={bowlNumber}
                              kindLabel={`Drive Shot · ${handLabel(hands.drive)}`}
                              stateLabel={stateLabel}
                              icon={<Crosshair className="h-4 w-4" />}
                              options={DRIVE_OPTIONS}
                              selected={bowl}
                              disabled={isFutureBowl}
                              onSelect={(o) =>
                                setBowlAt(idx, { kind: "drive", key: o.key, points: o.points, hand: hands.drive })
                              }
                            />
                          );
                        }
                        return (
                          <DriveDrawBowlCard
                            key={idx}
                            bowlNumber={bowlNumber}
                            kindLabel={`Draw Shot · ${handLabel(hands.draw)}`}
                            stateLabel={stateLabel}
                            icon={<Target className="h-4 w-4" />}
                            options={DRAW_OPTIONS}
                            selected={bowl}
                            disabled={isFutureBowl}
                            onSelect={(o) =>
                              setBowlAt(idx, { kind: "draw", key: o.key, points: o.points, hand: hands.draw })
                            }
                          />
                        );
                      })}
                    </>
                  );
                }
                // Visual mode: one shared target for draws (bowls 2 & 4),
                // with the two drive Hit/Miss controls stacked above.
                const drawIndices = [1, 3];
                const drawMarkers = drawIndices
                  .map((idx) => {
                    const b = bowls[idx];
                    if (!b || b.kind !== "draw" || b.x == null || b.y == null) return null;
                    return { x: b.x, y: b.y, number: idx + 1, hand: hands.draw };
                  })
                  .filter((m): m is { x: number; y: number; number: number; hand: "forehand" | "backhand" } => !!m);
                const nextDrawIdx = drawIndices.find((idx) => !bowls[idx]);
                const activeDrawNumber = nextDrawIdx != null ? nextDrawIdx + 1 : undefined;
                return (
                  <>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Drive {handLabel(hands.drive)} · Draw {handLabel(hands.draw)}
                    </p>
                    {[0, 2].map((idx) => {
                      const bowl = bowls[idx];
                      return (
                        <DriveDrawBowlCard
                          key={idx}
                          bowlNumber={idx + 1}
                          kindLabel={`Drive Shot · ${handLabel(hands.drive)}`}
                          stateLabel={bowl ? "Completed" : "Current"}
                          icon={<Crosshair className="h-4 w-4" />}
                          options={DRIVE_OPTIONS}
                          selected={bowl}
                          onSelect={(o) =>
                            setBowlAt(idx, { kind: "drive", key: o.key, points: o.points, hand: hands.drive })
                          }
                        />
                      );
                    })}
                    <div className="mt-3 rounded-xl bg-secondary/40 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="flex items-center gap-1.5 font-display font-bold">
                          <Target className="h-4 w-4" />
                          Draw Bowls 2 & 4
                          <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                            {handLabel(hands.draw)}
                          </span>
                        </p>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {drawMarkers.length}/2 placed
                        </span>
                      </div>
                      <VisualTarget
                        onSelect={(tap) => {
                          const slot = nextDrawIdx ?? 1;
                          setDrawTapAt(slot, tap, hands.draw);
                        }}
                        hand={hands.draw}
                        markers={drawMarkers}
                        currentNumber={activeDrawNumber}
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {drawIndices.map((idx) => {
                          const b = bowls[idx];
                          if (!b) return null;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setBowls((p) => { const n = p.slice(); n[idx] = null; return n; })}
                              className="rounded-lg bg-card px-3 py-1.5 text-[11px] font-bold text-charcoal border border-border"
                            >
                              Undo Bowl {idx + 1} ({b.points}pt{b.points === 1 ? "" : "s"})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}
            </section>



            {completedEnds.length > 0 && (
              <section className="rounded-2xl bg-card p-4 bt-shadow-card">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Ends so far
                </p>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  {completedEnds.map((e) => (
                    <div key={e.end_number} className="rounded-xl bg-secondary/40 p-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">
                        End {e.end_number}
                      </p>
                      <p className="font-display text-xl font-extrabold text-primary">
                        {e.end_score}
                        <span className="text-xs text-muted-foreground">/{maxEndScore}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <Button
              onClick={completeEnd}
              disabled={!allMarked}
              className="h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated"
            >
              {allMarked
                ? currentEndNumber >= totalEnds
                  ? "Finish challenge"
                  : `Complete end • next end ${currentEndNumber + 1}`
                : `Score all ${bowlsPerEnd} bowls`}
            </Button>
          </>
        ) : (
          <>
            <section className="rounded-3xl bg-card p-6 text-center bt-shadow-elevated">
              <Trophy className="mx-auto h-10 w-10 text-primary" />
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Challenge complete
              </p>
              <p className="mt-1 font-display text-5xl font-extrabold">
                {runningTotal}
                <span className="text-2xl text-muted-foreground">/{maxScore}</span>
              </p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {accuracyPct}% accuracy
              </p>
            </section>

            <ChallengeResultMeta challenge={challenge} score={runningTotal} userId={user.id} />


            {(() => {
              const allBowls = completedEnds.flatMap((e) => e.bowls);
              const drives = allBowls.filter((b) => b.kind === "drive");
              const draws = allBowls.filter((b) => b.kind === "draw");
              const driveHits = drives.filter((b) => b.points > 0).length;
              const driveMisses = drives.length - driveHits;
              const drawScore = draws.reduce((s, b) => s + b.points, 0);
              return (
                <section className="rounded-2xl bg-card p-5 bt-shadow-card">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Drive Hits</p>
                      <p className="font-display text-2xl font-extrabold text-primary">{driveHits}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Drive Misses</p>
                      <p className="font-display text-2xl font-extrabold text-destructive">{driveMisses}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Draw Score</p>
                      <p className="font-display text-2xl font-extrabold">{drawScore}</p>
                    </div>
                  </div>
                </section>
              );
            })()}

            <section className="rounded-2xl bg-card p-5 bt-shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h3 className="font-display text-base font-bold">End breakdown</h3>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {completedEnds.map((e) => (
                  <div key={e.end_number} className="rounded-xl bg-secondary/40 p-2">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      End {e.end_number}
                    </p>
                    <p className="mt-1 font-display text-2xl font-extrabold text-primary">
                      {e.end_score}
                    </p>
                    <p className="text-[10px] text-muted-foreground">/ {maxEndScore}</p>
                  </div>
                ))}
              </div>
            </section>

            <Button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated"
            >
              {saving ? "Saving…" : `Save result • ${runningTotal} / ${maxScore}`}
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

function DriveDrawBowlCard({
  bowlNumber,
  kindLabel,
  stateLabel,
  icon,
  options,
  selected,
  disabled = false,
  onSelect,
}: {
  bowlNumber: number;
  kindLabel: string;
  stateLabel: string;
  icon: React.ReactNode;
  options: { key: string; label: string; points: number; tone: "primary" | "accent" | "destructive" }[];
  selected: DriveDrawBowl | null;
  disabled?: boolean;
  onSelect: (o: { key: string; label: string; points: number }) => void;
}) {
  return (
    <div className={`mt-3 rounded-xl bg-secondary/40 p-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-display font-bold">
          {icon}
          Bowl {bowlNumber}
          <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-primary">
            {kindLabel}
          </span>
        </p>
        {selected && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
            {selected.points} pt{selected.points === 1 ? "" : "s"}
          </span>
        )}
        {!selected && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {stateLabel}
          </span>
        )}
      </div>
      <div className={`grid gap-2 ${options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((o) => {
          const active = selected?.key === o.key;
          const palette =
            o.tone === "primary"
              ? active
                ? "bt-gradient-primary text-white bt-shadow-card"
                : "bg-card text-primary border border-border"
              : o.tone === "destructive"
                ? active
                  ? "bg-destructive text-destructive-foreground bt-shadow-card"
                  : "bg-card text-destructive border border-border"
                : active
                  ? "bg-charcoal text-white bt-shadow-card"
                  : "bg-card text-charcoal border border-border";
          return (
            <button
              key={o.key}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(o)}
              className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-bold leading-tight transition disabled:cursor-not-allowed ${palette}`}
            >
              <span className="text-center">{o.label}</span>
              <span className="text-[10px] opacity-80">{o.points} pt{o.points === 1 ? "" : "s"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Jack in the Ditch recorder: 5 ends, up to 4 bowls per end.
// Player picks which bowl (1-4) drove the jack into the ditch,
// or marks the end as a miss. Scoring: 16/12/8/4/0. Max 80.
// ============================================================
function scoreJackInDitchEnd(bowls: JackInDitchBowl[]): {
  bowls: JackInDitchBowl[];
  jack_struck_on: number | null;
  perfect_end: boolean;
  end_score: number;
} {
  let jackStruckOn: number | null = null;
  let base = 0;
  const normalised: JackInDitchBowl[] = bowls.map((b) => {
    let pts = 0;
    if (b.outcome === "jack") {
      pts = JACK_IN_DITCH_POINTS_JACK;
      if (jackStruckOn == null) jackStruckOn = b.bowl_number;
    } else if (b.outcome === "gate") {
      pts = JACK_IN_DITCH_POINTS_GATE;
    }
    base += pts;
    return { ...b, points: pts };
  });
  const perfect =
    jackStruckOn === 1 &&
    normalised.length >= 2 &&
    normalised.slice(1).every((b) => b.outcome === "gate");
  return {
    bowls: normalised,
    jack_struck_on: jackStruckOn,
    perfect_end: perfect,
    end_score: base + (perfect ? JACK_IN_DITCH_PERFECT_BONUS : 0),
  };
}

function JackInDitchRecorder({ challenge }: { challenge: Challenge }) {
  const { user } = Route.useRouteContext();
  const { start } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const cfg = challenge.config ?? {};
  const totalEnds = cfg.ends ?? 5;
  const bowlsPerEnd = cfg.bowls_per_end ?? 4;
  // Theoretical max: each end can score up to (4 jack + (n-1) * 1 gate + 2 bonus)
  const maxScore =
    cfg.max_score ?? totalEnds * (JACK_IN_DITCH_POINTS_JACK + (bowlsPerEnd - 1) * JACK_IN_DITCH_POINTS_GATE + JACK_IN_DITCH_PERFECT_BONUS);

  const [completedEnds, setCompletedEnds] = useState<JackInDitchEnd[]>([]);
  const [currentBowls, setCurrentBowls] = useState<JackInDitchBowl[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [perfectFlash, setPerfectFlash] = useState<{ end: number } | null>(null);

  useEffect(() => {
    if (start !== "1") return;
    setStartedAt(ensureChallengeStart(challenge.id));
  }, [challenge.id, start]);

  useEffect(() => {
    if (start !== "1") {
      navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
    }
  }, [challenge.slug, start, navigate]);

  const currentEndNumber = completedEnds.length + 1;
  const runningTotal = completedEnds.reduce((s, e) => s + e.end_score, 0);
  const jackStruckThisEnd = currentBowls.some((b) => b.outcome === "jack");
  const nextBowlNumber = currentBowls.length + 1;
  const endComplete = currentBowls.length >= bowlsPerEnd;

  const hasUnsaved = !savedOk && (completedEnds.length > 0 || currentBowls.length > 0);
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved && !finished,
    enableBeforeUnload: hasUnsaved && !finished,
    withResolver: true,
  });

  function recordBowl(outcome: JackInDitchOutcome) {
    if (endComplete) return;
    const next: JackInDitchBowl[] = [
      ...currentBowls,
      { bowl_number: nextBowlNumber, outcome, points: 0 },
    ];
    setCurrentBowls(next);
  }

  function undoBowl() {
    if (currentBowls.length === 0) return;
    setCurrentBowls(currentBowls.slice(0, -1));
  }

  function completeEnd() {
    if (currentBowls.length !== bowlsPerEnd) return;
    const scored = scoreJackInDitchEnd(currentBowls);
    const end: JackInDitchEnd = {
      end_number: currentEndNumber,
      ...scored,
    };
    const next = [...completedEnds, end];
    setCompletedEnds(next);
    setCurrentBowls([]);
    if (end.perfect_end) {
      setPerfectFlash({ end: end.end_number });
      setTimeout(() => setPerfectFlash(null), 3500);
    }
    if (next.length >= totalEnds) setFinished(true);
  }

  async function handleSave(repeat = false) {
    setSaving(true);
    const completedAt = new Date();
    const startIso = startedAt ?? ensureChallengeStart(challenge.id);
    const durationMinutes = Math.max(
      1,
      Math.round((completedAt.getTime() - new Date(startIso).getTime()) / 60000),
    );
    const total = completedEnds.reduce((s, e) => s + e.end_score, 0);
    const perfectEnds = completedEnds.filter((e) => e.perfect_end).length;
    const driveGateSuccesses = completedEnds.reduce(
      (s, e) => s + e.bowls.filter((b) => b.outcome === "gate").length,
      0,
    );
    const jackHits = completedEnds.reduce(
      (s, e) => s + e.bowls.filter((b) => b.outcome === "jack").length,
      0,
    );
    const breakdown = {
      type: "jack-in-ditch" as const,
      ends: completedEnds,
      total_score: total,
      max_score: maxScore,
      perfect_ends: perfectEnds,
      drive_gate_successes: driveGateSuccesses,
      jack_hits: jackHits,
    };
    const activeSession = await getActiveSession(user.id);
    if (isDemoMode()) {
      setSaving(false);
      clearChallengeStart(challenge.id);
      setSavedOk(true);
      if (activeSession) await attachActivity(activeSession.id, "challenge", challenge.category);
      toast.success(`Demo result — not saved (${total}/${maxScore})`);
      if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
      else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
      else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
      return;
    }
    const { data, error } = await (supabase as any)
      .from("challenge_results")
      .insert({
        user_id: user.id,
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
      qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(user.id) });
      qc.invalidateQueries({ queryKey: SESSIONS_QK(user.id) });
      qc.invalidateQueries({ queryKey: ["training_session", activeSession.id] });
      qc.invalidateQueries({ queryKey: ["session_challenges", activeSession.id] });
    }
    qc.invalidateQueries({ queryKey: ["challenge_results"] });
    qc.invalidateQueries({ queryKey: ["challenge_results", user.id] });
    toast.success(activeSession ? "Added to session" : `Saved — ${total} / ${maxScore}`);
    if (repeat) navigate({ to: "/challenge/$slug", params: { slug: challenge.slug } });
    else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
    else navigate({ to: "/challenge-progress/$slug", params: { slug: challenge.slug } });
  }

  const totalPerfectEnds = completedEnds.filter((e) => e.perfect_end).length;
  const totalGateSuccesses = completedEnds.reduce(
    (s, e) => s + e.bowls.filter((b) => b.outcome === "gate").length,
    0,
  );
  const totalJackHits = completedEnds.reduce(
    (s, e) => s + e.bowls.filter((b) => b.outcome === "jack").length,
    0,
  );

  return (
    <>
      <PageHeader title={challenge.name} subtitle={`${challenge.category} Challenge`} />

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
          <div className="flex items-center justify-around text-center">
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">End</p>
              <p className="font-display text-3xl font-extrabold">
                {finished ? totalEnds : currentEndNumber}
                <span className="text-base text-muted-foreground">/{totalEnds}</span>
              </p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Score</p>
              <p className="font-display text-3xl font-extrabold text-primary">
                {runningTotal}
                <span className="text-base text-muted-foreground">/{maxScore}</span>
              </p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Perfect</p>
              <p className="font-display text-3xl font-extrabold">{totalPerfectEnds}</p>
            </div>
          </div>
        </section>

        {perfectFlash && (
          <section className="rounded-2xl border-2 border-primary bg-primary/10 p-4 text-center">
            <p className="font-display text-lg font-extrabold text-primary">⭐ PERFECT END!</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Jack ditched with the opening bowl. All remaining drives passed through the Drive Gate.
            </p>
            <p className="mt-1 text-xs font-bold text-primary">+2 Bonus Points</p>
          </section>
        )}

        {!finished ? (
          <>
            <section className="rounded-2xl bg-card p-5 bt-shadow-card">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold">
                  End {currentEndNumber} of {totalEnds}
                </h3>
                <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                  <Zap className="h-3.5 w-3.5" />
                  Bowl {Math.min(nextBowlNumber, bowlsPerEnd)} of {bowlsPerEnd}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {endComplete
                  ? "All four bowls recorded — complete the end to score it."
                  : jackStruckThisEnd
                    ? "Jack already struck — drive the remaining bowls through the Drive Gate."
                    : "Score the next drive."}
              </p>

              {!endComplete && (
                <div className="mt-3 space-y-2">
                  {!jackStruckThisEnd && (
                    <button
                      type="button"
                      onClick={() => recordBowl("jack")}
                      className="flex h-14 w-full items-center justify-between rounded-xl bt-gradient-primary px-4 text-sm font-bold text-white bt-shadow-card"
                    >
                      <span>Strike the Jack {nextBowlNumber === 1 ? "(into the ditch)" : ""}</span>
                      <span className="text-base font-extrabold">+4</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => recordBowl("gate")}
                    className="flex h-14 w-full items-center justify-between rounded-xl bg-charcoal px-4 text-sm font-bold text-white bt-shadow-card"
                  >
                    <span>Through the Drive Gate</span>
                    <span className="text-base font-extrabold">+1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => recordBowl("miss")}
                    className="flex h-14 w-full items-center justify-between rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground bt-shadow-card"
                  >
                    <span>Missed</span>
                    <span className="text-base font-extrabold">0</span>
                  </button>
                </div>
              )}

              {currentBowls.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {currentBowls.map((b) => (
                    <span
                      key={b.bowl_number}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        b.outcome === "jack"
                          ? "bg-primary text-primary-foreground"
                          : b.outcome === "gate"
                            ? "bg-charcoal text-white"
                            : "bg-destructive text-destructive-foreground"
                      }`}
                    >
                      B{b.bowl_number}: {b.outcome === "jack" ? "Jack" : b.outcome === "gate" ? "Gate" : "Miss"}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={undoBowl}
                  disabled={currentBowls.length === 0}
                  className="h-11 flex-1"
                >
                  Undo bowl
                </Button>
                <Button
                  type="button"
                  onClick={completeEnd}
                  disabled={!endComplete}
                  className="h-11 flex-1"
                >
                  Complete end
                </Button>
              </div>
            </section>

            {completedEnds.length > 0 && (
              <section className="rounded-2xl bg-card p-4 bt-shadow-card">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Ends so far
                </p>
                <div className="mt-2 grid grid-cols-5 gap-2 text-center">
                  {completedEnds.map((e) => (
                    <div
                      key={e.end_number}
                      className={`rounded-xl p-2 ${e.perfect_end ? "bg-primary/20 ring-2 ring-primary" : "bg-secondary/40"}`}
                    >
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">
                        End {e.end_number}
                      </p>
                      <p className="font-display text-lg font-extrabold text-primary">
                        {e.end_score}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {e.perfect_end ? "⭐ Perfect" : e.jack_struck_on ? `Jack B${e.jack_struck_on}` : "No jack"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            <section className="rounded-3xl bg-card p-6 text-center bt-shadow-elevated">
              <Trophy className="mx-auto h-10 w-10 text-primary" />
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Challenge complete
              </p>
              <p className="mt-1 font-display text-5xl font-extrabold">
                {runningTotal}
                <span className="text-2xl text-muted-foreground">/{maxScore}</span>
              </p>
            </section>

            <ChallengeResultMeta challenge={challenge} score={runningTotal} userId={user.id} />

            <section className="rounded-2xl bg-card p-5 bt-shadow-card">
              <h3 className="font-display text-base font-bold">Results</h3>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-secondary/40 p-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Drive Gate</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-primary">{totalGateSuccesses}</p>
                </div>
                <div className="rounded-xl bg-secondary/40 p-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Jack Hits</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-primary">{totalJackHits}</p>
                </div>
                <div className={`rounded-xl p-2 ${totalPerfectEnds > 0 ? "bg-primary/20 ring-2 ring-primary" : "bg-secondary/40"}`}>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Perfect Ends</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-primary">
                    {totalPerfectEnds > 0 ? `⭐ ${totalPerfectEnds}` : "0"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-card p-5 bt-shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h3 className="font-display text-base font-bold">End breakdown</h3>
              </div>
              <div className="grid grid-cols-5 gap-2 text-center">
                {completedEnds.map((e) => (
                  <div
                    key={e.end_number}
                    className={`rounded-xl p-2 ${e.perfect_end ? "bg-primary/20 ring-2 ring-primary" : "bg-secondary/40"}`}
                  >
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      End {e.end_number}
                    </p>
                    <p className="mt-1 font-display text-xl font-extrabold text-primary">
                      {e.end_score}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {e.perfect_end ? "⭐ Perfect" : e.jack_struck_on ? `Jack B${e.jack_struck_on}` : "No jack"}
                    </p>
                  </div>
                ))}
              </div>
            </section>


            <Button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated"
            >
              {saving ? "Saving…" : `Save result • ${runningTotal} / ${maxScore}`}
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
