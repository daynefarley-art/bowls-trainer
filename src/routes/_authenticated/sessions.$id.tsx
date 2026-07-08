import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import {
  ACTIVE_SESSION_QK,
  SESSIONS_QK,
  formatElapsed,
  formatMinutes,
  type TrainingSession,
} from "@/lib/sessions";
import { EndSessionDialog } from "@/components/bowls/EndSessionDialog";
import { Clock, Target, Trophy, StopCircle, PlusCircle, Trash2 } from "lucide-react";
import { DeleteSessionDialog } from "@/components/bowls/DeleteSessionDialog";
import { DeleteResultDialog } from "@/components/bowls/DeleteResultDialog";

export const Route = createFileRoute("/_authenticated/sessions/$id")({
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { user } = Route.useRouteContext();
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [endOpen, setEndOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingResult, setPendingResult] = useState<{ kind: "drill" | "challenge"; id: string } | null>(null);
  const [, setTick] = useState(0);

  const { data: session, isLoading } = useQuery({
    queryKey: ["training_session", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("training_sessions")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TrainingSession | null;
    },
    refetchInterval: 10_000,
  });

  const { data: drillResults } = useQuery({
    queryKey: ["session_drills", id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("id, drill_name, category, score, percentage, played_at, duration_minutes, conditions_list, green_type")
        .eq("session_id", id)
        .eq("user_id", user.id)
        .order("played_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: challengeResults } = useQuery({
    queryKey: ["session_challenges", id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenge_results")
        .select("id, challenge_name, category, score, played_at, duration_minutes, conditions_list, green_type")
        .eq("session_id", id)
        .eq("user_id", user.id)
        .order("played_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!session || session.status !== "active") return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [session]);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Training session" />
        <main className="mx-auto -mt-4 max-w-md px-5 py-10 text-center text-sm text-muted-foreground">Loading…</main>
      </>
    );
  }
  if (!session) {
    return (
      <>
        <PageHeader title="Training session" />
        <main className="mx-auto -mt-4 max-w-md px-5 py-10 text-center text-sm text-muted-foreground">
          Session not found.
          <div className="mt-4">
            <Link to="/sessions" className="font-semibold text-primary">Back to sessions</Link>
          </div>
        </main>
      </>
    );
  }

  const isActive = session.status === "active";
  const startedAt = new Date(session.session_started_at);
  const drills = drillResults ?? [];
  const challenges = challengeResults ?? [];
  const categoryEntries = Object.entries(session.category_breakdown ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        title={isActive ? "Active session" : "Session summary"}
        subtitle={startedAt.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        {/* Time + totals */}
        <div className="rounded-2xl bg-card p-5 bt-shadow-card">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {isActive ? "Elapsed" : "Total time"}
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold text-primary">
            <span suppressHydrationWarning>
              {isActive
                ? formatElapsed(session.session_started_at)
                : formatMinutes(session.total_duration_minutes)}
            </span>
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Activities" value={String(session.total_activities)} />
            <Stat label="Drills" value={String(session.drills_completed)} />
            <Stat label="Challenges" value={String(session.challenges_completed)} />
          </div>
        </div>

        {/* Action buttons */}
        {isActive ? (
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/drills"
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bt-gradient-primary text-sm font-bold text-primary-foreground bt-shadow-elevated"
            >
              <PlusCircle className="h-5 w-5" /> Add activity
            </Link>
            <button
              type="button"
              onClick={() => setEndOpen(true)}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-destructive text-sm font-bold text-destructive-foreground active:scale-[0.99] transition"
            >
              <StopCircle className="h-5 w-5" /> End session
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Link
              to="/sessions"
              className="block rounded-2xl bg-secondary px-4 py-3 text-center text-sm font-semibold text-primary"
            >
              ← All sessions
            </Link>
            {!id.startsWith("demo-") && (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-destructive/10 text-sm font-bold text-destructive active:scale-[0.99] transition"
              >
                <Trash2 className="h-4 w-4" /> Delete Session
              </button>
            )}
          </div>
        )}

        {/* Session location & conditions (entered at session start) */}
        <SessionDetailsCard session={session} />


        {/* Focus areas */}
        {categoryEntries.length > 0 && (
          <section className="rounded-2xl bg-card p-4 bt-shadow-card">
            <h2 className="font-display text-base font-bold">Focus areas</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {categoryEntries.map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary"
                >
                  {k} · {v}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Drills list */}
        {drills.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 font-display text-base font-bold">Drills</h2>
            {drills.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 bt-shadow-card">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Target className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.drill_name ?? "Drill"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.category ?? "Drill"} · {formatMinutes(r.duration_minutes)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-extrabold text-primary">{r.score}</p>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    BSI {r.percentage != null ? Number(r.percentage).toFixed(0) : "—"}
                  </p>
                </div>
                {!isActive && !id.startsWith("demo-") && (
                  <button
                    type="button"
                    onClick={() => setPendingResult({ kind: "drill", id: r.id })}
                    aria-label="Delete drill result"
                    className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Challenges list */}
        {challenges.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 font-display text-base font-bold">Challenges</h2>
            {challenges.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 bt-shadow-card">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Trophy className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.challenge_name ?? "Challenge"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.category ?? "Challenge"} · {formatMinutes(r.duration_minutes)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-extrabold text-primary">{r.score}</p>
                </div>
                {!isActive && !id.startsWith("demo-") && (
                  <button
                    type="button"
                    onClick={() => setPendingResult({ kind: "challenge", id: r.id })}
                    aria-label="Delete challenge result"
                    className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </section>
        )}

        {session.total_activities === 0 && (
          <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground bt-shadow-card">
            No activities yet — tap “Add activity” to record a drill or challenge.
          </p>
        )}

        {/* Notes */}
        {!isActive && session.notes && (
          <section className="rounded-2xl bg-card p-4 bt-shadow-card">
            <h2 className="font-display text-base font-bold">Notes</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{session.notes}</p>
          </section>
        )}

        {/* Footer with timestamps */}
        <p className="px-1 text-center text-[11px] text-muted-foreground">
          <Clock className="mr-1 inline h-3 w-3" />
          Started {startedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          {session.session_ended_at && (
            <>
              {" "}
              · Ended{" "}
              {new Date(session.session_ended_at).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </>
          )}
        </p>
      </main>

      {isActive && (
        <EndSessionDialog
          open={endOpen}
          onOpenChange={setEndOpen}
          session={session}
          onEnded={() => {
            qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(user.id) });
            qc.invalidateQueries({ queryKey: SESSIONS_QK(user.id) });
            qc.invalidateQueries({ queryKey: ["training_session", id] });
          }}
        />
      )}
      {!isActive && !id.startsWith("demo-") && (
        <DeleteSessionDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          sessionId={id}
          userId={user.id}
          email={user.email ?? ""}
        />
      )}
      {pendingResult && (
        <DeleteResultDialog
          open={!!pendingResult}
          onOpenChange={(o) => !o && setPendingResult(null)}
          kind={pendingResult.kind}
          resultId={pendingResult.id}
          email={user.email ?? ""}
          onDeleted={() => {
            setPendingResult(null);
            qc.invalidateQueries({ queryKey: ["session_drills", id] });
            qc.invalidateQueries({ queryKey: ["session_challenges", id] });
            qc.invalidateQueries({ queryKey: ["training_session", id] });
          }}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-lg font-extrabold text-primary">{value}</p>
    </div>
  );
}

function SessionDetailsCard({ session }: { session: TrainingSession }) {
  const club = (session as any).club as string | null | undefined;
  const green = (session as any).green as string | null | undefined;
  const greenType = (session as any).green_type as string | null | undefined;
  const conditions = ((session as any).conditions ?? []) as string[];
  if (!club && !green && !greenType && conditions.length === 0) return null;
  return (
    <section className="rounded-2xl bg-card p-4 bt-shadow-card">
      <h2 className="font-display text-base font-bold">Session details</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        {club && (
          <div>
            <p className="font-bold uppercase tracking-wide text-muted-foreground">Club</p>
            <p className="text-foreground">{club}</p>
          </div>
        )}
        {green && (
          <div>
            <p className="font-bold uppercase tracking-wide text-muted-foreground">Green</p>
            <p className="text-foreground">{green}</p>
          </div>
        )}
        {greenType && (
          <div>
            <p className="font-bold uppercase tracking-wide text-muted-foreground">Green type</p>
            <p className="text-foreground">{greenType}</p>
          </div>
        )}
      </div>
      {conditions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {conditions.map((c) => (
            <span key={c} className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">
              {c}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

