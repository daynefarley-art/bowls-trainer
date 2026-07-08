import { Link, type LinkProps } from "@tanstack/react-router";
import { Trophy, ChevronRight } from "lucide-react";
import { normalizeChallengeConfig, type Challenge } from "@/lib/challenges";
import { TrafficJamDiagram } from "@/components/bowls/TrafficJamDiagram";
import { DifficultyBadge, AchievementBadge } from "@/components/bowls/ChallengeBadge";
import {
  getNextBadge,
  BADGE_META,
  getChallengeBestLabel,
  getChallengeRemainingUnit,
  formatChallengeScore,
  getChallengeScoreUnit,
} from "@/lib/challenges";
import { AchievementTargets } from "@/components/bowls/AchievementTargets";

export function ChallengeInstructions({
  challenge,
  startLink,
  backLink,
  backLabel,
  bestScore = null,
}: {
  challenge: Challenge;
  startLink: LinkProps;
  backLink?: LinkProps;
  backLabel?: string;
  bestScore?: number | null;
}) {
  challenge = normalizeChallengeConfig(challenge);
  const cfg = challenge.config ?? {};
  const isFixedEnds = cfg.type === "fixed-ends";

  const ends = cfg.ends ?? 0;
  const bowlsPerEnd = cfg.bowls_per_end ?? 0;
  const totalBowls = ends * bowlsPerEnd;
  const maxScore = cfg.max_score ?? totalBowls;

  const startBowls = cfg.start_bowls ?? 4;
  const maxBowls = cfg.max_bowls ?? 4;

  return (
    <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-32">
      <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bt-gradient-primary text-white">
            <Trophy className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
              {challenge.category} Challenge
            </p>
            <h1 className="font-display text-2xl font-extrabold leading-tight">{challenge.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <DifficultyBadge slug={challenge.slug} size="md" />
              <AchievementBadge slug={challenge.slug} best={bestScore} size="md" />
            </div>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Does not affect your BSI
            </p>
          </div>
        </div>
      </section>

      <AchievementTargets slug={challenge.slug} best={bestScore} />

      {bestScore != null && (() => {
        const next = getNextBadge(challenge.slug, bestScore);
        const unit = getChallengeScoreUnit(challenge.slug);
        const remainingUnit = getChallengeRemainingUnit(challenge.slug);
        return (
          <Section title={getChallengeBestLabel(challenge.slug)}>
            <p className="text-sm">
              <span className="font-display text-xl font-extrabold">{bestScore}</span>
              <span className="text-muted-foreground"> {unit ?? challenge.score_label}</span>
            </p>
            {next && (
              <p className="mt-1 text-xs text-muted-foreground">
                Next: {BADGE_META[next.tier].emoji} {BADGE_META[next.tier].label} requires {next.required}
                {" — "}{next.remaining} {remainingUnit}{next.remaining === 1 ? "" : "s"} remaining
              </p>
            )}
          </Section>
        );
      })()}

      {challenge.description && (
        <Section title="Objective">
          <p className="text-sm leading-relaxed">{challenge.description}</p>
        </Section>
      )}

      {challenge.setup && (
        <Section title="Setup">
          <p className="whitespace-pre-line text-sm leading-relaxed">{challenge.setup}</p>
        </Section>
      )}

      {cfg.diagram === "traffic-jam" && (
        <Section title="Setup diagram">
          <div className="mx-auto max-w-[220px]">
            <TrafficJamDiagram className="h-auto w-full" />
          </div>
        </Section>
      )}


      <Section title={isFixedEnds ? "Format" : "Bowls"}>
        {isFixedEnds ? (
          <p className="text-sm">
            <span className="font-display text-xl font-extrabold">{totalBowls}</span>{" "}
            <span className="text-muted-foreground">
              bowls · {ends} ends × {bowlsPerEnd} bowls per end
            </span>
          </p>
        ) : (
          <p className="text-sm">
            <span className="font-display text-xl font-extrabold">{startBowls}</span>{" "}
            <span className="text-muted-foreground">starting bowls · max {maxBowls}</span>
          </p>
        )}
      </Section>

      {challenge.rules.length > 0 && (
        <Section title="Rules">
          <ul className="space-y-1.5 text-sm">
            {challenge.rules.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Scoring">
        {cfg.variant === "jack-in-ditch" ? (
          <ul className="space-y-1.5 text-sm">
            <li className="flex gap-2"><span className="text-primary">•</span><span>Through the Drive Gate = <span className="font-bold">1 point</span></span></li>
            <li className="flex gap-2"><span className="text-primary">•</span><span>Strike the Jack = <span className="font-bold">4 points</span></span></li>
            <li className="flex gap-2"><span className="text-primary">•</span><span>⭐ Perfect End = <span className="font-bold">+2 bonus points</span></span></li>
            <li className="mt-1 text-xs text-muted-foreground">Max {maxScore} — {challenge.score_label}</li>
          </ul>
        ) : (
          <p className="text-sm">
            Final score = <span className="font-display font-bold">{challenge.score_label}</span>
            {isFixedEnds && (
              <span className="text-muted-foreground"> · max {maxScore}</span>
            )}
          </p>
        )}
      </Section>


      <Section title="Tips">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {cfg.variant === "slimed" ? (
            <>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Weight is crucial, reset with every delivery.</span></li>
            </>
          ) : cfg.variant === "jack-in-ditch" ? (
            <>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Drive through the Drive Gate every bowl — every successful drive counts.</span></li>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Open each end by attacking the jack. Strike it first up to chase the Perfect End bonus.</span></li>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Once the jack is struck and removed, keep the line and weight committed through the Drive Gate.</span></li>
            </>
          ) : cfg.variant === "drive-draw" ? (
            <>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Commit to the drive — weight and line straight through the channel.</span></li>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Reset your stance and tempo before the draw shot.</span></li>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Half-mat draws score double — accuracy beats safety.</span></li>
            </>
          ) : isFixedEnds ? (
            <>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Pick your line carefully, getting as close to the jack without touching the obstacle mats.</span></li>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Weight wins this one — short or heavy and you'll hit a mat.</span></li>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Commit to forehand or backhand for the whole end.</span></li>
            </>
          ) : (
            <>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Take your time on each delivery — surviving beats brilliance.</span></li>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Reset your routine between ends.</span></li>
              <li className="flex gap-2"><span className="text-primary">•</span><span>Challenge yourself: for every successful end, move the mat back by one metre. See if you can make it all the way to maximum length. (Coaching suggestion — does not affect scoring or badges.)</span></li>
            </>
          )}
        </ul>
      </Section>


      <div className="fixed inset-x-0 bottom-20 z-30 mx-auto max-w-md px-5">
        <Link
          {...startLink}
          className="flex h-16 items-center justify-center gap-2 rounded-2xl bt-gradient-primary text-base font-bold text-primary-foreground bt-shadow-elevated"
        >
          Start Challenge
          <ChevronRight className="h-5 w-5" />
        </Link>
        {backLink && (
          <Link
            {...backLink}
            className="mt-2 flex h-10 items-center justify-center text-xs font-semibold text-muted-foreground"
          >
            {backLabel ?? "Back"}
          </Link>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-5 bt-shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}
