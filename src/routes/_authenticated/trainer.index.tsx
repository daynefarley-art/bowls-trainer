import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import type { Drill, Result, SkillAreaKey } from "@/lib/bowls";
import {
  createTrainerSession,
  getCurrentTrainerSession,
  listActiveVariants,
  recentTrainerBlocks,
  resetTrainerSession,
  TRAINER_CURRENT_QK,
} from "@/lib/trainer";
import {
  buildRepetitionMemory,
  coachingFocusSummary,
  generateVariedTrainerPlan,
  SESSION_DURATION_OPTIONS,
} from "@/lib/trainer-generator";
import { getTrainerDurationPref, setTrainerDurationPref } from "@/lib/dashboard-prefs";
import { TrainerBlockList } from "@/components/bowls/TrainerBlockList";

export const Route = createFileRoute("/_authenticated/trainer/")({
  component: TrainerIndex,
});

function TrainerIndex() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [minutes, setMinutes] = useState<number>(() => getTrainerDurationPref());

  const { data: current, isLoading } = useQuery({
    queryKey: TRAINER_CURRENT_QK(user.id),
    queryFn: () => getCurrentTrainerSession(user.id),
  });

  async function generate() {
    setGenerating(true);
    setTrainerDurationPref(minutes);
    try {
      const [{ data: drills }, { data: results }, variants, recent] = await Promise.all([
        supabase.from("drills").select("*").order("sort_order"),
        supabase.from("results").select("drill_id,percentage,bsi,played_at").eq("user_id", user.id),
        listActiveVariants(),
        recentTrainerBlocks(user.id),
      ]);
      const plan = generateVariedTrainerPlan({
        results: (results ?? []) as unknown as Result[],
        drills: (drills ?? []) as unknown as Drill[],
        variants,
        memory: buildRepetitionMemory(recent),
        plannedMinutes: minutes,
      });
      if (!plan) {
        toast.error("Couldn't build a session yet — record a drill first.");
        return;
      }
      const created = await createTrainerSession({
        userId: user.id,
        focusAreas: plan.focusAreas,
        plannedMinutes: plan.plannedMinutes,
        meta: plan.meta,
        blocks: plan.blocks,
      });
      qc.invalidateQueries({ queryKey: TRAINER_CURRENT_QK(user.id) });
      navigate({ to: "/trainer/$id", params: { id: created.session.id } });
    } catch (e) {
      console.error("[trainer] generate failed", e);
      toast.error("Couldn't build your session. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function discard() {
    if (!current) return;
    setResetting(true);
    try {
      await resetTrainerSession(current.session.id, user.id);
      await qc.invalidateQueries({ queryKey: TRAINER_CURRENT_QK(user.id) });
      toast.success("Session deleted. Any practice you recorded has been kept.");
    } catch (e) {
      console.error("[trainer] reset failed", e);
      toast.error("Couldn't delete that session.");
    } finally {
      setResetting(false);
    }
  }

  const focusText = current
    ? (current.session.meta?.['focusSummary'] as string | undefined) ??
      coachingFocusSummary(current.session.focus_areas as SkillAreaKey[])
    : "";

  return (
    <>
      <PageHeader
        title={current ? "Today's AI Coach Session" : "AI Coach Session"}
        subtitle={
          current
            ? `${current.session.planned_minutes} min · ${current.blocks.length} drill${current.blocks.length === 1 ? "" : "s"}`
            : "Personalised practice focused on where you'll improve most."
        }
      />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-10">
        {isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : current ? (
          <section className="rounded-2xl bg-card p-5 bt-shadow-card">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Today's AI Coach Session
            </p>
            <h2 className="font-display text-xl font-bold">
              {current.session.planned_minutes} min ·{" "}
              {current.blocks.length} drill{current.blocks.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Focus: {focusText}</p>
            <div className="mt-4">
              <TrainerBlockList blocks={current.blocks} />
            </div>
            <Button
              className="mt-5 h-12 w-full text-base font-bold"
              onClick={() => navigate({ to: "/trainer/$id", params: { id: current.session.id } })}
            >
              {current.session.status === "in_progress" ? "Continue Session" : "Start Session"}
            </Button>
            <Button
              variant="ghost"
              className="mt-2 h-10 w-full text-sm text-muted-foreground"
              onClick={discard}
              disabled={resetting}
            >
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete this session"}
            </Button>
          </section>
        ) : (
          <section className="rounded-2xl bg-card p-6 text-center bt-shadow-card">
            <Sparkles className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-3 font-display text-lg font-bold">AI Coach Session</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Personalised practice focused on where you'll improve most.
            </p>
            <p className="mt-5 font-display text-base font-bold">How long have you got?</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {SESSION_DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setMinutes(opt)}
                  aria-pressed={minutes === opt}
                  className={`h-12 rounded-xl border text-sm font-bold transition ${
                    minutes === opt
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground"
                  }`}
                >
                  {opt} min
                </button>
              ))}
            </div>
            <Button className="mt-4 h-12 w-full text-base font-bold" onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : "Build my session"}
            </Button>
          </section>
        )}
      </main>
    </>
  );
}
