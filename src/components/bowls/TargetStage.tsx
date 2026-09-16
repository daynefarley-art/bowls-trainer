import type { ComponentProps } from "react";
import { VisualTarget } from "./VisualTarget";

/**
 * Shared presentation frame for the Visual Target.
 *
 * MEDIUM DRAW (EndTargetRecorder) is the gold-standard visual-targeting
 * experience. Every other drill/challenge that renders a target inside a card
 * routes through this component so sizing, spacing, hint copy and marker
 * behaviour are identical everywhere. Scoring rules are unaffected.
 */
export function TargetStage({
  caption = "Tap to place · drag a bowl to adjust",
  className,
  ...target
}: ComponentProps<typeof VisualTarget> & { caption?: string | null; className?: string }) {
  return (
    <div className={className}>
      <div
        className="mx-auto aspect-square w-full"
        style={{ maxWidth: "min(100%, calc(100dvh - 330px))" }}
      >
        <VisualTarget hideReadout hideHint {...target} />
      </div>
      {caption && (
        <p className="mt-2 text-center text-[10px] font-semibold text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  );
}
