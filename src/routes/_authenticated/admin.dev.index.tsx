import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getAdminUsers } from "@/lib/admin.functions";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { overallBSI, type Drill, type Result } from "@/lib/bowls";
import { Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dev/")({
  component: DevDashboard,
});

type ChallengeRow = { user_id: string; played_at: string };
type SessionRow = { user_id: string; session_started_at: string | null };

const DAY = 86_400_000;
type FilterKey = "all" | "today" | "week" | "no_sessions" | "never_returned" | "most_active" | "highest_bsi" | "newest";

function DevDashboard() {
  const getAdminUsersFn = useServerFn(getAdminUsers);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data: users = [] } = useQuery({
    queryKey: ["dev-users"],
    queryFn: getAdminUsersFn,
  });

  const { data: drills = [] } = useQuery({
    queryKey: ["drills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drills").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Drill[];
    },
  });

  const { data: results = [] } = useQuery({
    queryKey: ["dev-all-results"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("id,user_id,drill_id,percentage,bsi,played_at");
      if (error) throw error;
      return (data ?? []) as unknown as Pick<Result, "id" | "user_id" | "drill_id" | "percentage" | "bsi" | "played_at">[];
    },
  });

  const { data: challenges = [] } = useQuery({
    queryKey: ["dev-all-challenges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("challenge_results")
        .select("user_id,played_at");
      if (error) throw error;
      return (data ?? []) as ChallengeRow[];
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["dev-all-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_sessions")
        .select("user_id,session_started_at");
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const now = Date.now();

  const stats = useMemo(() => {
    const map = new Map<string, {
      results: typeof results;
      challenges: number;
      sessions: number;
      lastResult: number;
    }>();
    for (const r of results) {
      const s = map.get(r.user_id) ?? { results: [], challenges: 0, sessions: 0, lastResult: 0 };
      s.results.push(r);
      const t = new Date(r.played_at).getTime();
      if (t > s.lastResult) s.lastResult = t;
      map.set(r.user_id, s);
    }
    for (const c of challenges) {
      const s = map.get(c.user_id) ?? { results: [], challenges: 0, sessions: 0, lastResult: 0 };
      s.challenges += 1;
      const t = new Date(c.played_at).getTime();
      if (t > s.lastResult) s.lastResult = t;
      map.set(c.user_id, s);
    }
    for (const ss of sessions) {
      const st = map.get(ss.user_id) ?? { results: [], challenges: 0, sessions: 0, lastResult: 0 };
      st.sessions += 1;
      map.set(ss.user_id, st);
    }
    return users.map((u) => {
      const s = map.get(u.id) ?? { results: [], challenges: 0, sessions: 0, lastResult: 0 };
      const bsi = overallBSI(s.results, drills);
      const lastActive = Math.max(
        u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0,
        s.lastResult,
      );
      return {
        ...u,
        bsi,
        sessions: s.sessions,
        drills: s.results.length,
        challenges: s.challenges,
        lastActive: lastActive || null,
      };
    });
  }, [users, results, challenges, sessions, drills]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = stats.filter((u) => {
      if (!q) return true;
      const hay = `${u.full_name ?? ""} ${u.email ?? ""} ${u.club ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    switch (filter) {
      case "today":
        list = list.filter((u) => u.lastActive && now - u.lastActive <= DAY);
        break;
      case "week":
        list = list.filter((u) => u.lastActive && now - u.lastActive <= 7 * DAY);
        break;
      case "no_sessions":
        list = list.filter((u) => u.sessions === 0 && u.drills === 0 && u.challenges === 0);
        break;
      case "never_returned": {
        // signed up but only one sign-in OR no activity after first day
        list = list.filter((u) => {
          if (!u.created_at) return false;
          const created = new Date(u.created_at).getTime();
          const last = u.lastActive ?? 0;
          return last - created <= DAY;
        });
        break;
      }
      case "most_active":
        list = [...list].sort((a, b) => (b.sessions + b.drills + b.challenges) - (a.sessions + a.drills + a.challenges));
        break;
      case "highest_bsi":
        list = [...list].sort((a, b) => b.bsi - a.bsi);
        break;
      case "newest":
        list = [...list].sort((a, b) => (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0));
        break;
    }
    return list;
  }, [stats, search, filter, now]);

  return (
    <>
      <PageHeader title="Developer Dashboard" subtitle="Beta review & debugging tools" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <div className="rounded-2xl bg-card p-4 bt-shadow-elevated">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Wrench className="h-3 w-3" /> Beta tools — admin only
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Inspect any user&rsquo;s sessions, drills, challenges &amp; BSI. Replay visual scoring bowl-by-bowl.
          </p>
        </div>

        <div className="space-y-2 rounded-2xl bg-card p-4 bt-shadow-elevated">
          <Input placeholder="Search name, email, club…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              <SelectItem value="today">Active today</SelectItem>
              <SelectItem value="week">Active this week</SelectItem>
              <SelectItem value="no_sessions">No sessions</SelectItem>
              <SelectItem value="never_returned">Never returned</SelectItem>
              <SelectItem value="most_active">Most active</SelectItem>
              <SelectItem value="highest_bsi">Highest BSI</SelectItem>
              <SelectItem value="newest">Newest users</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Users ({filtered.length})</p>
          {filtered.map((u) => (
            <Link
              key={u.id}
              to="/admin/dev/users/$userId"
              params={{ userId: u.id }}
              className="block rounded-2xl bg-card p-4 bt-shadow-elevated active:scale-[0.99] transition"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{u.full_name ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email ?? ""}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.club ?? "No club"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-lg font-extrabold">{u.bsi.toFixed(1)}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">BSI</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                <span className="rounded bg-secondary py-1"><b>{u.sessions}</b> sess</span>
                <span className="rounded bg-secondary py-1"><b>{u.drills}</b> drills</span>
                <span className="rounded bg-secondary py-1"><b>{u.challenges}</b> chal</span>
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>Joined {fmt(u.created_at)}</span>
                <span>Last {fmt(u.lastActive ? new Date(u.lastActive).toISOString() : null)}</span>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">No users match.</p>
          )}
        </div>
      </main>
    </>
  );
}

function fmt(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}
