import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { isDrawDrillSlug } from "@/lib/bowls";
import type { PracticeActivity } from "@/lib/practice";

type Props = {
  activity: Pick<PracticeActivity, "id" | "kind" | "slug">;
  className?: string;
  children: ReactNode;
};

export function PracticeResumeLink({ activity, className, children }: Props) {
  if (activity.kind === "drill") {
    if (activity.slug && isDrawDrillSlug(activity.slug)) {
      return (
        <Link
          to="/record-draw/$slug"
          params={{ slug: activity.slug }}
          search={{ resume: activity.id }}
          className={className}
        >
          {children}
        </Link>
      );
    }

    return (
      <Link
        to="/record"
        search={{ drill: activity.slug ?? undefined, resume: activity.id }}
        className={className}
      >
        {children}
      </Link>
    );
  }

  if (activity.slug) {
    return (
      <Link
        to="/challenge-record/$slug"
        params={{ slug: activity.slug }}
        search={{ start: "1", resume: activity.id }}
        className={className}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link to="/challenges" className={className}>
      {children}
    </Link>
  );
}