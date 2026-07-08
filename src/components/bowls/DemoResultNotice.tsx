import { Target } from "lucide-react";

export function DemoResultNotice({ label = "Demo Result" }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-100">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Target className="h-4 w-4" /> {label}
      </div>
      <p className="mt-0.5 text-xs opacity-90">This result has not been saved.</p>
    </div>
  );
}
