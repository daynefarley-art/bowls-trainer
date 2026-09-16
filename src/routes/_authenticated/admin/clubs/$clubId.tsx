import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listClubs, setClubBranding, setClubDefaults, addClubMember, setClubJoinCode, type Club } from "@/lib/club.functions";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/clubs/$clubId")({
  component: ClubDetailPage,
});

function ClubDetailPage() {
  const { clubId } = useParams({ from: "/_authenticated/admin/clubs/$clubId" });
  const listClubsFn = useServerFn(listClubs);
  const setBrandingFn = useServerFn(setClubBranding);
  const setDefaultsFn = useServerFn(setClubDefaults);
  const addMemberFn = useServerFn(addClubMember);
  const setJoinCodeFn = useServerFn(setClubJoinCode);

  const { data: clubs = [], refetch } = useQuery({
    queryKey: ["admin-clubs"],
    queryFn: () => listClubsFn({}),
  });

  const club = clubs.find((c) => c.id === clubId);

  const [primary, setPrimary] = useState(club?.primary_colour ?? "#0055A4");
  const [secondary, setSecondary] = useState(club?.secondary_colour ?? "#00AEEF");
  const [accent, setAccent] = useState(club?.accent_colour ?? "#FFD700");
  const [surface, setSurface] = useState(club?.surface_colour ?? "#FFFFFF");
  const [enabled, setEnabled] = useState(club?.managed_branding_enabled ?? false);
  const [logoUrl, setLogoUrl] = useState(club?.logo_url ?? "");

  const [autoSquad, setAutoSquad] = useState(club?.auto_add_to_squad ?? true);
  const [autoCoach, setAutoCoach] = useState(club?.auto_assign_default_coach ?? true);
  const [optOut, setOptOut] = useState(club?.allow_member_squad_opt_out ?? true);
  const [defaultCoachId, setDefaultCoachId] = useState(club?.default_coach_id ?? "");
  const [defaultSquadOwnerId, setDefaultSquadOwnerId] = useState(club?.default_squad_owner_id ?? "");

  const [memberEmail, setMemberEmail] = useState("");
  const [joinCode, setJoinCode] = useState(club?.join_code ?? "");
  const [joinCodeEnabled, setJoinCodeEnabled] = useState(club?.join_code_enabled ?? true);

  if (!club) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p className="text-muted-foreground">Club not found.</p>
      </div>
    );
  }

  const handleSaveBranding = async () => {
    await setBrandingFn({
      data: {
        clubId: club.id,
        enabled,
        logoUrl: logoUrl || null,
        primary,
        secondary,
        accent,
        surface,
      },
    });
    await refetch();
  };

  const handleSaveDefaults = async () => {
    await setDefaultsFn({
      data: {
        clubId: club.id,
        autoAddToSquad: autoSquad,
        autoAssignDefaultCoach: autoCoach,
        allowMemberSquadOptOut: optOut,
        defaultCoachId: defaultCoachId || null,
        defaultSquadOwnerId: defaultSquadOwnerId || null,
      },
    });
    await refetch();
  };

  const handleSaveJoinCode = async () => {
    try {
      await setJoinCodeFn({ data: { clubId: club!.id, code: joinCode.trim().toUpperCase() || null, enabled: joinCodeEnabled } });
      await refetch();
    } catch (e) {
      alert("Could not save the join code — it may already be used by another club.");
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    await addMemberFn({ data: { clubId: club.id, email: memberEmail } });
    setMemberEmail("");
    await refetch();
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title={club.name} subtitle="Managed branding & defaults" />
      <main className="mx-auto max-w-md space-y-6 px-6 py-6">
        <section className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-card">
          <h2 className="font-display font-bold">Branding</h2>
          <div className="flex items-center justify-between">
            <Label htmlFor="branding-enabled">Enable club branding</Label>
            <Switch id="branding-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div>
            <Label htmlFor="logo-url">Logo URL</Label>
            <Input id="logo-url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="primary">Primary</Label>
              <div className="flex items-center gap-2">
                <input id="primary" type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-9 rounded border" />
                <Input value={primary} onChange={(e) => setPrimary(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="secondary">Secondary</Label>
              <div className="flex items-center gap-2">
                <input id="secondary" type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-9 w-9 rounded border" />
                <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="accent">Accent</Label>
              <div className="flex items-center gap-2">
                <input id="accent" type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-9 rounded border" />
                <Input value={accent} onChange={(e) => setAccent(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="surface">Surface</Label>
              <div className="flex items-center gap-2">
                <input id="surface" type="color" value={surface} onChange={(e) => setSurface(e.target.value)} className="h-9 w-9 rounded border" />
                <Input value={surface} onChange={(e) => setSurface(e.target.value)} />
              </div>
            </div>
          </div>
          <Button onClick={handleSaveBranding} className="w-full gap-2">
            <Save className="h-4 w-4" /> Save branding
          </Button>
        </section>

        <section className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-card">
          <h2 className="font-display font-bold">Automation defaults</h2>
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-squad">Auto-add new members to default squad</Label>
            <Switch id="auto-squad" checked={autoSquad} onCheckedChange={setAutoSquad} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-coach">Auto-assign default coach</Label>
            <Switch id="auto-coach" checked={autoCoach} onCheckedChange={setAutoCoach} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="opt-out">Allow members to opt out of club squad</Label>
            <Switch id="opt-out" checked={optOut} onCheckedChange={setOptOut} />
          </div>
          <div>
            <Label htmlFor="default-coach">Default coach user ID</Label>
            <Input id="default-coach" value={defaultCoachId} onChange={(e) => setDefaultCoachId(e.target.value)} placeholder="uuid" />
          </div>
          <div>
            <Label htmlFor="default-squad">Default squad owner user ID</Label>
            <Input id="default-squad" value={defaultSquadOwnerId} onChange={(e) => setDefaultSquadOwnerId(e.target.value)} placeholder="uuid" />
          </div>
          <Button onClick={handleSaveDefaults} className="w-full gap-2">
            <Save className="h-4 w-4" /> Save defaults
          </Button>
        </section>

        <section className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-card">
          <h2 className="font-display font-bold">Club join code</h2>
          <p className="text-xs text-muted-foreground">
            Members enter this code during sign-up, or from their profile, to join this club as a member.
          </p>
          <div>
            <Label htmlFor="join-code">Code</Label>
            <Input
              id="join-code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="TWEED1"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="join-code-enabled">Code active</Label>
            <Switch id="join-code-enabled" checked={joinCodeEnabled} onCheckedChange={setJoinCodeEnabled} />
          </div>
          <Button onClick={handleSaveJoinCode} className="w-full gap-2">
            <Save className="h-4 w-4" /> Save join code
          </Button>
        </section>

        <section className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-card">
          <h2 className="font-display font-bold">Add member</h2>
          <form onSubmit={handleAddMember} className="flex gap-2">
            <Input
              type="email"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              placeholder="member@club.com"
              required
              className="flex-1"
            />
            <Button type="submit" size="icon">
              <UserPlus className="h-4 w-4" />
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
