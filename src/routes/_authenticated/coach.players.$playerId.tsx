import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { BSIBadge } from "@/components/bowls/BSIBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  bsiInWindow,
  overallBSI,
  trainingStats,
  type Drill,
  type Result,
} from "@/lib/bowls";
import type { Challenge } from "@/lib/challenges";
import { ChevronLeft, MessageSquare, Lock, Eye } from "lucide-react";
import { ChallengeMasteryReportView } from "@/components/bowls/ChallengeAchievements";
import { PerformanceInsights } from "@/components/bowls/PerformanceInsights";

export const Route = createFileRoute("/_authenticated/coach/players/$playerId")({
  component: PlayerAnalysisPage,
});

type ChallengeResult = {
  id: string;
  user_id: string;
  challenge_slug: string;
  score: number;
  played_at: string;
};

function PlayerAnalysisPage() {
  const { playerId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const { data: drills = [] } = useQuery({
    queryKey: ["drills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drills").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Drill[];
    },
  });

  const { data: results = [] } = useQuery({
    queryKey: ["coach-player-results", playerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("coach_get_player_results", { _player_id: playerId });
      if (error) throw error;
      return (data ?? []) as unknown as Result[];
    },
  });

  const { data: challengeResults = [] } = useQuery({
    queryKey: ["coach-player-challenges", playerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("coach_get_player_challenge_results", { _player_id: playerId });
      if (error) throw error;
      return (data ?? []) as unknown as (ChallengeResult & { challenge_id: string })[];
    },
  });

  const { data: allChallenges = [] } = useQuery({
    queryKey: ["challenges"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("challenges").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Challenge[];
    },
  });

  const challengeMasteryItems = useMemo(() => {
    const bestById = new Map<string, number>();
    for (const r of challengeResults as { challenge_id: string; score: number }[]) {
      const cur = bestById.get(r.challenge_id);
      if (cur == null || r.score > cur) bestById.set(r.challenge_id, r.score);
    }
    return allChallenges.map((c) => ({ ...c, best: bestById.get(c.id) ?? null }));
  }, [allChallenges, challengeResults]);


  const { data: profile } = useQuery({
    queryKey: ["coach-player-profile", playerId, user.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("coach_list_players");
      if (error) throw error;
      const row = (data ?? []).find((r: { player_id: string }) => r.player_id === playerId);
      return row ? { player_email: row.player_email as string } : null;
    },
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["coach-notes", playerId, user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_notes")
        .select("*")
        .eq("coach_id", user.id)
        .eq("player_id", playerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const bsiAll = overallBSI(results, drills);
  const bsi30 = bsiInWindow(results, drills, 30);
  const bsi90 = bsiInWindow(results, drills, 90);

  const tStats = trainingStats(results);

  // per-drill stats
  const drillStats = useMemo(() => {
    return drills.map((d) => {
      const rs = results.filter((r) => r.drill_id === d.id);
      const latest = rs[0]?.score ?? null;
      const best = rs.length ? Math.max(...rs.map((r) => r.score)) : null;
      const avg = rs.length ? rs.reduce((s, r) => s + r.score, 0) / rs.length : null;
      const last = rs[0]?.played_at ?? null;
      return { drill: d, latest, best, avg, last, count: rs.length };
    });
  }, [drills, results]);

  // Challenge stats grouped
  const challengeStats = useMemo(() => {
    const groups = new Map<string, ChallengeResult[]>();
    for (const c of challengeResults) {
      const arr = groups.get(c.challenge_slug) ?? [];
      arr.push(c);
      groups.set(c.challenge_slug, arr);
    }
    return Array.from(groups.entries()).map(([slug, rs]) => ({
      slug,
      best: Math.max(...rs.map((r) => r.score)),
      avg: rs.reduce((s, r) => s + r.score, 0) / rs.length,
      attempts: rs.length,
      last: rs[0]?.played_at,
    }));
  }, [challengeResults]);

  // Session counts in last 7 / 30 days
  const now = Date.now();
  const ms7 = 7 * 86_400_000;
  const ms30 = 30 * 86_400_000;
  const sessions7 = results.filter((r) => now - new Date(r.played_at).getTime() <= ms7).length;
  const sessions30 = results.filter((r) => now - new Date(r.played_at).getTime() <= ms30).length;
  const minutes30 = results
    .filter((r) => now - new Date(r.played_at).getTime() <= ms30)
    .reduce((s, r) => s + (r.duration_minutes ?? 0), 0);

  // Most practised drill (by count)
  const mostPractised = [...drillStats].sort((a, b) => b.count - a.count)[0];
  const leastPractised = [...drillStats].filter((s) => s.count > 0).sort((a, b) => a.count - b.count)[0];

  // Insights
  const insights = useMemo(() => {
    const out: string[] = [];
    if (results.length === 0) {
      out.push("No drill results recorded yet.");
      return out;
    }
    if (mostPractised && mostPractised.count > 0) out.push(`Most practised: ${mostPractised.drill.name}.`);
    if (leastPractised && mostPractised && leastPractised.drill.id !== mostPractised.drill.id) {
      out.push(`Least practised: ${leastPractised.drill.name}.`);
    }
    if (bsi30 != null && bsiAll != null && bsi30 < bsiAll - 2) {
      out.push("Recent 30-day BSI is trending below all-time average.");
    } else if (bsi30 != null && bsiAll != null && bsi30 > bsiAll + 2) {
      out.push("30-day BSI is trending above all-time average — strong recent form.");
    }
    return out;
  }, [results, mostPractised, leastPractised, bsi30, bsiAll]);

  // Add note state
  const [noteText, setNoteText] = useState("");
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveNote() {
    if (!noteText.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("coach_notes").insert({
      coach_id: user.id,
      player_id: playerId,
      note_text: noteText.trim(),
      visibility: shared ? "shared" : "private",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setNoteText("");
    setShared(false);
    toast.success("Note added");
    qc.invalidateQueries({ queryKey: ["coach-notes", playerId, user.id] });
  }

  return (
    <>
      <PageHeader
        title={profile?.player_email ?? "Player"}
        subtitle="Player Analysis"
      />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5">
        <Link to="/coach/players" className="inline-flex items-center text-sm text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to players
        </Link>

        <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-lg font-bold">Overview</h2>
          <div className="flex items-center justify-between">
            <BSIBadge bsi={bsiAll} />
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini label="30d" value={bsi30 == null ? "—" : bsi30.toFixed(1)} />
              <Mini label="90d" value={bsi90 == null ? "—" : bsi90.toFixed(1)} />
              <Mini label="All" value={bsiAll == null ? "—" : bsiAll.toFixed(1)} />
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-lg font-bold">Training Summary</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Sessions (7d)" value={sessions7} />
            <Stat label="Sessions (30d)" value={sessions30} />
            <Stat label="Hours (30d)" value={(minutes30 / 60).toFixed(1)} />
            <Stat label="Total sessions" value={tStats.sessions} />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-lg font-bold">Drill Analysis</h2>
          <ul className="space-y-2">
            {drillStats.map((s) => (
              <li key={s.drill.id} className="rounded-xl bg-secondary/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{s.drill.name}</p>
                  <span className="text-xs text-muted-foreground">{s.count} sessions</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                  <span>Latest: <b>{s.latest ?? "—"}</b></span>
                  <span>Best: <b>{s.best ?? "—"}</b></span>
                  <span>Avg: <b>{s.avg == null ? "—" : s.avg.toFixed(1)}</b></span>
                </div>
                {s.last && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Last: {new Date(s.last).toLocaleDateString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        {challengeStats.length > 0 && (
          <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
            <h2 className="font-display text-lg font-bold">Challenge Analysis</h2>
            <ul className="space-y-2">
              {challengeStats.map((c) => (
                <li key={c.slug} className="rounded-xl bg-secondary/40 p-3 text-sm">
                  <p className="font-semibold capitalize">{c.slug.replace(/-/g, " ")}</p>
                  <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                    <span>PB: <b>{c.best}</b></span>
                    <span>Avg: <b>{c.avg.toFixed(1)}</b></span>
                    <span>Attempts: <b>{c.attempts}</b></span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <PerformanceInsights
          results={results}
          drills={drills}
          subjectName={profile?.player_email?.split("@")[0] ?? "Player"}
          hideNoteCta
        />

        <ChallengeMasteryReportView items={challengeMasteryItems} />


        {insights.length > 0 && (
          <section className="space-y-2 rounded-2xl bg-card p-5 bt-shadow-card">
            <h2 className="font-display text-lg font-bold">Insights</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {insights.map((i, idx) => (
                <li key={idx}>{i}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">Coach Notes</h2>
          </div>

          <div className="space-y-2">
            <Textarea
              placeholder="Add a note about this player…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
            />
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm">
                <Switch checked={shared} onCheckedChange={setShared} />
                Share with player
              </Label>
              <Button onClick={saveNote} disabled={saving || !noteText.trim()}>
                {saving ? "Saving…" : "Add Note"}
              </Button>
            </div>
          </div>

          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-secondary/40 p-3 text-sm">
                <p className="whitespace-pre-wrap">{n.note_text}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  {n.visibility === "shared" ? <Eye className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {n.visibility === "shared" ? "Shared with player" : "Private"}
                  {" · "}
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 p-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display text-base font-extrabold">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-extrabold">{value}</p>
    </div>
  );
}
