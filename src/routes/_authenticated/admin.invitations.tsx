import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Copy, Trash2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/invitations")({
  component: InvitationsPage,
});

type InviteRow = {
  id: string;
  email: string;
  role: "admin" | "player" | "coach";
  invite_code: string;
  status: "pending" | "used" | "expired" | "revoked";
  notes: string | null;
  expires_at: string;
  created_at: string;
  used_at: string | null;
};

function InvitationsPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"player" | "coach" | "admin">("player");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: invites = [] } = useQuery({
    queryKey: ["invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InviteRow[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["invitation-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_invitation_stats");
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const { data: betaMode = true } = useQuery({
    queryKey: ["app-setting", "private_beta_mode"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "private_beta_mode")
        .maybeSingle();
      return data?.value === true;
    },
  });

  async function toggleBeta(enabled: boolean) {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "private_beta_mode", value: enabled, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success(`Private beta mode ${enabled ? "ON" : "OFF"}`);
    qc.invalidateQueries({ queryKey: ["app-setting", "private_beta_mode"] });
  }

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("invitations").insert({
      email: email.trim().toLowerCase(),
      role,
      notes: notes.trim() || null,
      invited_by: userData.user?.id ?? null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Invitation created");
    setEmail("");
    setNotes("");
    setRole("player");
    qc.invalidateQueries({ queryKey: ["invitations"] });
    qc.invalidateQueries({ queryKey: ["invitation-stats"] });
  }

  async function revokeInvite(id: string) {
    const { error } = await supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invitation revoked");
    qc.invalidateQueries({ queryKey: ["invitations"] });
    qc.invalidateQueries({ queryKey: ["invitation-stats"] });
  }

  async function resendInvite(row: InviteRow) {
    // "Resend" extends expiry and resets to pending, keeps same code
    const { error } = await supabase
      .from("invitations")
      .update({
        status: "pending",
        expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
      })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    copyLink(row.invite_code);
    toast.success("Invitation refreshed — link copied to clipboard");
    qc.invalidateQueries({ queryKey: ["invitations"] });
  }

  function copyLink(code: string) {
    const url = `${window.location.origin}/auth?invite=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    toast.success("Invitation link copied");
  }

  function effectiveStatus(row: InviteRow) {
    if (row.status === "pending" && new Date(row.expires_at) < new Date()) return "expired";
    return row.status;
  }

  return (
    <>
      <PageHeader title="Invitations" subtitle="Manage private-beta access" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Sent" value={stats.sent} />
            <Stat label="Used" value={stats.used} />
            <Stat label="Pending" value={stats.pending} />
            <Stat label="Expired" value={stats.expired} />
          </div>
        )}

        {/* Beta toggle */}
        <div className="flex items-center justify-between rounded-2xl bg-card p-4 bt-shadow-elevated">
          <div>
            <p className="font-bold">Private Beta Mode</p>
            <p className="text-xs text-muted-foreground">When ON, registration requires an invitation.</p>
          </div>
          <Switch checked={betaMode} onCheckedChange={toggleBeta} />
        </div>

        {/* Create form */}
        <form onSubmit={createInvite} className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-elevated">
          <p className="font-bold">Create Invitation</p>
          <div className="space-y-2">
            <Label htmlFor="inv-email">Email Address</Label>
            <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="player">Player</SelectItem>
                <SelectItem value="coach">Coach</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-notes">Notes (optional)</Label>
            <Textarea id="inv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button type="submit" disabled={submitting} className="w-full h-12 rounded-xl font-bold">
            {submitting ? "Creating…" : "Send Invitation"}
          </Button>
          <p className="text-xs text-muted-foreground">
            After creating, copy the invitation link and share it manually (email sending is not enabled).
          </p>
        </form>

        {/* List */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            All Invitations ({invites.length})
          </p>
          {invites.map((row) => {
            const st = effectiveStatus(row);
            return (
              <div key={row.id} className="rounded-2xl bg-card p-4 bt-shadow-elevated space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{row.email}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {row.role} · created {new Date(row.created_at).toLocaleDateString()}
                    </p>
                    {row.notes && <p className="mt-1 text-xs italic">{row.notes}</p>}
                  </div>
                  <StatusBadge status={st} />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Expires {new Date(row.expires_at).toLocaleDateString()}
                  {row.used_at && ` · Used ${new Date(row.used_at).toLocaleDateString()}`}
                </p>
                {(st === "pending" || st === "expired") && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => copyLink(row.invite_code)}>
                      <Copy className="h-3 w-3 mr-1" /> Copy link
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => resendInvite(row)}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Resend
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => revokeInvite(row.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {invites.length === 0 && (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
              No invitations yet. Create one above.
            </p>
          )}
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | bigint }) {
  return (
    <div className="rounded-xl bg-card p-2 text-center bt-shadow-elevated">
      <p className="font-display text-xl font-extrabold">{String(value)}</p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-primary/10 text-primary",
    used: "bg-muted text-muted-foreground",
    expired: "bg-destructive/10 text-destructive",
    revoked: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${map[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}
