import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Crown, Target, Shield } from "lucide-react";
import {
  BADGE_META,
  getBadgeForScore,
  getChallengeBestLabel,
} from "@/lib/challenges";

export type LadderRow = {
  user_id: string;
  full_name: string | null;
  club: string | null;
  best_score: number | null;
  date_achieved: string | null;
  is_self: boolean;
};

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

export function useChallengeLadder(challengeId: string | undefined) {
  return useQuery({
    queryKey: ["challenge-squad-leaderboard", challengeId],
    enabled: !!challengeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("challenge_squad_leaderboard", {
        _challenge_id: challengeId,
      });
      if (error) throw error;
      return (data ?? []) as LadderRow[];
    },
  });
}

export function LadderList({
  rows,
  challengeSlug,
  challengeId,
  limit,
}: {
  rows: LadderRow[];
  challengeSlug: string;
  challengeId: string;
  limit?: number;
}) {
  const isSurvival = challengeSlug === "keep-it-up";
  const unit = getChallengeBestLabel(challengeSlug);
  const sorted = [...rows].sort((a, b) => (b.best_score ?? -1) - (a.best_score ?? -1));
  const visible = limit ? sorted.slice(0, limit) : sorted;
  const selfIndex = sorted.findIndex((r) => r.is_self);
  const selfRow = selfIndex >= 0 ? sorted[selfIndex] : null;
  const above = selfIndex > 0 ? sorted[selfIndex - 1] : null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[32px_1fr_auto] gap-2 px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <span>#</span>
        <span>Player</span>
        <span>{unit}</span>
      </div>
      {visible.map((r, i) => {
        const badge = getBadgeForScore(challengeSlug, r.best_score ?? null);
        return (
          <div
            key={r.user_id}
            className={`grid grid-cols-[32px_1fr_auto] items-center gap-2 rounded-xl px-2 py-2.5 ${
              r.is_self ? "bg-primary/10 ring-1 ring-primary/30" : "bg-secondary/40"
            }`}
          >
            <span className="flex items-center justify-center text-sm font-bold">
              {i === 0 ? <Crown className="h-4 w-4 text-primary" /> : i + 1}
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {initials(r.full_name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {r.is_self ? "You" : r.full_name ?? "Unnamed"}
                  {i === 0 && (
                    <span className="ml-1 text-[10px] font-bold text-primary">
                      🏆 Champion
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-1.5">
                  {r.club && (
                    <p className="truncate text-[11px] text-muted-foreground">{r.club}</p>
                  )}
                  {badge && (
                    <span
                      className="rounded bg-white/60 px-1 text-[10px] font-bold"
                      title={BADGE_META[badge].label}
                    >
                      {BADGE_META[badge].emoji}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-extrabold leading-none">
                {r.best_score ?? "—"}
                {isSurvival && r.best_score != null && (
                  <span className="ml-1 text-[10px] font-bold text-muted-foreground">
                    end{r.best_score === 1 ? "" : "s"}
                  </span>
                )}
              </p>
              {r.date_achieved && (
                <p className="text-[10px] text-muted-foreground">
                  {new Date(r.date_achieved).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {limit && sorted.length > limit && (
        <Link
          to="/squad/ladder/$slug"
          params={{ slug: challengeSlug }}
          className="block rounded-xl bg-secondary py-2 text-center text-xs font-bold text-primary"
        >
          View Full Ladder ({sorted.length})
        </Link>
      )}

      {/* Personal challenge CTA */}
      {selfRow && above && (
        <Link
          to="/challenge-record/$slug"
          params={{ slug: challengeSlug }}
          search={{
            start: "1",
            ghost: above.user_id,
            ghostName: above.full_name ?? undefined,
            ghostScore: above.best_score == null ? undefined : String(above.best_score),
          }}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground active:scale-[0.99] transition"
        >
          <Target className="h-4 w-4" /> Beat {above.full_name?.split(" ")[0] ?? "them"}
        </Link>
      )}
      {selfRow && !above && sorted.length > 0 && (
        <Link
          to="/challenge-record/$slug"
          params={{ slug: challengeSlug }}
          search={{ start: "1" }}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground active:scale-[0.99] transition"
        >
          <Shield className="h-4 w-4" /> Defend Your Title
        </Link>
      )}
    </div>
  );
}

export function ChallengeLeaderboard({
  challengeId,
  challengeSlug,
}: {
  challengeId: string;
  challengeSlug: string;
}) {
  const { data, isLoading } = useChallengeLadder(challengeId);
  const rows = data ?? [];

  return (
    <section className="mx-auto max-w-md px-5 pb-6">
      <div className="rounded-2xl bg-card p-5 bt-shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-bold">My Squad Ladder</h2>
        </div>
        {isLoading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No results yet. Play this challenge or add Squad members.
          </p>
        ) : (
          <LadderList
            rows={rows}
            challengeSlug={challengeSlug}
            challengeId={challengeId}
            limit={rows.length > 25 ? 10 : undefined}
          />
        )}
      </div>
    </section>
  );
}
