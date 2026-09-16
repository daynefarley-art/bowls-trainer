import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Play, Save, History, Trash2 } from "lucide-react";
import { discardActivity, pauseActivity, resumeActivity, type PracticeActivity } from "@/lib/practice";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: PracticeActivity;
  title?: string;
  description?: string;
  /** Noun used in the destructive action — "drill" (default) or "session". */
  noun?: "drill" | "session";
  onBeforePause?: () => Promise<void> | void;
  onBeforeDiscard?: () => Promise<void> | void;
  hasCurrentStats?: boolean;
  /** Called after Save for Later — usually navigate home / to saved list. */
  onSaved?: () => void;
  /** Called after the activity ended (saved to history or deleted). */
  onDiscarded?: () => void;
};

/**
 * SINGLE-DECISION end modal.
 *
 * Replaces the old three-popup chain (pause sheet → "Discard?" → "keep stats
 * or remove?"). Every outcome is one tap here; there is no follow-up
 * confirmation. The underlying data policy is unchanged: "Save to History"
 * ends the activity keeping its results (discardActivity(id, true)) and
 * "Delete" ends it removing them (discardActivity(id, false)).
 */
export function PausePracticeSheet({
  open,
  onOpenChange,
  activity,
  title = "End this drill?",
  description = "What would you like to do with your progress?",
  noun = "drill",
  onBeforePause,
  onBeforeDiscard,
  onSaved,
  onDiscarded,
}: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const Noun = noun === "session" ? "Session" : "Drill";

  const handleSaveForLater = async () => {
    setBusy(true);
    try {
      await onBeforePause?.();
      await pauseActivity(activity.id);
      qc.invalidateQueries({ queryKey: ["practice_activities"] });
      onOpenChange(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  const handleContinue = async () => {
    setBusy(true);
    try {
      if (activity.status !== "active") await resumeActivity(activity.id);
      qc.invalidateQueries({ queryKey: ["practice_activities"] });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const end = async (keepResults: boolean) => {
    setBusy(true);
    try {
      await onBeforeDiscard?.();
      await discardActivity(activity.id, keepResults);
      qc.invalidateQueries({ queryKey: ["practice_activities"] });
      onOpenChange(false);
      onDiscarded?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogTitle className="text-center font-display text-lg font-extrabold">
          {title}
        </DialogTitle>
        <DialogDescription className="text-center text-sm text-muted-foreground">
          {description}
        </DialogDescription>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => end(true)}
            disabled={busy}
            className="rounded-xl bg-primary px-4 py-3 text-left text-sm font-bold text-primary-foreground active:scale-[0.99] transition disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <History className="h-4 w-4" /> Save to History
            </span>
            <span className="mt-0.5 block text-[11px] font-semibold opacity-80">
              End the {noun} and keep the results.
            </span>
          </button>

          <button
            type="button"
            onClick={handleSaveForLater}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-bold active:scale-[0.99] transition disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> Save for Later
          </button>

          <button
            type="button"
            onClick={handleContinue}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-bold active:scale-[0.99] transition disabled:opacity-60"
          >
            <Play className="h-4 w-4" /> Cancel — keep practising
          </button>

          <button
            type="button"
            onClick={() => end(false)}
            disabled={busy}
            className="rounded-xl bg-destructive px-4 py-3 text-left text-sm font-bold text-destructive-foreground active:scale-[0.99] transition disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Delete {Noun}
            </span>
            <span className="mt-0.5 block text-[11px] font-semibold opacity-80">
              End the {noun} and permanently delete these results.
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
