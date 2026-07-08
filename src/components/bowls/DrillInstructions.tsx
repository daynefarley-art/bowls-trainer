import { Link, type LinkProps } from "@tanstack/react-router";
import { Target, ChevronRight } from "lucide-react";
import type { Drill } from "@/lib/bowls";

const TIPS: Record<string, string[]> = {
  "short-draw": [
    "Bowls 1–2 forehand, 3–4 backhand; commit fully to each line.",
  ],
  "medium-draw": [
    "Reset between bowls — same routine every time.",
    "Favour finishing past the jack over short.",
  ],
  "long-draw": [
    "Long jack — extend the backswing, keep the action smooth.",
    "Pick a clear aiming point on the bank for each hand.",
  ],
  "weight-control-ladder": [
    "Reset between bowls — pick the next target length before you start your routine.",
    "Adjust weight smoothly; longer lengths need a longer backswing, not extra force.",
  ],
  "upshot-drill": [
    "Pick the line first, then add the weight.",
    "Stay over the bowl on release.",
  ],
  "running-shot-drill": [
    "Keep your delivery shape — don't lunge for extra pace.",
    "Aim narrower than a draw; the extra weight straightens the bowl.",
  ],
  "drive-accuracy": [
    "Drive through the target, not at it.",
    "Stay balanced on follow-through.",
  ],
  "jack-in-ditch": [
    "Focus on the target, keep your delivery smooth.",
  ],
  "jack-delivery-accuracy": [
    "Use the same routine as your bowl delivery.",
    "Pick a length and commit — adjust on the next end if needed.",
  ],
};

function attemptNoun(category: string | null) {
  if (category === "Jack Delivery") return "jacks";
  if (category === "Drive") return "drives";
  return "bowls";
}

export function DrillInstructions({
  drill,
  startLink,
  backLink,
  backLabel,
}: {
  drill: Drill;
  startLink: LinkProps;
  backLink?: LinkProps;
  backLabel?: string;
}) {
  const noun = attemptNoun(drill.category);
  const tips = TIPS[drill.slug] ?? [
    "Set up the same way every time for a fair comparison.",
    "Take your time — quality reps beat fast reps.",
  ];

  return (
    <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-32">
      <section className="rounded-3xl bg-card p-5 bt-shadow-elevated">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bt-gradient-primary text-white">
            <Target className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
              {drill.category ?? "Drill"}
            </p>
            <h1 className="font-display text-2xl font-extrabold leading-tight">{drill.name}</h1>
          </div>
        </div>
      </section>

      {drill.description && (
        <Section title="Objective">
          <p className="text-sm leading-relaxed">{drill.description}</p>
        </Section>
      )}

      {drill.setup && (
        <Section title="Setup">
          <p className="text-sm leading-relaxed">{drill.setup}</p>
        </Section>
      )}

      <Section title="Attempts">
        {(() => {
          const ends = drill.scoring_config.ends ?? 1;
          const total = ends * drill.bowls_per_end;
          return (
            <p className="text-sm">
              <span className="font-display text-xl font-extrabold">{total}</span>{" "}
              <span className="capitalize text-muted-foreground">{noun}</span>
              {ends > 1 && (
                <span className="text-muted-foreground"> · {ends} ends × {drill.bowls_per_end} {noun}</span>
              )}
              <span className="text-muted-foreground"> · Score range {drill.min_score}–{drill.max_score} pts</span>
            </p>
          );
        })()}
      </Section>

      <Section title="Scoring rules">
        <ul className="space-y-1.5">
          {drill.scoring_config.categories.map((c) => (
            <li key={c.key} className="flex items-center justify-between text-sm">
              <span>{c.label}</span>
              <span
                className="font-display font-bold"
                style={{ color: c.points >= 0 ? "var(--color-primary)" : "var(--color-destructive)" }}
              >
                {c.points > 0 ? `+${c.points}` : c.points} pts
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tips">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {tips.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="fixed inset-x-0 bottom-20 z-30 mx-auto max-w-md px-5">
        <Link
          {...startLink}
          className="flex h-16 items-center justify-center gap-2 rounded-2xl bt-gradient-primary text-base font-bold text-primary-foreground bt-shadow-elevated"
        >
          Start Drill
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
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </section>
  );
}
