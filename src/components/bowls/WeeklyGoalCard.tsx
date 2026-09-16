import { Link } from "@tanstack/react-router";
import { Target, ChevronRight } from "lucide-react";
import { useWeeklyGoal } from "@/hooks/use-weekly-goal";
import { formatGoal } from "@/lib/training-goals";
import { formatHM } from "@/lib/bowls";

/**
 * Compact dashboard progress for the optional weekly training goal.
 * Renders nothing until the player has set a goal (no-goal is the default).
 */
export function WeeklyGoalCard({ userId }: { userId: string }) {
  const { hasGoal, goalMinutes, thisWeek } = useWeeklyGoal(userId, 1);
  if (!hasGoal || !goalMinutes) return null;

  const pct = thisWeek.percent ?? 0;
  const bar = Math.min(100, pct);
  const remaining = Math.max(0, goalMinutes - thisWeek.minutes);

  return (
    <Link
      to="/practice/week"
      className="block rounded-2xl bg-card p-4 bt-shadow-card active:scale-[0.99] transition"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          <Target className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Weekly Goal
          </p>
          <p className="mt-0.5 font-display text-xl font-extrabold">
            {formatHM(thisWeek.minutes)}
            <span className="ml-1 text-sm font-bold text-muted-foreground">
              / {formatGoal(goalMinutes)}
            </span>
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
            thisWeek.metGoal ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
          }`}
        >
          {pct}%
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${bar}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Weekly practice goal progress"
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {thisWeek.metGoal
          ? `Goal smashed — ${pct}% of your target this week.`
          : `${formatHM(remaining)} to go · ${thisWeek.trainingDays} training day${thisWeek.trainingDays === 1 ? "" : "s"}`}
      </p>
    </Link>
  );
}
