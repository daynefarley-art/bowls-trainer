import { Check, Pencil } from "lucide-react";

/**
 * Compact end-navigation strip: shows E1..EN as small chips.
 * Tap a submitted end to jump back and edit it.
 * Current end is highlighted; submitted ends show a check; ends the user has
 * not reached yet are disabled.
 */

export type EndChip = {
  end: number; // 1-based
  submitted: boolean;
  current: boolean;
  reachable: boolean;
  score?: number | null;
};

export function EndPickerStrip({
  ends,
  onJump,
  className,
}: {
  ends: EndChip[];
  onJump: (end: number) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        {ends.map((e) => {
          const disabled = !e.reachable && !e.submitted && !e.current;
          const base =
            "inline-flex min-w-[52px] items-center justify-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide transition";
          const style = e.current
            ? "bg-primary text-primary-foreground"
            : e.submitted
              ? "bg-secondary text-charcoal hover:bg-secondary/80"
              : "bg-transparent text-muted-foreground border border-border";
          return (
            <button
              key={e.end}
              type="button"
              disabled={disabled}
              onClick={() => onJump(e.end)}
              aria-label={`End ${e.end}${e.submitted ? " — tap to edit" : ""}`}
              className={`${base} ${style} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span>E{e.end}</span>
              {e.submitted && !e.current && <Check className="h-3 w-3" />}
              {e.current && e.submitted && <Pencil className="h-3 w-3" />}
              {typeof e.score === "number" && (
                <span className="opacity-80">· {e.score}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
