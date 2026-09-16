import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDown, ArrowUp, Loader2, Lock, Plus, Users, X } from "lucide-react";
import { ActivityPicker, type LibraryItem } from "@/components/bowls/ActivityPicker";
import {
  COACH_PROGRAMS_QK,
  addActivity,
  addSession,
  assignProgram,
  assignProgramToSquad,
  deleteActivity,
  deleteSession,
  getProgramDetail,
  lockedActivityIds,
  programPlayerProgress,
  programTypeLabel,
  reorderActivities,
  setProgramStatus,
  updateActivity,
  updateSession,
  type ResolvedSession,
} from "@/lib/programs";

export const Route = createFileRoute("/_authenticated/coach/programs/$programId")({
  component: CoachProgramDetail,
});

function CoachProgramDetail() {
  const { programId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [newSession, setNewSession] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const detailQK = ["coach-program", programId];

  const { data, isLoading, refetch } = useQuery({
    queryKey: detailQK,
    queryFn: async () => {
      const [detail, rows, locked] = await Promise.all([
        // Coach view of the structure — progress shown per player below.
        getProgramDetail(programId, user.id),
        programPlayerProgress(programId),
        lockedActivityIds(programId),
      ]);
      return { detail, rows, locked };
    },
  });

  const { data: myPlayers = [] } = useQuery({
    queryKey: ["coach-players"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("coach_list_players");
      if (error) throw error;
      return (data ?? []) as Array<{ player_id: string; player_email: string; full_name: string | null }>;
    },
  });

  const { data: library = [] } = useQuery({
    queryKey: ["program-library-full"],
    queryFn: async () => {
      const [{ data: drills }, { data: challenges }] = await Promise.all([
        supabase.from("drills").select("id, slug, name, category, description").order("sort_order"),
        (supabase as any).from("challenges").select("id, slug, name, category, description").order("sort_order"),
      ]);
      return [
        ...((drills ?? []) as any[]).map((d) => ({ ...d, kind: "drill" as const })),
        ...((challenges ?? []) as any[]).map((c) => ({ ...c, kind: "challenge" as const })),
      ] as LibraryItem[];
    },
  });

  async function guarded(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await refetch();
      if (label) toast.success(label);
    } catch (e) {
      console.error("[coach] program edit failed", e);
      toast.error(e instanceof Error ? e.message : "Couldn't save that change.");
    } finally {
      setBusy(false);
    }
  }

  async function addFutureSession() {
    if (!newSession.trim()) return;
    await guarded("Session added. Completed work is untouched.", async () => {
      const seq = (data?.detail?.totalSessions ?? 0) + 1;
      await addSession(programId, { title: newSession.trim(), activities: [] }, seq);
      setNewSession("");
    });
  }

  async function assign(playerId: string) {
    await guarded("Player assigned.", () => assignProgram(programId, playerId, user.id));
  }

  async function assignSquad() {
    setBusy(true);
    try {
      const { assigned, skipped } = await assignProgramToSquad(programId, user.id);
      await refetch();
      if (assigned === 0 && skipped.length === 0) {
        toast.error("You don't have any squad members yet.");
      } else {
        toast.success(
          `${assigned} squad ${assigned === 1 ? "member" : "members"} added.${
            skipped.length ? ` ${skipped.length} still need to accept you as coach.` : ""
          }`,
        );
      }
    } catch (e) {
      console.error("[coach] squad assign failed", e);
      toast.error("Couldn't assign your squad.");
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    await setProgramStatus(programId, "active");
    qc.invalidateQueries({ queryKey: COACH_PROGRAMS_QK(user.id) });
    await refetch();
    toast.success("Program activated.");
  }

  if (isLoading) {
    return (
      <main className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }
  const detail = data?.detail;
  if (!detail) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center text-muted-foreground">
        <p>That program is no longer available.</p>
        <Link to="/coach/programs" className="mt-4 inline-block text-sm font-bold text-primary">
          Back to programs
        </Link>
      </main>
    );
  }
  const program = detail.program;
  const assignedIds = new Set((data?.rows ?? []).map((r) => r.playerId));
  const locked = data?.locked ?? new Set<string>();

  return (
    <main className="mx-auto max-w-md space-y-4 px-5 pb-10">
      <section className="rounded-2xl bg-card p-5 bt-shadow-card">
        <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
          {programTypeLabel(program.program_type)} · {program.status}
        </p>
        <h2 className="font-display text-lg font-bold">{program.name}</h2>
        {program.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{program.description}</p>
        ) : null}
        {program.start_date || program.end_date ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {program.start_date ?? "—"} → {program.end_date ?? "—"}
          </p>
        ) : null}
        {program.status === "draft" ? (
          <Button className="mt-3 h-10 w-full" onClick={activate}>
            Activate program
          </Button>
        ) : null}
      </section>

      <section className="space-y-2 rounded-2xl bg-card p-5 bt-shadow-card">
        <p className="font-display text-base font-bold">Player progress</p>
        {(data?.rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody assigned yet.</p>
        ) : (
          (data?.rows ?? []).map((r) => (
            <div key={r.playerId} className="rounded-xl bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{r.name ?? "Player"}</span>
                <span className="text-sm font-bold text-primary">{r.percent}%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.completedSessions}/{r.totalSessions} sessions · {r.completedActivities}/{r.totalActivities}{" "}
                activities
                {r.lastActivityAt
                  ? ` · last trained ${new Date(r.lastActivityAt).toLocaleDateString(undefined, { weekday: "short" })}`
                  : ""}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary/60">
                <div className="h-full bt-gradient-primary" style={{ width: `${r.percent}%` }} />
              </div>
            </div>
          ))
        )}
      </section>

      <section className="space-y-2 rounded-2xl bg-card p-5 bt-shadow-card">
        <p className="font-display text-base font-bold">Add players</p>
        <Button variant="outline" className="h-11 w-full" onClick={assignSquad} disabled={busy}>
          <Users className="mr-2 h-4 w-4" /> Assign my whole squad
        </Button>
        <p className="text-xs text-muted-foreground">
          Everyone in your squad who has accepted you as coach is added at once. They share this one program and each
          keeps their own progress.
        </p>
        {myPlayers.filter((p) => !assignedIds.has(p.player_id)).length === 0 ? (
          <p className="text-sm text-muted-foreground">All your players are already on this program.</p>
        ) : (
          myPlayers
            .filter((p) => !assignedIds.has(p.player_id))
            .map((p) => (
              <button
                key={p.player_id}
                type="button"
                onClick={() => assign(p.player_id)}
                className="w-full rounded-xl border border-border px-3 py-2 text-left text-sm"
              >
                {p.full_name || p.player_email}
              </button>
            ))
        )}
      </section>

      <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
        <p className="font-display text-base font-bold">Sessions</p>
        <p className="text-xs text-muted-foreground">
          You can keep shaping work nobody has recorded yet. Anything a player has already completed is kept exactly
          as they did it, with their score and practice time intact.
        </p>
        {detail.sessions.map((s) => (
          <SessionEditor
            key={s.id}
            session={s}
            locked={locked}
            library={library}
            busy={busy}
            pickerOpen={pickerFor === s.id}
            onOpenPicker={() => setPickerFor(s.id)}
            onClosePicker={() => setPickerFor(null)}
            onSaveSession={(patch) => guarded("Session updated.", () => updateSession(s.id, patch))}
            onRemoveSession={() => guarded("Session removed.", () => deleteSession(s.id))}
            onAddActivity={(item) =>
              guarded("Activity added.", async () => {
                await addActivity(
                  programId,
                  s.id,
                  {
                    kind: item.kind,
                    drillId: item.kind === "drill" ? item.id : null,
                    challengeId: item.kind === "challenge" ? item.id : null,
                  },
                  s.activities.length + 1,
                );
                setPickerFor(null);
              })
            }
            onRemoveActivity={(id) => guarded("Activity removed.", () => deleteActivity(id))}
            onMoveActivity={(idx, dir) =>
              guarded("", () => {
                const ids = s.activities.map((a) => a.id);
                const to = idx + dir;
                if (to < 0 || to >= ids.length) return Promise.resolve();
                [ids[idx], ids[to]] = [ids[to]!, ids[idx]!];
                return reorderActivities(ids);
              })
            }
            onSaveActivity={(id, patch) => guarded("Saved.", () => updateActivity(id, patch))}
          />
        ))}
        <div className="flex gap-2">
          <Input
            placeholder="New session title"
            aria-label="New session title"
            value={newSession}
            onChange={(e) => setNewSession(e.target.value)}
          />
          <Button onClick={addFutureSession} disabled={busy}>
            Add
          </Button>
        </div>
      </section>
    </main>
  );
}

