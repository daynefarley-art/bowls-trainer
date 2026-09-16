import { useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { discardActivity, pauseActivity, type PracticeActivity } from "@/lib/practice";

type Props = {
  /** When true, block in-app navigation away and beforeunload. */
  when: boolean | (() => boolean);
  activity: PracticeActivity | null;
  onBeforeSave?: () => Promise<void> | void;
  onBeforeDiscard?: () => Promise<void> | void;
  hasCurrentStats?: boolean;
  /** Called when the user decides to leave so the caller can suppress its own re-block. */
  onLeaving?: () => void;
};

/**
 * Shared leave-guard. ONE modal, one decision:
 *   - Save to History  (end the drill, keep the results)
 *   - Save for Later   (pause so it can be resumed)
 *   - Cancel           (stay in the drill)
 *   - Delete Drill     (end the drill, delete the results)
 *
 * The old chain (guard → "Discard?" → "keep stats?") is gone. Underlying data
 * behaviour is unchanged: discardActivity(id, keepResults).
 */
export function LeavePracticeGuard({ when, activity, onBeforeSave, onBeforeDiscard, onLeaving }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const blocker = useBlocker({
    shouldBlockFn: () => (typeof when === "function" ? when() : when),
    enableBeforeUnload: typeof when === "function" ? when() : when,
    withResolver: true,
  });

  const proceed = () => {
    onLeaving?.();
    blocker.proceed?.();
  };

  const handleSaveForLater = async () => {
    if (!activity) return proceed();
    setBusy(true);
    try {
      await onBeforeSave?.();
      if (activity.status === "active") {
        console.log("[practice] leave-guard: pausing", activity.id);
        await pauseActivity(activity.id);
        qc.invalidateQueries({ queryKey: ["practice_activities"] });
      }
    } finally {
      setBusy(false);
      proceed();
    }
  };

  const end = async (keepResults: boolean) => {
    if (!activity) return proceed();
    setBusy(true);
    try {
      await onBeforeDiscard?.();
      await discardActivity(activity.id, keepResults);
      qc.invalidateQueries({ queryKey: ["practice_activities"] });
    } finally {
      setBusy(false);
      proceed();
    }
  };

  return (
    <AlertDialog open={blocker.status === "blocked"}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End this drill?</AlertDialogTitle>
          <AlertDialogDescription>
            What would you like to do with your progress?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => end(true)}
            className="rounded-xl bg-primary px-4 py-3 text-left text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            Save to History
            <span className="mt-0.5 block text-[11px] font-semibold opacity-80">
              End the drill and keep the results.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleSaveForLater}
            className="rounded-xl bg-secondary px-4 py-3 text-sm font-bold disabled:opacity-60"
          >
            Save for Later
          </button>
          <AlertDialogCancel disabled={busy} onClick={() => blocker.reset?.()}>
            Cancel
          </AlertDialogCancel>
          {activity && (
            <button
              type="button"
              disabled={busy}
              onClick={() => end(false)}
              className="rounded-xl bg-destructive px-4 py-3 text-left text-sm font-bold text-destructive-foreground disabled:opacity-60"
            >
              Delete Drill
              <span className="mt-0.5 block text-[11px] font-semibold opacity-80">
                End the drill and permanently delete these results.
              </span>
            </button>
          )}
        </div>
        <AlertDialogFooter />
      </AlertDialogContent>
    </AlertDialog>
  );
}
