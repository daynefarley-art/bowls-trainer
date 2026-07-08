import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Target, Trophy, Clock, TrendingUp, Eye, BarChart3, Sparkles } from "lucide-react";

const STORAGE_KEY = "bt_getting_started_v1_done";

type Page = {
  icon: typeof BookOpen;
  title: string;
  intro?: string;
  sections: { heading?: string; body?: string; bullets?: string[] }[];
  closing?: string;
};

const pages: Page[] = [
  {
    icon: TrendingUp,
    title: "What is BSI?",
    intro: "BSI stands for Bowls Skill Index.",
    sections: [
      { body: "Your BSI measures your current bowling skill based on structured drill results. It is not a handicap and it does not measure whether you win or lose games — it reflects how accurately and consistently you perform key bowling skills." },
      { heading: "BSI is built from", bullets: ["Draw accuracy", "Weight control", "Line consistency", "Conversion shots", "Driving accuracy", "Jack control"] },
      { heading: "BSI levels", bullets: ["0–39 Beginner", "40–54 Developing", "55–69 Club", "70–79 Competitive", "80–89 Advanced", "90–100 Elite"] },
    ],
    closing: "The goal is not to compare yourself with others — it's to improve your own performance over time.",
  },
  {
    icon: Target,
    title: "BSI Drills",
    intro: "Drills contribute to your BSI.",
    sections: [
      { heading: "Use drills to measure", bullets: ["Accuracy", "Consistency", "Weight Control", "Conversion Skills", "Shot Execution"] },
      { heading: "Examples", bullets: ["Short Draw", "Medium Draw", "Long Draw", "Upshot", "Running Shot", "Jack in the Ditch"] },
      { heading: "Draw drill accuracy", body: "A bowl within one mat of the jack is a strong result, especially at longer lengths. A bowl within half a mat is excellent. A bowl within two mats is useful but leaves room for improvement." },
    ],
    closing: "Think of drills as skill assessments. Every drill completed contributes to your BSI.",
  },
  {
    icon: Trophy,
    title: "Challenges",
    intro: "Challenges do NOT contribute to BSI.",
    sections: [
      { body: "Challenges are fun practice games designed to improve specific skills." },
      { heading: "Examples", bullets: ["Keep It Up", "Traffic Jam", "Drive Then Draw"] },
      { heading: "Challenges help you", bullets: ["Practise under pressure", "Build specific skills", "Track personal bests", "Add variety to training"] },
    ],
    closing: "Think of challenges as practice games.",
  },
  {
    icon: Clock,
    title: "Training Sessions",
    intro: "Training Sessions track your overall practice.",
    sections: [
      { body: "Start a Training Session before you begin training. Complete drills and challenges as normal. End the session when training is finished." },
      { heading: "Training Sessions track", bullets: ["Training Hours", "Drills Completed", "Challenges Completed", "Training Focus Areas", "Session Notes"] },
    ],
    closing: "Think of Training Sessions as your training diary.",
  },
  {
    icon: BarChart3,
    title: "Tracking Progress",
    intro: "Your progress is measured in three ways.",
    sections: [
      { heading: "BSI Score", body: "Your Bowls Skill Index increases as your drill scores improve. BSI is designed to show long-term improvement rather than day-to-day fluctuations." },
      { heading: "Drill Performance", bullets: ["Personal Best", "Average Score", "Recent Results", "Trends Over Time"] },
      { heading: "Training Activity", bullets: ["Training Hours", "Number of Sessions", "Drills Completed", "Challenges Completed", "Training Focus Areas"] },
    ],
    closing: "The more consistently you train, the more meaningful your progress data becomes.",
  },
  {
    icon: Eye,
    title: "Visual Scoring Insights",
    intro: "When using Visual Scoring on Draw Drills, the app can identify why bowls are missing the target.",
    sections: [
      { heading: "Track", bullets: ["Narrow / Crossed Line deliveries", "Wide deliveries", "Short bowls", "Within a Mat bowls", "Long bowls"] },
      { heading: "Patterns it can reveal", bullets: ["Forehand crossing the line", "Backhand finishing wide", "Long draws finishing short", "Consistent weight issues"] },
    ],
    closing: "The goal is to turn practice results into coaching insights.",
  },
  {
    icon: BarChart3,
    title: "The Progress Screen",
    intro: "The Progress area allows you to review:",
    sections: [
      { bullets: ["BSI History", "Drill History", "Challenge History", "Training Sessions", "Training Hours", "Accuracy Trends", "Coaching Insights", "Personal Bests"] },
    ],
    closing: "Use the Progress screen to understand where your game is improving and where more practice is needed.",
  },
  {
    icon: Sparkles,
    title: "Ready to Train?",
    sections: [
      { bullets: [
        "Build your BSI with Drills.",
        "Develop skills with Challenges.",
        "Track your effort with Training Sessions.",
        "Review your improvement in Progress.",
      ] },
    ],
    closing: "Small improvements repeated consistently lead to big improvements over time.",
  },
];

export function hasSeenGettingStarted() {
  if (typeof window === "undefined") return true;
  return !!window.localStorage.getItem(STORAGE_KEY);
}

export function markGettingStartedSeen() {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, "1");
}

export function GettingStartedGuide({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  function close() {
    markGettingStartedSeen();
    onOpenChange(false);
  }

  const page = pages[step];
  const Icon = page.icon;
  const isLast = step === pages.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(true); }}>
      <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="flex gap-1 flex-wrap">
            {pages.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary" : "w-1.5 bg-muted"}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={close}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="px-6 pt-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-7 w-7" />
          </div>
          <DialogTitle className="mt-3 font-display text-2xl font-extrabold">{page.title}</DialogTitle>
          {page.intro && (
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              {page.intro}
            </DialogDescription>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 px-6 pb-5 pt-4 text-left text-sm">
          {page.sections.map((s, i) => (
            <div key={i}>
              {s.heading && (
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {s.heading}
                </p>
              )}
              {s.body && <p className={`${s.heading ? "mt-1" : ""} text-foreground`}>{s.body}</p>}
              {s.bullets && (
                <ul className={`${s.heading ? "mt-1" : ""} space-y-1`}>
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {page.closing && (
            <p className="rounded-xl bg-secondary/50 px-3 py-2 text-sm font-medium text-foreground">
              {page.closing}
            </p>
          )}
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
          <p className="text-xs text-muted-foreground">{step + 1} / {pages.length}</p>
          <button
            type="button"
            onClick={() => {
              if (isLast) {
                close();
                navigate({ to: "/drills" });
              } else {
                setStep((s) => s + 1);
              }
            }}
            className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground active:scale-[0.98] transition"
          >
            {isLast ? "Start Training" : "Next"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
