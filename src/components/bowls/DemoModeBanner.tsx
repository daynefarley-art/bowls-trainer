import { useDemoMode } from "@/lib/demo-mode";
import { Target } from "lucide-react";
import { toast } from "sonner";

export function DemoModeBanner() {
  const { enabled, setEnabled } = useDemoMode();
  if (!enabled) return null;
  return (
    <div className="sticky top-0 z-40 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-amber-900 dark:text-amber-100 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-2 text-xs font-semibold">
        <Target className="h-4 w-4 shrink-0" />
        <div className="flex-1 leading-tight">
          <p className="font-bold">Demo Mode Active</p>
          <p className="text-[11px] opacity-90">Results and statistics will not be saved.</p>
        </div>
        <button
          onClick={() => {
            setEnabled(false);
            toast.success("Demo Mode turned off");
          }}
          className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-amber-700"
        >
          Turn Off
        </button>
      </div>
    </div>
  );
}
