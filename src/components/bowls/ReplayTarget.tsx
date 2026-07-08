// Static, read-only top-down draw target used for Session Replay in the
// Developer Dashboard. Mirrors VisualTarget visuals but renders no
// interactive surface — bowls are drawn at supplied coordinates with
// hand-coloured numbered markers.

type Marker = {
  x: number;
  y: number;
  n: number;
  hand?: "forehand" | "backhand";
  active?: boolean;
  dim?: boolean;
};

const UNIT = 50;
const VB = 200;
const HALF = VB / 2;

function markerFill(hand?: "forehand" | "backhand") {
  return hand === "backhand" ? "var(--color-bowl-backhand)" : "var(--color-bowl-forehand)";
}

export function ReplayTarget({ markers }: { markers: Marker[] }) {
  return (
    <div className="relative mx-auto aspect-square w-full">
      <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 z-10 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground/80">Long</span>
      <span className="pointer-events-none absolute left-1/2 bottom-1 -translate-x-1/2 z-10 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground/80">Short</span>
      <span className="pointer-events-none absolute top-1/2 left-1 -translate-y-1/2 z-10 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground/80 [writing-mode:vertical-rl] rotate-180">Left</span>
      <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 z-10 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground/80 [writing-mode:vertical-rl]">Right</span>
      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-secondary/40">
        <svg viewBox={`${-HALF} ${-HALF} ${VB} ${VB}`} className="h-full w-full">
          <circle cx={0} cy={0} r={2 * UNIT} fill="var(--color-card)" stroke="var(--color-border)" strokeWidth={1.5} />
          <circle cx={0} cy={0} r={1 * UNIT} fill="var(--color-secondary)" stroke="var(--color-border)" strokeWidth={1.5} />
          <circle cx={0} cy={0} r={0.5 * UNIT} fill="var(--color-card)" stroke="var(--color-border)" strokeWidth={1.5} />
          <line x1={-HALF} y1={0} x2={HALF} y2={0} stroke="var(--color-border)" strokeDasharray="3 4" strokeWidth={0.6} />
          <line x1={0} y1={-HALF} x2={0} y2={HALF} stroke="var(--color-border)" strokeDasharray="3 4" strokeWidth={0.6} />
          <circle cx={0} cy={0} r={7} fill="white" stroke="var(--color-primary)" strokeWidth={1.5} />
          <text x={0} y={2.6} textAnchor="middle" fontSize="8" fontWeight={900} fill="var(--color-primary)" style={{ fontFamily: "var(--font-display)" }}>J</text>

          {markers.map((m) => {
            const r = m.active ? 9 : 7;
            const cx = m.x * UNIT;
            const cy = -m.y * UNIT;
            return (
              <g key={`rm-${m.n}-${m.x}-${m.y}`} opacity={m.dim ? 0.35 : 1}>
                {m.active && <circle cx={cx} cy={cy} r={r + 4} fill={markerFill(m.hand)} fillOpacity={0.22} />}
                <circle cx={cx} cy={cy} r={r} fill={markerFill(m.hand)} stroke="white" strokeWidth={1.3} />
                <text x={cx} y={cy + (r > 8 ? 3.2 : 2.8)} textAnchor="middle" fontSize={r > 8 ? 10 : 9} fontWeight={800} fill="white" style={{ fontFamily: "var(--font-display)" }}>{m.n}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
