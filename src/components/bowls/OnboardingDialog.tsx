import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Target, Trophy, Clock, Check, X } from "lucide-react";

const STORAGE_KEY = "bt_onboarding_v1_done";

type Card = {
  icon: typeof Target;
  title: string;
  description: string;
  listTitle: string;
  list: string[];
  examplesTitle: string;
  examples: string[];
  badge: { icon: "check" | "x" | "clock"; label: string };
};

const cards: Card[] = [
  {
    icon: Target,
    title: "BSI Drills",
    description: "Complete drills to build your Bowls Skill Index (BSI).",
    listTitle: "Drills:",
    list: [
      "Contribute to BSI",
      "Measure skill improvement",
      "Track strengths and weaknesses over time",
    ],
    examplesTitle: "Examples:",
    examples: ["Short Draw", "Medium Draw", "Long Draw", "Upshot", "Running Shot", "Jack in the Ditch"],
    badge: { icon: "check", label: "Contributes to BSI" },
  },
  {
    icon: Trophy,
    title: "Challenges",
    description: "Fun practice games that do not affect BSI.",
    listTitle: "Challenges:",
    list: ["Track personal bests", "Build specific skills", "Add variety to training"],
    examplesTitle: "Examples:",
    examples: ["Keep It Up", "Traffic Jam", "Drive Then Draw"],
    badge: { icon: "x", label: "Does not affect BSI" },
  },
  {
    icon: Clock,
    title: "Training Sessions",
    description: "Track complete practice sessions.",
    listTitle: "Sessions:",
    list: [
      "Record training time",
      "Track drills and challenges completed",
      "Review training focus and consistency",
    ],
    examplesTitle: "Example:",
    examples: ["90 minute session", "2 drills", "3 challenges"],
    badge: { icon: "clock", label: "Tracks practice time" },
  },
];

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(STORAGE_KEY)) {
      setOpen(true);
    }
  }, []);

  function finish() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
    setOpen(false);
  }

  const card = cards[step];
  const Icon = card.icon;
  const isLast = step === cards.length - 1;
  const BadgeIcon = card.badge.icon === "check" ? Check : card.badge.icon === "x" ? X : Clock;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) finish();
      }}
    >
      <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="flex gap-1.5">
            {cards.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={finish}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
        </div>

        <div className="px-6 pb-2 pt-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-8 w-8" />
          </div>
          <DialogTitle className="mt-4 font-display text-2xl font-extrabold">{card.title}</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            {card.description}
          </DialogDescription>

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
            <BadgeIcon className="h-3.5 w-3.5 text-primary" />
            {card.badge.label}
          </div>
        </div>

        <div className="space-y-3 px-6 pb-5 pt-3 text-left text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {card.listTitle}
            </p>
            <ul className="mt-1 space-y-1">
              {card.list.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {card.examplesTitle}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {card.examples.map((ex) => (
                <span
                  key={ex}
                  className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"
                >
                  {ex}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-card px-5 py-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-xl px-4 py-2 text-sm font-bold text-foreground disabled:opacity-30"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground active:scale-[0.98] transition"
          >
            {isLast ? "Get Started" : "Next"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
