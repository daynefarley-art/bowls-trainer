import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Shield, X, MessageSquare } from "lucide-react";

type CoachAccess = {
  id: string;
  coach_id: string;
  coach_email: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  requested_at: string;
};

export function MyCoachSection({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: accessRows = [] } = useQuery({
    queryKey: ["my-coach-access", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("my_coach_list");
      if (error) throw error;
      return (data ?? []) as CoachAccess[];
    },
  });

  const { data: sharedNotes = [] } = useQuery({
    queryKey: ["my-shared-notes", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_notes")
        .select("id, note_text, created_at, coach_id")
        .eq("player_id", userId)
        .eq("visibility", "shared")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handleRequest() {
    if (!email.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("request_coach_access", {
      _coach_email: email.trim().toLowerCase(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Access request sent");
    setEmail("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["my-coach-access", userId] });
  }

  async function handleRevoke(id: string) {
    const { error } = await supabase
      .from("coach_access")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Access revoked");
    qc.invalidateQueries({ queryKey: ["my-coach-access", userId] });
  }

  const active = accessRows.filter((r) => r.status !== "revoked");

  return (
    <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-bold">My Coach</h2>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="rounded-xl">
          <UserPlus className="mr-1 h-4 w-4" /> Add Coach
        </Button>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don't have a coach connected. Enter your coach's registered email to send an access request.
        </p>
      ) : (
        <ul className="space-y-2">
          {active.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{row.coach_email}</p>
                <p className="text-xs text-muted-foreground">Status: {row.status}</p>
              </div>
              <button
                aria-label="Remove coach access"
                onClick={() => handleRevoke(row.id)}
                className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {sharedNotes.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base font-bold">Coach Feedback</h3>
          </div>
          <ul className="space-y-2">
            {sharedNotes.map((n) => (
              <li key={n.id} className="rounded-xl bg-secondary/40 p-3">
                <p className="text-sm whitespace-pre-wrap">{n.note_text}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Coach</DialogTitle>
            <DialogDescription>Enter your coach's registered email address.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="coach-email">Coach Email</Label>
            <Input
              id="coach-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coach@example.com"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRequest} disabled={submitting || !email.trim()}>
              {submitting ? "Sending…" : "Send Access Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
