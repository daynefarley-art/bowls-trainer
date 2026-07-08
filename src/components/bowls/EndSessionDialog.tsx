import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { endSession, discardSession, formatElapsed, type TrainingSession } from "@/lib/sessions";

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
  const [discardOpen, setDiscardOpen] = useState(false);
  const navigate = useNavigate();

  async function handleEnd() {
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

  async function handleDiscard() {
    setBusy(true);
    try {
      await discardSession(session.id);
      onEnded();
      onOpenChange(false);
      setDiscardOpen(false);
      toast.success("Session discarded");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not discard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End training session</AlertDialogTitle>
            <AlertDialogDescription>
              <span suppressHydrationWarning>{formatElapsed(session.session_started_at)}</span>{" "}
              · {session.total_activities} {session.total_activities === 1 ? "activity" : "activities"}{" "}
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
              rows={4}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="h-11 w-full sm:flex-1"
            >
              Keep Training
            </Button>
            <Button
              type="button"
              onClick={handleEnd}
              disabled={busy}
              className="h-11 w-full sm:flex-1"
            >
              End Session
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDiscardOpen(true)}
              disabled={busy}
              className="h-11 w-full sm:flex-1"
            >
              Discard Session
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this training session?</AlertDialogTitle>
            <AlertDialogDescription>
              All unsaved session activity will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={() => setDiscardOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={handleDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
