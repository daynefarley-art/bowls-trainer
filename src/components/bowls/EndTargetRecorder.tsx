import { useEffect, useMemo, useState } from "react";
import { VisualTarget, classifyTap, type VisualTap, type PlacedMarker } from "./VisualTarget";
import type { BowlDetail } from "@/lib/bowls";
import { Undo2, Eraser, X } from "lucide-react";
import { DeliveryOrderStrip, type DeliveryPill } from "./DeliveryOrderStrip";
import { EndPickerStrip, type EndChip } from "./EndPickerStrip";
import { HeadScanFlow, type HeadScanResult } from "./head-scan/HeadScanFlow";
import { Camera } from "lucide-react";
import { ensureMotionPermission } from "@/lib/motion-permission";
import { useCurrentUserId } from "@/hooks/use-role";
import { isHeadScanAllowedUser } from "@/lib/head-scan-access";



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
  /**
   * Batch placement for Head Scan, which returns every bowl of the end at once.
   * Parents that update state from a closure MUST implement this, otherwise
   * sequential onPlace calls in one tick overwrite each other.
   */
  onPlaceMany?: (end: number, entries: { bowl: number; tap: VisualTap }[]) => void;
  onClear: (end: number, bowl: number) => void;
  onClearEnd?: (end: number) => void;
  onFinish: () => void;
  onExit?: () => void;
  saving?: boolean;
  /** Optional slot rendered above Undo/Clear (used for Pause / Save for later). */
  pauseSlot?: React.ReactNode;
  /**
   * Enables the Head Scan alternative entry method for this drill/challenge.
   * Only stationary-target activities should set this (see lib/head-scan.ts).
   */
  headScanEnabled?: boolean;
  /**
   * Prescribed target tolerance — scales the EXISTING scoring rings only
   * (1 = standard, 0.75 = narrow). Ordinary practice never passes this.
   */
  bandScale?: number;
  /** Short prescribed-instruction chips shown in the header (target/weight/progression). */
  prescriptionChips?: string[];
  /** Prescribed step for each bowl slot in the end (progression drills only). */
  bowlStepLabels?: string[];
  /**
   * Label of the target the CURRENT bowl is played to. Used by multi-target
   * drills (e.g. Lead Drill's two jacks) so the player can never be in doubt
   * about which jack the target represents.
   */
  bowlTargetLabels?: string[];
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
  } catch {
    /* ignore */
  }
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
  onPlaceMany,
  onClear,
  onClearEnd,
  onFinish,
  onExit,
  saving,
  pauseSlot,
  headScanEnabled: headScanEnabledProp,
  bandScale = 1,
  prescriptionChips,
  bowlStepLabels,
  bowlTargetLabels,
}: Props) {
  // Head Scan is in private testing: only allowlisted accounts see it at all.
  const currentUserId = useCurrentUserId();
  const headScanEnabled = headScanEnabledProp && isHeadScanAllowedUser(currentUserId);
  const [currentEnd, setCurrentEnd] = useState(0);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<boolean[]>(() => Array(ends).fill(false));

  const [showSummary, setShowSummary] = useState(false);
  const [headScanOpen, setHeadScanOpen] = useState(false);
  /**
   * Bumped on every Head Scan open so the overlay is always a FRESH mount.
   * The old dead-button behaviour came from a Head Scan instance that had been
   * closed but whose internal phase/camera state was reused on re-entry; a new
   * key guarantees a clean camera + marking state every single time.
   */
  const [scanNonce, setScanNonce] = useState(0);
  /** What Head Scan left for the player to finish by hand on this end. */
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);


  // Toggle body class so AuthLayout can hide the bottom nav while scoring.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("bt-fullscreen-scoring");
    return () => document.body.classList.remove("bt-fullscreen-scoring");
  }, []);

  // The "still needs placing" note belongs to one end only.
  useEffect(() => {
    setScanNote(null);
  }, [currentEnd]);

  const endTaps = taps[currentEnd];
  const endBowls = bowls[currentEnd];

  const nextEmpty = useMemo(() => {
    for (let i = 0; i < bowlsPerEnd; i++) if (endBowls[i] === null) return i;
    return null;
  }, [endBowls, bowlsPerEnd]);

  const activeBowl = editIdx ?? nextEmpty;
  /**
   * ONE Head Scan photo covers the WHOLE end. When a specific bowl is being
   * edited the scan is scoped to that bowl; otherwise it offers every bowl of
   * the end that still needs a position, so the player never has to reopen the
   * camera between bowls.
   */
  const headScanBowls = useMemo(() => {
    const idxs =
      editIdx !== null
        ? [editIdx]
        : Array.from({ length: bowlsPerEnd }, (_, i) => i).filter((i) => endBowls[i] === null);
    const list = idxs.length ? idxs : Array.from({ length: bowlsPerEnd }, (_, i) => i);
    return list.map((i) => ({ number: i + 1, hand: hands[i] }));
  }, [editIdx, endBowls, bowlsPerEnd, hands]);

  const allPlaced = nextEmpty === null;
  // isLastEnd removed — allEndsSubmitted below is the real "finish" gate.
  const endSubmitted = submitted[currentEnd];

  const markers: PlacedMarker[] = useMemo(() => {
    const m: PlacedMarker[] = [];
    for (let i = 0; i < bowlsPerEnd; i++) {
      const t = endTaps[i];
      if (t && i !== editIdx) m.push({ x: t.x, y: t.y, number: i + 1, hand: hands[i] });
    }
    return m;
  }, [endTaps, hands, bowlsPerEnd, editIdx]);

  const currentTap = activeBowl != null ? (endTaps[activeBowl] ?? null) : null;
  const currentHand = activeBowl != null ? hands[activeBowl] : undefined;
  const currentNumber = activeBowl != null ? activeBowl + 1 : undefined;

  const placedCountThisEnd = endBowls.filter((v) => v !== null).length;

  function handleSelect(tap: VisualTap) {
    if (activeBowl == null) return;
    onPlace(currentEnd, activeBowl, tap);
    if (editIdx !== null) setEditIdx(null);
  }

  /**
   * Head Scan hand-off. Every returned coordinate is placed through the same
   * onPlace path a manual Visual Target tap uses, so scoring, BSI, analytics
   * and history are identical. Bowls returned without a tap ("not in photo" /
   * "can't identify") are left unplaced so the player positions them manually
   * on the Visual Target.
   */
  function applyHeadScan(results: HeadScanResult[]) {
    setHeadScanOpen(false);
    // Unresolved bowls ("not in photo" / "can't identify") are left exactly as
    // they were so an existing manual placement is never destroyed; any
    // still-empty slot simply stays empty for manual Visual Target entry.
    const entries = results
      // Re-classify through the same band scale the manual target uses, so a
      // narrowed prescribed target scores identically whichever entry method
      // the player chose.
      .map((r) => ({
        bowl: r.number - 1,
        tap: r.tap ? classifyTap(r.tap.x, r.tap.y, bandScale) : r.tap,
      }))
      .filter(
        (e): e is { bowl: number; tap: VisualTap } =>
          e.tap != null && e.bowl >= 0 && e.bowl < bowlsPerEnd,
      );
    if (entries.length) {
      // One batched update — sequential onPlace calls in a single tick would
      // clobber each other in parents that copy state from a closure.
      if (onPlaceMany) onPlaceMany(currentEnd, entries);
      else for (const e of entries) onPlace(currentEnd, e.bowl, e.tap);
    }
    // Placing the active bowl clears the edit lock so `nextEmpty` advances the
    // recorder to the following bowl exactly as a manual tap would.
    setEditIdx(null);

    // Return to the SAME end with the unresolved bowls called out, so the
    // player knows exactly what is left to place by hand.
    const unresolved = results
      .filter((r) => r.status !== "scanned")
      .map((r) => r.number)
      .filter((n) => n >= 1 && n <= bowlsPerEnd);
    setScanNote(
      unresolved.length
        ? unresolved.length === 1
          ? `Bowl ${unresolved[0]} still needs placing — tap the target`
          : `${unresolved.length} bowls still need placing — tap the target`
        : null,
    );
    tryHaptic(16);
  }


  function handleClearEnd() {
    if (onClearEnd) {
      onClearEnd(currentEnd);
    } else {
      for (let i = 0; i < bowlsPerEnd; i++) onClear(currentEnd, i);
    }
    setEditIdx(null);
    setConfirmClear(false);
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

  function firstUnfinishedEnd(): number {
    for (let i = 0; i < ends; i++) if (!submitted[i]) return i;
    return ends - 1;
  }

  function handleAdvance() {
    // After submitting an edited earlier end, jump to the first still-unfinished
    // end rather than blindly incrementing; if all are submitted, finish.
    if (submitted.every(Boolean) || (currentEnd === ends - 1 && submitted[currentEnd])) {
      onFinish();
      return;
    }
    setCurrentEnd(firstUnfinishedEnd());
    setShowSummary(false);
    setEditIdx(null);
  }

  /**
   * Jump back to a previously submitted end to correct one or more bowls.
   * Unlocks that end and re-opens the recording view with existing markers.
   * Parent state (bowls/taps) is unchanged — the user can drag markers,
   * undo, or clear from within the recording UI, and totals recompute
   * reactively from the tap array.
   */
  function jumpToEnd(target: number) {
    if (target < 0 || target >= ends) return;
    setCurrentEnd(target);
    setSubmitted((prev) => {
      const next = prev.slice();
      next[target] = false;
      return next;
    });
    setShowSummary(false);
    setEditIdx(null);
    tryHaptic(10);
  }

  // Smart primary button
  let primaryLabel = "Place Bowl";
  let primaryDisabled = false;
  let primaryAction: () => void = () => {};
  const allEndsSubmitted = submitted.every(Boolean);
  if (showSummary) {
    primaryLabel = allEndsSubmitted ? (saving ? "Saving…" : "View Results") : "Next End";
    primaryDisabled = !!saving;
    primaryAction = handleAdvance;
  } else if (allPlaced) {
    primaryLabel = allEndsSubmitted ? "Re-submit End" : "Submit End";
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

  const endChips: EndChip[] = Array.from({ length: ends }, (_, i) => ({
    end: i + 1,
    submitted: submitted[i],
    current: i === currentEnd,
    // Reachable if it's already been submitted (can edit) or it's the next
    // sequential unfinished end.
    reachable: submitted[i] || i === firstUnfinishedEnd(),
    score: submitted[i] ? endScore(taps[i]) : null,
  }));

  const deliveryPills: DeliveryPill[] = Array.from({ length: bowlsPerEnd }, (_, i) => ({
    number: i + 1,
    hand: hands[i],
    placed: endBowls[i] !== null,
    current: !endSubmitted && i === activeBowl,
    sublabel: bowlStepLabels?.[i],
  }));

  const activeTargetLabel =
    activeBowl != null ? bowlTargetLabels?.[activeBowl] : undefined;

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
            {drillName}
            {titleSuffix}
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
          {endSubmitted ? (
            <p className="font-display text-sm font-bold text-success">
              End complete · tap to edit
            </p>
          ) : allPlaced ? (
            <p className="font-display text-sm font-bold text-primary">Submit end</p>
          ) : null}
        </div>

        {/* Always-visible ends navigator — tap a submitted end to edit it. */}
        <div className="mt-1.5">
          <EndPickerStrip ends={endChips} onJump={jumpToEnd} />
        </div>

        {/* Always-visible 4-bowl delivery order for this end. */}
        <div className="mt-1.5">
          <DeliveryOrderStrip bowls={deliveryPills} />
        </div>

        {/* Which target the current bowl is played to (multi-jack drills). */}
        {activeTargetLabel && (
          <div className="mt-1.5 rounded-lg bg-primary/10 px-2 py-1 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Target · {activeTargetLabel}
            </span>
          </div>
        )}

        {/* Prescribed instructions for this block — only the ones that apply. */}
        {prescriptionChips && prescriptionChips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {prescriptionChips.map((c) => (
              <span
                key={c}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* THE TARGET — fills the remaining space and ends with a HARD boundary.
          `overflow-hidden` + `z-0` guarantee that nothing belonging to the
          Visual Target (SVG bounds, marker halos, absolute labels) can paint
          or receive touches over the action row below. */}
      <div className="relative z-0 flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 pt-2 pb-3">
        {!showSummary ? (
          <div
            className="aspect-square w-full max-h-full"
            style={{ maxWidth: "min(100%, calc(100dvh - 330px))" }}
          >



            <VisualTarget
              value={currentTap ? { x: currentTap.x, y: currentTap.y } : null}
              onSelect={handleSelect}
              onMoveMarker={(bowlNumber, tap) => {
                // marker.number is 1-based bowl slot within the end
                onPlace(currentEnd, bowlNumber - 1, tap);
              }}
              hand={currentHand}
              markers={markers}
              currentNumber={currentNumber}
              hideReadout
              hideHint
              bandScale={bandScale}
            />
          </div>
        ) : (
          <div className="w-full max-w-sm animate-[fade-in_0.25s_ease-out] rounded-3xl bg-card p-5 text-center bt-shadow-elevated">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              End {currentEnd + 1} complete
            </p>
            <p className="mt-2 font-display text-5xl font-extrabold text-primary">
              {score}
              <span className="text-2xl text-muted-foreground"> / {endMaxScore}</span>
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

      {/* Bottom control panel — sits entirely below the target, never over it.
          `relative z-10` keeps every control above the target's stacking
          context so nothing transparent can swallow a tap. */}
      <div className="relative z-10 shrink-0 border-t border-border bg-card px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">

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
              return (
                <span
                  key={i}
                  aria-label={`Bowl ${i + 1} pending`}
                  className={`${base} bg-border`}
                />
              );
            })}
          </div>
        )}

        {/* What Head Scan couldn't resolve — placed by hand on this same end. */}
        {!showSummary && scanNote && (
          <p className="relative z-10 rounded-xl bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary">
            {scanNote}
          </p>
        )}

        {/* PRIMARY ACTION ROW — manual placement is dominant, Head Scan is the
            compact secondary entry method. Sits in its own stacking context
            ABOVE the target so it is always tappable. */}
        <div className="relative z-10 flex items-stretch gap-2">
          <button
            type="button"
            onClick={primaryAction}
            disabled={primaryDisabled || (!allPlaced && !showSummary)}
            className="h-14 min-w-0 flex-[2] rounded-2xl bt-gradient-primary px-3 text-sm font-extrabold uppercase tracking-wide text-primary-foreground bt-shadow-elevated active:scale-[0.99] transition disabled:opacity-50 disabled:active:scale-100 sm:text-base"
          >
            {primaryLabel}
          </button>
          {!showSummary && headScanEnabled && (
            <button
              type="button"
              onClick={() => {
                // USER GESTURE: the only place iOS will accept a
                // DeviceOrientation permission request from. Asked once ever,
                // then remembered; failure never blocks Head Scan.
                void ensureMotionPermission();
                setScanNote(null);
                setScanNonce((n) => n + 1);
                setHeadScanOpen(true);
              }}

              aria-label="Head Scan this end"
              className="relative z-10 flex h-14 flex-1 shrink-0 basis-[32%] items-center justify-center gap-1.5 rounded-2xl border border-primary/40 bg-primary/5 px-2 text-xs font-bold text-primary transition active:scale-[0.98] sm:max-w-[180px] sm:text-sm"
            >
              <Camera className="h-4 w-4 shrink-0" />
              <span className="truncate">Head Scan</span>
            </button>
          )}
        </div>


        {!showSummary && pauseSlot && <div className="w-full">{pauseSlot}</div>}

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
              onClick={() => setConfirmClear(true)}
              disabled={placedCountThisEnd === 0}
              className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-destructive/10 px-3 text-sm font-bold text-destructive disabled:opacity-40 active:scale-[0.98] transition"
            >
              <Eraser className="h-4 w-4" /> Clear End
            </button>
          </div>
        )}

        {editIdx !== null && !showSummary && (
          <p className="text-center text-[11px] font-semibold text-muted-foreground">
            Repositioning Bowl {editIdx + 1} — tap the target to save.
          </p>
        )}
      </div>

      {/* Clear End is deliberately destructive — always confirm first. */}
      {confirmClear && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 px-6">
          <div className="w-full max-w-xs rounded-3xl bg-card p-5 text-center bt-shadow-elevated">
            <p className="font-display text-lg font-extrabold">Clear this end?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clear all bowl entries for End {currentEnd + 1}? To fix one bowl, tap that bowl
              instead.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="h-11 rounded-2xl bg-secondary text-sm font-bold text-charcoal active:scale-[0.98] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearEnd}
                className="h-11 rounded-2xl bg-destructive text-sm font-bold text-destructive-foreground active:scale-[0.98] transition"
              >
                Clear End
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Head Scan overlay — ONE photo covers every unresolved bowl of this
          end. Back/cancel simply unmounts it, so the recorder state (end,
          current bowl, placed bowls, timer, notes) is untouched. The `key`
          forces a fresh mount on every open so re-entry can never hit stale
          camera/marking state. */}
      {headScanOpen && (
        <HeadScanFlow
          key={`scan-${currentEnd}-${scanNonce}`}
          endNumber={currentEnd + 1}
          bowls={headScanBowls}
          onCancel={() => setHeadScanOpen(false)}
          onComplete={applyHeadScan}
        />
      )}

    </div>

  );
}
