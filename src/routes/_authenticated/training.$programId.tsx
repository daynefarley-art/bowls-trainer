import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, Loader2, Play, Target } from "lucide-react";
import {
  MY_PROGRAMS_QK,
  PROGRAM_DETAIL_QK,
  activityLaunchTarget,
  countdownLabel,
  getProgramDetail,
  launchActivity,
  phaseLabel,
  programTypeLabel,
  setProgramStatus,
  syncProgramProgress,
  type ResolvedActivity,
  type ResolvedSession,
} from "@/lib/programs";

export const Route = createFileRoute("/_authenticated/training/$programId")({
  head: () => ({
    meta: [
      { title: "Your Training Program — Bowls Trainer" },
      {
        name: "description",
        content: "Work through your training sessions one activity at a time, recorded through the normal Bowls Trainer drills and challenges.",
      },
      { property: "og:title", content: "Your Training Program — Bowls Trainer" },
      { property: "og:description", content: "Ordered training sessions built from real drills and challenges." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgramDetailPage,
});

function ProgramDetailPage() {
  const { programId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [openSession, setOpenSession] = useState<string | null>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: PROGRAM_DETAIL_QK(programId, user.id),
    queryFn: () => getProgramDetail(programId, user.id),
  });

  // Mirror completions from canonical results. Never writes results or BSI.
  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    (async () => {
      const changed = await syncProgramProgress(detail, user.id);
      if (changed && !cancelled) {
        qc.invalidateQueries({ queryKey: PROGRAM_DETAIL_QK(programId, user.id) });
        qc.invalidateQueries({ queryKey: MY_PROGRAMS_QK(user.id) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail, programId, user.id, qc]);

  useEffect(() => {
    if (detail?.nextSession && openSession === null) setOpenSession(detail.nextSession.id);
  }, [detail, openSession]);

  async function start(activity: ResolvedActivity) {
    const target = activityLaunchTarget(activity);
    if (!target) {
      toast.error("That activity is no longer in the library.");
      return;
    }
    await launchActivity(activity, user.id);
    navigate(target as never);
  }

  async function finish() {
    await setProgramStatus(programId, "completed");
    qc.invalidateQueries({ queryKey: PROGRAM_DETAIL_QK(programId, user.id) });
    qc.invalidateQueries({ queryKey: MY_PROGRAMS_QK(user.id) });
    toast.success("Program marked finished. Your results and history are kept.");
  }

  if (isLoading) {
    return (
      <main className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center text-muted-foreground">
        <p>This program is no longer available.</p>
        <Link to="/training" className="mt-4 inline-block text-sm font-bold text-primary">
          Back to Training Plans
        </Link>
      </main>
    );
  }

  const { program } = detail;
  const isTournament = program.program_type === "TOURNAMENT_PREP";
  const countdown = isTournament ? countdownLabel(program.end_date) : null;
  const past = countdown === "finished";

  return (
    <>
      <PageHeader
        title={program.name}
        subtitle={`${programTypeLabel(program.program_type)} · ${detail.completedSessions} of ${detail.totalSessions} sessions complete`}
      />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-10">
        <section className="rounded-2xl bg-card p-5 bt-shadow-card">
          {program.description ? (
            <p className="text-sm text-muted-foreground">{program.description}</p>
          ) : null}
          {isTournament && program.end_date ? (
            <p className="mt-2 text-sm font-semibold">
              {past ? "Tournament date has passed" : `Tournament ${countdown}`}
            </p>
          ) : null}
          {program.settings?.['position'] ? (
            <p className="text-sm text-muted-foreground">
              Role: {String(program.settings['position'])}
            </p>
          ) : null}
          {program.notes ? <p className="mt-2 text-sm">{program.notes}</p> : null}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary/60">
            <div
              className="h-full bt-gradient-primary"
              style={{
                width: `${detail.totalActivities ? Math.round((detail.completedActivities / detail.totalActivities) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {detail.completedActivities} of {detail.totalActivities} activities complete · all practice
            counts once in your normal totals
          </p>
          {past && program.status === "active" ? (
            <Button variant="outline" className="mt-4 h-10 w-full" onClick={finish}>
              Mark this program finished
            </Button>
          ) : null}
        </section>

        {detail.sessions.map((session) => (
          <SessionBlock
            key={session.id}
            session={session}
            open={openSession === session.id}
            onToggle={() => setOpenSession(openSession === session.id ? null : session.id)}
            onStart={start}
            readOnly={program.status === "completed" || program.status === "archived"}
          />
        ))}

        {detail.sessions.length === 0 ? (
          <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground bt-shadow-card">
            No sessions have been added to this program yet.
          </p>
        ) : null}
      </main>
    </>
  );
}

function SessionBlock({
  session,
  open,
  onToggle,
  onStart,
  readOnly,
}: {
  session: ResolvedSession;
  open: boolean;
  onToggle: () => void;
  onStart: (a: ResolvedActivity) => void;
  readOnly: boolean;
}) {
  const next = session.activities.find((a) => a.status !== "completed") ?? null;
  const phase = phaseLabel(session.phase);
  return (
    <section className="overflow-hidden rounded-2xl bg-card bt-shadow-card">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
            session.status === "completed"
              ? "bt-gradient-primary text-primary-foreground"
              : "bg-secondary/60 text-foreground"
          }`}
        >
          {session.status === "completed" ? <Check className="h-4 w-4" /> : session.sequence}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-primary">
            Session {session.sequence}
            {session.week_number ? ` · Week ${session.week_number}` : ""}
            {phase ? ` · ${phase}` : ""}
          </span>
          <span className="block truncate font-display text-base font-bold">{session.title}</span>
          <span className="block text-xs text-muted-foreground">
            {session.completedCount} of {session.activities.length} activities complete
          </span>
        </span>
        <ChevronRight className={`h-5 w-5 shrink-0 text-muted-foreground transition ${open ? "rotate-90" : ""}`} />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border/60 p-4">
          {session.objective ? (
            <p className="text-sm text-muted-foreground">{session.objective}</p>
          ) : null}
          {session.coach_note ? (
            <p className="rounded-xl bg-secondary/40 p-3 text-sm">
              <span className="font-bold">Coach note: </span>
              {session.coach_note}
            </p>
          ) : null}
          <ol className="space-y-2">
            {session.activities.map((a) => (
              <li key={a.id} className="flex items-start gap-3 rounded-xl bg-background p-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary/60 text-xs font-bold">
                  {a.sequence}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-tight">{a.ref?.name ?? "Removed activity"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {a.ref?.category ?? (a.kind === "challenge" ? "Challenge" : "Drill")}
                    {a.kind === "challenge" ? " · Challenge (no BSI)" : ""}
                    {a.required_completions > 1 ? ` · ${a.required_completions} runs` : ""}
                  </span>
                  {a.target_score != null ? (
                    <span className="block text-xs text-muted-foreground">Target: {a.target_score}</span>
                  ) : null}
                  {a.focus ? <span className="block text-xs">Focus: {a.focus}</span> : null}
                  {a.coach_note ? (
                    <span className="block text-xs">Coach: {a.coach_note}</span>
                  ) : null}
                  <span className="mt-1 block text-xs font-bold">
                    {a.status === "completed"
                      ? `Completed${a.resultBsi != null ? ` — BSI ${Math.round(a.resultBsi)}` : a.resultScore != null ? ` — score ${a.resultScore}` : ""}`
                      : a.status === "in_progress"
                        ? `In progress${a.required_completions > 1 ? ` — ${a.progress?.completions ?? 0}/${a.required_completions}` : ""}`
                        : "Not started"}
                  </span>
                </span>
                {a.status === "completed" || readOnly ? null : (
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onStart(a)}>
                    <Play className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ol>
          {next && !readOnly ? (
            <Button className="h-12 w-full text-base font-bold" onClick={() => onStart(next)}>
              <Target className="mr-2 h-5 w-5" />
              {session.status === "not_started" ? "Start session" : "Start next activity"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
