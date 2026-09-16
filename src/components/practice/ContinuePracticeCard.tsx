import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock, Play } from "lucide-react";
import { formatActive, totalActiveSeconds, type PracticeActivity } from "@/lib/practice";
import { useRelativeTime } from "@/hooks/use-practice-activity";
import { PracticeResumeLink } from "./PracticeResumeLink";

type Props = {
  activity: PracticeActivity;
  /** If there are additional saved practices, show a "View all" affordance. */
  moreCount?: number;
};

/**
 * Home-screen prompt to resume the most recently active practice.
 * Only rendered when there's an active/paused activity — the space is
 * reclaimed when the queue is empty (see dashboard integration).
 */
export function ContinuePracticeCard({ activity, moreCount = 0 }: Props) {
  const relative = useRelativeTime(activity.last_active_at);
  const label = activity.title ?? activity.slug ?? (activity.kind === "drill" ? "Drill" : "Challenge");
  const bowls = activity.bowls_delivered ?? 0;
  const secs = totalActiveSeconds(activity);

  return (
    <section className="rounded-2xl bg-card p-4 bt-shadow-card">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
          Continue Practice
        </span>
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-base font-extrabold truncate">{label}</p>
          <p className="text-xs text-muted-foreground">
            {activity.kind === "drill" ? "Drill" : "Challenge"} · {bowls} bowl{bowls === 1 ? "" : "s"} · <Clock className="inline h-3 w-3 -mt-0.5" /> {formatActive(secs)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Last active {relative}</p>
        </div>
        <PracticeResumeLink
          activity={activity}
          className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground active:scale-[0.99] transition shrink-0"
        >
          <Play className="h-3.5 w-3.5" /> Resume
        </PracticeResumeLink>
      </div>

      <Link
        to="/practice/saved"
        className="mt-3 flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 text-xs font-semibold"
      >
        <span>{moreCount > 0 ? `View all saved practices (${moreCount + 1})` : "Saved Practices"}</span>
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
