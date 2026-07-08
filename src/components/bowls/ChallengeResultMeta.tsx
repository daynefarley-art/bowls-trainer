import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DIFFICULTY_META,
  BADGE_META,
  getChallengeDifficulty,
  getBadgeForScore,
  getNextBadge,
  getChallengeBestLabel,
  getChallengeRemainingUnit,
  formatChallengeScore,
  type Challenge,
} from "@/lib/challenges";

/**
 * Compact achievement meta panel rendered under the "Challenge complete" hero
 * on every challenge result screen.
 */
export function ChallengeResultMeta({
  challenge,
  score,
  userId,
}: {
  challenge: Challenge;
  score: number;
  userId: string;
}) {
  const difficulty = getChallengeDifficulty(challenge.slug);
  const badge = getBadgeForScore(challenge.slug, score);
  const next = getNextBadge(challenge.slug, score);

  // Was previous best lower than this score?
  const { data: prevBest } = useQuery({
    queryKey: ["challenge_prev_best", userId, challenge.id, score],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenge_results")
        .select("score")
        .eq("challenge_id", challenge.id)
        .eq("user_id", userId)
        .order("score", { ascending: false });
      if (error) throw error;
      const scores = ((data ?? []) as { score: number }[]).map((r) => r.score);
      // Exclude the just-saved score (if present) by removing one instance
      const idx = scores.indexOf(score);
      if (idx >= 0) scores.splice(idx, 1);
      return scores.length ? Math.max(...scores) : null;
    },
  });

  const isPB = prevBest == null || score > prevBest;
  const longestRun = Math.max(score, prevBest ?? 0);
  const bestLabel = getChallengeBestLabel(challenge.slug);
  const remainingUnit = getChallengeRemainingUnit(challenge.slug);

  return (
    <section className="rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="space-y-2 text-sm">
        {difficulty && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Difficulty</span>
            <span className="font-semibold">
              {DIFFICULTY_META[difficulty].emoji} {DIFFICULTY_META[difficulty].label}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Achievement</span>
          <span className="font-semibold">
            {badge
              ? `${BADGE_META[badge].emoji} ${BADGE_META[badge].label}`
              : "No badge yet"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Personal Best</span>
          <span className={`font-semibold ${isPB ? "text-primary" : ""}`}>
            {isPB ? "Yes — new record!" : "No"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{bestLabel}</span>
          <span className="font-semibold">{formatChallengeScore(challenge.slug, longestRun)}</span>
        </div>
        {next && (
          <div className="mt-3 rounded-xl bg-secondary/40 p-3 text-xs">
            <p className="font-semibold">
              Next Achievement: {BADGE_META[next.tier].emoji} {BADGE_META[next.tier].label}
            </p>
            <p className="text-muted-foreground">
              Requires {next.required} — {next.remaining} {remainingUnit}{next.remaining === 1 ? "" : "s"} remaining
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
