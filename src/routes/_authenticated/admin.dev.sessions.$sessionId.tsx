import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dev/sessions/$sessionId")({
  component: SessionDetail,
});

function SessionDetail() {
  const { sessionId } = Route.useParams();

  const { data: session } = useQuery({
    queryKey: ["dev-session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const { data: results = [] } = useQuery({
    queryKey: ["dev-session-results", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("id,drill_name,score,max_score,bsi,played_at,breakdown")
        .eq("session_id", sessionId)
        .order("played_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: challenges = [] } = useQuery({
    queryKey: ["dev-session-challenges", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("challenge_results")
        .select("id,challenge_name,category,score,played_at,breakdown")
        .eq("session_id", sessionId)
        .order("played_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const userId = (session?.user_id as string | undefined) ?? "";
  const conditionsList = (session?.conditions_list as string[] | null) ?? null;
  const conditionsStr = conditionsList?.join(", ") ?? (session?.conditions as string | null) ?? "—";

  return (
    <>
      <PageHeader title="Session" subtitle={fmtDT(session?.session_started_at as string | null)} />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        {userId && (
          <Link to="/admin/dev/users/$userId" params={{ userId }} className="inline-flex items-center text-xs font-semibold text-muted-foreground">
            <ChevronLeft className="h-4 w-4" /> Back to user
          </Link>
        )}

        <div className="space-y-1 rounded-2xl bg-card p-4 text-sm bt-shadow-elevated">
          <Row k="Started" v={fmtDT(session?.session_started_at as string | null)} />
          <Row k="Ended" v={fmtDT(session?.session_ended_at as string | null)} />
          <Row k="Duration" v={`${(session?.total_duration_minutes as number | null) ?? 0} min`} />
          <Row k="Status" v={(session?.status as string | null) ?? "—"} />
          <Row k="Club" v={(session?.club as string | null) ?? "—"} />
          <Row k="Green" v={(session?.green as string | null) ?? "—"} />
          <Row k="Green type" v={(session?.green_type as string | null) ?? "—"} />
          <Row k="Conditions" v={conditionsStr} />
          {(session?.notes as string | null) && (
            <p className="border-t pt-2 text-xs text-muted-foreground">{session?.notes as string}</p>
          )}
        </div>

        <Section title={`Drills (${results.length})`}>
          {results.map((r) => (
            <Link key={r.id} to="/admin/dev/results/$resultId" params={{ resultId: r.id }} className="block rounded-xl bg-secondary p-2 text-xs">
              <div className="flex justify-between"><b>{r.drill_name}</b><span>{r.score}/{r.max_score ?? "—"}</span></div>
              <p className="text-[10px] text-muted-foreground">
                BSI {Number(r.bsi).toFixed(1)} · {visualTag(r.breakdown)}
              </p>
            </Link>
          ))}
          {results.length === 0 && <Empty />}
        </Section>

        <Section title={`Challenges (${challenges.length})`}>
          {challenges.map((c) => (
            <Link key={c.id} to="/admin/dev/challenges/$resultId" params={{ resultId: c.id }} className="block rounded-xl bg-secondary p-2 text-xs">
              <div className="flex justify-between"><b>{c.challenge_name}</b><span>{c.score ?? "—"}</span></div>
              <p className="text-[10px] text-muted-foreground">{c.category ?? ""} · {visualTag(c.breakdown)}</p>
            </Link>
          ))}
          {challenges.length === 0 && <Empty />}
        </Section>
      </main>
    </>
  );
}

function visualTag(bd: unknown): string {
  const b = (bd ?? {}) as Record<string, unknown>;
  const bowls = Array.isArray(b.bowls) ? (b.bowls as Array<Record<string, unknown>>) : [];
  const ends = Array.isArray(b.ends) ? (b.ends as Array<Record<string, unknown>>) : [];
  const flat = ends.flatMap((e) => Array.isArray(e.bowls) ? (e.bowls as Array<Record<string, unknown>>) : []);
  const all = [...bowls, ...flat];
  const visual = all.some((x) => typeof x.x === "number" && typeof x.y === "number");
  return visual ? "Visual scoring" : "Simple scoring";
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-semibold">{v}</span></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-1.5 rounded-2xl bg-card p-3 bt-shadow-elevated">{children}</div>
    </div>
  );
}
function Empty() { return <p className="text-center text-xs text-muted-foreground">None</p>; }
function fmtDT(s: string | null) { return s ? new Date(s).toLocaleString() : "—"; }
