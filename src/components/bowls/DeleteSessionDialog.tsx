import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Trash2 } from "lucide-react";

export function DeleteSessionDialog({
  open,
  onOpenChange,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  /** @deprecated kept for callsite compatibility */
  userId?: string;
  /** @deprecated kept for callsite compatibility */
  email?: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setStep(1);
    setTyped("");
    setLoading(false);
  }

  async function confirmDelete() {
    if (typed.trim().toUpperCase() !== "DELETE") return;
    setLoading(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setLoading(false);
      return toast.error("Please sign in again before deleting history.");
    }

    const { data: ownerRow, error: ownerError } = await (supabase as any)
      .from("training_sessions")
      .select("user_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (ownerError) {
      setLoading(false);
      return toast.error(ownerError.message);
    }

    if (!ownerRow) {
      setLoading(false);
      toast.success("This session was already removed.");
      onOpenChange(false);
      reset();
      await qc.invalidateQueries();
      return navigate({ to: "/sessions" });
    }

    if (ownerRow.user_id !== userData.user.id) {
      setLoading(false);
      toast.error("That session is not on your account, so it cannot be deleted here.");
      onOpenChange(false);
      reset();
      await qc.invalidateQueries();
      return navigate({ to: "/sessions" });
    }

    const { error: drillError } = await supabase
      .from("results")
      .delete()
      .eq("session_id", sessionId)
      .eq("user_id", userData.user.id);
    if (drillError) {
      setLoading(false);
      return toast.error(drillError.message);
    }

    const { error: challengeError } = await (supabase as any)
      .from("challenge_results")
      .delete()
      .eq("session_id", sessionId)
      .eq("user_id", userData.user.id);
    if (challengeError) {
      setLoading(false);
      return toast.error(challengeError.message);
    }

    const { error } = await (supabase as any)
      .from("training_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", userData.user.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Training session deleted.");
    onOpenChange(false);
    reset();
    await qc.invalidateQueries();
    navigate({ to: "/sessions" });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Delete Training Session?
          </DialogTitle>
        </DialogHeader>
        {step === 1 && (
          <div className="space-y-3">
            <DialogDescription>
              This will permanently delete this training session from your history.
            </DialogDescription>
            <p className="text-sm text-foreground">
              This may also remove any drills, challenges or games completed during this session from your
              progress data.
            </p>
            <p className="text-sm font-semibold text-destructive">This action cannot be undone.</p>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="secondary" onClick={() => onOpenChange(false)} className="h-12 w-full rounded-xl font-bold">
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => setStep(2)} className="h-12 w-full rounded-xl font-bold">
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <DialogDescription>
              Type <span className="font-bold text-destructive">DELETE</span> to permanently remove this session.
            </DialogDescription>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Type DELETE</Label>
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="h-12 rounded-xl"
                autoFocus
                autoCapitalize="characters"
                placeholder="DELETE"
              />
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="secondary" onClick={() => setStep(1)} className="h-12 w-full rounded-xl font-bold">
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={loading || typed.trim().toUpperCase() !== "DELETE"}
                className="h-12 w-full rounded-xl font-bold"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {loading ? "Deleting…" : "Confirm and Delete"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
