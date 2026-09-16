import { useClub } from "./ClubProvider";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { getCurrentTrainerSession, TRAINER_CURRENT_QK } from "@/lib/trainer";
import { coachingFocusSummary } from "@/lib/trainer-generator";
import type { SkillAreaKey } from "@/lib/bowls";

/**
 * Dashboard entry point for the Bowls Trainer.
 * Before a session exists it explains the AI Coach Session; once one is
 * planned/in progress it summarises the ACTUAL generated session.
 */
export function AICoachDashboardCard({ userId }: { userId: string }) {
  const { activeClub } = useClub();
  const clubBranding = Boolean(activeClub?.managed_branding_enabled);
  const { data: current } = useQuery({
    queryKey: TRAINER_CURRENT_QK(userId),
    queryFn: () => getCurrentTrainerSession(userId),
  });

  const session = current?.session;
  const blocks = current?.blocks ?? [];
  const drillCount = blocks.filter((b) => !!b.exercise_id).length || blocks.length;
  const focus = session
    ? ((session.meta?.['focusSummary'] as string | undefined) ??
      coachingFocusSummary((session.focus_areas ?? []) as SkillAreaKey[]))
    : "";


  return (
    <Link
      to="/trainer"
      className="flex items-center gap-3 rounded-2xl bg-card p-4 bt-shadow-card active:opacity-90"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bt-gradient-primary text-white">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{clubBranding ? "AI Coach" : "Bowls Trainer"}</p>
        {session ? (
          <>
            <p className="font-display text-base font-bold leading-tight">Today's AI Coach Session</p>
            <p className="text-xs text-muted-foreground">
              {session.planned_minutes} min · {drillCount} drill{drillCount === 1 ? "" : "s"}
            </p>
            {focus && <p className="text-xs text-muted-foreground">Focus: {focus}</p>}
          </>
        ) : (
          <>
            <p className="font-display text-base font-bold leading-tight">AI Coach Session</p>
            <p className="text-xs text-muted-foreground">
              Personalised practice focused on where you'll improve most.
            </p>
          </>
        )}
      </div>
    </Link>
  );
}
