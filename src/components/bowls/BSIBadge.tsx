import { bsiLevel } from "@/lib/bowls";

export function BSIBadge({ bsi, size = "md" }: { bsi: number; size?: "sm" | "md" | "lg" }) {
  const level = bsiLevel(bsi);
  const sz = size === "lg" ? "h-28 w-28 text-4xl" : size === "sm" ? "h-12 w-12 text-sm" : "h-20 w-20 text-2xl";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${sz} flex flex-col items-center justify-center rounded-full font-display font-extrabold text-white bt-shadow-elevated`}
        style={{ background: `linear-gradient(135deg, ${level.color}, oklch(0.7 0.14 150))` }}
      >
        <span className="leading-none">{Math.round(bsi)}</span>
        {size === "lg" && <span className="text-[10px] font-semibold opacity-90">BSI</span>}
      </div>
      {size !== "sm" && <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{level.label}</span>}
    </div>
  );
}
