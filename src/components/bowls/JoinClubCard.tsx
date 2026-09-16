import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ticket } from "lucide-react";
import { validateClubCode, joinClubWithCode, clubCodeErrorMessage, type ClubCodeCheck } from "@/lib/club-code";

export function JoinClubCard() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [check, setCheck] = useState<ClubCodeCheck | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await validateClubCode(code.trim());
    setCheck(res);
    setBusy(false);
    if (!res.valid) toast.error(clubCodeErrorMessage(res.reason));
  };

  const handleJoin = async () => {
    setBusy(true);
    try {
      const joined = await joinClubWithCode(code.trim());
      toast.success(joined.already_member ? `You're already a member of ${joined.club_name}` : `Joined ${joined.club_name}`);
      setCode("");
      setCheck(null);
      await queryClient.invalidateQueries({ queryKey: ["my-clubs"] });
    } catch {
      toast.error("Could not join that club. Please check the code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="flex items-center gap-2">
        <Ticket className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-bold">Join a club</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Got a club code? Enter it here — it adds the club to your existing account.
      </p>
      <form onSubmit={handleCheck} className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="join-club-code" className="text-xs">Club code</Label>
          <Input
            id="join-club-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setCheck(null);
            }}
            placeholder="TWEED1"
            className="h-11 rounded-xl"
          />
        </div>
        <Button type="submit" variant="outline" disabled={busy || !code.trim()} className="h-11">
          Check
        </Button>
      </form>
      {check?.valid && (
        <div className="flex items-center justify-between rounded-xl border border-primary bg-primary/5 px-3 py-2">
          <p className="text-sm font-semibold">{check.club_name}</p>
          <Button size="sm" onClick={handleJoin} disabled={busy}>
            Join {check.club_name}
          </Button>
        </div>
      )}
      {check && !check.valid && (
        <p className="text-xs font-semibold text-destructive">{clubCodeErrorMessage(check.reason)}</p>
      )}
    </section>
  );
}
