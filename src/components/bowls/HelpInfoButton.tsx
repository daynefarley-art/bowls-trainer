import { useState } from "react";
import { HelpCircle, Target, Trophy, Clock, BookOpen, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GettingStartedGuide } from "@/components/bowls/GettingStartedGuide";

export function HelpInfoButton() {
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Help"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground active:scale-95 transition"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogTitle className="font-display text-xl font-extrabold">Help</DialogTitle>
          <DialogDescription className="sr-only">
            Help topics including BSI Drills, Challenges, Training Sessions, and the Getting Started Guide.
          </DialogDescription>
          <div className="space-y-4 pt-2 text-sm">
            <Row
              icon={<Target className="h-5 w-5" />}
              title="BSI Drills"
              body="Complete drills to build your Bowls Skill Index."
            />
            <Row
              icon={<Trophy className="h-5 w-5" />}
              title="Challenges"
              body="Practice games that track personal bests but do not affect BSI."
            />
            <Row
              icon={<Clock className="h-5 w-5" />}
              title="Training Sessions"
              body="Track your overall practice time and activities."
            />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setGuideOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl bg-secondary/60 p-3 text-left active:scale-[0.99] transition"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-bold">Getting Started Guide</p>
                <p className="text-xs text-muted-foreground">Walk through how everything works.</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <GettingStartedGuide open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  );
}

function Row({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
