import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import { overallBSI, type Drill, type Result } from "@/lib/bowls";
import { ChevronLeft, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dev/users/$userId")({
  component: UserDetail,
});

type Tab = "overview" | "sessions" | "drills" | "challenges" | "bsi";

type SessionRow = {
  id: string;
  user_id: string;
  session_started_at: string | null;
  session_ended_at: string | null;
  total_duration_minutes: number | null;
  status: string | null;
  notes: string | null;
  total_activities: number | null;
  drills_completed: number | null;
  challenges_completed: number | null;
};

type ChallengeRow = {
  id: string;
  challenge_name: string | null;
  category: string | null;
  score: number | null;
  played_at: string;
  session_id: string | null;
};

function UserDetail() {
  const { userId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("overview");

  const { data: user } = useQuery({
    queryKey: ["dev-user-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,club,created_at,status,default_club,default_green,default_green_type")
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
    queryKey: ["dev-user-results", userId],
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

  const { data: challenges = [] } = useQuery({
    queryKey: ["dev-user-challenges", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("challenge_results")
        .select("id,challenge_name,category,score,played_at,session_id")
        .eq("user_id", userId)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChallengeRow[];
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["dev-user-sessions", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("session_started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const bsi = useMemo(() => overallBSI(results, drills), [results, drills]);

  // BSI over time — cumulative recompute per result chronologically.
  const bsiSeries = useMemo(() => {
    const chrono = [...results].sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());
    const acc: Result[] = [];
    let prev = 0;
    return chrono.map((r) => {
      acc.push(r);
      const v = overallBSI(acc, drills);
      const change = +(v - prev).toFixed(1);
      prev = v;
      return { id: r.id, at: r.played_at, drill: r.drill_name, bsi: v, change };
    });
  }, [results, drills]);

  return (
    <>
      <PageHeader title={user?.full_name ?? "User"} subtitle={user?.club ?? "—"} />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <Link to="/admin/dev" className="inline-flex items-center text-xs font-semibold text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to users
        </Link>

        <div className="grid grid-cols-4 gap-2">
          <Stat label="BSI" value={bsi.toFixed(1)} />
          <Stat label="Sessions" value={sessions.length} />
          <Stat label="Drills" value={results.length} />
          <Stat label="Chal." value={challenges.length} />
        </div>

        <Link to="/admin/dev/view/$userId" params={{ userId }}>
          <Button className="w-full" variant="outline">
            <Eye className="mr-2 h-4 w-4" /> View as user (read-only)
          </Button>
        </Link>

        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-card p-1 bt-shadow-elevated">
          {(["overview", "sessions", "drills", "challenges", "bsi"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold uppercase ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-2 rounded-2xl bg-card p-4 bt-shadow-elevated text-sm">
            <Row k="Joined" v={fmt(user?.created_at ?? null)} />
            <Row k="Status" v={user?.status ?? "—"} />
            <Row k="Default club" v={user?.default_club ?? "—"} />
            <Row k="Default green" v={user?.default_green ?? "—"} />
            <Row k="Green type" v={user?.default_green_type ?? "—"} />
          </div>
        )}

        {tab === "sessions" && (
          <div className="space-y-2">
            {sessions.map((s) => (
              <Link
                key={s.id}
                to="/admin/dev/sessions/$sessionId"
                params={{ sessionId: s.id }}
                className="block rounded-2xl bg-card p-3 bt-shadow-elevated active:scale-[0.99] transition"
              >
                <div className="flex justify-between text-xs">
                  <span className="font-bold">{fmtDT(s.session_started_at)}</span>
                  <span className="text-muted-foreground">{s.status ?? "—"}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.total_duration_minutes ?? 0}m · {s.drills_completed ?? 0} drills · {s.challenges_completed ?? 0} chal
                </p>
              </Link>
            ))}
            {sessions.length === 0 && <Empty label="No sessions" />}
          </div>
        )}

        {tab === "drills" && (
          <div className="space-y-2">
            {results.map((r) => (
              <Link
                key={r.id}
                to="/admin/dev/results/$resultId"
                params={{ resultId: r.id }}
                className="block rounded-2xl bg-card p-3 bt-shadow-elevated active:scale-[0.99] transition"
              >
                <div className="flex justify-between text-xs">
                  <span className="font-bold">{r.drill_name ?? r.drill_id}</span>
                  <span>{r.score}/{r.max_score ?? "—"}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{fmtDT(r.played_at)} · BSI {Number(r.bsi).toFixed(1)}</p>
              </Link>
            ))}
            {results.length === 0 && <Empty label="No drills" />}
          </div>
        )}

        {tab === "challenges" && (
          <div className="space-y-2">
            {challenges.map((c) => (
              <Link
                key={c.id}
                to="/admin/dev/challenges/$resultId"
                params={{ resultId: c.id }}
                className="block rounded-2xl bg-card p-3 bt-shadow-elevated active:scale-[0.99] transition"
              >
                <div className="flex justify-between text-xs">
                  <span className="font-bold">{c.challenge_name ?? "—"}</span>
                  <span>{c.score ?? "—"}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{fmtDT(c.played_at)} · {c.category ?? ""}</p>
              </Link>
            ))}
            {challenges.length === 0 && <Empty label="No challenges" />}
          </div>
        )}

        {tab === "bsi" && (
          <div className="space-y-2">
            {bsiSeries.length === 0 && <Empty label="No BSI history" />}
            {bsiSeries.slice().reverse().map((p) => (
              <Link
                key={p.id}
                to="/admin/dev/results/$resultId"
                params={{ resultId: p.id }}
                className="block rounded-2xl bg-card p-3 bt-shadow-elevated active:scale-[0.99] transition"
              >
                <div className="flex justify-between text-xs">
                  <span className="font-bold">BSI {p.bsi.toFixed(1)}</span>
                  <span className={p.change > 0 ? "text-primary" : p.change < 0 ? "text-destructive" : "text-muted-foreground"}>
                    {p.change > 0 ? "+" : ""}{p.change}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">{fmtDT(p.at)} · {p.drill ?? "—"}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-card p-2 text-center bt-shadow-elevated">
      <p className="font-display text-lg font-extrabold">{value}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-semibold">{v}</span></div>
  );
}
function Empty({ label }: { label: string }) {
  return <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">{label}</p>;
}
function fmt(s: string | null) { return s ? new Date(s).toLocaleDateString() : "—"; }
function fmtDT(s: string | null) { return s ? new Date(s).toLocaleString() : "—"; }
