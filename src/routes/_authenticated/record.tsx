import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
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
import { percentageOf, bsiFromBreakdown, type Drill } from "@/lib/bowls";
import { SessionConditionsField, type GreenType } from "@/components/bowls/SessionConditionsField";
import { Minus, Plus, Target, ChevronRight, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoResultNotice } from "@/components/bowls/DemoResultNotice";
import { useActiveSession } from "@/hooks/use-active-session";
import { ACTIVE_SESSION_QK, SESSIONS_QK, attachActivity, getActiveSession } from "@/lib/sessions";

const SESSION_KEY = "bowls.activeSession.v1";
type ActiveSession = Record<string, string>; // drillId -> ISO start time

function readSessions(): ActiveSession {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function writeSessions(s: ActiveSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
function ensureStart(drillId: string): string {
  const all = readSessions();
  if (!all[drillId]) {
    all[drillId] = new Date().toISOString();
    writeSessions(all);
  }
  return all[drillId];
}
function clearStart(drillId: string) {
  const all = readSessions();
  delete all[drillId];
  writeSessions(all);
}


const searchSchema = z.object({
  drill: z.string().optional(),
  id: z.string().optional(),
  start: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/record")({
  validateSearch: searchSchema,
  component: RecordPage,
});

function RecordPage() {
  const { user } = Route.useRouteContext();
  const { drill: drillSlug, id: editId, start } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: drills } = useQuery({
    queryKey: ["drills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drills").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Drill[];
    },
  });

  const { data: editing } = useQuery({
    queryKey: ["result", editId],
    enabled: !!editId,
    queryFn: async () => {
      const { data, error } = await supabase.from("results").select("*").eq("id", editId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // When editing, find the original drill. Otherwise, resolve by slug only.
  const drill = useMemo(() => {
    if (!drills?.length) return null;
    if (editing) return drills.find((d) => d.id === editing.drill_id) ?? null;
    if (!drillSlug) return null;
    return drills.find((d) => d.slug === drillSlug) ?? null;
  }, [drills, drillSlug, editing]);

  // No drill selected and not editing → show drill picker (step 2 in the flow).
  const showPicker = !editId && !drillSlug;

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [conditionsList, setConditionsList] = useState<string[]>([]);
  const [greenType, setGreenType] = useState<GreenType | "">("");
  const [greenSpeed, setGreenSpeed] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const { activeSession } = useActiveSession();

  useEffect(() => {
    if (editing && !hydrated) {
      const ed = editing as any;
      setCounts((ed.breakdown ?? {}) as Record<string, number>);
      setNotes(ed.notes ?? "");
      const list = Array.isArray(ed.conditions_list) ? ed.conditions_list as string[] : [];
      setConditionsList(list);
      setGreenType((ed.green_type ?? "") as GreenType | "");
      setGreenSpeed(ed.green_speed ?? "");
      setLocation(ed.location ?? "");
      setHydrated(true);
    }
  }, [editing, hydrated]);

  // Background timer: only START when the user explicitly tapped "Start Drill"
  // (start=1) or when editing an existing result.
  // Persists in localStorage so reloads / nav-away+return resume the same start.
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  useEffect(() => {
    if (!drill || editId) return;
    if (start !== "1") return;
    setStartedAt(ensureStart(drill.id));
  }, [drill, editId, start]);

  // Block in-app navigation away when there's an in-progress (unsaved) session.
  const hasUnsaved = !editId && !savedOk && Object.values(counts).some((n) => n > 0);
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved,
    enableBeforeUnload: hasUnsaved,
    withResolver: true,
  });

  // Step 2: drill picker — when no drill is selected, list drills.
  if (showPicker) {
    return (
      <>
        <PageHeader title="Select Drill" subtitle="Choose a drill to record" />
        <main className="mx-auto -mt-4 max-w-md space-y-3 px-5 pb-8">
          {drills?.map((d) => (
            <Link
              key={d.id}
              to="/drill/$slug"
              params={{ slug: d.slug }}
              className="flex items-center gap-4 rounded-2xl bg-card p-4 bt-shadow-card active:opacity-90"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bt-gradient-primary text-white">
                <Target className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  {d.category ?? "Drill"}
                </p>
                <h3 className="font-display text-base font-bold leading-tight">{d.name}</h3>
                {d.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{d.description}</p>
                )}
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          ))}
        </main>
      </>
    );
  }

  if (!drill) {
    return (
      <>
        <PageHeader title={editId ? "Edit Result" : "Record Result"} />
        <main className="mx-auto max-w-md px-5 py-10 text-center text-muted-foreground">Loading drill…</main>
      </>
    );
  }

  const cats = drill.scoring_config.categories;
  const total = cats.reduce((s, c) => s + (counts[c.key] ?? 0), 0);
  const score = cats.reduce((s, c) => s + (counts[c.key] ?? 0) * c.points, 0);
  const target = drill.bowls_per_end;
  const remaining = target - total;
  const valid = total === target;
  const pct = percentageOf(score, drill.min_score, drill.max_score);
  const attemptLabel = drill.category === "Jack Delivery" ? "jacks" : drill.category === "Drive" ? "drives" : "bowls";

  function adjust(key: string, delta: number) {
    setCounts((prev) => {
      const next = Math.max(0, (prev[key] ?? 0) + delta);
      const otherTotal = cats.reduce((s, c) => s + (c.key === key ? 0 : prev[c.key] ?? 0), 0);
      if (otherTotal + next > target) return prev;
      return { ...prev, [key]: next };
    });
  }

  async function handleSave(repeat = false) {
    if (!valid) {
      toast.error(`Total ${attemptLabel} must equal ${target}`);
      return;
    }
    setSaving(true);

    if (editId) {
      const { error } = await supabase
        .from("results")
        .update({
          score,
          max_score: drill!.max_score,
          min_score: drill!.min_score,
          percentage: pct,
          bsi: bsiFromBreakdown(drill!.slug, counts, pct),
          breakdown: counts,
          notes: notes || null,
          conditions: conditionsList.length ? conditionsList.join(", ") : null,
          conditions_list: conditionsList.length ? conditionsList : null,
          green_type: greenType || null,
          green_speed: greenSpeed || null,
          location: location || null,
          last_edited_at: new Date().toISOString(),
        } as any)
        .eq("id", editId);
      setSaving(false);
      if (error) return toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["results", user.id] });
      qc.invalidateQueries({ queryKey: ["result", editId] });
      toast.success("Result updated");
      navigate({ to: "/history" });
      return;
    }

    const completedAt = new Date();
    const startIso = startedAt ?? ensureStart(drill!.id);
    const durationMinutes = Math.max(
      1,
      Math.round((completedAt.getTime() - new Date(startIso).getTime()) / 60000),
    );

    const activeSession = await getActiveSession(user.id);

    if (isDemoMode()) {
      setSaving(false);
      setSavedOk(true);
      clearStart(drill!.id);
      if (activeSession) await attachActivity(activeSession.id, "drill", drill!.category);
      toast.success(`Demo result — not saved (${score}/${drill!.max_score})`);
      if (repeat) navigate({ to: "/drill/$slug", params: { slug: drill!.slug } });
      else if (activeSession) navigate({ to: "/sessions/$id", params: { id: activeSession.id } });
      else navigate({ to: "/dashboard" });
      return;
    }


    const { data, error } = await supabase
      .from("results")
      .insert({
        user_id: user.id,
        drill_id: drill!.id,
        drill_name: drill!.name,
        category: drill!.category,
        score,
        max_score: drill!.max_score,
        min_score: drill!.min_score,
        percentage: pct,
        bsi: bsiFromBreakdown(drill!.slug, counts, pct),
        breakdown: counts,
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

    const newId = data.id;
    clearStart(drill!.id);
    setSavedOk(true);
    if (activeSession) {
      await attachActivity(activeSession.id, "drill", drill!.category);
      qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(user.id) });
      qc.invalidateQueries({ queryKey: SESSIONS_QK(user.id) });
      qc.invalidateQueries({ queryKey: ["training_session", activeSession.id] });
      qc.invalidateQueries({ queryKey: ["session_drills", activeSession.id] });
    }
    qc.invalidateQueries({ queryKey: ["results", user.id] });
    toast.success(activeSession ? "Added to session" : "Result saved", {
      duration: 10000,
      action: {
        label: "Undo",
        onClick: async () => {
          const { error: delErr } = await supabase.from("results").delete().eq("id", newId);
          if (delErr) return toast.error(delErr.message);
          qc.invalidateQueries({ queryKey: ["results", user.id] });
          toast("Result undone");
        },
      },
    });
    if (repeat) {
      navigate({ to: "/drill/$slug", params: { slug: drill!.slug } });
    } else {
      navigate({ to: activeSession ? "/sessions/$id" : "/dashboard", params: activeSession ? { id: activeSession.id } : undefined as any });
    }
  }

  const isJackInDitch = drill.slug === "jack-in-ditch";

  return (
    <>
      <PageHeader title={editId ? `Edit • ${drill.name}` : drill.name} subtitle={isJackInDitch ? "Pick the ditching bowl for each end" : `Tap to count ${attemptLabel} in each zone`} />

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        {!editId && (
          <div className="flex items-center justify-between rounded-2xl bg-secondary/40 px-4 py-2 text-xs">
            <span className="font-semibold text-muted-foreground">Recording session</span>
            <Link to="/drills" className="font-semibold text-primary">Change drill</Link>
          </div>
        )}

        {isJackInDitch && !editId ? (
          <JackInDitchEnds
            cats={cats}
            totalEnds={drill.bowls_per_end}
            score={score}
            pct={pct}
            onChange={setCounts}
          />
        ) : (
        <>
        <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
          <div className="flex items-center justify-around text-center">
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground capitalize">{attemptLabel}</p>
              <p className="font-display text-3xl font-extrabold">{total}<span className="text-base text-muted-foreground">/{target}</span></p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Score</p>
              <p className="font-display text-3xl font-extrabold text-primary">{score}</p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">BSI</p>
              <p className="font-display text-3xl font-extrabold">{pct.toFixed(0)}</p>
            </div>
          </div>
          {!valid && (
            <p className="mt-3 text-center text-sm font-semibold text-muted-foreground">
              {remaining > 0 ? `${remaining} ${attemptLabel.slice(0, remaining === 1 ? -1 : undefined)} left` : `${-remaining} too many`}
            </p>
          )}
        </section>

        {["8-bowl-draw-test", "forehand-draw-test", "backhand-draw-test"].includes(drill.slug) && (
          <section className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm">
            <p className="font-display font-bold">Scoring Guide</p>
            <ul className="mt-2 space-y-0.5 text-muted-foreground">
              <li>Half Mat = 5</li>
              <li>One Mat = 3</li>
              <li>Two Mats = 1</li>
              <li>Outside Two Mats = 0</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              A bowl within one mat of the jack is a strong result, especially at longer lengths. Within half a mat is excellent; within two mats is useful but leaves room to improve.
            </p>
          </section>
        )}



        <section className="space-y-2">
          {cats.map((c) => (
            <div key={c.key} className="flex items-center gap-3 rounded-2xl bg-card p-4 bt-shadow-card">
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold">{c.label}</p>
                <p className="text-xs font-semibold" style={{ color: c.points >= 0 ? "var(--color-primary)" : "var(--color-destructive)" }}>
                  {c.points > 0 ? `+${c.points}` : c.points} pts
                </p>
              </div>
              <button
                onClick={() => adjust(c.key, -1)}
                disabled={!counts[c.key]}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-charcoal disabled:opacity-30"
                aria-label={`Decrease ${c.label}`}
              >
                <Minus className="h-5 w-5" />
              </button>
              <span className="w-8 text-center font-display text-2xl font-extrabold">{counts[c.key] ?? 0}</span>
              <button
                onClick={() => adjust(c.key, 1)}
                disabled={remaining <= 0}
                className="flex h-12 w-12 items-center justify-center rounded-xl bt-gradient-primary text-white disabled:opacity-30"
                aria-label={`Increase ${c.label}`}
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          ))}
        </section>
        </>
        )}

        {activeSession && !editId ? (
          <section className="rounded-2xl bg-secondary/40 p-4 text-xs">
            <p className="font-semibold text-foreground">
              Inheriting session details
              {activeSession.club ? ` · ${activeSession.club}` : ""}
              {activeSession.green ? ` · ${activeSession.green}` : ""}
            </p>
            <p className="mt-1 text-muted-foreground">
              Location, green and conditions come from the active training session.
            </p>
            <div className="mt-3 space-y-2">
              <Label className="text-sm font-semibold">Drill notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="rounded-xl" placeholder="Anything specific about this drill?" />
            </div>
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


        <Button onClick={() => handleSave(false)} disabled={!valid || saving} className="h-16 w-full rounded-2xl text-base font-bold bt-shadow-elevated">
          {saving ? "Saving…" : editId ? `Update result • ${score} pts` : valid ? `Save result • ${score} pts` : `Add ${remaining} more`}
        </Button>
        {valid && !editId && (
          <Button onClick={() => handleSave(true)} disabled={saving} variant="outline" className="h-14 w-full rounded-2xl text-sm font-bold">
            Save & Repeat Drill
          </Button>
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
      </main>

      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this drill session?</AlertDialogTitle>
            <AlertDialogDescription>
              You haven't saved this session yet. Leaving now will discard your current bowls and the training time won't be recorded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Resume session</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (drill) clearStart(drill.id);
                blocker.proceed?.();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

function FieldRow({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-12 rounded-xl text-base" />
    </div>
  );
}

type Cat = { key: string; label: string; points: number };

function JackInDitchEnds({
  cats,
  totalEnds,
  score,
  pct,
  onChange,
}: {
  cats: Cat[];
  totalEnds: number;
  score: number;
  pct: number;
  onChange: (counts: Record<string, number>) => void;
}) {
  const [picks, setPicks] = useState<(string | null)[]>(() => Array(totalEnds).fill(null));
  const currentEnd = picks.findIndex((p) => p === null);
  const allDone = currentEnd === -1;

  function pick(key: string) {
    setPicks((prev) => {
      const next = [...prev];
      const idx = next.findIndex((p) => p === null);
      if (idx === -1) return prev;
      next[idx] = key;
      const counts: Record<string, number> = {};
      for (const k of next) if (k) counts[k] = (counts[k] ?? 0) + 1;
      onChange(counts);
      return next;
    });
  }

  function resetEnd(i: number) {
    setPicks((prev) => {
      const next = prev.map((p, idx) => (idx >= i ? null : p));
      const counts: Record<string, number> = {};
      for (const k of next) if (k) counts[k] = (counts[k] ?? 0) + 1;
      onChange(counts);
      return next;
    });
  }

  const ditchKeys = ["bowl1", "bowl2", "bowl3", "bowl4"];
  const bowlsUsed = picks.reduce((sum, k) => {
    if (!k) return sum;
    const idx = ditchKeys.indexOf(k);
    return sum + (idx >= 0 ? idx + 1 : 4);
  }, 0);
  const successfulEnds = picks.filter((k) => k && ditchKeys.includes(k));
  const avgBowlsToDitch =
    successfulEnds.length > 0
      ? successfulEnds.reduce((s, k) => s + (ditchKeys.indexOf(k!) + 1), 0) / successfulEnds.length
      : null;

  function labelFor(key: string) {
    return cats.find((c) => c.key === key)?.label ?? key;
  }
  function pointsFor(key: string) {
    return cats.find((c) => c.key === key)?.points ?? 0;
  }

  if (!allDone) {
    return (
      <section className="space-y-4">
        <div className="rounded-3xl bg-card p-5 bt-shadow-elevated text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
            End {currentEnd + 1} of {totalEnds}
          </p>
          <h3 className="mt-1 font-display text-2xl font-extrabold">
            Which bowl drove the jack into the ditch?
          </h3>
        </div>
        <div className="space-y-2">
          {cats.map((c) => (
            <button
              key={c.key}
              onClick={() => pick(c.key)}
              className="flex w-full items-center justify-between rounded-2xl bg-card p-4 bt-shadow-card active:opacity-80"
            >
              <span className="font-display text-base font-bold">{c.label}</span>
              <span
                className="font-display text-xl font-extrabold"
                style={{ color: c.points > 0 ? "var(--color-primary)" : "var(--color-muted-foreground)" }}
              >
                {c.points}
              </span>
            </button>
          ))}
        </div>
        {picks.some((p) => p !== null) && (
          <div className="rounded-2xl bg-secondary/40 p-4 text-sm">
            <p className="mb-2 font-semibold text-muted-foreground">Previous ends</p>
            <ul className="space-y-1">
              {picks.map((p, i) =>
                p ? (
                  <li key={i} className="flex items-center justify-between">
                    <span>End {i + 1}: {labelFor(p)}</span>
                    <button onClick={() => resetEnd(i)} className="text-xs font-semibold text-primary">
                      Redo
                    </button>
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl bg-card p-5 bt-shadow-elevated text-center">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Final result</p>
        <p className="mt-1 font-display text-5xl font-extrabold text-primary">
          {score}
          <span className="text-2xl text-muted-foreground">/40</span>
        </p>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">BSI {pct.toFixed(0)}</p>
      </div>
      <div className="space-y-2">
        {picks.map((p, i) => (
          <div key={i} className="flex items-center justify-between rounded-2xl bg-card p-4 bt-shadow-card">
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground">End {i + 1}</p>
              <p className="font-display font-bold">{labelFor(p!)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl font-extrabold text-primary">{pointsFor(p!)}</span>
              <button onClick={() => resetEnd(i)} className="text-xs font-semibold text-primary">Redo</button>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-secondary/40 p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Total bowls used</span><span className="font-semibold">{bowlsUsed}</span></div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted-foreground">Avg bowls to ditch</span>
          <span className="font-semibold">{avgBowlsToDitch !== null ? avgBowlsToDitch.toFixed(1) : "—"}</span>
        </div>
      </div>
    </section>
  );
}
