import { CheckCircle2, Circle, PlayCircle, SkipForward } from "lucide-react";
import type { TrainerBlock } from "@/lib/trainer";

const TYPE_LABEL: Record<string, string> = {
  warmup: "Warm-up",
  focus: "Focus",
  challenge: "Challenge",
  cooldown: "Cool-down",
};

export function TrainerBlockList({
  blocks,
  activeId,
}: {
  blocks: TrainerBlock[];
  activeId?: string | null;
}) {
  return (
    <ol className="space-y-2">
      {blocks.map((b) => {
        const done = b.status === "completed";
        const skipped = b.status === "skipped";
        const isNext = b.id === activeId;
        return (
          <li
            key={b.id}
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              isNext ? "border-primary bg-primary/5" : "border-border/60"
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {done ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : skipped ? (
                <SkipForward className="h-5 w-5 text-muted-foreground" />
              ) : isNext ? (
                <PlayCircle className="h-5 w-5 text-primary" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/60" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                {TYPE_LABEL[b.block_type] ?? b.block_type} • {b.planned_minutes} min
              </p>
              <p className={`font-semibold leading-tight ${done ? "text-muted-foreground line-through" : skipped ? "text-muted-foreground" : ""}`}>
                {b.title}
              </p>
              {b.reason && <p className="mt-0.5 text-xs text-muted-foreground">{b.reason}</p>}
              {done && b.percentage != null && (
                <p className="mt-1 text-xs font-semibold text-primary">Scored {Math.round(Number(b.percentage))}%</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
