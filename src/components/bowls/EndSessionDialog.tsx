import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { endSession, discardSession, formatElapsed, type TrainingSession } from "@/lib/sessions";

/**
 * SINGLE-DECISION session end modal.
 *
 * Old flow: End Session → "Discard Session" → second "Discard this session?"
 * confirmation. New flow: one modal with Save to History / Delete Session /
 * Cancel. No second popup for either outcome. The data behaviour behind each
 * button is unchanged (`endSession` / `discardSession`).
 */
export function EndSessionDialog({
  open,
  onOpenChange,
  session,
  onEnded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: TrainingSession;
  onEnded: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSaveToHistory() {
    setBusy(true);
    try {
      const ended = await endSession(session.id, notes || null);
      onEnded();
      onOpenChange(false);
      navigate({ to: "/sessions/$id", params: { id: ended.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not end session");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await discardSession(session.id);
      onEnded();
      onOpenChange(false);
      toast.success("Session deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End this session?</AlertDialogTitle>
          <AlertDialogDescription>
            What would you like to do with your progress?{" "}
            <span suppressHydrationWarning>{formatElapsed(session.session_started_at)}</span>
            {" · "}
            {session.total_activities} {session.total_activities === 1 ? "activity" : "activities"}{" "}
            ({session.drills_completed} drill{session.drills_completed === 1 ? "" : "s"},{" "}
            {session.challenges_completed} challenge{session.challenges_completed === 1 ? "" : "s"})
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Session notes (optional)
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it go? Focus areas, what worked, what to try next…"
            rows={3}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            onClick={handleSaveToHistory}
            disabled={busy}
            className="h-auto w-full flex-col items-start py-3 text-left"
          >
            <span className="text-sm font-bold">Save to History</span>
            <span className="text-[11px] font-semibold opacity-80">
              End the session and keep the results.
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-11 w-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={busy}
            className="h-auto w-full flex-col items-start py-3 text-left"
          >
            <span className="text-sm font-bold">Delete Session</span>
            <span className="text-[11px] font-semibold opacity-80">
              End the session and permanently delete these results.
            </span>
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

