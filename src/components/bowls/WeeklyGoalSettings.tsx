import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWeeklyGoal } from "@/hooks/use-weekly-goal";
import { GOALS_QK, GOAL_PRESETS, formatGoal, setWeeklyGoal } from "@/lib/training-goals";

/**
 * Optional weekly training goal. Default is NO goal — nothing is nagged,
 * nothing appears on the dashboard until the player opts in.
 */
export function WeeklyGoalSettings({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { goalMinutes, hasGoal } = useWeeklyGoal(userId, 1);
  const [hours, setHours] = useState("0");
  const [mins, setMins] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const m = goalMinutes ?? 0;
    setHours(String(Math.floor(m / 60)));
    setMins(String(m % 60));
  }, [goalMinutes]);

  const pending = Number(hours || 0) * 60 + Number(mins || 0);

  const save = async (minutes: number | null) => {
    setBusy(true);
    try {
      await setWeeklyGoal(userId, minutes);
      qc.invalidateQueries({ queryKey: GOALS_QK(userId) });
      toast.success(minutes ? `Weekly goal set to ${formatGoal(minutes)}` : "Weekly goal removed");
    } catch {
      toast.error("Couldn't save your goal. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-bold">Weekly Practice Goal</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Optional. We count the time you actually spend practising drills and challenges — not
        travel, breaks or time with the app in the background.
      </p>

      <div className="flex flex-wrap gap-2">
        {GOAL_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setHours(String(Math.floor(p / 60)));
              setMins(String(p % 60));
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              pending === p ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
            }`}
          >
            {formatGoal(p)}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-3">
        <label className="flex-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Hours
          </span>
          <input
            type="number"
            min={0}
            max={40}
            inputMode="numeric"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold"
          />
        </label>
        <label className="flex-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Minutes
          </span>
          <input
            type="number"
            min={0}
            max={59}
            step={5}
            inputMode="numeric"
            value={mins}
            onChange={(e) => setMins(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold"
          />
        </label>
      </div>

      <div className="flex gap-2">
        <Button disabled={busy || pending <= 0} onClick={() => save(pending)} className="flex-1">
          {hasGoal ? "Update goal" : "Set goal"}
        </Button>
        {hasGoal && (
          <Button variant="secondary" disabled={busy} onClick={() => save(null)}>
            Remove
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {hasGoal
          ? `Current goal: ${formatGoal(goalMinutes!)} per week (Monday to Sunday).`
          : "No goal set — your practice time is still tracked."}
      </p>
    </section>
  );
}
