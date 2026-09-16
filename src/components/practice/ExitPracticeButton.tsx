import { useState } from "react";
import { X } from "lucide-react";
import { PausePracticeSheet } from "./PausePracticeSheet";
import type { PracticeActivity } from "@/lib/practice";

type Props = {
  activity: PracticeActivity | null;
  onBeforePause?: () => Promise<void> | void;
  onBeforeDiscard?: () => Promise<void> | void;
  hasCurrentStats?: boolean;
  onSaved?: () => void;
  onDiscarded?: () => void;
};

export function ExitPracticeButton({
  activity,
  onBeforePause,
  onBeforeDiscard,
  hasCurrentStats,
  onSaved,
  onDiscarded,
}: Props) {
  const [open, setOpen] = useState(false);
  if (!activity) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Exit drill"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 active:scale-[0.98] transition"
      >
        <X className="h-5 w-5" />
      </button>
      <PausePracticeSheet
        open={open}
        onOpenChange={setOpen}
        activity={activity}
        title="End this drill?"
        description="What would you like to do with your progress?"

        onBeforePause={onBeforePause}
        onBeforeDiscard={onBeforeDiscard}
        hasCurrentStats={hasCurrentStats}
        onSaved={onSaved}
        onDiscarded={onDiscarded}
      />
    </>
  );
}