function SessionEditor({
  session,
  locked,
  library,
  busy,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onSaveSession,
  onRemoveSession,
  onAddActivity,
  onRemoveActivity,
  onMoveActivity,
  onSaveActivity,
}: {
  session: ResolvedSession;
  locked: Set<string>;
  library: LibraryItem[];
  busy: boolean;
  pickerOpen: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onSaveSession: (patch: { title: string; objective: string | null; coach_note: string | null }) => void;
  onRemoveSession: () => void;
  onAddActivity: (item: LibraryItem) => void;
  onRemoveActivity: (id: string) => void;
  onMoveActivity: (idx: number, dir: -1 | 1) => void;
  onSaveActivity: (
    id: string,
    patch: { coach_note: string | null; target_score: number | null; required_completions: number },
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(session.title);
  const [objective, setObjective] = useState(session.objective ?? "");
  const [note, setNote] = useState(session.coach_note ?? "");
  const anyRecorded = session.activities.some((a) => locked.has(a.id));

  return (
    <div className="rounded-xl bg-background p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold">
            {session.sequence}. {session.title}
          </span>
          <span className="block text-xs text-muted-foreground">
            {session.activities.map((a) => a.ref?.name ?? "—").join(" · ") || "No activities yet"}
          </span>
        </span>
        <span className="shrink-0 text-xs font-bold text-primary">{open ? "Done" : "Edit"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          <Input value={title} aria-label="Session title" onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            rows={2}
            aria-label="Session objective"
            placeholder="Objective (optional)"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
          <Input
            aria-label="Session coach note"
            placeholder="Coach note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              className="h-9 flex-1 text-xs"
              disabled={busy}
              onClick={() =>
                onSaveSession({ title: title.trim() || session.title, objective: objective.trim() || null, coach_note: note.trim() || null })
              }
            >
              Save session
            </Button>
            {anyRecorded ? null : (
              <Button variant="ghost" className="h-9 text-xs" disabled={busy} onClick={onRemoveSession}>
                Remove
              </Button>
            )}
          </div>

          <ol className="space-y-2">
            {session.activities.map((a, ai) => (
              <ActivityEditor
                key={a.id}
                name={a.ref?.name ?? "Activity"}
                kind={a.kind}
                locked={locked.has(a.id)}
                busy={busy}
                requiredCompletions={a.required_completions}
                targetScore={a.target_score}
                coachNote={a.coach_note}
                onMove={(dir) => onMoveActivity(ai, dir)}
                onRemove={() => onRemoveActivity(a.id)}
                onSave={(patch) => onSaveActivity(a.id, patch)}
              />
            ))}
          </ol>

          {pickerOpen ? (
            <ActivityPicker items={library} onPick={onAddActivity} onClose={onClosePicker} />
          ) : (
            <Button variant="outline" className="h-10 w-full" onClick={onOpenPicker}>
              <Plus className="mr-1 h-4 w-4" /> Add drill or challenge
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ActivityEditor({
  name,
  kind,
  locked,
  busy,
  requiredCompletions,
  targetScore,
  coachNote,
  onMove,
  onRemove,
  onSave,
}: {
  name: string;
  kind: "drill" | "challenge";
  locked: boolean;
  busy: boolean;
  requiredCompletions: number;
  targetScore: number | null;
  coachNote: string | null;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onSave: (patch: { coach_note: string | null; target_score: number | null; required_completions: number }) => void;
}) {
  const [repeats, setRepeats] = useState(String(requiredCompletions));
  const [target, setTarget] = useState(targetScore === null ? "" : String(targetScore));
  const [note, setNote] = useState(coachNote ?? "");

  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold leading-tight">{name}</span>
          <span className="block text-xs text-muted-foreground">
            {kind === "drill" ? "Drill · counts toward BSI" : "Challenge · no BSI"}
          </span>
        </span>
        {locked ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Recorded
          </span>
        ) : (
          <>
            <Button variant="ghost" size="icon" aria-label={`Move ${name} up`} disabled={busy} onClick={() => onMove(-1)}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Move ${name} down`} disabled={busy} onClick={() => onMove(1)}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Remove ${name}`} disabled={busy} onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {locked ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Already recorded by a player — kept exactly as they did it.
        </p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input
              type="number"
              min={1}
              aria-label={`Number of runs for ${name}`}
              value={repeats}
              onChange={(e) => setRepeats(e.target.value)}
            />
            <Input
              placeholder="Target score"
              inputMode="numeric"
              aria-label={`Target score for ${name}`}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <Input
            className="mt-2"
            placeholder="Coach note (optional)"
            aria-label={`Coach note for ${name}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            variant="outline"
            className="mt-2 h-9 w-full text-xs"
            disabled={busy}
            onClick={() =>
              onSave({
                coach_note: note.trim() || null,
                target_score: target.trim() ? Number(target) : null,
                required_completions: Math.max(1, Number(repeats) || 1),
              })
            }
          >
            Save changes
          </Button>
        </>
      )}
    </li>
  );
}
