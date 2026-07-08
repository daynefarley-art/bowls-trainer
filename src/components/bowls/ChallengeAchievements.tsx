import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";
import {
  BADGE_META,
  DIFFICULTY_META,
  BADGE_ORDER,
  getBadgeForScore,
  getChallengeDifficulty,
  getChallengeBestLabel,
  formatChallengeScore,
  normalizeChallengeConfig,
  type Challenge,
  type ChallengeBadgeTier,
  type ChallengeDifficulty,
} from "@/lib/challenges";
import { AchievementProgress } from "@/components/bowls/AchievementTargets";

type ChallengeWithBest = Challenge & { best: number | null };

function useChallengeBests(userId: string) {
  const challengesQ = useQuery({
    queryKey: ["challenges"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenges").select("*").order("sort_order");
      if (error) throw error;
      return ((data ?? []) as Challenge[]).map(normalizeChallengeConfig);
    },
  });
  const bestsQ = useQuery({
    queryKey: ["challenge_bests", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenge_results").select("challenge_id, score").eq("user_id", userId);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of (data ?? []) as { challenge_id: string; score: number }[]) {
        const cur = map.get(r.challenge_id);
        if (cur == null || r.score > cur) map.set(r.challenge_id, r.score);
      }
      return map;
    },
  });
  const list: ChallengeWithBest[] = (challengesQ.data ?? []).map((c) => ({
    ...c,
    best: bestsQ.data?.get(c.id) ?? null,
  }));
  return { list, isLoading: challengesQ.isLoading || bestsQ.isLoading };
}

export function ChallengeAchievementsSection({ userId }: { userId: string }) {
  const { list } = useChallengeBests(userId);
  if (list.length === 0) return null;
  return (
    <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-primary" />
        <h2 className="font-display text-base font-bold">Challenge Achievements</h2>
      </div>
      <ul className="space-y-3">
        {list.map((c) => (
          <li key={c.id} className="space-y-1.5 rounded-xl bg-secondary/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">{c.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {getChallengeBestLabel(c.slug)}: {c.best == null ? "—" : formatChallengeScore(c.slug, c.best)}
              </span>
            </div>
            <AchievementProgress slug={c.slug} best={c.best} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export type ChallengeMastery = {
  byDifficulty: Record<ChallengeDifficulty, { earned: number; total: number; pct: number }>;
  totals: Record<ChallengeBadgeTier, number>;
  strongest: { name: string; tier: ChallengeBadgeTier } | null;
  weakest: { name: string } | null;
  highest: ChallengeBadgeTier | null;
  withoutAchievement: string[];
};

export function computeMastery(items: ChallengeWithBest[]): ChallengeMastery {
  const byDifficulty: ChallengeMastery["byDifficulty"] = {
    easy:   { earned: 0, total: 0, pct: 0 },
    medium: { earned: 0, total: 0, pct: 0 },
    hard:   { earned: 0, total: 0, pct: 0 },
    expert: { earned: 0, total: 0, pct: 0 },
  };
  const totals: ChallengeMastery["totals"] = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
  let strongest: ChallengeMastery["strongest"] = null;
  let weakest: ChallengeMastery["weakest"] = null;
  let highest: ChallengeBadgeTier | null = null;
  const withoutAchievement: string[] = [];

  for (const c of items) {
    const d = getChallengeDifficulty(c.slug);
    if (!d) continue;
    byDifficulty[d].total += 1;
    const tier = getBadgeForScore(c.slug, c.best);
    if (tier) {
      // Earned ratio uses tier index (1..4) over platinum (4).
      const rank = BADGE_ORDER.indexOf(tier) + 1;
      byDifficulty[d].earned += rank / BADGE_ORDER.length;
      totals[tier] += 1;
      const strongRank = strongest ? BADGE_ORDER.indexOf(strongest.tier) + 1 : -1;
      if (rank > strongRank) strongest = { name: c.name, tier };
      const highRank = highest ? BADGE_ORDER.indexOf(highest) + 1 : -1;
      if (rank > highRank) highest = tier;
    } else {
      withoutAchievement.push(c.name);
      if (!weakest) weakest = { name: c.name };
    }
  }
  for (const d of Object.keys(byDifficulty) as ChallengeDifficulty[]) {
    const b = byDifficulty[d];
    b.pct = b.total === 0 ? 0 : Math.round((b.earned / b.total) * 100);
  }
  return { byDifficulty, totals, strongest, weakest, highest, withoutAchievement };
}

export function ChallengeMasterySection({ userId, title = "Challenge Mastery" }: { userId: string; title?: string }) {
  const { list } = useChallengeBests(userId);
  if (list.length === 0) return null;
  const m = computeMastery(list);
  const difficulties: ChallengeDifficulty[] = ["easy", "medium", "hard", "expert"];
  return (
    <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-primary" />
        <h2 className="font-display text-base font-bold">{title}</h2>
      </div>
      <div className="space-y-2">
        {difficulties.map((d) => {
          const b = m.byDifficulty[d];
          return (
            <div key={d}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">{DIFFICULTY_META[d].emoji} {DIFFICULTY_META[d].label}</span>
                <span className="text-muted-foreground">{b.pct}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary/60">
                <div className="h-full bg-primary transition-all" style={{ width: `${b.pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-2 border-t border-border pt-3 text-center text-xs">
        {BADGE_ORDER.map((t) => (
          <div key={t} className="rounded-xl bg-secondary/40 p-2">
            <p className="text-base">{BADGE_META[t].emoji}</p>
            <p className="font-display text-lg font-extrabold">{m.totals[t]}</p>
            <p className="text-[10px] text-muted-foreground">{BADGE_META[t].label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ChallengeMasteryReport({ userId }: { userId: string }) {
  const { list } = useChallengeBests(userId);
  return <ChallengeMasteryReportView items={list} />;
}

export function ChallengeMasteryReportView({ items }: { items: ChallengeWithBest[] }) {
  if (items.length === 0) return null;
  const m = computeMastery(items);
  return (
    <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-primary" />
        <h2 className="font-display text-base font-bold">Challenge Mastery Report</h2>
      </div>
      <div className="space-y-1.5 text-sm">
        <Row label="Strongest Challenge" value={m.strongest ? `${m.strongest.name} (${BADGE_META[m.strongest.tier].emoji} ${BADGE_META[m.strongest.tier].label})` : "—"} />
        <Row label="Weakest Challenge" value={m.weakest?.name ?? "—"} />
        <Row label="Highest Achievement" value={m.highest ? `${BADGE_META[m.highest].emoji} ${BADGE_META[m.highest].label}` : "None yet"} />
        <Row label="Without Achievement" value={m.withoutAchievement.length === 0 ? "None" : `${m.withoutAchievement.length}`} />
      </div>
      <div className="border-t border-border pt-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Difficulty Breakdown</p>
        <div className="space-y-1 text-xs">
          {(["easy", "medium", "hard", "expert"] as ChallengeDifficulty[]).map((d) => (
            <div key={d} className="flex items-center justify-between">
              <span>{DIFFICULTY_META[d].emoji} {DIFFICULTY_META[d].label}</span>
              <span className="font-semibold">{m.byDifficulty[d].pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
