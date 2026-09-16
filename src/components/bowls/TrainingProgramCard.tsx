import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ClipboardList, GraduationCap, Target } from "lucide-react";
import {
  MY_PROGRAMS_QK,
  countdownLabel,
  getProgramDetail,
  listMyPrograms,
  programTypeLabel,
} from "@/lib/programs";

/** One compact Dashboard entry for the canonical Training Plans area. */
export function TrainingProgramCard({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: [...MY_PROGRAMS_QK(userId), "dashboard"],
    queryFn: async () => {
      const rows = (await listMyPrograms(userId)).filter((r) => r.program.status === "active");
      if (rows.length === 0) return [];
      const detailed = await Promise.all(
        rows.map(async (r) => ({ ...r, detail: await getProgramDetail(r.program.id, userId) })),
      );
      return detailed.sort((a, b) => {
        const aStarted = (a.detail?.completedSessions ?? 0) > 0 || a.detail?.sessions.some((s) => s.status === "in_progress");
        const bStarted = (b.detail?.completedSessions ?? 0) > 0 || b.detail?.sessions.some((s) => s.status === "in_progress");
        if (aStarted !== bStarted) return aStarted ? -1 : 1;
        const aEnd = a.program.end_date ? new Date(`${a.program.end_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        const bEnd = b.program.end_date ? new Date(`${b.program.end_date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        return aEnd - bEnd;
      });
    },
  });

  const current = data?.[0];

  if (!current) {
    return (
      <Link
        to="/training"
        className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 bt-shadow-card active:opacity-90"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          <ClipboardList className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Training Plans</span>
          <span className="block text-sm font-bold">Tournament &amp; coach programs</span>
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
            Prepare for an event or follow a program from your coach.
          </span>
          <span className="mt-2 block text-xs font-bold text-primary">View training plans</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </Link>
    );
  }

  const next = current.detail?.nextSession;
  const isTournament = current.program.program_type === "TOURNAMENT_PREP";
  const countdown = isTournament ? countdownLabel(current.program.end_date) : null;
  const complete = current.detail?.completedSessions ?? 0;
  const total = current.detail?.totalSessions ?? 0;
  const title = current.ownerName ? `${current.ownerName} — ${current.program.name}` : current.program.name;
  const multiple = (data?.length ?? 0) > 1;

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4 bt-shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          {isTournament ? <Target className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Your training</p>
          <h2 className="font-display text-base font-bold leading-tight">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isTournament && countdown && countdown !== "finished"
              ? `Tournament ${countdown}`
              : total > 0
                ? `${complete} of ${total} sessions complete`
                : programTypeLabel(current.program.program_type)}
          </p>
          <p className="mt-2 text-xs font-semibold">
            {next ? `Next: Session ${next.sequence} — ${next.title}` : "All sessions complete"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 border-t border-border/60 pt-3">
        <Link
          to="/training/$programId"
          params={{ programId: current.program.id }}
          className="flex h-10 flex-1 items-center justify-center rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground active:opacity-90"
        >
          Continue training
        </Link>
        <Link to="/training" className="shrink-0 text-xs font-bold text-primary">
          {multiple ? `All ${data?.length} plans` : "All plans"}
        </Link>
      </div>
    </section>
  );
}
