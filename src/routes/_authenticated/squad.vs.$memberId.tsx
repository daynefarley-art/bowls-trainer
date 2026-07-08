import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { ChevronLeft, Trophy, Minus, Crown, Heart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/squad/vs/$memberId")({
  component: HeadToHead,
});

type Row = {
  challenge_id: string;
  challenge_slug: string;
  challenge_name: string;
  my_best: number | null;
  other_best: number | null;
  my_plays: number;
  other_plays: number;
};

type Summary = {
  my_bsi: number | null;
  other_bsi: number | null;
  my_pb_count: number;
  other_pb_count: number;
  my_wins: number;
  other_wins: number;
  my_champ_position: number;
  other_champ_position: number;
  my_favourite: string | null;
  other_favourite: string | null;
};

function HeadToHead() {
  const { memberId } = useParams({ from: "/_authenticated/squad/vs/$memberId" });

  const member = useQuery({
    queryKey: ["squad-member-profile", memberId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, club").eq("id", memberId).maybeSingle();
      return data as { full_name: string | null; club: string | null } | null;
    },
  });

  const h2h = useQuery({
    queryKey: ["head-to-head", memberId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("head_to_head", { _other: memberId });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const summary = useQuery({
    queryKey: ["head-to-head-summary", memberId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("head_to_head_summary", { _other: memberId });
      if (error) throw error;
      return (data?.[0] ?? null) as Summary | null;
    },
  });

  const rows = h2h.data ?? [];
  const s = summary.data;
  const otherFirst = member.data?.full_name?.split(" ")[0] ?? "Them";

  return (
    <>
      <PageHeader title="Head-to-Head" subtitle={member.data?.full_name ?? "Squad member"} />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <Link
          to="/squad"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          <ChevronLeft className="h-4 w-4" /> Back to My Squad
        </Link>

        {s && (
          <div className="grid grid-cols-2 gap-2">
            <SummaryCard label="Your BSI (30d)" youValue={s.my_bsi != null ? Math.round(Number(s.my_bsi)) : "—"} otherLabel={otherFirst} otherValue={s.other_bsi != null ? Math.round(Number(s.other_bsi)) : "—"} />
            <SummaryCard label="Personal Bests" youValue={s.my_pb_count} otherLabel={otherFirst} otherValue={s.other_pb_count} />
            <SummaryCard label="Challenge Wins" youValue={s.my_wins} otherLabel={otherFirst} otherValue={s.other_wins} icon={<Trophy className="h-3.5 w-3.5" />} />
            <SummaryCard label="Championship" youValue={s.my_champ_position > 0 ? `#${s.my_champ_position}` : "—"} otherLabel={otherFirst} otherValue={s.other_champ_position > 0 ? `#${s.other_champ_position}` : "—"} icon={<Crown className="h-3.5 w-3.5" />} />
          </div>
        )}

        {s && (s.my_favourite || s.other_favourite) && (
          <div className="rounded-2xl bg-card p-4 bt-shadow-card">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <Heart className="mr-1 inline h-3 w-3" /> Favourite Challenge
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-muted-foreground">You</p>
                <p className="truncate text-sm font-bold">{s.my_favourite ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">{otherFirst}</p>
                <p className="truncate text-sm font-bold">{s.other_favourite ?? "—"}</p>
              </div>
            </div>
          </div>
        )}

        <section className="space-y-2">
          <h2 className="px-1 font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
            By Challenge
          </h2>
          {h2h.isLoading ? (
            <p className="text-center text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground bt-shadow-card">
              No challenges yet.
            </p>
          ) : (
            rows.map((r) => {
              const mine = r.my_best;
              const theirs = r.other_best;
              const iWin = mine != null && (theirs == null || mine > theirs);
              const theyWin = theirs != null && (mine == null || theirs > mine);
              return (
                <div key={r.challenge_id} className="rounded-2xl bg-card p-4 bt-shadow-card">
                  <p className="truncate text-sm font-bold">{r.challenge_name}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                    <ScoreCell label="You" score={mine} plays={r.my_plays} highlight={iWin} />
                    <ScoreCell label={otherFirst} score={theirs} plays={r.other_plays} highlight={theyWin} />
                  </div>
                </div>
              );
            })
          )}
        </section>
      </main>
    </>
  );
}

function SummaryCard({
  label,
  youValue,
  otherLabel,
  otherValue,
  icon,
}: {
  label: string;
  youValue: number | string;
  otherLabel: string;
  otherValue: number | string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card p-3 bt-shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <div className="mt-1 grid grid-cols-2 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">You</p>
          <p className="font-display text-xl font-extrabold text-primary">{youValue}</p>
        </div>
        <div>
          <p className="truncate text-[10px] text-muted-foreground">{otherLabel}</p>
          <p className="font-display text-xl font-extrabold">{otherValue}</p>
        </div>
      </div>
    </div>
  );
}

function ScoreCell({ label, score, plays, highlight }: { label: string; score: number | null; plays: number; highlight: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-primary/10 ring-1 ring-primary/40" : "bg-secondary/40"}`}>
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-xl font-extrabold">
        {score != null ? Math.round(Number(score)) : <Minus className="mx-auto h-5 w-5 text-muted-foreground" />}
      </p>
      <p className="text-[10px] text-muted-foreground">{plays} play{plays === 1 ? "" : "s"}</p>
      {highlight && <Trophy className="mx-auto mt-1 h-3 w-3 text-primary" />}
    </div>
  );
}
