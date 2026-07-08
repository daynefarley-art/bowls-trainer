import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getAdminUsers, type AdminUser } from "@/lib/admin.functions";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BSI_LEVELS,
  bsiLevel,
  overallBSI,
  type Drill,
  type Result,
} from "@/lib/bowls";
import { Download, Users, Activity, Dumbbell, TrendingUp, Star, Trophy, Mail, ShieldCheck, Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const getAdminUsersFn = useServerFn(getAdminUsers);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [joinedFilter, setJoinedFilter] = useState<string>("all");

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
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
    queryKey: ["admin-results"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Result[];
    },
  });

  const now = Date.now();
  const day30 = 30 * 86_400_000;

  // Per-user stats
  const userStats = useMemo(() => {
    const byUser = new Map<string, Result[]>();
    for (const r of results) {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r);
      byUser.set(r.user_id, arr);
    }
    return users.map((u) => {
      const rs = byUser.get(u.id) ?? [];
      const bsi = overallBSI(rs, drills);
      const lastResultAt = rs[0]?.played_at ?? null;
      const lastActive = [u.last_sign_in_at, lastResultAt].filter(Boolean).sort().pop() ?? null;
      return {
        ...u,
        bsi,
        level: bsiLevel(bsi).label,
        sessions: rs.length,
        lastActive,
      };
    });
  }, [users, results, drills]);

  // Overview
  const totalUsers = users.length;
  const activeUsers = userStats.filter(
    (u) => u.lastActive && now - new Date(u.lastActive).getTime() <= day30,
  ).length;
  const totalSessions = results.length;
  const avgBSI = useMemo(() => {
    const xs = userStats.filter((u) => u.sessions > 0).map((u) => u.bsi);
    if (!xs.length) return 0;
    return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  }, [userStats]);

  const mostPopularDrill = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of results) counts.set(r.drill_id, (counts.get(r.drill_id) ?? 0) + 1);
    let best: { id: string; count: number } | null = null;
    for (const [id, count] of counts) {
      if (!best || count > best.count) best = { id, count };
    }
    if (!best) return "—";
    return drills.find((d) => d.id === best!.id)?.name ?? "—";
  }, [results, drills]);

  const fastestImprover = useMemo(() => {
    let best: { name: string; change: number } | null = null;
    for (const u of userStats) {
      const rs = results.filter((r) => r.user_id === u.id);
      if (rs.length < 4) continue;
      const recent = rs.filter((r) => now - new Date(r.played_at).getTime() <= day30);
      if (!recent.length) continue;
      const recentBSI = overallBSI(recent, drills);
      const allBSI = overallBSI(rs, drills);
      const change = recentBSI - allBSI;
      if (!best || change > best.change) {
        best = { name: u.full_name ?? u.email ?? "—", change };
      }
    }
    return best ? `${best.name} (+${best.change.toFixed(1)})` : "—";
  }, [userStats, results, drills, now]);

  // Filters
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return userStats.filter((u) => {
      if (q) {
        const hay = `${u.full_name ?? ""} ${u.email ?? ""} ${u.club ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (levelFilter !== "all" && u.level !== levelFilter) return false;
      if (activeFilter !== "all") {
        const isActive = !!u.lastActive && now - new Date(u.lastActive).getTime() <= day30;
        if (activeFilter === "active" && !isActive) return false;
        if (activeFilter === "inactive" && isActive) return false;
      }
      if (joinedFilter !== "all" && u.created_at) {
        const age = now - new Date(u.created_at).getTime();
        if (joinedFilter === "7d" && age > 7 * 86_400_000) return false;
        if (joinedFilter === "30d" && age > 30 * 86_400_000) return false;
        if (joinedFilter === "90d" && age > 90 * 86_400_000) return false;
      }
      return true;
    });
  }, [userStats, search, levelFilter, activeFilter, joinedFilter, now]);

  function exportCSV(rows: typeof filtered, filename: string) {
    const headers = ["Name", "Email", "Club", "BSI", "Level", "Sessions", "Date Joined", "Last Active"];
    const lines = [headers.join(",")];
    for (const u of rows) {
      const vals = [
        u.full_name ?? "",
        u.email ?? "",
        u.club ?? "",
        u.bsi.toFixed(1),
        u.level,
        String(u.sessions),
        u.created_at ?? "",
        u.lastActive ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(vals.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Admin Dashboard" subtitle="Manage users & view stats" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        {/* Overview Cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Users} label="Total Users" value={totalUsers} />
          <StatCard icon={Activity} label="Active 30d" value={activeUsers} />
          <StatCard icon={Dumbbell} label="Sessions" value={totalSessions} />
          <StatCard icon={TrendingUp} label="Avg BSI" value={avgBSI.toFixed(1)} />
          <StatCard icon={Star} label="Popular Drill" value={mostPopularDrill} small />
          <StatCard icon={Trophy} label="Fastest ↑" value={fastestImprover} small />
        </div>

        <Link
          to="/admin/analytics"
          className="block rounded-2xl bg-card p-4 bt-shadow-elevated active:scale-[0.99] transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">App Analytics</p>
              <p className="mt-1 font-display text-lg font-extrabold">View charts & trends →</p>
            </div>
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
        </Link>

        <Link
          to="/admin/user-management"
          className="block rounded-2xl bg-card p-4 bt-shadow-elevated active:scale-[0.99] transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">User Management</p>
              <p className="mt-1 font-display text-lg font-extrabold">Roles, status &amp; access →</p>
            </div>
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
        </Link>

        <Link
          to="/admin/invitations"
          className="block rounded-2xl bg-card p-4 bt-shadow-elevated active:scale-[0.99] transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Invitations</p>
              <p className="mt-1 font-display text-lg font-extrabold">Manage private beta access →</p>
            </div>
            <Mail className="h-8 w-8 text-primary" />
          </div>
        </Link>

        <Link
          to="/admin/dev"
          className="block rounded-2xl bg-card p-4 bt-shadow-elevated active:scale-[0.99] transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Developer Dashboard</p>
              <p className="mt-1 font-display text-lg font-extrabold">Inspect testers &amp; replay sessions →</p>
            </div>
            <Wrench className="h-8 w-8 text-primary" />
          </div>
        </Link>

        {/* Filters */}
        <div className="space-y-2 rounded-2xl bg-card p-4 bt-shadow-elevated">
          <Input
            placeholder="Search name, email, club…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid grid-cols-3 gap-2">
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger><SelectValue placeholder="Level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                {BSI_LEVELS.map((l) => (
                  <SelectItem key={l.label} value={l.label}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger><SelectValue placeholder="Activity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={joinedFilter} onValueChange={setJoinedFilter}>
              <SelectTrigger><SelectValue placeholder="Joined" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => exportCSV(userStats, "all-users.csv")}>
              <Download className="mr-1 h-4 w-4" /> All
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => exportCSV(filtered, "filtered-users.csv")}>
              <Download className="mr-1 h-4 w-4" /> Filtered
            </Button>
          </div>
        </div>

        {/* User List */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Users ({filtered.length})
          </p>
          {filtered.map((u) => (
            <Link
              key={u.id}
              to="/admin/users/$userId"
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
                  <p className="text-[10px] uppercase text-muted-foreground">{u.level}</p>
                  <p className="text-[10px] text-muted-foreground">{u.sessions} sess.</p>
                </div>
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>Joined {fmtDate(u.created_at)}</span>
                <span>Last {fmtDate(u.lastActive)}</span>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
              No users match your filters.
            </p>
          )}
        </div>
      </main>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  small,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-card p-3 bt-shadow-elevated">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className={`mt-1 font-display font-extrabold ${small ? "text-sm" : "text-2xl"}`}>{value}</p>
    </div>
  );
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}
