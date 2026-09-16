import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, UserPlus, Users, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/club-admin")({
  head: () => ({
    meta: [
      { title: "Club Admin · Bowls Trainer" },
      { name: "description", content: "Onboard club members with your club join code or an email invitation." },
      { property: "og:title", content: "Club Admin · Bowls Trainer" },
      { property: "og:description", content: "Share your club join code and invite members to Bowls Trainer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClubAdminPage,
});

type AdminClub = {
  id: string;
  name: string;
  slug: string;
  short_name: string | null;
  join_code: string | null;
  join_code_enabled: boolean;
  member_count: number;
};

type Member = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  status: string;
  joined_at: string;
};

type Invite = { id: string; email: string; status: string; created_at: string; expires_at: string };

function ClubAdminPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const { data: clubs = [], isLoading } = useQuery({
    queryKey: ["club-admin-clubs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("club_admin_my_clubs");
      if (error) throw error;
      return (data ?? []) as AdminClub[];
    },
  });

  const club = clubs.find((c) => c.id === selected) ?? clubs[0] ?? null;

  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ["club-admin-members", club?.id],
    enabled: !!club,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("club_admin_list_members", { _club_id: club!.id });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const { data: invites = [], refetch: refetchInvites } = useQuery({
    queryKey: ["club-admin-invites", club?.id],
    enabled: !!club,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("club_admin_list_invitations", { _club_id: club!.id });
      if (error) throw error;
      return (data ?? []) as Invite[];
    },
  });

  if (isLoading) return <div className="min-h-screen bg-background p-6 text-muted-foreground">Loading…</div>;

  if (!club) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Club Admin" subtitle="Member onboarding" />
        <main className="mx-auto max-w-md px-6 py-6">
          <p className="text-muted-foreground">You're not a club administrator for any club.</p>
        </main>
      </div>
    );
  }

  const copyCode = async () => {
    if (!club.join_code) return;
    await navigator.clipboard.writeText(club.join_code);
    toast.success("Club code copied");
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await (supabase as any).rpc("club_admin_invite_member", {
      _club_id: club.id,
      _email: email.trim(),
    });
    if (error) return toast.error(error.message);
    const row = (data ?? [])[0];
    toast.success(row?.is_new_account ? "Invitation created — they'll join on sign-up" : "Member added to the club");
    setEmail("");
    await Promise.all([refetchMembers(), refetchInvites()]);
  };

  const removeMember = async (userId: string) => {
    const { error } = await (supabase as any).rpc("club_admin_remove_member", { _club_id: club.id, _user_id: userId });
    if (error) return toast.error(error.message);
    toast.success("Membership removed");
    await refetchMembers();
  };

  const cancelInvite = async (id: string) => {
    const { error } = await (supabase as any).rpc("club_admin_cancel_invitation", { _invitation_id: id });
    if (error) return toast.error(error.message);
    toast.success("Invitation cancelled");
    await refetchInvites();
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title={club.name} subtitle="Club admin · member onboarding" />
      <main className="mx-auto max-w-md space-y-5 px-6 py-6">
        {clubs.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {clubs.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={c.id === club.id ? "default" : "outline"}
                onClick={() => setSelected(c.id)}
              >
                {c.short_name ?? c.name}
              </Button>
            ))}
          </div>
        )}

        <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-lg font-bold">Join your club</h2>
          <p className="text-xs text-muted-foreground">
            Tell members: download Bowls Trainer and enter this code when they sign up.
          </p>
          {club.join_code && club.join_code_enabled ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-xl border border-dashed border-primary bg-primary/5 px-4 py-3 text-center font-display text-xl font-extrabold tracking-[0.2em]">
                {club.join_code}
              </div>
              <Button variant="outline" size="icon" className="h-12 w-12" onClick={copyCode} title="Copy club code">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active join code. Contact the Bowls Trainer team to have one issued.
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-lg font-bold">Invite member</h2>
          <form onSubmit={invite} className="flex gap-2">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
              className="h-11 flex-1 rounded-xl"
            />
            <Button type="submit" size="icon" className="h-11 w-11">
              <UserPlus className="h-4 w-4" />
            </Button>
          </form>
          {invites.filter((i) => i.status === "pending").length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending invitations</p>
              {invites
                .filter((i) => i.status === "pending")
                .map((i) => (
                  <div key={i.id} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
                    <span className="truncate text-sm">{i.email}</span>
                    <Button variant="ghost" size="icon" onClick={() => cancelInvite(i.id)} title="Cancel invitation">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">Members ({members.length})</h2>
          </div>
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{m.full_name ?? m.email}</p>
                <p className="text-xs capitalize text-muted-foreground">{m.role} · {m.status}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeMember(m.user_id)} title="Remove from club">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
