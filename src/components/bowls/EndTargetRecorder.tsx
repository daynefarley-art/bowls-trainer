import { useEffect, useMemo, useState } from "react";
import { VisualTarget, type VisualTap, type PlacedMarker } from "./VisualTarget";
import type { BowlDetail } from "@/lib/bowls";
import { Undo2, Eraser, X } from "lucide-react";


/**
 * Full-screen per-end visual scoring.
 *
 * - Target is the hero of the screen (fills available space).
 * - Bottom nav is hidden while this recorder is mounted.
 * - Numbered, hand-coloured markers; bowl numbering resets every end (never Bowl 5).
 * - Smart primary button: Place Bowl X → Submit End → Next End / View Results.
 *
 * Scoring math, BSI, analytics and persistence are owned by the parent.
 */

type Props = {
  drillName: string;
  ends: number;
  bowlsPerEnd: number;
  hands: BowlDetail["hand"][];
  drawLength: string | null;
  bowls: (string | null)[][];
  taps: (VisualTap | null)[][];
  endMaxScore: number;
  onPlace: (end: number, bowl: number, tap: VisualTap) => void;
  onClear: (end: number, bowl: number) => void;
  onFinish: () => void;
  onExit?: () => void;
  saving?: boolean;
};


function endScore(taps: (VisualTap | null)[]): number {
  return taps.reduce((s, t) => s + (t?.points ?? 0), 0);
}

function weightLabel(taps: VisualTap[]): string {
  if (taps.length === 0) return "—";
  const avg = taps.reduce((s, t) => s + Math.abs(t.y), 0) / taps.length;
  if (avg <= 0.4) return "Excellent";
  if (avg <= 0.8) return "Good";
  if (avg <= 1.3) return "Fair";
  return "Work on";
}
function lineLabel(taps: VisualTap[]): string {
  if (taps.length === 0) return "—";
  const onLine = taps.filter((t) => Math.abs(t.x) <= 1.0).length;
  const ratio = onLine / taps.length;
  if (ratio >= 0.85) return "Excellent";
  if (ratio >= 0.6) return "Good";
  if (ratio >= 0.4) return "Fair";
  return "Work on";
}

function tryHaptic(ms = 14) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(ms);
  } catch { /* ignore */ }
}

function handDotClass(hand: BowlDetail["hand"]) {
  return hand === "backhand"
    ? "bg-[var(--color-bowl-backhand)]"
    : "bg-[var(--color-bowl-forehand)]";
}

