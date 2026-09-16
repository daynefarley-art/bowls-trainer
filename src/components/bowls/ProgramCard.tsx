import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, GraduationCap, Target } from "lucide-react";
import {
  countdownLabel,
  programTypeLabel,
  type ProgramStatus,
  type ProgramType,
} from "@/lib/programs";

export type ProgramCardProps = {
  programId: string;
  name: string;
  programType: ProgramType;
  status: ProgramStatus;
  endDate: string | null;
  ownerName?: string | null;
  position?: string | null;
  completedSessions?: number;
  totalSessions?: number;
  ctaLabel?: string;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

/** Compact player-facing program summary. Uses theme tokens only. */
export function ProgramCard(props: ProgramCardProps) {
  const isTournament = props.programType === "TOURNAMENT_PREP";
  const countdown = isTournament ? countdownLabel(props.endDate) : null;
  const dateText = formatDate(props.endDate);
  const total = props.totalSessions ?? 0;

  return (
    <Link
      to="/training/$programId"
      params={{ programId: props.programId }}
      className="block rounded-2xl bg-card p-4 bt-shadow-card active:opacity-90"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bt-gradient-primary text-primary-foreground">
          {isTournament ? <Target className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
            {programTypeLabel(props.programType)}
            {props.status === "completed" ? " · Finished" : props.status === "archived" ? " · Archived" : ""}
          </p>
          <h3 className="truncate font-display text-base font-bold leading-tight">{props.name}</h3>
          {props.ownerName ? (
            <p className="text-xs text-muted-foreground">Coach: {props.ownerName}</p>
          ) : null}
          {dateText ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {isTournament ? `Tournament: ${dateText}` : `Ends: ${dateText}`}
              {countdown && props.status === "active" ? ` · ${countdown}` : ""}
            </p>
          ) : null}
          {props.position ? (
            <p className="text-xs text-muted-foreground">Role: {props.position}</p>
          ) : null}
          {total > 0 ? (
            <p className="mt-1 text-xs font-semibold">
              {props.completedSessions ?? 0} of {total} sessions complete
            </p>
          ) : null}
        </div>
        <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-muted-foreground" />
      </div>
      <span className="mt-3 flex h-10 items-center justify-center rounded-xl bt-gradient-primary text-sm font-bold text-primary-foreground">
        {props.ctaLabel ?? (props.status === "active" ? "Continue training" : "View program")}
      </span>
    </Link>
  );
}
