import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Target } from "lucide-react";
import { toast } from "sonner";

export function GhostBanner({
  challengeId,
  ghostUserId,
  fallbackName,
  fallbackScore,
  currentScore,
  isSurvival,
}: {
  challengeId?: string;
  ghostUserId?: string;
  fallbackName?: string | null;
  fallbackScore?: number | null;
  currentScore?: number | null;
  isSurvival?: boolean;
}) {
  const fallbackData = fallbackScore == null ? null : {
    full_name: fallbackName ?? null,
    best_score: fallbackScore,
    is_survival: isSurvival ?? false,
  };

  const q = useQuery({
    queryKey: ["ghost-target", challengeId, ghostUserId],
    enabled: !!challengeId && !!ghostUserId && !fallbackData,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("ghost_target", {
        _challenge_id: challengeId,
        _user_id: ghostUserId,
      });
      if (error) throw error;
      return (data?.[0] ?? null) as {
        full_name: string | null;
        best_score: number | null;
        is_survival: boolean;
      } | null;
    },
  });

  // Surface an error toast once if the ghost target cannot be loaded,
  // so tapping "Beat [Name]" from a Squad ladder never fails silently.
  useEffect(() => {
    if (!ghostUserId || fallbackData) return;
    if (q.isError) {
      toast.error("Unable to load this challenge target. Playing without a ghost.");
    } else if (q.isSuccess && (!q.data || q.data.best_score == null)) {
      toast.message("No score to chase yet — this player hasn't logged a result.");
    }
  }, [ghostUserId, fallbackData, q.isError, q.isSuccess, q.data]);

  const targetData = fallbackData ?? q.data;

  if (!ghostUserId || !targetData || targetData.best_score == null) return null;

  const target = Number(targetData.best_score);
  const you = currentScore ?? 0;
  const diff = target - you;
  const survival = targetData.is_survival ?? isSurvival ?? false;
  const unit = survival ? "ends" : "pts";

  let msg = "";
  if (currentScore == null) {
    msg = `Beat this score`;
  } else if (diff > 0) {
    msg = `You are ${diff} ${unit} behind`;
  } else if (diff === 0) {
    msg = `You are level`;
  } else {
    msg = `You lead by ${-diff} ${unit}`;
  }

  const first = targetData.full_name?.split(" ")[0] ?? "them";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 mx-auto max-w-md px-5">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-gradient-to-br from-primary to-primary/80 p-3 text-primary-foreground shadow-lg">
        <Target className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
            🎯 Beat {first}
          </p>
          <p className="truncate text-sm font-bold">
            Target {target}
            {survival ? ` end${target === 1 ? "" : "s"}` : ""} · {msg}
          </p>
        </div>
      </div>
    </div>
  );
}
