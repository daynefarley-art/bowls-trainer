import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getAdminUser } from "@/lib/admin.functions";
import { PageHeader } from "@/components/bowls/PageHeader";
import { BSIBadge } from "@/components/bowls/BSIBadge";
import {
  bsiInWindow,
  categoryScores,
  CATEGORY_LABELS,
  overallBSI,
  personalBestBSI,
  type CategoryKey,
  type Drill,
  type Result,
} from "@/lib/bowls";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  component: UserDetail,
});

function UserDetail() {
  const { userId } = Route.useParams();
  const getAdminUserFn = useServerFn(getAdminUser);

  const { data: user } = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => getAdminUserFn({ data: { userId } }),
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
    queryKey: ["admin-user-results", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("user_id", userId)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Result[];
    },
  });

  const allTime = overallBSI(results, drills);
  const bsi30 = bsiInWindow(results, drills, 30);
  const bsi90 = bsiInWindow(results, drills, 90);
  const pb = personalBestBSI(results);
  const cats = categoryScores(results, drills);

  const drillCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of results) c.set(r.drill_id, (c.get(r.drill_id) ?? 0) + 1);
    return c;
  }, [results]);
  const mostCompleted = useMemo(() => {
    let best: { id: string; n: number } | null = null;
    for (const [id, n] of drillCounts) if (!best || n > best.n) best = { id, n };
    return best ? drills.find((d) => d.id === best!.id)?.name ?? "—" : "—";
  }, [drillCounts, drills]);

  const catList = (Object.keys(CATEGORY_LABELS) as CategoryKey[])
    .map((k) => ({ key: k, ...cats[k] }))
    .filter((c) => c.score != null) as { key: CategoryKey; score: number; label: string }[];
  const strongest = catList.length ? [...catList].sort((a, b) => b.score - a.score)[0].label : "—";
  const weakest = catList.length ? [...catList].sort((a, b) => a.score - b.score)[0].label : "—";

  // BSI history: per-result running BSI
  const history = useMemo(() => {
    const sorted = [...results].sort(
      (a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime(),
    );
    const acc: Result[] = [];
    return sorted.map((r) => {
      acc.push(r);
      return { date: r.played_at, bsi: overallBSI(acc, drills) };
    });
  }, [results, drills]);

  const personalBests = useMemo(() => {
    const best = new Map<string, Result>();
    for (const r of results) {
      const cur = best.get(r.drill_id);
      if (!cur || Number(r.percentage ?? 0) > Number(cur.percentage ?? 0)) best.set(r.drill_id, r);
    }
    return Array.from(best.values());
  }, [results]);

  return (
    <>
      <PageHeader
        title={user?.full_name ?? "User"}
        subtitle={user?.email ?? ""}
        action={
          <Link to="/admin" className="rounded-full bg-white/20 p-2 text-white">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        }
      />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        {/* Profile */}
        <Section title="Profile">
          <Row label="Name" value={user?.full_name ?? "—"} />
          <Row label="Email" value={user?.email ?? "—"} />
          <Row label="Club" value={user?.club ?? "—"} />
          <Row label="Joined" value={fmt(user?.created_at)} />
          <Row label="Last sign-in" value={fmt(user?.last_sign_in_at)} />
        </Section>

        <RoleManager userId={userId} />


        {/* Performance */}
        <Section title="Performance">
          <div className="flex items-center gap-4">
            <BSIBadge bsi={allTime} size="md" />
            <div className="grid flex-1 grid-cols-2 gap-2 text-xs">
              <Stat label="All-Time" v={allTime.toFixed(1)} />
              <Stat label="30 Day" v={bsi30?.toFixed(1) ?? "—"} />
              <Stat label="90 Day" v={bsi90?.toFixed(1) ?? "—"} />
              <Stat label="PB" v={pb?.toFixed(1) ?? "—"} />
            </div>
          </div>
        </Section>

        {/* Training */}
        <Section title="Training">
          <Row label="Total Sessions" value={String(results.length)} />
          <Row label="Total Drill Results" value={String(results.length)} />
          <Row label="Most Completed" value={mostCompleted} />
          <Row label="Strongest" value={strongest} />
          <Row label="Weakest" value={weakest} />
        </Section>

        {/* BSI History */}
        <Section title="BSI History">
          {history.length ? (
            <Sparkline points={history.map((h) => h.bsi)} />
          ) : (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          )}
        </Section>

        {/* Recent Results */}
        <Section title="Recent Results">
          {results.slice(0, 5).map((r) => (
            <div key={r.id} className="flex justify-between border-b border-border py-1 text-sm last:border-0">
              <span className="truncate">{r.drill_name ?? "—"}</span>
              <span className="text-muted-foreground">
                {r.score}/{r.max_score} · {fmt(r.played_at)}
              </span>
            </div>
          ))}
          {!results.length && <p className="text-sm text-muted-foreground">No results.</p>}
        </Section>

        {/* Personal Bests */}
        <Section title="Personal Bests">
          {personalBests.map((r) => (
            <div key={r.id} className="flex justify-between border-b border-border py-1 text-sm last:border-0">
              <span className="truncate">{r.drill_name ?? "—"}</span>
              <span className="font-semibold">{Number(r.percentage ?? 0).toFixed(1)}%</span>
            </div>
          ))}
          {!personalBests.length && <p className="text-sm text-muted-foreground">No bests yet.</p>}
        </Section>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-4 bt-shadow-elevated">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-lg bg-muted px-2 py-1">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-display text-base font-extrabold">{v}</p>
    </div>
  );
}
function fmt(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}
function Sparkline({ points }: { points: number[] }) {
  if (!points.length) return null;
  const w = 280;
  const h = 60;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} className="text-primary" />
    </svg>
  );
}

function RoleManager({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery({
    queryKey: ["admin-user-roles", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as "admin" | "coach" | "player");
    },
  });

  async function toggle(role: "coach" | "admin", on: boolean) {
    if (on) {
      const { error } = await supabase.rpc("admin_set_user_role", { _user_id: userId, _role: role });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.rpc("admin_remove_user_role", { _user_id: userId, _role: role });
      if (error) return toast.error(error.message);
    }
    toast.success("Role updated");
    qc.invalidateQueries({ queryKey: ["admin-user-roles", userId] });
  }

  return (
    <Section title="Roles">
      <div className="space-y-2">
        <RoleRow label="Coach" checked={roles.includes("coach")} onChange={(v) => toggle("coach", v)} />
        <RoleRow label="Admin" checked={roles.includes("admin")} onChange={(v) => toggle("admin", v)} />
        <p className="text-xs text-muted-foreground">All users are players by default.</p>
      </div>
    </Section>
  );
}

function RoleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-sm">
      <span className="font-semibold">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}
