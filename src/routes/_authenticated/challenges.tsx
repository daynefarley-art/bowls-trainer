import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Trophy, ChevronRight } from "lucide-react";
import { normalizeChallengeConfig, formatChallengeScore, getChallengeBestLabel, type Challenge } from "@/lib/challenges";
import { DifficultyBadge, AchievementBadge } from "@/components/bowls/ChallengeBadge";
import { NewBadge, FeaturedBadge } from "@/components/bowls/NewBadge";
import { getChallengeReleaseMeta, shouldShowNewBadge } from "@/lib/whats-new";

export const Route = createFileRoute("/_authenticated/challenges")({
  component: ChallengesPage,
});

function ChallengesPage() {
  const { user } = Route.useRouteContext();

  const { data: challenges } = useQuery({
    queryKey: ["challenges"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenges")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return ((data ?? []) as Challenge[]).map(normalizeChallengeConfig);
    },
  });

  const { data: bestByChallenge } = useQuery({
    queryKey: ["challenge_bests", user.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenge_results")
        .select("challenge_id, score")
        .eq("user_id", user.id);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of (data ?? []) as { challenge_id: string; score: number }[]) {
        const cur = map.get(row.challenge_id);
        if (cur == null || row.score > cur) map.set(row.challenge_id, row.score);
      }
      return map;
    },
  });

  const grouped = new Map<string, Challenge[]>();
  (challenges ?? []).forEach((c) => {
    const arr = grouped.get(c.category) ?? [];
    arr.push(c);
    grouped.set(c.category, arr);
  });

  // Sort each category: featured first, then by sort_order.
  for (const [cat, arr] of grouped) {
    arr.sort((a, b) => {
      const af = getChallengeReleaseMeta(a.slug)?.isFeatured ? 1 : 0;
      const bf = getChallengeReleaseMeta(b.slug)?.isFeatured ? 1 : 0;
      if (af !== bf) return bf - af;
      return a.sort_order - b.sort_order;
    });
    grouped.set(cat, arr);
  }

  return (
    <>
      <PageHeader title="Challenges" subtitle="Test yourself — scores don't affect your BSI" />
      <main className="mx-auto mt-6 max-w-md space-y-6 px-5 pb-8">
        {[...grouped.entries()].map(([category, items]) => (
          <section key={category} className="space-y-3">
            <h2 className="px-1 font-display text-lg font-bold">{category}</h2>
            {items.map((c) => {
              const best = bestByChallenge?.get(c.id) ?? null;
              const meta = getChallengeReleaseMeta(c.slug);
              const showNew = shouldShowNewBadge({
                releaseDate: meta?.releaseDate,
                completed: best != null,
              }) || (meta?.isNew && best == null);
              return (
                <Link
                  key={c.id}
                  to="/challenge/$slug"
                  params={{ slug: c.slug }}
                  className="flex items-center gap-4 rounded-2xl bg-card p-4 bt-shadow-card active:opacity-90"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bt-gradient-primary text-white">
                    <Trophy className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      {c.category} Challenge
                    </p>
                    <h3 className="font-display text-base font-bold leading-tight">
                      {c.name}
                      {showNew && <NewBadge className="ml-2 align-middle" />}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <DifficultyBadge slug={c.slug} />
                      {meta?.isFeatured && <FeaturedBadge />}
                      {best != null && (
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {getChallengeBestLabel(c.slug)}: {formatChallengeScore(c.slug, best)}
                        </span>
                      )}
                      <AchievementBadge slug={c.slug} best={best} />
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              );
            })}
          </section>
        ))}
        {(!challenges || challenges.length === 0) && (
          <p className="py-10 text-center text-sm text-muted-foreground">No challenges yet.</p>
        )}
      </main>
    </>
  );
}
