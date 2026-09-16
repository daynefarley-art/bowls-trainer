import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { MeasureVersion } from "@/lib/measurement";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  completeTrainerBlock,
  getTrainerBlock,
  prescriptionSummary,
  recorderPrescription,
  trainerPrescription,
  TRAINER_BLOCK_QK,
  TRAINER_CURRENT_QK,
  TRAINER_SESSION_QK,
} from "@/lib/trainer";
import { PageHeader } from "@/components/bowls/PageHeader";
import { ExitPracticeButton } from "@/components/practice/ExitPracticeButton";
import { EndSessionDialog } from "@/components/bowls/EndSessionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { percentageOf, bsiFromBreakdown, type Drill, type BowlDetail, isDrawDrillSlug, drawLengthForSlug, LEAD_DRILL_SLUG, LEAD_DRILL_BOWL_TARGETS } from "@/lib/bowls";
import { VisualTarget, type VisualTap } from "@/components/bowls/VisualTarget";
import { EndTargetRecorder } from "@/components/bowls/EndTargetRecorder";
import { isHeadScanEnabled } from "@/lib/head-scan";

import { SessionConditionsField, type GreenType } from "@/components/bowls/SessionConditionsField";
import { StopCircle } from "lucide-react";
import { toast } from "sonner";
import { useActiveSession } from "@/hooks/use-active-session";
import { ACTIVE_SESSION_QK, SESSIONS_QK, attachActivity, ensureActivePractice } from "@/lib/sessions";
import { isDemoMode } from "@/lib/demo-mode";
import { usePracticeTracker } from "@/hooks/use-practice-tracker";
import { PauseButton } from "@/components/practice/PauseButton";
import { LeavePracticeGuard } from "@/components/practice/LeavePracticeGuard";
import { useActivityAutosave, useBackgroundPauseGuard } from "@/hooks/use-practice-activity";

const SESSION_KEY = "bowls.activeSession.v1";
type ActiveSession = Record<string, string>;
function readSessions(): ActiveSession {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "{}"); } catch { return {}; }
}
function writeSessions(s: ActiveSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
function ensureStart(drillId: string): string {
  const all = readSessions();
  if (!all[drillId]) { all[drillId] = new Date().toISOString(); writeSessions(all); }
  return all[drillId];
}
function clearStart(drillId: string) {
  const all = readSessions();
  delete all[drillId];
  writeSessions(all);
}

const MODE_KEY = "bowls.scoringMode";
type ScoringMode = "simple" | "visual";
function readMode(): ScoringMode {
  if (typeof window === "undefined") return "simple";
  const v = localStorage.getItem(MODE_KEY);
  return v === "visual" ? "visual" : "simple";
}
function writeMode(m: ScoringMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MODE_KEY, m);
}

const searchSchema = z.object({
  start: z.coerce.string().optional(),
  resume: z.coerce.string().optional(),
  trainer: z.coerce.string().optional(),
  block: z.coerce.string().optional(),
});

export const Route = createFileRoute("/_authenticated/record-draw/$slug")({
  validateSearch: searchSchema,
  component: RecordDrawPage,
});

const ENDS = 4;
const BOWLS_PER_END = 4;
const DEFAULT_HANDS: BowlDetail["hand"][] = ["forehand", "forehand", "backhand", "backhand"];

function handsFor(prescribed: "forehand" | "backhand" | "alternate" | null | undefined): BowlDetail["hand"][] {
  if (prescribed === "forehand") return ["forehand", "forehand", "forehand", "forehand"];
  if (prescribed === "backhand") return ["backhand", "backhand", "backhand", "backhand"];
  if (prescribed === "alternate") return ["forehand", "backhand", "forehand", "backhand"];
  return DEFAULT_HANDS;
}

