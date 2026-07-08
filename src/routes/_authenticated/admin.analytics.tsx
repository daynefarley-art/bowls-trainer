import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getAdminUsers } from "@/lib/admin.functions";
import { PageHeader } from "@/components/bowls/PageHeader";
import { overallBSI, type Drill, type Result } from "@/lib/bowls";
import { ChevronLeft, Users, UserPlus, Dumbbell, CalendarDays, Activity, TrendingUp, Star, Snowflake } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const getAdminUsersFn = useServerFn(getAdminUsers);

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
        .order("played_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Result[];
    },
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const day30 = 30 * 86_400_000;

  const stats = useMemo(() => {
    const newUsersThisMonth = users.filter(
      (u) => u.created_at && new Date(u.created_at).getTime() >= monthStart,
    ).length;

    // active users = users with a result or sign-in in last 30d
    const lastActiveByUser = new Map<string, number>();
    for (const u of users) {
      if (u.last_sign_in_at) lastActiveByUser.set(u.id, new Date(u.last_sign_in_at).getTime());
    }
    for (const r of results) {
      const t = new Date(r.played_at).getTime();
      const cur = lastActiveByUser.get(r.user_id) ?? 0;
      if (t > cur) lastActiveByUser.set(r.user_id, t);
    }
    const activeUsers = Array.from(lastActiveByUser.values()).filter((t) => now.getTime() - t <= day30).length;

    const totalResults = results.length;
    const resultsThisMonth = results.filter((r) => new Date(r.played_at).getTime() >= monthStart).length;

    const sessionsByUser = new Map<string, number>();
    for (const r of results) sessionsByUser.set(r.user_id, (sessionsByUser.get(r.user_id) ?? 0) + 1);
    const avgSessions = sessionsByUser.size ? totalResults / sessionsByUser.size : 0;

    // avg BSI per user
    const bsiByUser: number[] = [];
    for (const [uid] of sessionsByUser) {
      const rs = results.filter((r) => r.user_id === uid);
      bsiByUser.push(overallBSI(rs, drills));
    }
    const avgBSI = bsiByUser.length ? bsiByUser.reduce((a, b) => a + b, 0) / bsiByUser.length : 0;

    const drillCounts = new Map<string, number>();
    for (const r of results) drillCounts.set(r.drill_id, (drillCounts.get(r.drill_id) ?? 0) + 1);
    let mostId: string | null = null;
    let leastId: string | null = null;
    let mostN = -1;
    let leastN = Infinity;
    for (const d of drills) {
      const n = drillCounts.get(d.id) ?? 0;
      if (n > mostN) { mostN = n; mostId = d.id; }
      if (n < leastN) { leastN = n; leastId = d.id; }
    }
    const mostPopularDrill = drills.find((d) => d.id === mostId)?.name ?? "—";
    const leastUsedDrill = drills.find((d) => d.id === leastId)?.name ?? "—";

    return {
      newUsersThisMonth,
      activeUsers,
      totalResults,
      resultsThisMonth,
      avgSessions: Math.round(avgSessions * 10) / 10,
      avgBSI: Math.round(avgBSI * 10) / 10,
      mostPopularDrill,
      leastUsedDrill,
    };
  }, [users, results, drills, monthStart, now]);

  // Chart data: by month (last 12 months)
  const chartData = useMemo(() => {
    const months: { key: string; label: string; start: number; end: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString(undefined, { month: "short" }),
        start: d.getTime(),
        end: next.getTime(),
      });
    }

    let cumUsers = 0;
    const userCreated = users
      .map((u) => (u.created_at ? new Date(u.created_at).getTime() : null))
      .filter((t): t is number => t != null)
      .sort((a, b) => a - b);
    // count users created before first month start as initial
    const firstStart = months[0].start;
    cumUsers = userCreated.filter((t) => t < firstStart).length;

    return months.map((m) => {
      const newInMonth = userCreated.filter((t) => t >= m.start && t < m.end).length;
      cumUsers += newInMonth;
      const monthResults = results.filter((r) => {
        const t = new Date(r.played_at).getTime();
        return t >= m.start && t < m.end;
      });
      const cumulativeResults = results.filter((r) => new Date(r.played_at).getTime() < m.end);
      const avgBSIForMonth = cumulativeResults.length
        ? overallBSI(cumulativeResults, drills)
        : 0;
      return {
        month: m.label,
        users: cumUsers,
        sessions: monthResults.length,
        avgBSI: Math.round(avgBSIForMonth * 10) / 10,
      };
    });
  }, [users, results, drills, now]);

  return (
    <>
      <PageHeader
        title="App Analytics"
        subtitle="Usage & performance"
        action={
          <Link to="/admin" className="rounded-full bg-white/20 p-2 text-white">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        }
      />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={UserPlus} label="New Users (mo)" value={stats.newUsersThisMonth} />
          <Stat icon={Users} label="Active Users (mo)" value={stats.activeUsers} />
          <Stat icon={Dumbbell} label="Total Results" value={stats.totalResults} />
          <Stat icon={CalendarDays} label="Results (mo)" value={stats.resultsThisMonth} />
          <Stat icon={Activity} label="Avg Sessions / User" value={stats.avgSessions} />
          <Stat icon={TrendingUp} label="Avg BSI" value={stats.avgBSI.toFixed(1)} />
          <Stat icon={Star} label="Most Popular" value={stats.mostPopularDrill} small />
          <Stat icon={Snowflake} label="Least Used" value={stats.leastUsedDrill} small />
        </div>

        <ChartCard title="User Growth (12 mo)">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="users" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sessions per Month">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="sessions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Average BSI Trend">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="avgBSI" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </main>
    </>
  );
}

function Stat({
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

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-4 bt-shadow-elevated">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}
