import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Copy, Trash2, RefreshCw, Apple, Smartphone, Info } from "lucide-react";
import {
  buildOnboardingMessage,
  accountStatusLabel,
  normaliseEmail,
  PLATFORM_LABEL,
  type TesterPlatform,
  type TesterRow,
} from "@/lib/tester-onboarding";

export const Route = createFileRoute("/_authenticated/admin/invitations")({
  component: InvitationsPage,
});

const db = supabase as any;

function InvitationsPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"player" | "coach" | "admin">("player");
  const [platforms, setPlatforms] = useState<TesterPlatform[]>(["ios"]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: testers = [] } = useQuery({
    queryKey: ["tester-directory"],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_tester_directory");
      if (error) throw error;
      return (data ?? []) as TesterRow[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["app-settings-beta"],
    queryFn: async () => {
      const { data } = await db
        .from("app_settings")
        .select("key,value")
        .in("key", ["private_beta_mode", "testflight_url", "play_test_url"]);
      const map: Record<string, any> = {};
      (data ?? []).forEach((r: any) => (map[r.key] = r.value));
      return map;
    },
  });

  const betaMode = settings?.["private_beta_mode"] === true;
  const testflightUrl = typeof settings?.["testflight_url"] === "string" ? settings["testflight_url"] : "";
  const playUrl = typeof settings?.["play_test_url"] === "string" ? settings["play_test_url"] : "";

  const stats = useMemo(() => {
    const s = {
      testers: testers.length,
      registered: testers.filter((t) => t.user_id).length,
      awaiting: testers.filter((t) => !t.user_id && t.invitation_status !== "revoked").length,
      ios: testers.filter((t) => (t.platforms ?? []).includes("ios")).length,
      android: testers.filter((t) => (t.platforms ?? []).includes("android")).length,
    };
    return s;
  }, [testers]);

  const duplicate = useMemo(() => {
    const e = normaliseEmail(email);
    if (!e) return null;
    return testers.find((t) => normaliseEmail(t.email) === e) ?? null;
  }, [email, testers]);

  async function saveSetting(key: string, value: any) {
    const { error } = await db
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["app-settings-beta"] });
  }

  function togglePlatform(p: TesterPlatform) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function inviteTester(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (platforms.length === 0) return toast.error("Choose at least one platform.");
    setSubmitting(true);
    const { data, error } = await db.rpc("admin_upsert_tester", {
      _email: normaliseEmail(email),
      _full_name: fullName.trim() || null,
      _role: role,
      _platforms: platforms,
      _notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    const row = data?.[0];
    if (row?.outcome === "existing_account") {
      toast.success("Already has a Bowls Trainer account — no registration invite created. Send the install instructions only.");
    } else if (row?.outcome === "existing_invitation") {
      toast.success("Tester already invited — platforms updated, no duplicate invitation created.");
    } else {
      toast.success("Tester added — copy the onboarding message below.");
    }
    setEmail("");
    setFullName("");
    setNotes("");
    setPlatforms(["ios"]);
    qc.invalidateQueries({ queryKey: ["tester-directory"] });
  }

  async function setRowPlatforms(row: TesterRow, next: TesterPlatform[]) {
    const { error } = await db.rpc("admin_set_tester_platforms", {
      _invitation_id: row.invitation_id,
      _platforms: next,
    });
    if (error) return toast.error(error.message);
    toast.success("Platforms updated — same Bowls Trainer account, no new registration.");
    qc.invalidateQueries({ queryKey: ["tester-directory"] });
  }

  async function markInstallSent(row: TesterRow, platform: TesterPlatform, sent: boolean) {
    const { error } = await db.rpc("admin_mark_install_sent", {
      _invitation_id: row.invitation_id,
      _platform: platform,
      _sent: sent,
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tester-directory"] });
  }

  async function revoke(row: TesterRow) {
    const { error } = await db.from("invitations").update({ status: "revoked" }).eq("id", row.invitation_id);
    if (error) return toast.error(error.message);
    toast.success("Tester access revoked");
    qc.invalidateQueries({ queryKey: ["tester-directory"] });
  }

  async function refreshInvite(row: TesterRow) {
    const { error } = await db
      .from("invitations")
      .update({ status: "pending", expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() })
      .eq("id", row.invitation_id);
    if (error) return toast.error(error.message);
    toast.success("Registration link refreshed");
    qc.invalidateQueries({ queryKey: ["tester-directory"] });
  }

  function copyOnboarding(row: TesterRow, platform: TesterPlatform) {
    const msg = buildOnboardingMessage({
      row,
      platform,
      storeUrl: platform === "ios" ? testflightUrl : playUrl,
      appOrigin: window.location.origin,
    });
    navigator.clipboard.writeText(msg);
    toast.success(`${PLATFORM_LABEL[platform]} onboarding message copied`);
  }

  return (
    <>
      <PageHeader title="Testers & Invitations" subtitle="One person = one Bowls Trainer account" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <div className="grid grid-cols-5 gap-2">
          <Stat label="Testers" value={stats.testers} />
          <Stat label="Registered" value={stats.registered} />
          <Stat label="Awaiting" value={stats.awaiting} />
          <Stat label="iOS" value={stats.ios} />
          <Stat label="Android" value={stats.android} />
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-card p-4 bt-shadow-elevated">
          <div>
            <p className="font-bold">Private Beta Mode (legacy)</p>
            <p className="text-xs text-muted-foreground">
              Player sign-up is now open to everyone. This flag is kept for reference only and no
              longer blocks new accounts.
            </p>
          </div>
          <Switch checked={betaMode} onCheckedChange={(v) => saveSetting("private_beta_mode", v)} />
        </div>

        {/* Store links */}
        <div className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-elevated">
          <p className="font-bold">Store testing links</p>
          <div className="space-y-2">
            <Label htmlFor="tf-url">TestFlight public link</Label>
            <Input
              id="tf-url"
              defaultValue={testflightUrl}
              placeholder="https://testflight.apple.com/join/…"
              onBlur={(e) => e.target.value !== testflightUrl && saveSetting("testflight_url", e.target.value.trim())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gp-url">Google Play testing link</Label>
            <Input
              id="gp-url"
              defaultValue={playUrl}
              placeholder="https://play.google.com/apps/testing/…"
              onBlur={(e) => e.target.value !== playUrl && saveSetting("play_test_url", e.target.value.trim())}
            />
          </div>
          <p className="flex gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Adding a tester's email to TestFlight or Google Play must still be done manually in App Store
            Connect / Play Console. Bowls Trainer cannot read install or tester status from Apple or Google.
          </p>
        </div>

        {/* Invite form */}
        <form onSubmit={inviteTester} className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-elevated">
          <p className="font-bold">Invite Tester</p>
          <div className="space-y-2">
            <Label htmlFor="inv-name">Name</Label>
            <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-email">Email Address</Label>
            <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          {duplicate && (
            <div className="rounded-xl bg-amber-100 p-3 text-xs text-amber-900">
              {duplicate.user_id
                ? `${duplicate.email} already has a Bowls Trainer account (${accountStatusLabel(duplicate)}). Adding them will only update their testing platforms — no second registration.`
                : `${duplicate.email} already has a pending invitation. Adding them will update platforms instead of creating a duplicate.`}
            </div>
          )}

          <div className="space-y-2">
            <Label>Platform (distribution only)</Label>
            <div className="flex gap-4">
              {(["ios", "android"] as TesterPlatform[]).map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={platforms.includes(p)} onCheckedChange={() => togglePlatform(p)} />
                  {PLATFORM_LABEL[p]}
                </label>
              ))}
            </div>
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
          <Button type="submit" disabled={submitting} className="h-12 w-full rounded-xl font-bold">
            {submitting ? "Saving…" : "Add / Update Tester"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Send each tester ONE onboarding message (copy it from their card below). It covers installing the app
            and creating their single Bowls Trainer account.
          </p>
        </form>

        {/* Directory */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Testers ({testers.length})
          </p>
          {testers.map((row) => (
            <TesterCard
              key={row.invitation_id}
              row={row}
              onCopy={copyOnboarding}
              onPlatforms={setRowPlatforms}
              onInstallSent={markInstallSent}
              onRevoke={revoke}
              onRefresh={refreshInvite}
            />
          ))}
          {testers.length === 0 && (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
              No testers yet. Add one above.
            </p>
          )}
        </div>
      </main>
    </>
  );
}

function TesterCard({
  row,
  onCopy,
  onPlatforms,
  onInstallSent,
  onRevoke,
  onRefresh,
}: {
  row: TesterRow;
  onCopy: (r: TesterRow, p: TesterPlatform) => void;
  onPlatforms: (r: TesterRow, next: TesterPlatform[]) => void;
  onInstallSent: (r: TesterRow, p: TesterPlatform, sent: boolean) => void;
  onRevoke: (r: TesterRow) => void;
  onRefresh: (r: TesterRow) => void;
}) {
  const plats = row.platforms ?? [];
  const registered = !!row.user_id;

  const toggle = (p: TesterPlatform) =>
    onPlatforms(row, plats.includes(p) ? plats.filter((x) => x !== p) : [...plats, p]);

  return (
    <div className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-elevated">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{row.full_name || row.email}</p>
          <p className="truncate text-xs text-muted-foreground">{row.email}</p>
          <p className="text-xs capitalize text-muted-foreground">{row.role}</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            registered ? "bg-emerald-100 text-emerald-900" : "bg-primary/10 text-primary"
          }`}
        >
          {accountStatusLabel(row)}
        </span>
      </div>

      {/* Distribution */}
      <div className="rounded-xl bg-muted/60 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Install / distribution
        </p>
        <div className="mt-2 space-y-2">
          {(["ios", "android"] as TesterPlatform[]).map((p) => {
            const on = plats.includes(p);
            const sentAt = p === "ios" ? row.ios_install_sent_at : row.android_install_sent_at;
            return (
              <div key={p} className="flex items-center justify-between gap-2 text-xs">
                <label className="flex items-center gap-2">
                  <Checkbox checked={on} onCheckedChange={() => toggle(p)} />
                  {p === "ios" ? <Apple className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
                  {PLATFORM_LABEL[p]}
                </label>
                {on && (
                  <button
                    onClick={() => onInstallSent(row, p, !sentAt)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      sentAt ? "bg-emerald-100 text-emerald-900" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {sentAt ? "Install invite sent" : "Mark install sent"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Account */}
      <div className="rounded-xl bg-muted/60 p-3 text-xs">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Bowls Trainer account
        </p>
        <p className="mt-1">
          {registered
            ? "Registered — signs in with this email on any platform. No further registration needed."
            : `Not registered — registers once in-app${
                row.invitation_status === "expired" ? " (link expired, refresh it)" : ""
              }.`}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {plats.map((p) => (
          <Button key={p} size="sm" variant="outline" className="flex-1" onClick={() => onCopy(row, p)}>
            <Copy className="mr-1 h-3 w-3" /> {p === "ios" ? "iOS" : "Android"} message
          </Button>
        ))}
        {!registered && (
          <Button size="sm" variant="outline" onClick={() => onRefresh(row)}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onRevoke(row)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-card p-2 text-center bt-shadow-elevated">
      <p className="font-display text-lg font-extrabold">{value}</p>
      <p className="text-[8px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
