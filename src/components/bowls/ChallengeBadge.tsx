import {
  DIFFICULTY_META,
  BADGE_META,
  getChallengeDifficulty,
  getBadgeForScore,
  type ChallengeBadgeTier,
} from "@/lib/challenges";

export function DifficultyBadge({ slug, size = "sm" }: { slug: string; size?: "sm" | "md" }) {
  const d = getChallengeDifficulty(slug);
  if (!d) return null;
  const meta = DIFFICULTY_META[d];
  const cls = size === "md" ? "text-xs px-2 py-0.5" : "text-[10px] px-1.5 py-0.5";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-secondary/60 font-semibold ${cls}`}>
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  );
}

export function AchievementBadge({
  slug,
  best,
  size = "sm",
  showNone = false,
}: {
  slug: string;
  best: number | null | undefined;
  size?: "sm" | "md";
  showNone?: boolean;
}) {
  const tier = getBadgeForScore(slug, best);
  if (!tier) {
    if (!showNone) return null;
    return <span className="text-[10px] text-muted-foreground">No badge yet</span>;
  }
  const meta = BADGE_META[tier];
  const cls = size === "md" ? "text-xs px-2 py-0.5" : "text-[10px] px-1.5 py-0.5";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-primary/10 font-semibold text-primary ${cls}`}>
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  );
}

export function TierEmoji({ tier }: { tier: ChallengeBadgeTier }) {
  return <span>{BADGE_META[tier].emoji}</span>;
}
