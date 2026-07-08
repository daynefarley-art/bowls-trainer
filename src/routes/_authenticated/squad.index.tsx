import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Users, UserPlus, Search, Trash2, Ban, X, Check, Bell, Trophy, Target, Swords, Award, Crown, Flame } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { bsiLevel } from "@/lib/bowls";

export const Route = createFileRoute("/_authenticated/squad/")({
  component: SquadPage,
});


function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

function timeAgo(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function SquadPage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const members = useQuery({
    queryKey: ["squad-members"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_my_squad");
      if (error) throw error;
      return data as Array<{
        member_user_id: string;
        full_name: string | null;
        club: string | null;
        current_bsi: number | null;
        last_active: string | null;
        personal_best_count: number;
        member_since: string;
      }>;
    },
  });

  const invites = useQuery({
    queryKey: ["squad-invites"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_squad_invites");
      if (error) throw error;
      return data as Array<{
        id: string;
        direction: "incoming" | "outgoing";
        other_user_id: string;
        other_name: string | null;
        other_club: string | null;
        status: string;
        created_at: string;
      }>;
    },
  });

  const respond = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await (supabase as any).rpc("respond_squad_invite", {
        _invite_id: id,
        _accept: accept,
      });
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      toast.success(vars.accept ? "Squad member added" : "Invite declined");
      qc.invalidateQueries({ queryKey: ["squad-invites"] });
      qc.invalidateQueries({ queryKey: ["squad-members"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("cancel_squad_invite", { _invite_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invite cancelled");
      qc.invalidateQueries({ queryKey: ["squad-invites"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await (supabase as any).rpc("remove_squad_member", { _member: memberId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from Squad");
      qc.invalidateQueries({ queryKey: ["squad-members"] });
    },
  });

  const block = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await (supabase as any).rpc("block_squad_user", { _target: memberId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User blocked");
      qc.invalidateQueries({ queryKey: ["squad-members"] });
      qc.invalidateQueries({ queryKey: ["squad-invites"] });
    },
  });

  const incoming = (invites.data ?? []).filter((i) => i.direction === "incoming");
  const outgoing = (invites.data ?? []).filter((i) => i.direction === "outgoing");

  return (
    <>
      <PageHeader title="My Squad" subtitle="Your private bowling network" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <Button
          onClick={() => setAddOpen(true)}
          className="h-14 w-full rounded-xl text-base font-bold"
        >
          <UserPlus className="mr-2 h-5 w-5" /> Add Squad Member
        </Button>

        <ChallengeOfTheWeekBanner />

        <Tabs defaultValue="members">
          <TabsList className="grid w-full grid-cols-7 rounded-xl">
            <TabsTrigger value="members" className="rounded-lg text-[10px]">
              Squad
            </TabsTrigger>
            <TabsTrigger value="championship" className="rounded-lg text-[10px]">Champ</TabsTrigger>
            <TabsTrigger value="ladders" className="rounded-lg text-[10px]">Ladders</TabsTrigger>
            <TabsTrigger value="activity" className="rounded-lg text-[10px]">Activity</TabsTrigger>
            <TabsTrigger value="records" className="rounded-lg text-[10px]">Records</TabsTrigger>
            <TabsTrigger value="invites" className="relative rounded-lg text-[10px]">
              Invites
              {incoming.length > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                  {incoming.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="alerts" className="rounded-lg text-[10px]">Alerts</TabsTrigger>
          </TabsList>


          <TabsContent value="members" className="mt-4 space-y-3">
            {members.isLoading ? (
              <p className="text-center text-sm text-muted-foreground">Loading…</p>
            ) : (members.data ?? []).length === 0 ? (
              <div className="rounded-2xl bg-card p-8 text-center bt-shadow-card">
                <Users className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">No squad members yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Invite bowling mates to compare challenges and compete on private ladders.
                </p>
              </div>
            ) : (
              members.data!.map((m) => {
                const bsi = m.current_bsi != null ? Math.round(Number(m.current_bsi)) : null;
                const level = bsi != null ? bsiLevel(bsi) : null;
                return (
                  <div
                    key={m.member_user_id}
                    className="flex items-center gap-3 rounded-2xl bg-card p-4 bt-shadow-card"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {initials(m.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{m.full_name ?? "Unnamed bowler"}</p>
                      {m.club && (
                        <p className="truncate text-xs text-muted-foreground">{m.club}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {bsi != null && (
                          <span>
                            BSI {bsi}
                            {level ? ` · ${level.label}` : ""}
                          </span>
                        )}
                        <span>{m.personal_best_count} PB{m.personal_best_count === 1 ? "" : "s"}</span>
                        <span>Active {timeAgo(m.last_active)}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
                          aria-label="Options"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/squad/vs/$memberId" params={{ memberId: m.member_user_id }}>
                            <Swords className="mr-2 h-4 w-4" /> Head-to-Head
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            if (confirm(`Remove ${m.full_name ?? "member"} from your Squad?`))
                              remove.mutate(m.member_user_id);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Remove Squad Member
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            if (confirm(`Block ${m.full_name ?? "user"}? They cannot invite you again.`))
                              block.mutate(m.member_user_id);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Ban className="mr-2 h-4 w-4" /> Block User
                        </DropdownMenuItem>
                      </DropdownMenuContent>

                    </DropdownMenu>
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="championship" className="mt-4">
            <ChampionshipTab />
          </TabsContent>

          <TabsContent value="ladders" className="mt-4">
            <LaddersHubTab />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <SquadActivityTab />
          </TabsContent>

          <TabsContent value="records" className="mt-4">
            <SquadRecordsTab />
          </TabsContent>

          <TabsContent value="alerts" className="mt-4">
            <SquadAlertsTab />
          </TabsContent>



          <TabsContent value="invites" className="mt-4 space-y-4">
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Incoming ({incoming.length})
              </h3>
              {incoming.length === 0 ? (
                <p className="rounded-xl bg-card p-4 text-center text-xs text-muted-foreground bt-shadow-card">
                  No pending invites.
                </p>
              ) : (
                <div className="space-y-2">
                  {incoming.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 bt-shadow-card">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {initials(i.other_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{i.other_name ?? "Unnamed"}</p>
                        {i.other_club && (
                          <p className="truncate text-[11px] text-muted-foreground">{i.other_club}</p>
                        )}
                      </div>
                      <button
                        onClick={() => respond.mutate({ id: i.id, accept: false })}
                        className="rounded-lg bg-secondary p-2 text-charcoal"
                        aria-label="Decline"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => respond.mutate({ id: i.id, accept: true })}
                        className="rounded-lg bg-primary p-2 text-primary-foreground"
                        aria-label="Accept"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Outgoing ({outgoing.length})
              </h3>
              {outgoing.length === 0 ? (
                <p className="rounded-xl bg-card p-4 text-center text-xs text-muted-foreground bt-shadow-card">
                  No outgoing invites.
                </p>
              ) : (
                <div className="space-y-2">
                  {outgoing.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 bt-shadow-card">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {initials(i.other_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{i.other_name ?? "Unnamed"}</p>
                        <p className="text-[11px] text-muted-foreground">Waiting for response…</p>
                      </div>
                      <button
                        onClick={() => cancel.mutate(i.id)}
                        className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-charcoal"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </main>

      <AddSquadMemberDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

function AddSquadMemberDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");

  const results = useQuery({
    queryKey: ["squad-search", query],
    enabled: open && query.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("search_squad_candidates", {
        _query: query.trim(),
      });
      if (error) throw error;
      return data as Array<{
        user_id: string;
        full_name: string | null;
        club: string | null;
        invite_status: string;
      }>;
    },
  });

  const invite = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase as any).rpc("send_squad_invite", { _to_user: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invite sent");
      qc.invalidateQueries({ queryKey: ["squad-search"] });
      qc.invalidateQueries({ queryKey: ["squad-invites"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not send invite"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Squad Member</DialogTitle>
          <DialogDescription>Search by name to invite a bowler to your Squad.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="h-12 rounded-xl pl-10"
            />
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {query.trim().length < 2 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Type at least 2 characters to search.
              </p>
            ) : results.isLoading ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Searching…</p>
            ) : (results.data ?? []).length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No bowlers found.
              </p>
            ) : (
              results.data!.map((r) => {
                const isMember = r.invite_status === "member";
                const isPending = r.invite_status === "pending";
                return (
                  <div
                    key={r.user_id}
                    className="flex items-center gap-3 rounded-xl bg-secondary/40 p-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {initials(r.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{r.full_name ?? "Unnamed"}</p>
                      {r.club && (
                        <p className="truncate text-[11px] text-muted-foreground">{r.club}</p>
                      )}
                    </div>
                    {isMember ? (
                      <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                        In Squad
                      </span>
                    ) : isPending ? (
                      <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                        Pending
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => invite.mutate(r.user_id)}
                        disabled={invite.isPending}
                        className="h-9 rounded-lg text-xs font-bold"
                      >
                        Invite to My Squad
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SquadActivityTab() {
  const q = useQuery({
    queryKey: ["squad-meaningful-activity", 30],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("squad_meaningful_activity", { _limit: 30 });
      if (error) throw error;
      return (data ?? []) as Array<{
        event_type: string;
        user_id: string;
        full_name: string | null;
        challenge_id: string;
        challenge_name: string | null;
        score: number | null;
        occurred_at: string;
      }>;
    },
  });

  if (q.isLoading) return <p className="text-center text-sm text-muted-foreground">Loading…</p>;
  const items = q.data ?? [];
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center bt-shadow-card">
        <p className="text-sm font-semibold">No recent achievements</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Personal bests, Platinum badges and champion moments show up here.
        </p>
      </div>
    );
  }
  const eventEmoji = (t: string) =>
    t === "platinum_earned" ? "💎" : t === "personal_best" ? "🏅" : "🏆";
  const eventLabel = (t: string) =>
    t === "platinum_earned" ? "earned Platinum in" : "hit a new personal best in";
  return (
    <div className="space-y-2">
      {items.map((a, i) => (
        <div
          key={`${a.event_type}-${a.user_id}-${a.challenge_id}-${i}`}
          className="flex items-center gap-3 rounded-2xl bg-card p-3 bt-shadow-card"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg">
            {eventEmoji(a.event_type)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <span className="font-bold">{a.full_name ?? "Someone"}</span>{" "}
              {eventLabel(a.event_type)}{" "}
              <span className="font-semibold">{a.challenge_name ?? "—"}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">{timeAgo(a.occurred_at)}</p>
          </div>
          {a.score != null && (
            <p className="shrink-0 font-display text-lg font-extrabold text-primary">
              {Math.round(Number(a.score))}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function LaddersHubTab() {
  const q = useQuery({
    queryKey: ["challenges-for-ladders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("challenges")
        .select("id, slug, name, category, sort_order")
        .order("sort_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; slug: string; name: string; category: string | null }>;
    },
  });
  const rows = q.data ?? [];
  if (q.isLoading) return <p className="text-center text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0)
    return <p className="text-center text-sm text-muted-foreground">No challenges yet.</p>;
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-muted-foreground">
        Every challenge has its own ladder. Tap to open and take on the leader.
      </p>
      {rows.map((c) => (
        <Link
          key={c.id}
          to="/squad/ladder/$slug"
          params={{ slug: c.slug }}
          className="flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left bt-shadow-card active:scale-[0.99] transition cursor-pointer"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{c.name}</p>
            {c.category && (
              <p className="truncate text-[11px] text-muted-foreground">{c.category}</p>
            )}
          </div>
          <p className="shrink-0 text-xs font-bold text-primary">Open →</p>
        </Link>
      ))}
    </div>
  );
}

function SquadRecordsTab() {
  const q = useQuery({
    queryKey: ["squad-records"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("squad_records");
      if (error) throw error;
      return (data ?? []) as Array<{
        challenge_id: string;
        challenge_slug: string;
        challenge_name: string;
        holder_user_id: string | null;
        holder_name: string | null;
        best_score: number | null;
        date_achieved: string | null;
        is_self: boolean;
      }>;
    },
  });

  if (q.isLoading) return <p className="text-center text-sm text-muted-foreground">Loading…</p>;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return <p className="text-center text-sm text-muted-foreground">No challenges yet.</p>;
  }
  return (
    <div className="space-y-4">
      <SquadExtraRecords />
      <div className="space-y-2">
        <h3 className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Challenge Records
        </h3>
        {rows.map((r) => (
          <Link
            key={r.challenge_id}
            to="/squad/ladder/$slug"
            params={{ slug: r.challenge_slug }}
            className="flex items-center gap-3 rounded-2xl bg-card p-3 bt-shadow-card active:scale-[0.99] transition"
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${r.is_self ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
              <Award className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{r.challenge_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.best_score != null ? (
                  <>
                    Held by <span className="font-semibold">{r.is_self ? "you" : r.holder_name ?? "—"}</span>
                  </>
                ) : (
                  "No record yet"
                )}
              </p>
            </div>
            <p className="shrink-0 font-display text-lg font-extrabold text-primary">
              {r.best_score != null ? Math.round(Number(r.best_score)) : "—"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

const EXTRA_RECORD_META: Record<string, { label: string; emoji: string; format: (v: number) => string }> = {
  highest_bsi:   { label: "Highest BSI",    emoji: "📈", format: (v) => `${Math.round(v)}` },
  most_platinum: { label: "Most Platinum",  emoji: "💎", format: (v) => `${Math.round(v)}` },
  most_pbs:      { label: "Most PBs",       emoji: "🏅", format: (v) => `${Math.round(v)}` },
  most_improved: { label: "Most Improved",  emoji: "🚀", format: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) },
};

function SquadExtraRecords() {
  const q = useQuery({
    queryKey: ["squad-extra-records"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("squad_extra_records");
      if (error) throw error;
      return (data ?? []) as Array<{
        category: string;
        holder_user_id: string | null;
        holder_name: string | null;
        value: number | null;
        meta: string | null;
      }>;
    },
  });
  const rows = q.data ?? [];
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Squad Records
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((r) => {
          const meta = EXTRA_RECORD_META[r.category];
          if (!meta || r.value == null) return null;
          return (
            <div key={r.category} className="rounded-2xl bg-card p-3 bt-shadow-card">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {meta.emoji} {meta.label}
              </p>
              <p className="mt-1 font-display text-2xl font-extrabold text-primary">
                {meta.format(Number(r.value))}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {r.holder_name ?? "—"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SquadAlertsTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["squad-alerts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_squad_notifications", { _limit: 30 });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        type: string;
        message: string;
        read: boolean;
        created_at: string;
      }>;
    },
  });

  useEffect(() => {
    (supabase as any).rpc("mark_squad_notifications_read").then(() => {
      qc.invalidateQueries({ queryKey: ["squad-unread"] });
    });
  }, [qc]);

  if (q.isLoading) return <p className="text-center text-sm text-muted-foreground">Loading…</p>;
  const items = q.data ?? [];
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center bt-shadow-card">
        <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold">No alerts</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You'll be notified when someone invites you or accepts your invite.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((n) => (
        <div
          key={n.id}
          className={`flex items-start gap-3 rounded-2xl p-3 bt-shadow-card ${n.read ? "bg-card" : "bg-primary/5 ring-1 ring-primary/20"}`}
        >
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">{n.message}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}


function ChallengeOfTheWeekBanner() {
  const q = useQuery({
    queryKey: ["cow-current"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("current_challenge_of_the_week");
      if (error) throw error;
      return (data?.[0] ?? null) as
        | { challenge_id: string; challenge_slug: string; challenge_name: string; week_start: string }
        | null;
    },
  });
  if (!q.data) return null;
  return (
    <Link
      to="/challenge/$slug"
      params={{ slug: q.data.challenge_slug }}
      className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-4 text-primary-foreground bt-shadow-card active:scale-[0.99] transition"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
        <Flame className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Challenge of the Week</p>
        <p className="truncate font-display text-lg font-extrabold leading-tight">{q.data.challenge_name}</p>
        <p className="mt-0.5 text-[11px] opacity-80">Win it for +3 championship points</p>
      </div>
    </Link>
  );
}

function ChampionshipTab() {
  const season = useQuery({
    queryKey: ["current-season"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("current_season");
      if (error) throw error;
      return (data?.[0] ?? null) as
        | { season_year: number; quarter: number; start_date: string; end_date: string }
        | null;
    },
  });
  const board = useQuery({
    queryKey: ["squad-championship"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("squad_championship_leaderboard");
      if (error) throw error;
      return (data ?? []) as Array<{
        user_id: string;
        full_name: string | null;
        club: string | null;
        badge_points: number;
        pb_points: number;
        cow_wins: number;
        total_points: number;
        is_self: boolean;
      }>;
    },
  });

  if (board.isLoading) return <p className="text-center text-sm text-muted-foreground">Loading…</p>;
  const rows = board.data ?? [];

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card p-4 bt-shadow-card">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Season {season.data ? `Q${season.data.quarter} ${season.data.season_year}` : "—"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Bronze 1 · Silver 2 · Gold 3 · Platinum 5 · PB +1 · Challenge of the Week win +3
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground bt-shadow-card">
          Play challenges this quarter to earn points.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={r.user_id}
              className={`flex items-center gap-3 rounded-2xl p-3 bt-shadow-card ${r.is_self ? "bg-primary/5 ring-1 ring-primary/30" : "bg-card"}`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-sm font-extrabold ${i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
                {i === 0 ? <Crown className="h-5 w-5" /> : i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {r.is_self ? "You" : r.full_name ?? "Unnamed"}
                  {i === 0 && (
                    <span className="ml-1 text-[10px] font-bold text-primary">
                      👑 Squad Leader
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {r.badge_points} badge · {r.pb_points} PB · {r.cow_wins} CoW
                </p>
              </div>
              <p className="shrink-0 font-display text-xl font-extrabold text-primary">
                {r.total_points}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