function RecordDrawPage() {
  const { user } = Route.useRouteContext();
  const { slug } = Route.useParams();
  const { resume, trainer: trainerId, block: trainerBlockId } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: drill, isLoading } = useQuery({
    queryKey: ["drill", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("drills").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as unknown as Drill | null;
    },
  });

  // Trainer block is the authoritative source of the prescribed setup — it is
  // fetched by id, not decoded from the URL, so it survives an app restart.
  const { data: trainerBlock } = useQuery({
    queryKey: TRAINER_BLOCK_QK(trainerBlockId ?? ""),
    enabled: !!trainerBlockId,
    queryFn: () => getTrainerBlock(trainerBlockId!),
  });
  const prescription = useMemo(() => trainerPrescription(trainerBlock), [trainerBlock]);
  const HANDS = useMemo(() => handsFor(prescription?.hand ?? null), [prescription]);
  const prescribedBits = useMemo(() => prescriptionSummary(prescription), [prescription]);
  // Recorder-actionable prescription. The seed is the block id, so a "random"
  // progression reproduces the same order after a resume or app restart.
  const rx = useMemo(
    () => recorderPrescription(prescription, slug, trainerBlockId ?? slug, BOWLS_PER_END),
    [prescription, slug, trainerBlockId],
  );

  useEffect(() => {
    if (!isLoading && (!drill || !isDrawDrillSlug(slug))) navigate({ to: "/drills" });
  }, [isLoading, drill, slug, navigate]);


  // bowls[end][bowl] = scoring category key, or null
  const [bowls, setBowls] = useState<(string | null)[][]>(() =>
    Array.from({ length: ENDS }, () => Array(BOWLS_PER_END).fill(null)),
  );
  const [taps, setTaps] = useState<(VisualTap | null)[][]>(() =>
    Array.from({ length: ENDS }, () => Array(BOWLS_PER_END).fill(null)),
  );
  const [mode, setMode] = useState<ScoringMode>("simple");
  useEffect(() => { setMode(readMode()); }, []);
  function changeMode(m: ScoringMode) { setMode(m); writeMode(m); }

  const [notes, setNotes] = useState("");
  const [conditionsList, setConditionsList] = useState<string[]>([]);
  const [greenType, setGreenType] = useState<GreenType | "">("");
  const [greenSpeed, setGreenSpeed] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const currentBowlsDelivered = useMemo(
    () => bowls.reduce((sum, row) => sum + row.filter(Boolean).length, 0),
    [bowls],
  );
  const practiceState = useMemo(
    () => ({ bowls, taps, mode, notes, conditionsList, greenType, greenSpeed, location }),
    [bowls, taps, mode, notes, conditionsList, greenType, greenSpeed, location],
  );
  // Continuous visual scoring: explicit focus on a single bowl.
  // Auto-advances after each placement; can be moved backward via Back/Undo.
  
  const { activeSession } = useActiveSession();


  useEffect(() => {
    if (!drill) return;
    setStartedAt(ensureStart(drill.id));
  }, [drill]);

  // Practice activity tracking: create/resume as soon as the drill loads.
  const trackerEnabled = !!drill;
  const { activity: practiceActivity, saveState: savePracticeState, markCompleted: markPracticeCompleted, measureVersion } =
    usePracticeTracker({
      userId: user?.id,
      kind: "drill",
      slug: drill?.slug,
      drillId: drill?.id ?? null,
      title: drill?.name ?? null,
      initialState: practiceState,
      bowlsDelivered: currentBowlsDelivered,
      enabled: trackerEnabled,
      resumeId: resume ?? null,
    });

  // Hydrate from resumed activity's saved state (once).
  const [practiceHydrated, setPracticeHydrated] = useState(false);
  useEffect(() => {
    if (!practiceActivity || practiceHydrated) return;
    const s = (practiceActivity.state ?? {}) as Record<string, any>;
    if (Array.isArray(s.bowls)) setBowls(s.bowls);
    if (Array.isArray(s.taps)) setTaps(s.taps);
    if (s.mode === "simple" || s.mode === "visual") changeMode(s.mode);
    if (typeof s.notes === "string") setNotes(s.notes);
    if (Array.isArray(s.conditionsList)) setConditionsList(s.conditionsList);
    if (typeof s.greenType === "string") setGreenType(s.greenType as GreenType | "");
    if (typeof s.greenSpeed === "string") setGreenSpeed(s.greenSpeed);
    if (typeof s.location === "string") setLocation(s.location);
    setPracticeHydrated(true);
  }, [practiceActivity, practiceHydrated]);

  useActivityAutosave(practiceActivity?.id, practiceState, {
    debounceMs: 250,
    bowlsDelivered: currentBowlsDelivered,
  });
  useBackgroundPauseGuard(practiceActivity);

  const flushPracticeState = async () => {
    await savePracticeState(practiceState, currentBowlsDelivered);
  };

  const cats = drill?.scoring_config.categories ?? [];
  const pointsByKey = useMemo(() => Object.fromEntries(cats.map((c) => [c.key, c.points])), [cats]);
  const drawLength = drawLengthForSlug(slug);

  const flat: BowlDetail[] = useMemo(() => {
    const arr: BowlDetail[] = [];
    for (let e = 0; e < ENDS; e++) {
      for (let b = 0; b < BOWLS_PER_END; b++) {
        const k = bowls[e][b];
        if (!k) continue;
        const tap = taps[e][b];
        if (tap) {
          const detail: BowlDetail = {
            end: e + 1, bowl: b + 1, hand: HANDS[b], key: k, points: pointsByKey[k] ?? tap.points,
          };
          detail.x = Math.round(tap.x * 1000) / 1000;
          detail.y = Math.round(tap.y * 1000) / 1000;
          detail.distance = Math.round(tap.distance * 1000) / 1000;
          detail.entry_method = tap.source ?? "visual_target";
          if (drawLength) detail.drill_length = drawLength;
          arr.push(detail);
        } else {
          const detail: BowlDetail = {
            end: e + 1, bowl: b + 1, hand: HANDS[b], key: k, points: pointsByKey[k] ?? 0,
          };
          if (drawLength) detail.drill_length = drawLength;
          arr.push(detail);
        }
      }
    }
    return arr;
  }, [bowls, taps, pointsByKey, drawLength, HANDS]);

  const score = flat.reduce((s, b) => s + b.points, 0);
  const filled = flat.length;
  const target = ENDS * BOWLS_PER_END;
  const valid = filled === target;
  const pct = drill ? percentageOf(score, drill.min_score, drill.max_score) : 0;
  const liveBsi = drill ? bsiFromBreakdown(drill.slug, { bowls: flat }, pct) : 0;

  function setBowlSimple(end: number, bowl: number, key: string) {
    const nextBowls = bowls.map((r) => r.slice());
    const nextTaps = taps.map((r) => r.slice());
    nextBowls[end][bowl] = key;
    nextTaps[end][bowl] = null;
    setBowls(nextBowls);
    setTaps(nextTaps);
    const nextDelivered = nextBowls.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    savePracticeState({ ...practiceState, bowls: nextBowls, taps: nextTaps }, nextDelivered).catch(() => {});
  }
  /**
   * Applies one or more bowl positions for an end in a SINGLE state update.
   * Head Scan returns every bowl of the end at once, so per-bowl updates that
   * read the current `bowls` closure would clobber each other and only the
   * last bowl would survive.
   */
  function setBowlsVisual(end: number, entries: { bowl: number; tap: VisualTap }[]) {
    if (entries.length === 0) return;
    const nextBowls = bowls.map((r) => r.slice());
    const nextTaps = taps.map((r) => r.slice());
    for (const { bowl, tap } of entries) {
      nextBowls[end][bowl] = tap.key;
      nextTaps[end][bowl] = tap;
    }
    setBowls(nextBowls);
    setTaps(nextTaps);
    const nextDelivered = nextBowls.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    savePracticeState({ ...practiceState, bowls: nextBowls, taps: nextTaps }, nextDelivered).catch(() => {});
  }
  function setBowlVisual(end: number, bowl: number, tap: VisualTap) {
    setBowlsVisual(end, [{ bowl, tap }]);
  }
  function clearBowl(end: number, bowl: number) {
    clearBowlsAt(end, [bowl]);
  }
  function clearBowlsAt(end: number, bowlIdxs: number[]) {
    const nextBowls = bowls.map((r) => r.slice());
    const nextTaps = taps.map((r) => r.slice());
    for (const b of bowlIdxs) {
      nextBowls[end][b] = null;
      nextTaps[end][b] = null;
    }
    setBowls(nextBowls);
    setTaps(nextTaps);
    const nextDelivered = nextBowls.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    savePracticeState({ ...practiceState, bowls: nextBowls, taps: nextTaps }, nextDelivered).catch(() => {});
  }


  async function handleSave(repeat = false) {
    if (!drill || !valid) {
      toast.error(`Record all ${target} bowls`);
      return;
    }
    setSaving(true);

    // Counts per category for backwards-compat aggregate display
    const counts: Record<string, number> = {};
    for (const c of cats) counts[c.key] = 0;
    for (const b of flat) counts[b.key] = (counts[b.key] ?? 0) + 1;

    const breakdown = {
      // Measurement version pinned when this practice began. Absent ⇒ legacy V1.
      measure_v: measureVersion,
      ...counts,
      ends: ENDS,
      bowls_per_end: BOWLS_PER_END,
      bowls: flat,
      // Prescribed conditions this result was recorded under (absent for
      // ordinary practice). Recorded for context only — scoring is unchanged.
      ...(prescription
        ? {
            prescription: {
              hand: prescription.hand,
              target_mode: prescription.targetMode,
              weight_intent: prescription.weightIntent,
              progression: prescription.progressionMode,
              band_scale: rx.bandScale,
            },
          }
        : {}),
    };

    const completedAt = new Date();
    const startIso = startedAt ?? ensureStart(drill.id);
    const durationMinutes = Math.min(60, Math.max(1, Math.round((completedAt.getTime() - new Date(startIso).getTime()) / 60000)));

    const activeSession = await ensureActivePractice(user.id);

    if (isDemoMode()) {
      setSaving(false);
      setSavedOk(true);
      clearStart(drill.id);
      await markPracticeCompleted();
      if (activeSession) await attachActivity(activeSession.id, "drill", drill.category);
      toast.success(`Demo result — not saved (${score}/${drill.max_score})`);
    if (trainerId && trainerBlockId) {
      await completeTrainerBlock({
        sessionId: trainerId,
        blockId: trainerBlockId,
        resultId: null,
        score,
        percentage: pct,
      });
      qc.invalidateQueries({ queryKey: TRAINER_SESSION_QK(trainerId) });
      qc.invalidateQueries({ queryKey: TRAINER_CURRENT_QK(user.id) });
      navigate({ to: "/trainer/$id", params: { id: trainerId } });
      return;
    }
      if (repeat) navigate({ to: "/drill/$slug", params: { slug: drill.slug } });
      else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
      else navigate({ to: "/dashboard" });
      return;
    }


    const { data, error } = await supabase
      .from("results")
      .insert({
        user_id: user.id,
        drill_id: drill.id,
        drill_name: drill.name,
        category: drill.category,
        score,
        max_score: drill.max_score,
        min_score: drill.min_score,
        percentage: pct,
        bsi: bsiFromBreakdown(drill.slug, breakdown, pct),
        breakdown,
        notes: notes || null,
        conditions: conditionsList.length ? conditionsList.join(", ") : null,
        conditions_list: conditionsList.length ? conditionsList : null,
        green_type: greenType || null,
        green_speed: greenSpeed || null,
        location: location || null,
        played_at: completedAt.toISOString(),
        drill_started_at: startIso,
        drill_completed_at: completedAt.toISOString(),
        duration_minutes: durationMinutes,
        session_id: activeSession?.id ?? null,
      } as any)
      .select("id")
      .single();

    setSaving(false);
    if (error || !data) return toast.error(error?.message ?? "Save failed");

    setSavedOk(true);
    clearStart(drill.id);
    await markPracticeCompleted({ resultId: data.id });
    if (activeSession) {
      await attachActivity(activeSession.id, "drill", drill.category);
      qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(user.id) });
      qc.invalidateQueries({ queryKey: SESSIONS_QK(user.id) });
      qc.invalidateQueries({ queryKey: ["training_session", activeSession.id] });
      qc.invalidateQueries({ queryKey: ["session_drills", activeSession.id] });
    }
    qc.invalidateQueries({ queryKey: ["results", user.id] });
    toast.success(activeSession ? "Added to session" : "Result saved");
    if (trainerId && trainerBlockId) {
      await completeTrainerBlock({
        sessionId: trainerId,
        blockId: trainerBlockId,
        resultId: data.id,
        score,
        percentage: pct,
      });
      qc.invalidateQueries({ queryKey: TRAINER_SESSION_QK(trainerId) });
      qc.invalidateQueries({ queryKey: TRAINER_CURRENT_QK(user.id) });
      navigate({ to: "/trainer/$id", params: { id: trainerId } });
      return;
    }
    if (repeat) {
      navigate({ to: "/drill/$slug", params: { slug: drill.slug } });
    } else if (activeSession) {
      navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
    } else {
      navigate({ to: "/dashboard" });
    }
  }

  if (!drill) {
    return (
      <>
        <PageHeader title="Record Result" />
        <main className="mx-auto max-w-md px-5 py-10 text-center text-muted-foreground">
          Loading drill…
        </main>
      </>
    );
  }

  // Per-end max score for visual mode summary (max points per bowl × bowls per end).
  // Visual scoring bands max out at 5 (half mat).
  const endMaxScore = BOWLS_PER_END * 5;

  return (
    <>
      <PageHeader
        title={drill.name}
        subtitle={mode === "visual" ? `Score each end · ${ENDS} ends` : "Tap the score zone for each bowl"}
        leading={
          <ExitPracticeButton
            activity={practiceActivity}
            hasCurrentStats={currentBowlsDelivered > 0}
            onBeforePause={flushPracticeState}
            onBeforeDiscard={flushPracticeState}
            onSaved={() => { setSavedOk(true); navigate({ to: "/dashboard" }); }}
            onDiscarded={() => { setSavedOk(true); navigate({ to: "/dashboard" }); }}
          />
        }
      />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        {trainerBlock && (
          <section className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Bowls Trainer block</p>
            <p className="font-display text-base font-bold leading-tight">{trainerBlock.title}</p>
            {rx.chips.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {rx.chips.map((c) => (
                  <span key={c} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    {c}
                  </span>
                ))}
              </div>
            )}
            {prescribedBits.length === 0 && rx.chips.length === 0 && prescription?.length && (
              <p className="mt-1 text-xs text-muted-foreground">{prescription.length} length</p>
            )}
            {prescription?.variantDescription && (
              <p className="mt-1 text-xs text-muted-foreground">{prescription.variantDescription}</p>
            )}
          </section>
        )}

        {mode === "simple" && (
          <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
            <div className="flex items-center justify-around text-center">
              <div>
                <p className="text-[11px] font-bold uppercase text-muted-foreground">Bowls</p>
                <p className="font-display text-3xl font-extrabold">
                  {filled}<span className="text-base text-muted-foreground">/{target}</span>
                </p>
              </div>
              <div className="h-12 w-px bg-border" />
              <div>
                <p className="text-[11px] font-bold uppercase text-muted-foreground">Score</p>
                <p className="font-display text-3xl font-extrabold text-primary">{score}</p>
              </div>
              <div className="h-12 w-px bg-border" />
              <div>
                <p className="text-[11px] font-bold uppercase text-muted-foreground">BSI</p>
                <p className="font-display text-3xl font-extrabold">{liveBsi.toFixed(0)}</p>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-card p-3 bt-shadow-card">
          <div className="grid grid-cols-2 gap-2">
            {(["simple", "visual"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => changeMode(m)}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                  mode === m ? "bt-gradient-primary text-white" : "bg-secondary text-charcoal"
                }`}
              >
                {m === "simple" ? "Simple Scoring" : "Visual Target"}
              </button>
            ))}
          </div>
        </section>

        {mode === "visual" ? (
          <EndTargetRecorder
            drillName={drill.name}
            ends={ENDS}
            bowlsPerEnd={BOWLS_PER_END}
            hands={HANDS}
            drawLength={drawLength}
            bowls={bowls}
            taps={taps}
            endMaxScore={endMaxScore}
            onPlace={setBowlVisual}
            onPlaceMany={setBowlsVisual}
            onClear={clearBowl}
            onClearEnd={(end) => clearBowlsAt(end, Array.from({ length: BOWLS_PER_END }, (_, i) => i))}
            onFinish={() => handleSave(false)}
            onExit={() => changeMode("simple")}
            saving={saving}
            headScanEnabled={isHeadScanEnabled(slug)}
            bandScale={rx.bandScale}
            prescriptionChips={rx.chips}
            bowlStepLabels={
              slug === LEAD_DRILL_SLUG
                ? [...LEAD_DRILL_BOWL_TARGETS]
                : rx.bowlStepLabels
            }
            bowlTargetLabels={
              slug === LEAD_DRILL_SLUG ? [...LEAD_DRILL_BOWL_TARGETS] : undefined
            }
            pauseSlot={practiceActivity ? (
              <PauseButton
                activity={practiceActivity}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-bold active:scale-[0.99] transition"
                label="Pause / Save for later"
                hasCurrentStats={currentBowlsDelivered > 0}
                onBeforePause={flushPracticeState}
                onBeforeDiscard={flushPracticeState}
                onSaved={() => { setSavedOk(true); navigate({ to: "/dashboard" }); }}
                onDiscarded={() => { setSavedOk(true); navigate({ to: "/dashboard" }); }}
              />
            ) : null}
          />

        ) : (
          Array.from({ length: ENDS }).map((_, e) => {
            const currentBowlInEnd = bowls[e].findIndex((v) => v === null);
            const prevEndsComplete = bowls.slice(0, e).every((row) => row.every((v) => v !== null));
            const isActiveEnd = prevEndsComplete && currentBowlInEnd !== -1;
            const fhCount = HANDS.filter((h) => h === "forehand").length;
            const bhCount = HANDS.filter((h) => h === "backhand").length;
            return (
              <section key={e} className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-card">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold">End {e + 1}</h3>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {fhCount} FH · {bhCount} BH
                  </p>
                </div>

                {isActiveEnd && (
                  <div className="rounded-xl bt-gradient-primary px-4 py-3 text-white">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">Current Bowl</p>
                    <p className="font-display text-lg font-extrabold leading-tight">
                      🎯 Bowl {currentBowlInEnd + 1}
                    </p>
                    <p className="font-display text-2xl font-extrabold uppercase tracking-wide">
                      {HANDS[currentBowlInEnd]}
                    </p>
                  </div>
                )}

                {Array.from({ length: BOWLS_PER_END }).map((_, b) => {
                  const hand = HANDS[b];
                  const selected = bowls[e][b];
                  const selectedPoints = selected ? (pointsByKey[selected] ?? taps[e][b]?.points ?? 0) : 0;
                  const isCurrent = isActiveEnd && b === currentBowlInEnd;
                  const isPending = !selected && !isCurrent;
                  return (
                    <div
                      key={b}
                      className={`rounded-xl border p-3 transition ${
                        isCurrent
                          ? "border-primary bg-primary/5 ring-2 ring-primary"
                          : isPending
                            ? "border-border/40 opacity-60"
                            : "border-border/60"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            🎯 Bowl {b + 1}
                          </p>
                          <p
                            className={`font-display text-lg font-extrabold uppercase tracking-wide ${
                              isCurrent ? "text-primary" : "text-charcoal"
                            }`}
                          >
                            {hand}
                          </p>
                        </div>
                        {selected && (
                          <span className="text-xs font-bold text-primary">
                            {selectedPoints} pt{selectedPoints === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {cats.map((c) => {
                          const active = selected === c.key;
                          return (
                            <button
                              key={c.key}
                              type="button"
                              onClick={() => setBowlSimple(e, b, c.key)}
                              className={`flex flex-col items-center justify-center rounded-lg px-1 py-2 text-[11px] font-semibold leading-tight transition ${
                                active
                                  ? "bt-gradient-primary text-white"
                                  : "bg-secondary text-charcoal active:opacity-80"
                              }`}
                            >
                              <span className="text-center">{c.label}</span>
                              <span className={active ? "text-white/90" : "text-muted-foreground"}>
                                {c.points}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })
        )}


        {activeSession ? (
          <section className="rounded-2xl bg-secondary/40 p-4 text-xs">
            <p className="font-semibold text-foreground">
              Inheriting session details
              {activeSession.club ? ` · ${activeSession.club}` : ""}
              {activeSession.green ? ` · ${activeSession.green}` : ""}
            </p>
            <p className="mt-1 text-muted-foreground">
              Location, green and conditions come from the active training session.
            </p>
          </section>
        ) : (
          <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
            <h3 className="font-display text-lg font-bold">Session details</h3>
            <FieldRow label="Location / club" value={location} onChange={setLocation} placeholder="e.g. Sunshine BC" />
            <SessionConditionsField
              conditions={conditionsList}
              onConditionsChange={setConditionsList}
              greenType={greenType}
              onGreenTypeChange={setGreenType}
            />
            <FieldRow label="Green speed" value={greenSpeed} onChange={setGreenSpeed} placeholder="14s" />
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="rounded-xl" placeholder="How did it feel?" />
            </div>
          </section>
        )}


        {mode === "simple" && (
          <>
            <Button onClick={() => handleSave(false)} disabled={!valid || saving} className="h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated">
              {saving ? "Saving…" : valid ? `Save result • ${score} pts` : `Record ${target - filled} more bowl${target - filled === 1 ? "" : "s"}`}
            </Button>
            {valid && (
              <Button onClick={() => handleSave(true)} disabled={saving} variant="outline" className="h-14 w-full rounded-2xl text-sm font-bold">
                Save & Repeat Drill
              </Button>
            )}
          </>
        )}

        {practiceActivity && mode !== "visual" && (
          <PauseButton
            activity={practiceActivity}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-bold active:scale-[0.99] transition"
            label="Pause / Save for later"
            hasCurrentStats={currentBowlsDelivered > 0}
            onBeforePause={flushPracticeState}
            onBeforeDiscard={flushPracticeState}
            onSaved={() => { setSavedOk(true); navigate({ to: "/dashboard" }); }}
            onDiscarded={() => { setSavedOk(true); navigate({ to: "/dashboard" }); }}
          />
        )}

        {activeSession && (
          <button
            type="button"
            onClick={() => setEndOpen(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-destructive text-sm font-bold text-destructive-foreground active:scale-[0.99] transition"
          >
            <StopCircle className="h-5 w-5" /> End session
          </button>
        )}

        <Link to="/drills" className="block py-2 text-center text-xs font-semibold text-muted-foreground">
          Cancel
        </Link>
      </main>

      <LeavePracticeGuard
        when={!savedOk && !!practiceActivity && practiceActivity.status !== "completed"}
        activity={practiceActivity}
        hasCurrentStats={currentBowlsDelivered > 0}
        onBeforeSave={flushPracticeState}
        onBeforeDiscard={flushPracticeState}
        onLeaving={() => {
          if (drill) clearStart(drill.id);
          setSavedOk(true);
        }}
      />


      {activeSession && (
        <EndSessionDialog
          open={endOpen}
          onOpenChange={setEndOpen}
          session={activeSession}
          onEnded={() => {
            navigate({ to: "/dashboard" });
          }}
        />
      )}
    </>
  );
}

function FieldRow({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="rounded-xl" />
    </div>
  );
}



