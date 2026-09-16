import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight } from "lucide-react";
import { useWeeklyGoal } from "@/hooks/use-weekly-goal";
import { formatGoal } from "@/lib/training-goals";
import { formatHM } from "@/lib/bowls";

/**
 * Compact "This week" snapshot. Always shows real active practice time —
 * a goal is optional and simply adds target/percentage information.
 */
export function ThisWeekCard({ userId }: { userId: string }) {
  const { thisWeek, goalMinutes, hasGoal } = useWeeklyGoal(userId, 1);
  const pct = thisWeek.percent ?? 0;

  return (
    <Link
      to="/practice/week"
      className="block rounded-2xl bg-card p-4 bt-shadow-card transition active:scale-[0.99]"
    >
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          This week
        </h2>
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
      </div>

      <p className="mt-1 font-display text-2xl font-extrabold">
        {formatHM(thisWeek.minutes)}
        <span className="ml-1.5 text-sm font-bold text-muted-foreground">practised</span>
      </p>

      {hasGoal && goalMinutes ? (
        <>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatGoal(goalMinutes)} goal · {pct}%
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, pct)}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Weekly practice goal progress"
            />
          </div>
        </>
      ) : null}

      <p className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {thisWeek.trainingDays} training day{thisWeek.trainingDays === 1 ? "" : "s"}
        </span>
        <span className="font-bold text-primary">
          {hasGoal ? "View week" : "Set weekly goal"}
        </span>
      </p>
    </Link>
  );
}
