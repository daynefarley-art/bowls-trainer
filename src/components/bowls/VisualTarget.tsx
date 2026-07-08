import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Visual Scoring 5.0 — simplified direct placement + native pinch-to-zoom.
 *
 * - Tap: place the bowl exactly where the finger touches.
 * - Drag: bowl follows the finger 1:1.
 * - Pinch: two-finger pinch zooms the target (max ~2×) and pans while zoomed.
 *   Marker glyphs stay visually constant — only the target enlarges.
 * - Double-tap: reset zoom + pan.
 * - Hard placement boundary at r=2.6 mats. Marker never disappears.
 * - Live score chip, active ring glow, guide line, cm-from-jack readout.
 * - First-time tip explains tap-and-pinch (max 2 displays, opt-out).
 *
 * Scoring bands (unchanged):
 *   distance <= 0.5 → 5 pts (Half Mat)
 *   distance <= 1.0 → 3 pts (One Mat)
 *   distance <= 2.0 → 1 pt  (Two Mats)
 *   else            → 0 pts (Outside)
 */

export type VisualBand = "half" | "one" | "two" | "outside";

export type VisualTap = {
  x: number;
  y: number;
  distance: number;
  band: VisualBand;
  points: number;
  key: string;
};

export type PlacedMarker = {
  x: number;
  y: number;
  number: number;
  hand?: "forehand" | "backhand";
  active?: boolean;
};

const BAND_TO_KEY: Record<VisualBand, { key: string; points: number; label: string }> = {
  half: { key: "half_mat", points: 5, label: "Half Mat" },
  one: { key: "one_mat", points: 3, label: "One Mat" },
  two: { key: "two_mats", points: 1, label: "Two Mats" },
  outside: { key: "outside_two_mats", points: 0, label: "Outside" },
};

export function classifyTap(x: number, y: number): VisualTap {
  const distance = Math.sqrt(x * x + y * y);
  let band: VisualBand;
  if (distance <= 0.5) band = "half";
  else if (distance <= 1.0) band = "one";
  else if (distance <= 2.0) band = "two";
  else band = "outside";
  const { key, points } = BAND_TO_KEY[band];
  return { x, y, distance, band, points, key };
}

export function bandLabel(band: VisualBand): string {
  return BAND_TO_KEY[band].label;
}

type Props = {
  value?: { x: number; y: number } | null;
  onSelect: (tap: VisualTap) => void;
  hand?: "forehand" | "backhand";
  markers?: PlacedMarker[];
  currentNumber?: number;
  hideReadout?: boolean;
  hideHint?: boolean;
};

// SVG coords: 1 mat = 50 units. Base viewBox 280 → radius up to 2.8 mats.
const UNIT = 50;
const VB = 280;
const HALF = VB / 2;
const MAX_R_MAT = 2.6;
const MAX_R_SVG = MAX_R_MAT * UNIT;
const CM_PER_MAT = 183;
const MIN_ZOOM = 1;
const MAX_ZOOM = 2;

// -------- First-time onboarding tip ---------------------------------------

const TIP_KEY = "bt-visual-scoring-tip-shown";
const TIP_MAX_SHOWS = 2;

function readTipState(): { shows: number; done: boolean } {
  if (typeof window === "undefined") return { shows: 0, done: false };
  try {
    const raw = window.localStorage.getItem(TIP_KEY);
    if (!raw) return { shows: 0, done: false };
    const parsed = JSON.parse(raw);
    return { shows: Number(parsed?.shows ?? 0) || 0, done: !!parsed?.done };
  } catch {
    return { shows: 0, done: false };
  }
}

function writeTipState(shows: number, done: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TIP_KEY, JSON.stringify({ shows, done }));
  } catch {
    /* ignore */
  }
}

