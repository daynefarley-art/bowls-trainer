import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { startSession, getLastCompletedSession, type SessionSetup } from "@/lib/sessions";
import {
  CONDITION_OPTIONS,
  GREEN_TYPE_OPTIONS,
  type GreenType,
} from "@/components/bowls/SessionConditionsField";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  onStarted: () => void;
};

export function StartSessionDialog({ open, onOpenChange, userId, onStarted }: Props) {
  const [club, setClub] = useState("");
  const [green, setGreen] = useState("");
  const [greenType, setGreenType] = useState<GreenType | "">("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [primed, setPrimed] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile-defaults", userId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("club, default_club, default_green, default_green_type")
        .eq("id", userId)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: last } = useQuery({
    queryKey: ["last-session", userId],
    enabled: open,
    queryFn: () => getLastCompletedSession(userId),
  });

  // Prime fields once per open: most recent session > profile defaults > blank
  useEffect(() => {
    if (!open) {
      setPrimed(false);
      return;
    }
    if (primed) return;
    if (profile === undefined || last === undefined) return;
    const cFromLast = (last as any)?.club ?? null;
    const gFromLast = (last as any)?.green ?? null;
    const gtFromLast = (last as any)?.green_type ?? null;
    const condFromLast = Array.isArray((last as any)?.conditions) ? (last as any).conditions : null;
    setClub(cFromLast ?? profile?.default_club ?? profile?.club ?? "");
    setGreen(gFromLast ?? profile?.default_green ?? "");
    const gtPick = gtFromLast ?? profile?.default_green_type ?? "";
    setGreenType((GREEN_TYPE_OPTIONS as readonly string[]).includes(gtPick) ? (gtPick as GreenType) : "");
    setConditions(condFromLast ?? []);
    setNotes("");
    setPrimed(true);
  }, [open, profile, last, primed]);

  function toggleCondition(c: string) {
    setConditions((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function handleStart() {
    setBusy(true);
    try {
      const setup: SessionSetup = {
        club: club.trim() || null,
        green: green.trim() || null,
        green_type: greenType || null,
        conditions: conditions.length ? conditions : null,
        notes: notes.trim() || null,
      };
      await startSession(userId, setup);
      onStarted();
      onOpenChange(false);
      toast.success("Training session started");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start Training Session</DialogTitle>
          <DialogDescription>
            Enter details once — every drill, challenge and game inside this session inherits
            them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Club / Location</Label>
            <Input
              value={club}
              onChange={(e) => setClub(e.target.value)}
              placeholder="e.g. Bowls Tauranga South"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Green</Label>
            <Input
              value={green}
              onChange={(e) => setGreen(e.target.value)}
              placeholder="e.g. Green 1, Indoor Green, Rink A"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Green Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {GREEN_TYPE_OPTIONS.map((opt) => {
                const active = greenType === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setGreenType(active ? "" : opt)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                      active ? "bt-gradient-primary text-white" : "bg-secondary text-charcoal"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Conditions</Label>
            <div className="grid grid-cols-2 gap-2">
              {CONDITION_OPTIONS.map((opt) => {
                const active = conditions.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleCondition(opt)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                      active ? "bt-gradient-primary text-white" : "bg-secondary text-charcoal"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Session notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Focus areas, plan…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-11 w-full sm:flex-1"
          >
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={busy} className="h-11 w-full sm:flex-1">
            {busy ? "Starting…" : "Start Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
