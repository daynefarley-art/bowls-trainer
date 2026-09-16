import { Check } from "lucide-react";

/**
 * Shared always-visible 4-bowl delivery-order strip.
 *
 * Shows the required delivery order for the current end (Bowl N + hand or
 * per-bowl label) so the player can remember which bowl was which after
 * walking to the head and entering the visual scoring results.
 *
 * Compact single-row layout; no vertical bloat.
 */

export type DeliveryPill = {
  number: number;
  hand: "forehand" | "backhand";
  /** Optional per-bowl label (e.g. SLiMeD target letter). */
  label?: string;
  /** Optional second line (e.g. a prescribed progression step or weight). */
  sublabel?: string;
  /** Marker has been placed for this bowl. */
  placed?: boolean;
  /** Currently-active bowl in the end. */
  current?: boolean;
  /** Hand not yet revealed (Switch 32 reveals the hand bowl-by-bowl). */
  unknown?: boolean;
};

export function DeliveryOrderStrip({
  bowls,
  className,
}: {
  bowls: DeliveryPill[];
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Delivery order this end
      </p>
      <div className="flex items-stretch gap-1.5">
        {bowls.map((b) => {
          const handColor = b.unknown
            ? "var(--color-border)"
            : b.hand === "backhand"
              ? "var(--color-bowl-backhand)"
              : "var(--color-bowl-forehand)";
          const isCurrent = !!b.current;
          const isPlaced = !!b.placed;
          return (
            <div
              key={b.number}
              className={`flex-1 rounded-lg border px-1.5 py-1 text-center transition ${
                isCurrent
                  ? "border-primary bg-primary/10"
                  : isPlaced
                    ? "border-transparent bg-secondary/60"
                    : "border-border bg-transparent"
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: handColor }}
                  aria-hidden
                />
                <span className="text-[10px] font-extrabold leading-none">
                  Bowl {b.number}
                </span>
                {isPlaced && (
                  <Check className="h-3 w-3 text-success" aria-label="placed" />
                )}
              </div>
              <p className="mt-0.5 text-[9px] font-bold uppercase leading-none text-muted-foreground">
                {b.unknown ? "?" : (b.label ?? (b.hand === "forehand" ? "Forehand" : "Backhand"))}
              </p>
              {b.sublabel && (
                <p className="mt-0.5 text-[9px] font-bold uppercase leading-none text-primary">
                  {b.sublabel}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