export function EndTargetRecorder({
  drillName,
  ends,
  bowlsPerEnd,
  hands,
  drawLength,
  bowls,
  taps,
  endMaxScore,
  onPlace,
  onClear,
  onFinish,
  onExit,
  saving,
}: Props) {

  const [currentEnd, setCurrentEnd] = useState(0);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<boolean[]>(() => Array(ends).fill(false));
  const [showSummary, setShowSummary] = useState(false);

  // Toggle body class so AuthLayout can hide the bottom nav while scoring.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("bt-fullscreen-scoring");
    return () => document.body.classList.remove("bt-fullscreen-scoring");
  }, []);

  const endTaps = taps[currentEnd];
  const endBowls = bowls[currentEnd];

  const nextEmpty = useMemo(() => {
    for (let i = 0; i < bowlsPerEnd; i++) if (endBowls[i] === null) return i;
    return null;
  }, [endBowls, bowlsPerEnd]);

  const activeBowl = editIdx ?? nextEmpty;
  const allPlaced = nextEmpty === null;
  const isLastEnd = currentEnd === ends - 1;
  const endSubmitted = submitted[currentEnd];

  const markers: PlacedMarker[] = useMemo(() => {
    const m: PlacedMarker[] = [];
    for (let i = 0; i < bowlsPerEnd; i++) {
      const t = endTaps[i];
      if (t && i !== editIdx) m.push({ x: t.x, y: t.y, number: i + 1, hand: hands[i] });
    }
    return m;
  }, [endTaps, hands, bowlsPerEnd, editIdx]);

  const currentTap = activeBowl != null ? endTaps[activeBowl] ?? null : null;
  const currentHand = activeBowl != null ? hands[activeBowl] : undefined;
  const currentNumber = activeBowl != null ? activeBowl + 1 : undefined;

  const placedCountThisEnd = endBowls.filter((v) => v !== null).length;

  function handleSelect(tap: VisualTap) {
    if (activeBowl == null) return;
    onPlace(currentEnd, activeBowl, tap);
    if (editIdx !== null) setEditIdx(null);
  }

  function handleClearEnd() {
    for (let i = 0; i < bowlsPerEnd; i++) onClear(currentEnd, i);
    setEditIdx(null);
  }

  function handleUndo() {
    for (let i = bowlsPerEnd - 1; i >= 0; i--) {
      if (endBowls[i] !== null) {
        onClear(currentEnd, i);
        setEditIdx(null);
        tryHaptic(8);
        return;
      }
    }
  }

  function handleSubmitEnd() {
    if (!allPlaced) return;
    setSubmitted((prev) => {
      const next = prev.slice();
      next[currentEnd] = true;
      return next;
    });
    setShowSummary(true);
    tryHaptic(20);
  }

  function handleAdvance() {
    if (currentEnd < ends - 1) {
      setCurrentEnd(currentEnd + 1);
      setShowSummary(false);
      setEditIdx(null);
    } else {
      onFinish();
    }
  }

  // Smart primary button
  let primaryLabel = "Place Bowl";
  let primaryDisabled = false;
  let primaryAction: () => void = () => {};
  if (showSummary) {
    primaryLabel = isLastEnd ? (saving ? "Saving…" : "View Results") : "Next End";
    primaryDisabled = !!saving;
    primaryAction = handleAdvance;
  } else if (allPlaced) {
    primaryLabel = "Submit End";
    primaryAction = handleSubmitEnd;
  } else {
    const bowlNo = (activeBowl ?? 0) + 1;
    primaryLabel = `Place Bowl ${bowlNo}`;
    primaryDisabled = true;
  }

  function tapMarker(i: number) {
    if (endSubmitted) return;
    if (endBowls[i] == null) return;
    setEditIdx(i);
  }

  useEffect(() => {
    if (endSubmitted) setShowSummary(true);
    else setShowSummary(false);
  }, [currentEnd, endSubmitted]);

  const titleSuffix = drawLength
    ? ` · ${drawLength.charAt(0).toUpperCase()}${drawLength.slice(1)}`
    : "";

  const placedTaps = endTaps.filter((t): t is VisualTap => t != null);
  const score = endScore(endTaps);
  const perfect = placedTaps.filter((t) => t.band === "half").length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Compact header */}
      <header className="shrink-0 border-b border-border bg-card px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {drillName}{titleSuffix}
          </p>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              aria-label="Exit visual scoring"
              className="-mt-1 -mr-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground active:scale-95 transition"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-0.5 flex items-baseline justify-between gap-3">
          <p className="font-display text-base font-extrabold leading-tight">
            End {currentEnd + 1} of {ends}
          </p>
          {!endSubmitted && activeBowl != null ? (
            <p className="font-display text-sm font-bold text-primary">
              Place Bowl {activeBowl + 1} of {bowlsPerEnd}
              <span
                className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${
                  currentHand === "backhand"
                    ? "bg-[var(--color-bowl-backhand)]"
                    : "bg-[var(--color-bowl-forehand)]"
                }`}
              >
                {currentHand}
              </span>
            </p>
          ) : endSubmitted ? (
            <p className="font-display text-sm font-bold text-success">End complete</p>
          ) : (
            <p className="font-display text-sm font-bold text-primary">Submit end</p>
          )}
        </div>
      </header>

      {/* THE TARGET — fills all remaining space */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-2">
        {!showSummary ? (
          <div
            className="aspect-square w-full"
            style={{ maxHeight: "100%", maxWidth: "min(100%, calc(100dvh - 230px))" }}
          >
            <VisualTarget
              value={currentTap ? { x: currentTap.x, y: currentTap.y } : null}
              onSelect={handleSelect}
              hand={currentHand}
              markers={markers}
              currentNumber={currentNumber}
              hideReadout
              hideHint
            />
          </div>
        ) : (
          <div className="w-full max-w-sm animate-[fade-in_0.25s_ease-out] rounded-3xl bg-card p-5 text-center bt-shadow-elevated">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">End {currentEnd + 1} complete</p>
            <p className="mt-2 font-display text-5xl font-extrabold text-primary">
              {score}<span className="text-2xl text-muted-foreground"> / {endMaxScore}</span>
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-left">
              <div className="rounded-xl bg-secondary/40 px-3 py-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Weight</p>
                <p className="font-display text-sm font-extrabold">{weightLabel(placedTaps)}</p>
              </div>
              <div className="rounded-xl bg-secondary/40 px-3 py-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Line</p>
                <p className="font-display text-sm font-extrabold">{lineLabel(placedTaps)}</p>
              </div>
              <div className="rounded-xl bg-secondary/40 px-3 py-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Perfect</p>
                <p className="font-display text-sm font-extrabold">{perfect}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom control panel */}
      <div className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2.5">
        {/* Bowl progress indicator */}
        {!showSummary && (
          <div className="flex items-center justify-center gap-3">
            {Array.from({ length: bowlsPerEnd }).map((_, i) => {
              const placed = endBowls[i] !== null;
              const isCurrent = i === activeBowl;
              const isEdit = i === editIdx;
              const hand = hands[i];
              const base = "h-3 w-3 rounded-full transition";
              if (placed) {
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => tapMarker(i)}
                    aria-label={`Bowl ${i + 1} placed — tap to reposition`}
                    className={`${base} ${handDotClass(hand)} ${isEdit ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`}
                  />
                );
              }
              if (isCurrent) {
                return (
                  <span
                    key={i}
                    aria-label={`Bowl ${i + 1} active`}
                    className={`${base} ring-2 ring-primary ring-offset-2 ring-offset-card bt-bowl-pulse ${handDotClass(hand)} opacity-70`}
                  />
                );
              }
              return <span key={i} aria-label={`Bowl ${i + 1} pending`} className={`${base} bg-border`} />;
            })}
          </div>
        )}

        {!showSummary && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={placedCountThisEnd === 0}
              className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-secondary px-3 text-sm font-bold text-charcoal disabled:opacity-40 active:scale-[0.98] transition"
            >
              <Undo2 className="h-4 w-4" /> Undo Last Bowl
            </button>
            <button
              type="button"
              onClick={handleClearEnd}
              disabled={placedCountThisEnd === 0}
              className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-destructive/10 px-3 text-sm font-bold text-destructive disabled:opacity-40 active:scale-[0.98] transition"
            >
              <Eraser className="h-4 w-4" /> Clear End
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={primaryAction}
          disabled={primaryDisabled || (!allPlaced && !showSummary)}
          className="h-14 w-full rounded-2xl bt-gradient-primary text-base font-extrabold uppercase tracking-wide text-primary-foreground bt-shadow-elevated active:scale-[0.99] transition disabled:opacity-50 disabled:active:scale-100"
        >
          {primaryLabel}
        </button>

        {editIdx !== null && !showSummary && (
          <p className="text-center text-[11px] font-semibold text-muted-foreground">
            Repositioning Bowl {editIdx + 1} — tap the target to save.
          </p>
        )}
      </div>
    </div>
  );
}
