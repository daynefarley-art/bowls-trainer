import { useState } from "react";
import { Pause } from "lucide-react";
import { PausePracticeSheet } from "./PausePracticeSheet";
import type { PracticeActivity } from "@/lib/practice";

type Props = {
  activity: PracticeActivity | null;
  onSaved?: () => void;
  onDiscarded?: () => void;
  onBeforePause?: () => Promise<void> | void;
  onBeforeDiscard?: () => Promise<void> | void;
  hasCurrentStats?: boolean;
  className?: string;
  label?: string;
};

/** Small button that opens the Pause / Save / Discard sheet. */
export function PauseButton({ activity, onSaved, onDiscarded, onBeforePause, onBeforeDiscard, hasCurrentStats, className, label = "Pause" }: Props) {
  const [open, setOpen] = useState(false);
  if (!activity) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-bold active:scale-[0.99] transition"
        }
      >
        <Pause className="h-4 w-4" /> {label}
      </button>
      <PausePracticeSheet
        open={open}
        onOpenChange={setOpen}
        activity={activity}
        onBeforePause={onBeforePause}
        onBeforeDiscard={onBeforeDiscard}
        hasCurrentStats={hasCurrentStats}
        onSaved={onSaved}
        onDiscarded={onDiscarded}
      />
    </>
  );
}
