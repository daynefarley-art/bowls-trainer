import { useEffect, useMemo, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReplayTarget } from "./ReplayTarget";
import { groupByEnd, hasVisualCoords, type NormalisedBowl } from "@/lib/dev-replay";

type Props = {
  bowls: NormalisedBowl[];
  /** ms per step during play. */
  stepMs?: number;
};

/**
 * Bowl-by-bowl replay used by the Developer Dashboard. Skips bowls without
 * (x,y) coordinates (e.g. drive shots in drive-then-draw) when rendering
 * markers, but they are still represented in the bowl table below.
 */
export function VisualReplay({ bowls, stepMs = 900 }: Props) {
  const visualBowls = useMemo(() => bowls.filter((b) => typeof b.x === "number" && typeof b.y === "number"), [bowls]);
  const ends = useMemo(() => groupByEnd(visualBowls), [visualBowls]);

  const [endIdx, setEndIdx] = useState(0);
  const [step, setStep] = useState(0); // bowls revealed in current end (1..bowls.length)
  const [playing, setPlaying] = useState(false);

  const currentEnd = ends[endIdx];
  const totalInEnd = currentEnd?.bowls.length ?? 0;

  useEffect(() => {
    setStep(0);
  }, [endIdx]);

  useEffect(() => {
    if (!playing) return;
    if (step >= totalInEnd) {
      // advance to next end if available
      if (endIdx + 1 < ends.length) {
        const t = setTimeout(() => {
          setEndIdx(endIdx + 1);
        }, stepMs);
        return () => clearTimeout(t);
      }
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), stepMs);
    return () => clearTimeout(t);
  }, [playing, step, totalInEnd, endIdx, ends.length, stepMs]);

  if (!hasVisualCoords(bowls)) {
    return (
      <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
        No visual scoring coordinates were recorded for this activity.
      </p>
    );
  }

  const markers = (currentEnd?.bowls ?? []).slice(0, step).map((b, i) => ({
    x: b.x!,
    y: b.y!,
    n: b.bowl ?? i + 1,
    hand: b.hand,
    active: i === step - 1,
  }));
  const activeBowl = currentEnd?.bowls[step - 1] ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Select value={String(endIdx)} onValueChange={(v) => { setPlaying(false); setEndIdx(Number(v)); }}>
          <SelectTrigger className="h-9 w-auto min-w-[7rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ends.map((e, i) => (
              <SelectItem key={e.end} value={String(i)}>End {e.end}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs font-semibold text-muted-foreground">
          Bowl {Math.max(step, 0)} / {totalInEnd}
        </p>
      </div>

      <ReplayTarget markers={markers} />

      <div className="grid grid-cols-5 gap-1">
        <Button size="sm" variant="outline" onClick={() => { setPlaying(false); setStep(0); setEndIdx(0); }} title="Restart">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} disabled={step <= 0} title="Step back">
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={() => setPlaying((p) => !p)} title={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setPlaying(false); setStep((s) => Math.min(totalInEnd, s + 1)); }} disabled={step >= totalInEnd} title="Step forward">
          <SkipForward className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setPlaying(false); setEndIdx((i) => Math.min(ends.length - 1, i + 1)); }} disabled={endIdx >= ends.length - 1} title="Next end">
          End+
        </Button>
      </div>

      {activeBowl && (
        <div className="rounded-2xl bg-card p-3 text-xs bt-shadow-elevated">
          <p className="font-bold">End {activeBowl.end} · Bowl {activeBowl.bowl}</p>
          <p className="text-muted-foreground">
            {activeBowl.hand ?? "—"} · {activeBowl.points ?? 0} pts
            {activeBowl.band ? ` · ${activeBowl.band}` : ""}
            {activeBowl.target ? ` · target ${activeBowl.target}` : ""}
            {activeBowl.weight ? ` · ${activeBowl.weight}` : ""}
            {activeBowl.line ? ` · ${activeBowl.line}` : ""}
          </p>
          {typeof activeBowl.x === "number" && typeof activeBowl.y === "number" && (
            <p className="text-muted-foreground">x {activeBowl.x.toFixed(2)} · y {activeBowl.y.toFixed(2)} mats</p>
          )}
        </div>
      )}
    </div>
  );
}