function VisualScoringTip({ open, onClose }: { open: boolean; onClose: (dontShow: boolean) => void }) {
  const [dontShow, setDontShow] = useState(false);
  useEffect(() => {
    if (!open) setDontShow(false);
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(dontShow); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>💡 Precision Placement</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tap to quickly place a bowl. Or pinch with two fingers to zoom in for
          even more accurate placement.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={dontShow}
            onCheckedChange={(v) => setDontShow(v === true)}
          />
          <span>Don't show this again</span>
        </label>
        <DialogFooter>
          <Button className="w-full" onClick={() => onClose(dontShow)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Target graphics --------------------------------------------------

function TargetGraphics({
  activeBand,
  boundaryGlow,
}: {
  activeBand?: VisualBand | null;
  boundaryGlow?: boolean;
}) {
  const glowColor = "var(--color-primary)";
  return (
    <>
      <circle
        cx={0}
        cy={0}
        r={MAX_R_SVG}
        fill="none"
        stroke={boundaryGlow ? "var(--color-destructive)" : "var(--color-border)"}
        strokeWidth={boundaryGlow ? 2 : 0.8}
        strokeDasharray="2 3"
        strokeOpacity={boundaryGlow ? 0.9 : 0.5}
        className={boundaryGlow ? "bt-ring-glow" : undefined}
      />
      <circle
        cx={0} cy={0} r={2 * UNIT}
        fill="var(--color-card)"
        stroke={activeBand === "two" ? glowColor : "var(--color-border)"}
        strokeWidth={activeBand === "two" ? 2.5 : 1.5}
        className={activeBand === "two" ? "bt-ring-glow" : undefined}
      />
      <circle
        cx={0} cy={0} r={1 * UNIT}
        fill="var(--color-secondary)"
        stroke={activeBand === "one" ? glowColor : "var(--color-border)"}
        strokeWidth={activeBand === "one" ? 2.5 : 1.5}
        className={activeBand === "one" ? "bt-ring-glow" : undefined}
      />
      <circle
        cx={0} cy={0} r={0.5 * UNIT}
        fill="var(--color-card)"
        stroke={activeBand === "half" ? glowColor : "var(--color-border)"}
        strokeWidth={activeBand === "half" ? 2.5 : 1.5}
        className={activeBand === "half" ? "bt-ring-glow" : undefined}
      />
      <line x1={-HALF} y1={0} x2={HALF} y2={0} stroke="var(--color-border)" strokeDasharray="3 4" strokeWidth={0.6} />
      <line x1={0} y1={-HALF} x2={0} y2={HALF} stroke="var(--color-border)" strokeDasharray="3 4" strokeWidth={0.6} />
      <circle cx={0} cy={0} r={7} fill="white" stroke="var(--color-primary)" strokeWidth={1.5} />
      <text x={0} y={2.6} textAnchor="middle" fontSize="8" fontWeight={900} fill="var(--color-primary)" style={{ fontFamily: "var(--font-display)" }}>J</text>
      <text x={0} y={-1.5 * UNIT + 3} textAnchor="middle" fontSize="8" fill="var(--color-muted-foreground)">2m · 1</text>
      <text x={0} y={-0.75 * UNIT + 3} textAnchor="middle" fontSize="8" fill="var(--color-muted-foreground)">1m · 3</text>
      <text x={0} y={-0.25 * UNIT + 3} textAnchor="middle" fontSize="7" fill="var(--color-muted-foreground)">½ · 5</text>
    </>
  );
}

function markerFill(hand?: "forehand" | "backhand") {
  return hand === "backhand" ? "var(--color-bowl-backhand)" : "var(--color-bowl-forehand)";
}

/**
 * Marker whose glyph stays visually constant regardless of viewBox zoom.
 * `unitScale` = current viewBox size / base viewBox size — we multiply radii
 * and font size by it so a 2× zoom (smaller viewBox) shrinks marker units.
 */
function NumberedMarker({
  x, y, n, hand, active, settle, unitScale = 1,
}: {
  x: number; y: number; n: number;
  hand?: "forehand" | "backhand";
  active?: boolean;
  settle?: boolean;
  unitScale?: number;
}) {
  const r = (active ? 9 : 7) * unitScale;
  const fontSize = (active ? 10 : 9) * unitScale;
  return (
    <g
      className={settle ? "bt-marker-settle" : undefined}
      style={settle ? { transformOrigin: `${x}px ${y}px`, transformBox: "fill-box" } : undefined}
    >
      {active && (
        <circle cx={x} cy={y} r={r + 4 * unitScale} fill={markerFill(hand)} fillOpacity={0.18} />
      )}
      <circle cx={x} cy={y} r={r} fill={markerFill(hand)} stroke="white" strokeWidth={1.3 * unitScale} />
      <text
        x={x}
        y={y + (active ? 3.2 : 2.8) * unitScale}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={800}
        fill="white"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {n}
      </text>
    </g>
  );
}

function tryHaptic(ms = 8) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(ms);
  } catch { /* ignore */ }
}

function bandScoreColor(band: VisualBand): string {
  switch (band) {
    case "half": return "text-success";
    case "one":  return "text-primary";
    case "two":  return "text-accent-foreground";
    default:     return "text-muted-foreground";
  }
}

function bandDotColor(band: VisualBand): string {
  switch (band) {
    case "half": return "#22c55e";
    case "one":  return "#eab308";
    case "two":  return "#f97316";
    default:     return "#9ca3af";
  }
}

function clampToBoundary(svgX: number, svgY: number): { x: number; y: number; hit: boolean } {
  const d = Math.hypot(svgX, svgY);
  if (d <= MAX_R_SVG) return { x: svgX, y: svgY, hit: false };
  const k = MAX_R_SVG / d;
  return { x: svgX * k, y: svgY * k, hit: true };
}

type Placing = {
  svgX: number;
  svgY: number;
  atBoundary: boolean;
};

export function VisualTarget({ value, onSelect, hand, markers, currentNumber, hideReadout, hideHint }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pending, setPending] = useState<VisualTap | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [settleKey, setSettleKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // pan is the SVG-coord center of the viewBox
  const [tipOpen, setTipOpen] = useState(false);

  const lastBand = useRef<VisualBand | null>(null);
  const lastBoundary = useRef<boolean>(false);
  const draggingRef = useRef(false);
  const pinchRef = useRef<{ dist: number; zoom: number; pan: { x: number; y: number }; midSvg: { x: number; y: number } } | null>(null);
  const lastTapAt = useRef<number>(0);

  // Show first-time tip.
  useEffect(() => {
    const state = readTipState();
    if (state.done) return;
    if (state.shows >= TIP_MAX_SHOWS) return;
    // Delay slightly so the target renders before the tip.
    const t = window.setTimeout(() => setTipOpen(true), 250);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!value) setPending(null);
  }, [value]);
  useEffect(() => {
    setPending(null);
    setPlacing(null);
    lastBand.current = null;
    lastBoundary.current = false;
  }, [currentNumber]);

  const closeTip = useCallback((dontShow: boolean) => {
    const state = readTipState();
    if (dontShow) writeTipState(state.shows + 1, true);
    else writeTipState(state.shows + 1, state.shows + 1 >= TIP_MAX_SHOWS);
    setTipOpen(false);
  }, []);

  /** Convert container-local px → SVG coords, accounting for zoom + pan. */
  const localToSvg = useCallback((localX: number, localY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const vbSize = VB / zoom;
    const vbLeft = pan.x - vbSize / 2;
    const vbTop = pan.y - vbSize / 2;
    const sx = vbLeft + (localX / rect.width) * vbSize;
    const sy = vbTop + (localY / rect.height) * vbSize;
    return { x: sx, y: sy };
  }, [zoom, pan.x, pan.y]);

  const computePlacing = useCallback((clientX: number, clientY: number): Placing | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const { x: rawSvgX, y: rawSvgY } = localToSvg(clientX - rect.left, clientY - rect.top);
    const { x: svgX, y: svgY, hit } = clampToBoundary(rawSvgX, rawSvgY);
    return { svgX, svgY, atBoundary: hit };
  }, [localToSvg]);

  const updatePlacing = useCallback((clientX: number, clientY: number) => {
    const p = computePlacing(clientX, clientY);
    if (!p) return;
    const tap = classifyTap(p.svgX / UNIT, -p.svgY / UNIT);
    if (lastBand.current && lastBand.current !== tap.band) tryHaptic(6);
    lastBand.current = tap.band;
    if (p.atBoundary && !lastBoundary.current) tryHaptic(10);
    lastBoundary.current = p.atBoundary;
    setPlacing(p);
  }, [computePlacing]);

  const commitPlacement = useCallback((p: Placing) => {
    const tap = classifyTap(p.svgX / UNIT, -p.svgY / UNIT);
    setPending(tap);
    setSettleKey((k) => k + 1);
    tryHaptic(14);
    onSelect(tap);
  }, [onSelect]);

  /** Clamp pan so the visible viewBox stays inside the base target box. */
  const clampPan = useCallback((p: { x: number; y: number }, z: number) => {
    const vbSize = VB / z;
    const maxOffset = (VB - vbSize) / 2;
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, p.x)),
      y: Math.max(-maxOffset, Math.min(maxOffset, p.y)),
    };
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        // Pinch start — cancel any in-progress placement.
        e.preventDefault();
        draggingRef.current = false;
        setPlacing(null);
        const [a, b] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const rect = el.getBoundingClientRect();
        const midClientX = (a.clientX + b.clientX) / 2;
        const midClientY = (a.clientY + b.clientY) / 2;
        const midSvg = localToSvg(midClientX - rect.left, midClientY - rect.top);
        pinchRef.current = { dist, zoom, pan: { ...pan }, midSvg };
        return;
      }
      const t = e.touches[0];

      // Double-tap detection → reset view.
      const now = Date.now();
      if (now - lastTapAt.current < 280) {
        lastTapAt.current = 0;
        resetView();
        return;
      }
      lastTapAt.current = now;

      draggingRef.current = true;
      lastBand.current = null;
      lastBoundary.current = false;
      updatePlacing(t.clientX, t.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (pinchRef.current && e.touches.length >= 2) {
        e.preventDefault();
        const [a, b] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const factor = dist / pinchRef.current.dist;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchRef.current.zoom * factor));
        // Keep the SVG point under the midpoint stable during pinch.
        // pan_new = midSvg - (midSvg - pan_old) * (z_old / z_new) → but our
        // pan is the viewBox center, and midSvg is invariant. Solve:
        //   midSvg = pan + (midClient - center) * (VB/z) / rect
        // Simpler: recompute midSvg using new zoom, then shift pan so the
        // captured midSvg stays under the new midpoint.
        const rect = el.getBoundingClientRect();
        const midClientX = (a.clientX + b.clientX) / 2;
        const midClientY = (a.clientY + b.clientY) / 2;
        // Under (newZoom, pinchRef.pan) the point at midClient would map to:
        const vbSize = VB / newZoom;
        const vbLeft = pinchRef.current.pan.x - vbSize / 2;
        const vbTop = pinchRef.current.pan.y - vbSize / 2;
        const mappedX = vbLeft + ((midClientX - rect.left) / rect.width) * vbSize;
        const mappedY = vbTop + ((midClientY - rect.top) / rect.height) * vbSize;
        const dx = pinchRef.current.midSvg.x - mappedX;
        const dy = pinchRef.current.midSvg.y - mappedY;
        const np = clampPan({ x: pinchRef.current.pan.x + dx, y: pinchRef.current.pan.y + dy }, newZoom);
        setZoom(newZoom);
        setPan(np);
        return;
      }
      if (!draggingRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      updatePlacing(t.clientX, t.clientY);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (pinchRef.current && e.touches.length < 2) {
        pinchRef.current = null;
        // Auto-recenter when zoomed back to 1×.
        if (zoom <= 1.001) setPan({ x: 0, y: 0 });
        return;
      }
      if (e.touches.length === 0 && draggingRef.current) {
        draggingRef.current = false;
        setPlacing((cur) => {
          if (cur) commitPlacement(cur);
          return null;
        });
        lastBand.current = null;
        lastBoundary.current = false;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [updatePlacing, commitPlacement, localToSvg, clampPan, zoom, pan, resetView]);

  // Mouse desktop parity.
  const mouseDragging = useRef(false);
  const onMouseDown = (e: React.MouseEvent) => {
    if ("ontouchstart" in window) return;
    mouseDragging.current = true;
    lastBand.current = null;
    lastBoundary.current = false;
    updatePlacing(e.clientX, e.clientY);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!mouseDragging.current) return;
    updatePlacing(e.clientX, e.clientY);
  };
  const onMouseUp = () => {
    if (!mouseDragging.current) return;
    mouseDragging.current = false;
    setPlacing((cur) => {
      if (cur) commitPlacement(cur);
      return null;
    });
    lastBand.current = null;
    lastBoundary.current = false;
  };
  const onDoubleClick = () => resetView();

  const showLive = currentNumber != null || value != null;
  const settledMarker = showLive ? (pending ?? (value ? classifyTap(value.x, value.y) : null)) : null;
  const mx = settledMarker ? settledMarker.x * UNIT : null;
  const my = settledMarker ? -settledMarker.y * UNIT : null;
  const liveNumber = currentNumber ?? ((markers?.length ?? 0) + 1);

  const dragging = placing != null;
  const liveTap = useMemo<VisualTap | null>(() => {
    if (!placing) return null;
    return classifyTap(placing.svgX / UNIT, -placing.svgY / UNIT);
  }, [placing]);
  const activeBand = liveTap?.band ?? null;

  const liveSvgX = dragging && placing ? placing.svgX : mx;
  const liveSvgY = dragging && placing ? placing.svgY : my;

  const distanceCm = liveTap ? Math.round(liveTap.distance * CM_PER_MAT) : null;

  const vbSize = VB / zoom;
  const vbX = pan.x - vbSize / 2;
  const vbY = pan.y - vbSize / 2;
  const unitScale = 1 / zoom; // keep marker glyphs constant CSS-size

  return (
    <div className="space-y-2">
      <div className="relative mx-auto aspect-square w-full">
        <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 z-10 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground/80">Long</span>
        <span className="pointer-events-none absolute left-1/2 bottom-1 -translate-x-1/2 z-10 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground/80">Short</span>
        <span className="pointer-events-none absolute top-1/2 left-1 -translate-y-1/2 z-10 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground/80 [writing-mode:vertical-rl] rotate-180">Left</span>
        <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 z-10 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground/80 [writing-mode:vertical-rl]">Right</span>

        <div
          ref={containerRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onDoubleClick={onDoubleClick}
          onMouseLeave={() => {
            if (mouseDragging.current) {
              mouseDragging.current = false;
              setPlacing(null);
            }
          }}
          className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-secondary/40 touch-none select-none"
          style={{ WebkitUserSelect: "none" }}
        >
          <svg viewBox={`${vbX} ${vbY} ${vbSize} ${vbSize}`} className="h-full w-full">
            <TargetGraphics activeBand={activeBand} boundaryGlow={placing?.atBoundary} />

            {markers?.map((m) => (
              <NumberedMarker
                key={`m-${m.number}`}
                x={m.x * UNIT}
                y={-m.y * UNIT}
                n={m.number}
                hand={m.hand}
                active={m.active}
                unitScale={unitScale}
              />
            ))}

            {dragging && placing && (
              <line
                x1={0} y1={0}
                x2={placing.svgX} y2={placing.svgY}
                stroke="var(--color-primary)"
                strokeOpacity={0.5}
                strokeWidth={1.2 * unitScale}
                strokeDasharray={`${3 * unitScale} ${3 * unitScale}`}
              />
            )}

            {liveSvgX != null && liveSvgY != null && (
              <NumberedMarker
                key={`live-${settleKey}`}
                x={liveSvgX}
                y={liveSvgY}
                n={liveNumber}
                hand={hand}
                active
                settle={!dragging && pending != null}
                unitScale={unitScale}
              />
            )}
          </svg>

          {zoom > 1.01 && (
            <button
              type="button"
              onClick={resetView}
              className="absolute right-2 top-2 z-20 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-bold text-foreground shadow"
            >
              {zoom.toFixed(1)}× · Reset
            </button>
          )}

          {dragging && placing && liveTap && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 shadow-md border border-border">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: bandDotColor(liveTap.band) }} />
                <span className={`font-display text-[11px] font-extrabold leading-none ${bandScoreColor(liveTap.band)}`}>
                  {liveTap.points} pt{liveTap.points === 1 ? "" : "s"}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground leading-none">
                  {bandLabel(liveTap.band)}
                </span>
              </div>
              {distanceCm != null && (
                <span className="text-[9px] font-semibold text-muted-foreground leading-none rounded-full bg-card/80 px-1.5 py-0.5">
                  {distanceCm} cm from jack
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {!hideHint && (
        <p className="text-center text-[10px] text-muted-foreground">
          Tap or drag to place · pinch to zoom · double-tap to reset
        </p>
      )}
      {!hideReadout && settledMarker && !dragging && (
        <p className="text-center text-xs font-semibold text-muted-foreground">
          {bandLabel(settledMarker.band)} · {settledMarker.points} pt{settledMarker.points === 1 ? "" : "s"} · {settledMarker.distance.toFixed(2)} mats
        </p>
      )}

      <VisualScoringTip open={tipOpen} onClose={closeTip} />
    </div>
  );
}
