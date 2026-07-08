import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useIncomingInvites,
  isInvitePopupDismissedThisSession,
  dismissInvitePopupForSession,
} from "@/lib/squad-invites";
import { Trophy } from "lucide-react";

/**
 * Auto-shown popup when the app opens and there are pending incoming Squad
 * invitations. One-per-session — a "Later" dismissal is sticky for the
 * current tab/session; the next app open re-shows if still pending.
 */
export function SquadInviteDialog() {
  const incoming = useIncomingInvites();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => isInvitePopupDismissedThisSession());
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (dismissed) return;
    if (incoming.length > 0) setOpen(true);
  }, [incoming.length, dismissed]);

  const respond = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await (supabase as any).rpc("respond_squad_invite", {
        _invite_id: id,
        _accept: accept,
      });
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      toast.success(vars.accept ? "You're now Squad members!" : "Invitation declined.");
      qc.invalidateQueries({ queryKey: ["squad-invites"] });
      qc.invalidateQueries({ queryKey: ["squad-members"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  function handleLater() {
    dismissInvitePopupForSession();
    setDismissed(true);
    setOpen(false);
  }

  function handleReview() {
    dismissInvitePopupForSession();
    setDismissed(true);
    setOpen(false);
    navigate({ to: "/squad" });
  }

  const single = incoming.length === 1 ? incoming[0] : null;
  const multi = incoming.length > 1;

  return (
    <Dialog
      open={open && incoming.length > 0}
      onOpenChange={(v) => {
        if (!v) handleLater();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            {multi ? "New Squad Invitations" : "New Squad Invitation"}
          </DialogTitle>
          <DialogDescription>
            {multi
              ? `You have ${incoming.length} new Squad invitations waiting.`
              : `${single?.other_name ?? "A bowler"} has invited you to join their Squad.`}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          {single ? (
            <>
              <Button
                className="w-full"
                onClick={() => {
                  respond.mutate(
                    { id: single.id, accept: true },
                    {
                      onSettled: () => {
                        setOpen(false);
                        dismissInvitePopupForSession();
                        setDismissed(true);
                      },
                    },
                  );
                }}
                disabled={respond.isPending}
              >
                Accept
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  respond.mutate(
                    { id: single.id, accept: false },
                    {
                      onSettled: () => {
                        setOpen(false);
                        dismissInvitePopupForSession();
                        setDismissed(true);
                      },
                    },
                  );
                }}
                disabled={respond.isPending}
              >
                Decline
              </Button>
              <Button variant="ghost" className="w-full" onClick={handleLater}>
                Later
              </Button>
            </>
          ) : (
            <>
              <Button className="w-full" onClick={handleReview}>
                Review Invites
              </Button>
              <Button variant="ghost" className="w-full" onClick={handleLater}>
                Later
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
