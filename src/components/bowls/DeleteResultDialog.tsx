import { useState } from "react";
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

type Kind = "drill" | "challenge";

const COPY: Record<
  Kind,
  { title: string; warning: string; affects: string[]; success: string }
> = {
  drill: {
    title: "Delete Drill Result?",
    warning: "This will permanently remove this drill result from your history.",
    affects: ["BSI", "Personal Bests", "Progress analytics", "Coach insights"],
    success: "Drill result deleted.",
  },
  challenge: {
    title: "Delete Challenge Result?",
    warning: "This will permanently remove this challenge result from your history.",
    affects: ["Achievement badges", "Personal Bests", "Challenge mastery", "Coach insights"],
    success: "Challenge result deleted.",
  },
};

export function DeleteResultDialog({
  open,
  onOpenChange,
  kind,
  resultId,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: Kind;
  resultId: string;
  /** @deprecated kept for callsite compatibility; no longer used */
  email?: string;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const copy = COPY[kind];

  function reset() {
    setStep(1);
    setTyped("");
    setLoading(false);
  }

  async function confirm() {
    if (typed.trim().toUpperCase() !== "DELETE") return;
    setLoading(true);
    const table = kind === "drill" ? "results" : "challenge_results";
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setLoading(false);
      return toast.error("Please sign in again before deleting history.");
    }

    const { data: ownerRow, error: ownerError } = await (supabase as any)
      .from(table)
      .select("user_id")
      .eq("id", resultId)
      .maybeSingle();

    if (ownerError) {
      setLoading(false);
      return toast.error(ownerError.message);
    }

    if (!ownerRow) {
      setLoading(false);
      onOpenChange(false);
      reset();
      await qc.invalidateQueries();
      onDeleted?.();
      return toast.success("This item was already removed.");
    }

    if (ownerRow.user_id !== userData.user.id) {
      setLoading(false);
      onOpenChange(false);
      reset();
      await qc.invalidateQueries();
      onDeleted?.();
      return toast.error("That history item is not on your account, so it cannot be deleted here.");
    }

    const { error } = await (supabase as any)
      .from(table)
      .delete()
      .eq("id", resultId)
      .eq("user_id", userData.user.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(copy.success);
    onOpenChange(false);
    reset();
    await qc.invalidateQueries();
    onDeleted?.();
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
            <AlertTriangle className="h-5 w-5" /> {copy.title}
          </DialogTitle>
        </DialogHeader>
        {step === 1 && (
          <div className="space-y-3">
            <DialogDescription>{copy.warning}</DialogDescription>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">This may affect:</p>
              <ul className="ml-4 list-disc text-sm text-muted-foreground">
                {copy.affects.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
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
              Type <span className="font-bold text-destructive">DELETE</span> to permanently remove this result.
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
                onClick={confirm}
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
