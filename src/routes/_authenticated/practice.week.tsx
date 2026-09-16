import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/bowls/PageHeader";
import { WeeklyGoalSettings } from "@/components/bowls/WeeklyGoalSettings";
import { formatHM } from "@/lib/bowls";
import {
  GOALS_QK,
  GOAL_ACTIVITIES_QK,
  activitiesInWeek,
  addWeeks,
  fetchGoalActivities,
  fetchGoals,
  formatGoal,
  formatWeekRange,
  goalForWeek,
  groupActivitiesByDay,
  startOfLocalWeek,
  summariseWeek,
} from "@/lib/training-goals";

export const Route = createFileRoute("/_authenticated/practice/week")({
  component: WeekDetailPage,
});

const WEEKS_BACK = 12;

function WeekDetailPage() {
  const { user } = Route.useRouteContext();
  const [offset, setOffset] = useState(0); // 0 = this week, -1 = last week

  const goalsQ = useQuery({ queryKey: GOALS_QK(user.id), queryFn: () => fetchGoals(user.id) });
  const actsQ = useQuery({
    queryKey: GOAL_ACTIVITIES_QK(user.id),
    queryFn: () => fetchGoalActivities(user.id, WEEKS_BACK),
  });

  const goals = goalsQ.data ?? [];
  const activities = actsQ.data ?? [];
  const isLoading = goalsQ.isLoading || actsQ.isLoading;

  const { week, days } = useMemo(() => {
    const now = new Date();
    const ws = addWeeks(startOfLocalWeek(now), offset);
    return {
      week: summariseWeek(activities, ws, goalForWeek(goals, ws), now),
      days: groupActivitiesByDay(activitiesInWeek(activities, ws)),
    };
  }, [activities, goals, offset]);

  const pct = week.percent ?? 0;

  return (
    <>
      <PageHeader title="Weekly Practice" subtitle="What you've actually practised" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-24">
        {/* Week navigator */}
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-2 bt-shadow-card">
          <button
            type="button"
            onClick={() => setOffset((o) => Math.max(-(WEEKS_BACK - 1), o - 1))}
            disabled={offset <= -(WEEKS_BACK - 1)}
            className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <div className="min-w-0 text-center">
            <p className="text-sm font-extrabold">{week.label}</p>
            <p className="text-[11px] text-muted-foreground">{formatWeekRange(week.weekStart)}</p>
          </div>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
            className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Summary */}
        <section className="rounded-2xl bg-card p-5 bt-shadow-card">
          <p className="font-display text-3xl font-extrabold">{formatHM(week.minutes)}</p>
          <p className="text-sm text-muted-foreground">
            practised · {week.trainingDays} training day{week.trainingDays === 1 ? "" : "s"}
          </p>

          {week.goalMinutes ? (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
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
              <p className="mt-2 text-xs text-muted-foreground">
                Goal {formatGoal(week.goalMinutes)} · {pct}%
                {week.metGoal ? " — goal met" : ""}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No goal applied this week.</p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-secondary/50 p-3">
              <p className="font-display text-xl font-extrabold">{week.drills}</p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Drills
              </p>
            </div>
            <div className="rounded-xl bg-secondary/50 p-3">
              <p className="font-display text-xl font-extrabold">{week.challenges}</p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Challenges
              </p>
            </div>
          </div>
        </section>

        {/* Category breakdown */}
        <section className="rounded-2xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-lg font-bold">Practice breakdown</h2>
          {week.categories.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing recorded this week.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {week.categories.map((c) => (
                <div key={c.key} className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{c.label}</span>
                  <span className="text-muted-foreground">
                    {formatHM(c.minutes)} · {c.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Activity list */}
        <section className="rounded-2xl bg-card p-5 bt-shadow-card">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">Activity</h2>
          </div>
          {isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : days.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No completed drills or challenges in this week.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {days.map((d) => (
                <div key={d.label}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {d.label}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {d.items.map((it) => (
                      <li
                        key={it.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{it.title}</p>
                          <p className="text-[11px] text-muted-foreground">{it.categoryLabel}</p>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-muted-foreground">
                          {formatHM(it.minutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Goal management lives here, not in Profile */}
        <WeeklyGoalSettings userId={user.id} />
      </main>
    </>
  );
}

