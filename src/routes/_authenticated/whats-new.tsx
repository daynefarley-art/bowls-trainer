import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/bowls/PageHeader";
import {
  RELEASES,
  markCurrentReleaseSeen,
  sortItems,
  type ReleaseItem,
} from "@/lib/whats-new";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/whats-new")({
  component: WhatsNewPage,
});

const KIND_LABEL: Record<ReleaseItem["kind"], string> = {
  challenge: "New Challenge",
  drill: "New Drill",
  game: "New Game",
  feature: "New Feature",
  improvement: "Improvement",
  bugfix: "Bug Fix",
};

function WhatsNewPage() {
  useEffect(() => {
    markCurrentReleaseSeen();
  }, []);

  return (
    <>
      <PageHeader title="What's New" subtitle="Latest drills, challenges and features" />
      <main className="mx-auto -mt-4 max-w-md space-y-6 px-5 pb-8">
        {RELEASES.map((release) => (
          <section key={release.version} className="space-y-3">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="font-display text-lg font-bold">Version {release.version}</h2>
              <span className="text-xs text-muted-foreground">
                {new Date(release.date).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <ul className="space-y-2">
              {sortItems(release.items).map((item, i) => {
                const inner = (
                  <div className="rounded-2xl bg-card p-4 bt-shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                        {KIND_LABEL[item.kind]}
                      </p>
                      {item.featured && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                          Featured
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="font-display text-base font-bold">
                        <span className="mr-1">{item.icon}</span>
                        {item.title}
                      </p>
                      {item.link && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                );
                return (
                  <li key={i}>
                    {item.link ? (
                      <Link
                        to={item.link.to as any}
                        params={item.link.params as any}
                        className="block active:opacity-90"
                      >
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
