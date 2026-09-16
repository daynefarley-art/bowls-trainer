import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Clock, Play, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/bowls/PageHeader";
import { useSavedPractices } from "@/hooks/use-practice-activity";
import {
  formatActive,
  totalActiveSeconds,
  type PracticeActivity,
} from "@/lib/practice";
import { DiscardPracticeDialog } from "@/components/practice/DiscardPracticeDialog";
import { PracticeResumeLink } from "@/components/practice/PracticeResumeLink";

export const Route = createFileRoute("/_authenticated/practice/saved")({
  component: SavedPracticesPage,
});

function SavedPracticesPage() {
  const { activities, isLoading } = useSavedPractices();
  const [toDiscard, setToDiscard] = useState<PracticeActivity | null>(null);

  return (
    <>
      <PageHeader title="Saved Practices" subtitle="Pick up any unfinished drill or challenge" />
      <main className="mx-auto max-w-md px-4 pb-24 pt-2">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-10">Loading…</p>
        ) : activities.length === 0 ? (
          <div className="rounded-2xl bg-card p-6 text-center bt-shadow-card">
            <p className="font-display font-bold">Nothing saved</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a drill or challenge and it will be saved automatically as you play.
            </p>
            <Link to="/drills" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
              Browse drills
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {activities.map((a) => (
              <SavedRow key={a.id} activity={a} onDiscard={() => setToDiscard(a)} />
            ))}
          </ul>
        )}
      </main>

      {toDiscard && (
        <DiscardPracticeDialog
          open={!!toDiscard}
          onOpenChange={(v) => { if (!v) setToDiscard(null); }}
          activity={toDiscard}
          onDiscarded={() => setToDiscard(null)}
        />
      )}
    </>
  );
}

function SavedRow({ activity, onDiscard }: { activity: PracticeActivity; onDiscard: () => void }) {
  const label = activity.title ?? activity.slug ?? (activity.kind === "drill" ? "Drill" : "Challenge");
  const bowls = activity.bowls_delivered ?? 0;
  const secs = totalActiveSeconds(activity);
  return (
    <li className="rounded-2xl bg-card p-3 bt-shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {activity.kind === "drill" ? "Drill" : "Challenge"} · {activity.status === "active" ? "In progress" : "Paused"}
          </p>
          <p className="font-display text-sm font-extrabold truncate">{label}</p>
          <p className="text-xs text-muted-foreground">
            {bowls} bowl{bowls === 1 ? "" : "s"} · <Clock className="inline h-3 w-3 -mt-0.5" /> {formatActive(secs)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Started {new Date(activity.started_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <PracticeResumeLink
            activity={activity}
            className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
          >
            <Play className="h-3.5 w-3.5" /> Resume
          </PracticeResumeLink>
          <button
            type="button"
            onClick={onDiscard}
            className="flex items-center gap-1 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> End
          </button>
        </div>
      </div>
    </li>
  );
}
