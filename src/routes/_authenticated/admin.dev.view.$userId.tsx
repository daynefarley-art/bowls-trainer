import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { overallBSI, bsiLevel, type Drill, type Result } from "@/lib/bowls";
import { ChevronLeft, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dev/view/$userId")({
  component: ViewAsUser,
});

/**
 * Read-only "View as user" — renders the user's BSI, recent activity and
 * stats from the developer's account. No mutations possible; banner makes
 * the impersonation explicit.
 */
function ViewAsUser() {
  const { userId } = Route.useParams();

  const { data: user } = useQuery({
    queryKey: ["dev-view-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,club,default_club,default_green")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
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
    queryKey: ["dev-view-results", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results").select("*").eq("user_id", userId)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Result[];
    },
  });

  const { data: challenges = [] } = useQuery({
    queryKey: ["dev-view-challenges", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("challenge_results")
        .select("id,challenge_name,score,played_at")
        .eq("user_id", userId)
        .order("played_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const bsi = useMemo(() => overallBSI(results, drills), [results, drills]);
  const level = bsiLevel(bsi);

  return (
    <>
      <PageHeader title="View as User" subtitle={user?.full_name ?? "—"} />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <Link to="/admin/dev/users/$userId" params={{ userId }} className="inline-flex items-center text-xs font-semibold text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to user detail
        </Link>

        <div className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 p-3 text-xs">
          <Eye className="h-4 w-4 text-primary" />
          <p>Read-only impersonation. No data can be changed from this view.</p>
        </div>

        <div className="rounded-2xl bg-card p-5 text-center bt-shadow-elevated">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Current BSI</p>
          <p className="mt-1 font-display text-5xl font-extrabold">{bsi.toFixed(1)}</p>
          <p className="mt-1 text-sm font-semibold" style={{ color: level.color }}>{level.label}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <Stat label="Drills logged" value={results.length} />
          <Stat label="Challenges" value={challenges.length} />
          <Stat label="Club" value={user?.club ?? user?.default_club ?? "—"} />
          <Stat label="Green" value={user?.default_green ?? "—"} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent drills</p>
          {results.slice(0, 8).map((r) => (
            <div key={r.id} className="rounded-xl bg-card p-2 text-xs bt-shadow-elevated">
              <div className="flex justify-between"><b>{r.drill_name}</b><span>{r.score}/{r.max_score ?? "—"}</span></div>
              <p className="text-[10px] text-muted-foreground">{new Date(r.played_at).toLocaleString()}</p>
            </div>
          ))}
          {results.length === 0 && <Empty />}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent challenges</p>
          {challenges.map((c) => (
            <div key={c.id} className="rounded-xl bg-card p-2 text-xs bt-shadow-elevated">
              <div className="flex justify-between"><b>{c.challenge_name}</b><span>{c.score ?? "—"}</span></div>
              <p className="text-[10px] text-muted-foreground">{new Date(c.played_at).toLocaleString()}</p>
            </div>
          ))}
          {challenges.length === 0 && <Empty />}
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-card p-3 bt-shadow-elevated">
      <p className="font-display text-base font-extrabold">{value}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
function Empty() { return <p className="rounded-2xl bg-card p-4 text-center text-xs text-muted-foreground">None</p>; }
