import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { VisualReplay } from "@/components/bowls/VisualReplay";
import { extractBowls, hasVisualCoords } from "@/lib/dev-replay";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dev/challenges/$resultId")({
  component: ChallengeDetail,
});

function ChallengeDetail() {
  const { resultId } = Route.useParams();
  const { data: r } = useQuery({
    queryKey: ["dev-challenge", resultId],
    queryFn: async () => {
      const { data, error } = await supabase.from("challenge_results").select("*").eq("id", resultId).maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  if (!r) {
    return (
      <>
        <PageHeader title="Challenge" subtitle="" />
        <main className="mx-auto max-w-md px-5">Loading…</main>
      </>
    );
  }

  const bowls = extractBowls(r.breakdown);
  const userId = r.user_id as string;

  return (
    <>
      <PageHeader title={(r.challenge_name as string) ?? "Challenge"} subtitle={fmtDT(r.played_at as string)} />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <Link to="/admin/dev/users/$userId" params={{ userId }} className="inline-flex items-center text-xs font-semibold text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to user
        </Link>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Score" value={(r.score as number | null) ?? "—"} />
          <Stat label="Category" value={(r.category as string) ?? "—"} />
          <Stat label="Bowls" value={bowls.length} />
        </div>

        <div className="rounded-2xl bg-card p-3 text-xs bt-shadow-elevated">
          <p><b>Visual scoring:</b> {hasVisualCoords(bowls) ? "Yes" : "No"}</p>
          <p><b>Duration:</b> {(r.duration_minutes as number | null) ?? 0} min</p>
          <p><b>Conditions:</b> {(r.conditions as string | null) ?? "—"}</p>
        </div>

        <Section title="Session Replay">
          <VisualReplay bowls={bowls} />
        </Section>

        <Section title="Bowl-by-bowl">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground">
                <tr><th className="text-left">End</th><th>Bowl</th><th>Hand</th><th>Pts</th><th>Tgt</th><th>x</th><th>y</th></tr>
              </thead>
              <tbody>
                {bowls.map((b, i) => (
                  <tr key={i} className="border-t border-border">
                    <td>{b.end}</td>
                    <td className="text-center">{b.bowl}</td>
                    <td className="text-center">{b.hand ?? "—"}</td>
                    <td className="text-center">{b.points ?? "—"}</td>
                    <td className="text-center">{b.target ?? b.kind ?? "—"}</td>
                    <td className="text-center">{b.x?.toFixed(2) ?? "—"}</td>
                    <td className="text-center">{b.y?.toFixed(2) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <details className="rounded-2xl bg-card p-3 text-[10px] bt-shadow-elevated">
          <summary className="cursor-pointer font-bold text-muted-foreground">Raw breakdown</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(r.breakdown, null, 2)}</pre>
        </details>
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
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="rounded-2xl bg-card p-3 bt-shadow-elevated">{children}</div>
    </div>
  );
}
function fmtDT(s: string | null) { return s ? new Date(s).toLocaleString() : "—"; }
