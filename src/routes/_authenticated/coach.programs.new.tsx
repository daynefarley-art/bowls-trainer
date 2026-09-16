import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from "lucide-react";
import { COACH_PROGRAMS_QK, createProgram, type NewSessionInput } from "@/lib/programs";
import { ActivityPicker, type LibraryItem } from "@/components/bowls/ActivityPicker";

export const Route = createFileRoute("/_authenticated/coach/programs/new")({
  component: NewProgramPage,
});

type DraftActivity = {
  key: string;
  item: LibraryItem;
  repeats: number;
  target: string;
  note: string;
};

type DraftSession = { key: string; title: string; objective: string; note: string; activities: DraftActivity[] };

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

function NewProgramPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [players, setPlayers] = useState<string[]>([]);
  const [sessions, setSessions] = useState<DraftSession[]>([
    { key: nextKey(), title: "Session 1", objective: "", note: "", activities: [] },
  ]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: library } = useQuery({
    queryKey: ["program-library-full"],
    queryFn: async () => {
      const [{ data: drills }, { data: challenges }] = await Promise.all([
        supabase.from("drills").select("id, slug, name, category, description").order("sort_order"),
        (supabase as any).from("challenges").select("id, slug, name, category, description").order("sort_order"),
      ]);
      const items: LibraryItem[] = [
        ...((drills ?? []) as any[]).map((d) => ({ ...d, kind: "drill" as const })),
        ...((challenges ?? []) as any[]).map((c) => ({ ...c, kind: "challenge" as const })),
      ];
      return items;
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

  function patchSession(key: string, patch: Partial<DraftSession>) {
    setSessions((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addActivity(sessionKey: string, item: LibraryItem) {
    setSessions((prev) =>
      prev.map((s) =>
        s.key === sessionKey
          ? { ...s, activities: [...s.activities, { key: nextKey(), item, repeats: 1, target: "", note: "" }] }
          : s,
      ),
    );
    setPickerFor(null);
  }

  function moveActivity(sessionKey: string, idx: number, dir: -1 | 1) {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.key !== sessionKey) return s;
        const arr = [...s.activities];
        const to = idx + dir;
        if (to < 0 || to >= arr.length) return s;
        [arr[idx], arr[to]] = [arr[to]!, arr[idx]!];
        return { ...s, activities: arr };
      }),
    );
  }

  async function save(activate: boolean) {
    if (!name.trim()) return toast.error("Give the program a name.");
    const usable = sessions.filter((s) => s.activities.length > 0);
    if (usable.length === 0) return toast.error("Add at least one drill or challenge.");
    if (activate && players.length === 0) return toast.error("Choose at least one player to assign.");
    setSaving(true);
    try {
      const payload: NewSessionInput[] = usable.map((s, i) => ({
        title: s.title.trim() || `Session ${i + 1}`,
        objective: s.objective.trim() || null,
        coachNote: s.note.trim() || null,
        activities: s.activities.map((a) => ({
          kind: a.item.kind,
          drillId: a.item.kind === "drill" ? a.item.id : null,
          challengeId: a.item.kind === "challenge" ? a.item.id : null,
          requiredCompletions: Math.max(1, a.repeats),
          targetScore: a.target.trim() ? Number(a.target) : null,
          coachNote: a.note.trim() || null,
        })),
      }));
      const program = await createProgram({
        ownerId: user.id,
        programType: "COACH_CUSTOM",
        name: name.trim(),
        description: description.trim() || null,
        status: activate ? "active" : "draft",
        startDate: startDate || null,
        endDate: endDate || null,
        sessions: payload,
        assignTo: activate ? players : [],
      });
      qc.invalidateQueries({ queryKey: COACH_PROGRAMS_QK(user.id) });
      toast.success(activate ? "Program assigned." : "Draft saved.");
      navigate({ to: "/coach/programs/$programId", params: { programId: program.id } });
    } catch (e) {
      console.error("[coach] create program failed", e);
      toast.error("Couldn't save that program.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-5 pb-10">
      <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
        <p className="font-display text-base font-bold">Program details</p>
        <div className="space-y-1.5">
          <Label htmlFor="pname">Name</Label>
          <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Draw &amp; Position Program" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pdesc">Description</Label>
          <Textarea id="pdesc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="sd">Starts</Label>
            <Input id="sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed">Ends</Label>
            <Input id="ed" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      </section>

      {sessions.map((s, si) => (
        <section key={s.key} className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
          <div className="flex items-center gap-2">
            <Input
              value={s.title}
              onChange={(e) => patchSession(s.key, { title: e.target.value })}
              className="font-bold"
            />
            {sessions.length > 1 ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove session"
                onClick={() => setSessions((prev) => prev.filter((x) => x.key !== s.key))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <Textarea
            rows={2}
            placeholder="Objective (optional)"
            value={s.objective}
            onChange={(e) => patchSession(s.key, { objective: e.target.value })}
          />
          <Input
            placeholder="Coach note for this session (optional)"
            value={s.note}
            onChange={(e) => patchSession(s.key, { note: e.target.value })}
          />

          <ol className="space-y-2">
            {s.activities.map((a, ai) => (
              <li key={a.key} className="rounded-xl bg-background p-3">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-tight">{a.item.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.item.category} · {a.item.kind === "drill" ? "Drill (counts toward BSI)" : "Challenge (no BSI)"}
                    </span>
                  </span>
                  <Button variant="ghost" size="icon" aria-label="Move up" onClick={() => moveActivity(s.key, ai, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Move down" onClick={() => moveActivity(s.key, ai, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove activity"
                    onClick={() =>
                      patchSession(s.key, { activities: s.activities.filter((x) => x.key !== a.key) })
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={a.repeats}
                    aria-label="Number of runs"
                    onChange={(e) =>
                      patchSession(s.key, {
                        activities: s.activities.map((x) =>
                          x.key === a.key ? { ...x, repeats: Math.max(1, Number(e.target.value) || 1) } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    placeholder="Target score"
                    inputMode="numeric"
                    value={a.target}
                    onChange={(e) =>
                      patchSession(s.key, {
                        activities: s.activities.map((x) => (x.key === a.key ? { ...x, target: e.target.value } : x)),
                      })
                    }
                  />
                </div>
                <Input
                  className="mt-2"
                  placeholder="Coach note (optional)"
                  value={a.note}
                  onChange={(e) =>
                    patchSession(s.key, {
                      activities: s.activities.map((x) => (x.key === a.key ? { ...x, note: e.target.value } : x)),
                    })
                  }
                />
              </li>
            ))}
          </ol>

          {pickerFor === s.key ? (
            <ActivityPicker items={library ?? []} onPick={(item) => addActivity(s.key, item)} onClose={() => setPickerFor(null)} />
          ) : (
            <Button variant="outline" className="h-10 w-full" onClick={() => setPickerFor(s.key)}>
              <Plus className="mr-1 h-4 w-4" /> Add drill or challenge
            </Button>
          )}
          {si === sessions.length - 1 ? (
            <Button
              variant="ghost"
              className="h-10 w-full text-sm"
              onClick={() =>
                setSessions((prev) => [
                  ...prev,
                  { key: nextKey(), title: `Session ${prev.length + 1}`, objective: "", note: "", activities: [] },
                ])
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add another session
            </Button>
          ) : null}
        </section>
      ))}

      <section className="space-y-2 rounded-2xl bg-card p-5 bt-shadow-card">
        <p className="font-display text-base font-bold">Assign to</p>
        <p className="text-xs text-muted-foreground">
          Only players who have accepted you as their coach appear here. Assign several players to share one
          program — each player's progress is their own.
        </p>
        {myPlayers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No players have accepted you as coach yet.</p>
        ) : (
          myPlayers.map((p) => {
            const on = players.includes(p.player_id);
            return (
              <button
                key={p.player_id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setPlayers(on ? players.filter((x) => x !== p.player_id) : [...players, p.player_id])
                }
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                  on ? "border-primary bg-secondary/40 font-bold" : "border-border"
                }`}
              >
                <span>{p.full_name || p.player_email}</span>
                {on ? <span className="text-xs text-primary">Assigned</span> : null}
              </button>
            );
          })
        )}
      </section>

      <div className="flex gap-2">
        <Button variant="outline" className="h-12 flex-1" onClick={() => save(false)} disabled={saving}>
          Save draft
        </Button>
        <Button className="h-12 flex-1 font-bold" onClick={() => save(true)} disabled={saving}>
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Assign & activate"}
        </Button>
      </div>
    </main>
  );
}
