import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import { TrainerBlockList } from "@/components/bowls/TrainerBlockList";
import { CheckCircle2, Loader2 } from "lucide-react";
import { isDrawDrillSlug, SKILL_AREA_LABELS, type SkillAreaKey } from "@/lib/bowls";
import {
  abandonTrainerSession,
  getTrainerSession,
  markBlockActive,
  skipBlock,
  startTrainerSession,
  TRAINER_CURRENT_QK,
  TRAINER_SESSION_QK,
  type TrainerBlock,
} from "@/lib/trainer";

export const Route = createFileRoute("/_authenticated/trainer/$id")({
  component: TrainerSessionPage,
});

function TrainerSessionPage() {
  const { user } = Route.useRouteContext();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: TRAINER_SESSION_QK(id),
    queryFn: () => getTrainerSession(id),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="Bowls Trainer" />
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Bowls Trainer" subtitle="Session not found" />
        <main className="mx-auto -mt-4 max-w-md px-5">
          <Button className="h-12 w-full" onClick={() => navigate({ to: "/trainer" })}>
            Back to Bowls Trainer
          </Button>
        </main>
      </>
    );
  }

  const { session, blocks } = data;
  const next: TrainerBlock | undefined = blocks.find((b) => b.status === "pending" || b.status === "active");
  const completed = blocks.filter((b) => b.status === "completed");
  const isDone = session.status === "completed" || !next;

  async function launch(block: TrainerBlock) {
    try {
      await startTrainerSession(session.id);
      await markBlockActive(block.id);
    } catch (e) {
      console.error("[trainer] launch failed", e);
    }
    const slug = block.exercise_slug;
    if (!slug) return toast.error("This block has no drill attached.");
    // Reuse the EXISTING full-screen recorders; the trainer session id + block
    // id ride along in search params so we return here when the drill is saved.
    if (isDrawDrillSlug(slug)) {
      navigate({
        to: "/record-draw/$slug",
        params: { slug },
        search: { start: "1", trainer: session.id, block: block.id },
      });
    } else {
      navigate({
        to: "/record",
        search: { drill: slug, start: "1", trainer: session.id, block: block.id },
      });
    }
  }

  async function skip(block: TrainerBlock) {
    await skipBlock(session.id, block.id);
    qc.invalidateQueries({ queryKey: TRAINER_SESSION_QK(session.id) });
    qc.invalidateQueries({ queryKey: TRAINER_CURRENT_QK(user.id) });
  }

  async function endSession() {
    await abandonTrainerSession(session.id);
    qc.invalidateQueries({ queryKey: TRAINER_CURRENT_QK(user.id) });
    navigate({ to: "/trainer" });
  }

  const avg = completed.length
    ? Math.round(
        completed.reduce((s, b) => s + (b.percentage != null ? Number(b.percentage) : 0), 0) / completed.length,
      )
    : null;

  return (
    <>
      <PageHeader
        title={isDone ? "Session complete" : "Bowls Trainer session"}
        subtitle={
          isDone
            ? `${completed.length} of ${blocks.length} blocks completed`
            : `${session.planned_minutes} min • ${session.focus_areas
                .map((a) => SKILL_AREA_LABELS[a as SkillAreaKey] ?? a)
                .join(", ")}`
        }
      />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-10">
        <section className="rounded-2xl bg-card p-5 bt-shadow-card">
          <div className="mb-3 flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Progress</span>
            <span>
              {completed.length}/{blocks.length}
            </span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bt-gradient-primary transition-all"
              style={{ width: `${blocks.length ? (completed.length / blocks.length) * 100 : 0}%` }}
            />
          </div>
          <TrainerBlockList blocks={blocks} activeId={next?.id ?? null} />
        </section>

        {isDone ? (
          <section className="rounded-2xl bg-card p-6 text-center bt-shadow-card">
            <CheckCircle2 className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mt-3 font-display text-lg font-bold">Nice work</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You completed {completed.length} block{completed.length === 1 ? "" : "s"}
              {avg != null ? ` with an average of ${avg}%` : ""}.
            </p>
            <Button className="mt-5 h-12 w-full text-base font-bold" onClick={() => navigate({ to: "/trainer" })}>
              Done
            </Button>
          </section>
        ) : (
          next && (
            <section className="rounded-2xl bg-card p-5 bt-shadow-card">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Up next</p>
              <h2 className="font-display text-lg font-bold leading-tight">{next.title}</h2>
              {next.reason && <p className="mt-1 text-sm text-muted-foreground">{next.reason}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                About {next.planned_minutes} min{next.planned_ends ? ` • ${next.planned_ends} ends` : ""}
              </p>
              <Button className="mt-4 h-12 w-full text-base font-bold" onClick={() => launch(next)}>
                Start Block
              </Button>
              <div className="mt-2 flex gap-2">
                <Button variant="ghost" className="h-10 flex-1 text-sm" onClick={() => skip(next)}>
                  Skip block
                </Button>
                <Button variant="ghost" className="h-10 flex-1 text-sm text-muted-foreground" onClick={endSession}>
                  End session
                </Button>
              </div>
            </section>
          )
        )}
      </main>
    </>
  );
}
