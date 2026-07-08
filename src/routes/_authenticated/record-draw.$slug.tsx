import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { EndSessionDialog } from "@/components/bowls/EndSessionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { percentageOf, bsiFromBreakdown, type Drill, type BowlDetail, isDrawDrillSlug, drawLengthForSlug } from "@/lib/bowls";
import { VisualTarget, type VisualTap } from "@/components/bowls/VisualTarget";
import { EndTargetRecorder } from "@/components/bowls/EndTargetRecorder";

import { SessionConditionsField, type GreenType } from "@/components/bowls/SessionConditionsField";
import { StopCircle } from "lucide-react";
import { toast } from "sonner";
import { useActiveSession } from "@/hooks/use-active-session";
import { ACTIVE_SESSION_QK, SESSIONS_QK, attachActivity, getActiveSession } from "@/lib/sessions";
import { isDemoMode } from "@/lib/demo-mode";

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

const searchSchema = z.object({ start: z.string().optional() });

export const Route = createFileRoute("/_authenticated/record-draw/$slug")({
  validateSearch: searchSchema,
  component: RecordDrawPage,
});

const ENDS = 4;
const BOWLS_PER_END = 4;
const HANDS: BowlDetail["hand"][] = ["forehand", "forehand", "backhand", "backhand"];

function RecordDrawPage() {
  const { user } = Route.useRouteContext();
  const { slug } = Route.useParams();
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
  const [endOpen, setEndOpen] = useState(false);
  // Continuous visual scoring: explicit focus on a single bowl.
  // Auto-advances after each placement; can be moved backward via Back/Undo.
  
  const { activeSession } = useActiveSession();


  useEffect(() => {
    if (!drill) return;
    setStartedAt(ensureStart(drill.id));
  }, [drill]);

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
  }, [bowls, taps, pointsByKey, drawLength]);

  const score = flat.reduce((s, b) => s + b.points, 0);
  const filled = flat.length;
  const target = ENDS * BOWLS_PER_END;
  const valid = filled === target;
  const pct = drill ? percentageOf(score, drill.min_score, drill.max_score) : 0;
  const liveBsi = drill ? bsiFromBreakdown(drill.slug, { bowls: flat }, pct) : 0;

  function setBowlSimple(end: number, bowl: number, key: string) {
    setBowls((prev) => { const next = prev.map((r) => r.slice()); next[end][bowl] = key; return next; });
    setTaps((prev) => { const next = prev.map((r) => r.slice()); next[end][bowl] = null; return next; });
  }
  function setBowlVisual(end: number, bowl: number, tap: VisualTap) {
    setBowls((prev) => { const next = prev.map((r) => r.slice()); next[end][bowl] = tap.key; return next; });
    setTaps((prev) => { const next = prev.map((r) => r.slice()); next[end][bowl] = tap; return next; });
  }
  function clearBowl(end: number, bowl: number) {
    setBowls((prev) => { const next = prev.map((r) => r.slice()); next[end][bowl] = null; return next; });
    setTaps((prev) => { const next = prev.map((r) => r.slice()); next[end][bowl] = null; return next; });
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
      ...counts,
      ends: ENDS,
      bowls_per_end: BOWLS_PER_END,
      bowls: flat,
    };

    const completedAt = new Date();
    const startIso = startedAt ?? ensureStart(drill.id);
    const durationMinutes = Math.max(
      1,
      Math.round((completedAt.getTime() - new Date(startIso).getTime()) / 60000),
    );

    const activeSession = await getActiveSession(user.id);

    if (isDemoMode()) {
      setSaving(false);
      clearStart(drill.id);
      if (activeSession) await attachActivity(activeSession.id, "drill", drill.category);
      toast.success(`Demo result — not saved (${score}/${drill.max_score})`);
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

    clearStart(drill.id);
    if (activeSession) {
      await attachActivity(activeSession.id, "drill", drill.category);
      qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(user.id) });
      qc.invalidateQueries({ queryKey: SESSIONS_QK(user.id) });
      qc.invalidateQueries({ queryKey: ["training_session", activeSession.id] });
      qc.invalidateQueries({ queryKey: ["session_drills", activeSession.id] });
    }
    qc.invalidateQueries({ queryKey: ["results", user.id] });
    toast.success(activeSession ? "Added to session" : "Result saved");
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
      <PageHeader title={drill.name} subtitle={mode === "visual" ? `Score each end · ${ENDS} ends` : "Tap the score zone for each bowl"} />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
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
            onClear={clearBowl}
            onFinish={() => handleSave(false)}
            onExit={() => changeMode("simple")}
            saving={saving}
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



