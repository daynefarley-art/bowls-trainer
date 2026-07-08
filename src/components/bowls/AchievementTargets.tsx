import {
  BADGE_META,
  BADGE_ORDER,
  CHALLENGE_BADGE_THRESHOLDS,
  getBadgeForScore,
  getNextBadge,
  getChallengeBestLabel,
  getChallengeRemainingUnit,
  formatChallengeScore,
  type ChallengeBadgeTier,
} from "@/lib/challenges";
import { Lock } from "lucide-react";

/**
 * 4-tier achievement ladder. Earned tiers are highlighted; future tiers
 * appear locked. Always shows the score required for each tier.
 */
export function AchievementTargets({
  slug,
  best,
  title = "Achievement Targets",
}: {
  slug: string;
  best?: number | null;
  title?: string;
}) {
  const thr = CHALLENGE_BADGE_THRESHOLDS[slug];
  if (!thr) return null;
  const earned = getBadgeForScore(slug, best);
  const earnedRank = earned ? BADGE_ORDER.indexOf(earned) : -1;

  return (
    <section className="rounded-2xl bg-card p-5 bt-shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="mt-3 space-y-2">
        {BADGE_ORDER.map((tier, idx) => {
          const meta = BADGE_META[tier];
          const isEarned = idx <= earnedRank;
          return (
            <li
              key={tier}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition ${
                isEarned ? "bg-primary/10" : "bg-secondary/40 opacity-70"
              }`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <span className="text-lg">{meta.emoji}</span>
                <span>{meta.label}</span>
                {!isEarned && <Lock className="h-3 w-3 text-muted-foreground" />}
              </span>
              <span className={`font-display font-extrabold ${isEarned ? "text-primary" : "text-muted-foreground"}`}>
                {thr[tier]}
              </span>
            </li>
          );
        })}
      </ul>
      {best != null && (
        <div className="mt-3 border-t border-border pt-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{getChallengeBestLabel(slug)}</span>
            <span className="font-display text-base font-extrabold text-primary">
              {formatChallengeScore(slug, best)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Current Achievement</span>
            <span className="font-semibold">
              {earned ? `${BADGE_META[earned].emoji} ${BADGE_META[earned].label}` : "None yet"}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Compact progress bar showing distance to next tier — used in the profile
 * Challenge Achievements section.
 */
export function AchievementProgress({ slug, best }: { slug: string; best: number | null | undefined }) {
  const thr = CHALLENGE_BADGE_THRESHOLDS[slug];
  if (!thr) return null;
  const earned = getBadgeForScore(slug, best);
  const next = getNextBadge(slug, best);
  const score = best ?? 0;

  // progress between previous tier and next tier
  const prevThreshold: number = (() => {
    if (!earned) return 0;
    return thr[earned];
  })();
  const nextThreshold = next?.required ?? prevThreshold;
  const range = Math.max(1, nextThreshold - prevThreshold);
  const pct = next ? Math.max(0, Math.min(100, Math.round(((score - prevThreshold) / range) * 100))) : 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold">
          {earned ? `${BADGE_META[earned].emoji} ${BADGE_META[earned].label}` : "No badge yet"}
        </span>
        <span className="text-muted-foreground">
          {next ? `Progress to ${BADGE_META[next.tier].label}: ${score}/${next.required}` : "Max tier achieved"}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary/60">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-1 pt-0.5 text-[14px]">
        {BADGE_ORDER.map((t) => {
          const isEarned = earned ? BADGE_ORDER.indexOf(t) <= BADGE_ORDER.indexOf(earned) : false;
          return (
            <span key={t} className={isEarned ? "" : "opacity-30"} title={BADGE_META[t].label}>
              {BADGE_META[t].emoji}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function tierLabel(tier: ChallengeBadgeTier): string {
  return `${BADGE_META[tier].emoji} ${BADGE_META[tier].label}`;
}
