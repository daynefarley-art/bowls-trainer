// Normalize bowl coordinate data from various breakdown shapes used across
// drills (record-draw / SLiMeD) and challenges (drive-then-draw, keep-it-up,
// traffic-jam). All produce a flat array of NormalisedBowl, suitable for the
// dev Session Replay viewer.

export type NormalisedBowl = {
  end: number;
  bowl: number;
  hand?: "forehand" | "backhand";
  x?: number;
  y?: number;
  points?: number;
  band?: string;
  key?: string;
  kind?: string; // e.g. "drive", "draw"
  target?: string; // SLiMeD: S/M/L/D
  weight?: string;
  line?: string;
};

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

/** Extract bowls from a breakdown jsonb (drill OR challenge result). */
export function extractBowls(breakdown: unknown): NormalisedBowl[] {
  const bd = (breakdown ?? {}) as Record<string, unknown>;
  const out: NormalisedBowl[] = [];

  // Shape A — drills / SLiMeD: flat array at breakdown.bowls
  const rawFlat = bd.bowls;
  if (Array.isArray(rawFlat)) {
    for (const raw of rawFlat as Array<Record<string, unknown>>) {
      // SLiMeD uses bowl_number + circuit; draw drills use end+bowl
      const end = num(raw.end) ?? num(raw.circuit) ?? 1;
      const bowl = num(raw.bowl) ?? num(raw.bowl_number) ?? out.length + 1;
      out.push({
        end,
        bowl,
        hand: (str(raw.hand) as NormalisedBowl["hand"]) ?? undefined,
        x: num(raw.x),
        y: num(raw.y),
        points: num(raw.points) ?? num(raw.score),
        band: str(raw.band),
        key: str(raw.key),
        target: str(raw.target),
        weight: str(raw.weight),
        line: str(raw.line),
      });
    }
    return out;
  }

  // Shape B — drive-then-draw style: breakdown.ends[].bowls[]
  const ends = bd.ends;
  if (Array.isArray(ends)) {
    for (const e of ends as Array<Record<string, unknown>>) {
      const endNum = num(e.end_number) ?? num(e.end) ?? 1;
      const bowls = Array.isArray(e.bowls) ? (e.bowls as Array<Record<string, unknown>>) : [];
      bowls.forEach((raw, i) => {
        out.push({
          end: endNum,
          bowl: num(raw.bowl) ?? i + 1,
          hand: (str(raw.hand) as NormalisedBowl["hand"]) ?? undefined,
          x: num(raw.x),
          y: num(raw.y),
          points: num(raw.points) ?? num(raw.score),
          band: str(raw.band),
          key: str(raw.key),
          kind: str(raw.kind),
        });
      });
    }
    return out;
  }

  return out;
}

/** Group bowls into ends, keyed by end number, preserving insertion order. */
export function groupByEnd(bowls: NormalisedBowl[]): { end: number; bowls: NormalisedBowl[] }[] {
  const map = new Map<number, NormalisedBowl[]>();
  for (const b of bowls) {
    const arr = map.get(b.end) ?? [];
    arr.push(b);
    map.set(b.end, arr);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([end, bowls]) => ({ end, bowls }));
}

export function hasVisualCoords(bowls: NormalisedBowl[]): boolean {
  return bowls.some((b) => typeof b.x === "number" && typeof b.y === "number");
}
