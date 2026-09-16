import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { History, Trash2 } from "lucide-react";
import { discardActivity, type PracticeActivity } from "@/lib/practice";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: PracticeActivity;
  /** Noun used in the wording — "drill" (default) or "session". */
  noun?: "drill" | "session";
  onBeforeDiscard?: () => Promise<void> | void;
  hasCurrentStats?: boolean;
  onDiscarded?: () => void;
};

/**
 * SINGLE-DECISION end modal for an unfinished practice.
 *
 * Old flow: "Discard?" → "Keep bowls in statistics?" (two popups, on top of
 * whichever sheet opened it). New flow: one modal, one tap, no follow-up
 * confirmation. Data policy is unchanged — Save to History keeps the results
 * exactly as "Keep in statistics" did, Delete removes them exactly as
 * "Remove from history" did.
 */
export function DiscardPracticeDialog({
  open,
  onOpenChange,
  activity,
  noun = "drill",
  onBeforeDiscard,
  onDiscarded,
}: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const Noun = noun === "session" ? "Session" : "Drill";

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
          End this {noun}?
        </DialogTitle>
        <DialogDescription className="text-center text-sm text-muted-foreground">
          What would you like to do with your progress?
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => end(true)}
            disabled={busy}
            className="rounded-xl bg-primary px-4 py-3 text-left text-sm font-bold text-primary-foreground active:scale-[0.99] disabled:opacity-60"
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
            onClick={() => end(false)}
            disabled={busy}
            className="rounded-xl bg-destructive px-4 py-3 text-left text-sm font-bold text-destructive-foreground active:scale-[0.99] disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Delete {Noun}
            </span>
            <span className="mt-0.5 block text-[11px] font-semibold opacity-80">
              End the {noun} and permanently delete these results.
            </span>
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="rounded-xl bg-secondary px-4 py-3 text-sm font-bold active:scale-[0.99] disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
