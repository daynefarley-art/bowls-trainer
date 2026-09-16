import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

/**
 * Shared End Instructions primitive used by the End-based flow.
 *
 * Rendered before each end starts:
 *   End Instructions → NEXT → Visual Target for all bowls in the end → SUBMIT END.
 *
 * Keep this component stateless — the parent recorder owns end progression,
 * autosave, pause, and exit controls.
 */
export function EndInstructionsScreen({
  endNumber,
  totalEnds,
  hand,
  targetLabel,
  targetSub,
  bowlsPerEnd,
  description,
  bullets,
  extras,
  onNext,
  nextLabel = "Next — Play End",
}: {
  endNumber: number;
  totalEnds: number;
  hand: "forehand" | "backhand";
  targetLabel: string;
  targetSub?: string;
  bowlsPerEnd: number;
  description?: string;
  bullets?: string[];
  extras?: React.ReactNode;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <section className="rounded-3xl bg-card p-6 bt-shadow-elevated">
      <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
        End {endNumber} of {totalEnds}
      </p>
      <h2 className="mt-1 font-display text-2xl font-extrabold">
        Target: {targetLabel}
      </h2>
      {targetSub && (
        <p className="mt-0.5 text-sm font-semibold text-muted-foreground">{targetSub}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-secondary/40 p-3">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Hand</p>
          <p className="mt-0.5 font-display text-lg font-extrabold capitalize">
            {hand === "forehand" ? "Forehand" : "Backhand"}
          </p>
        </div>
        <div className="rounded-xl bg-secondary/40 p-3">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Bowls</p>
          <p className="mt-0.5 font-display text-lg font-extrabold">{bowlsPerEnd}</p>
        </div>
      </div>

      {description && (
        <p className="mt-4 text-sm text-muted-foreground">{description}</p>
      )}

      {bullets && bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {extras}

      <Button
        onClick={onNext}
        className="mt-5 h-14 w-full gap-2 rounded-2xl text-base font-bold bt-shadow-elevated"
      >
        {nextLabel} <ArrowRight className="h-5 w-5" />
      </Button>
    </section>
  );
}
