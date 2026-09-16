import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Target, ChevronRight } from "lucide-react";
import { type Drill, isDrawDrillSlug } from "@/lib/bowls";

export const Route = createFileRoute("/_authenticated/drills")({
  component: DrillsPage,
});

function DrillsPage() {
  const { data: drills } = useQuery({
    queryKey: ["drills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drills")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Drill[];
    },
  });

  return (
    <>
      <PageHeader title="Drill Library" subtitle="Tap a drill for details and to record" />
      <main className="mx-auto -mt-4 max-w-md space-y-3 px-5">
        {drills?.map((d) => (
          <article key={d.id} className="overflow-hidden rounded-2xl bg-card bt-shadow-card">
            <div className="flex items-start gap-4 p-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bt-gradient-primary text-white">
                <Target className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  {d.category ?? "Drill"}
                </p>
                <h3 className="font-display text-lg font-bold leading-tight">{d.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
              </div>
            </div>

            <div className="flex">
              <Link
                to="/drill/$slug"
                params={{ slug: d.slug }}
                className="flex h-14 flex-1 items-center justify-center gap-1.5 border-t border-border/60 text-sm font-bold text-foreground active:opacity-90"
              >
                View Drill
              </Link>
              <Link
                {...(isDrawDrillSlug(d.slug)
                  ? ({ to: "/record-draw/$slug", params: { slug: d.slug }, search: { start: "1" } } as const)
                  : ({ to: "/record", search: { drill: d.slug, start: "1" } } as const))}
                className="flex h-14 flex-1 items-center justify-center gap-1.5 bt-gradient-primary text-sm font-bold text-primary-foreground active:opacity-90"
              >
                Start Drill
                <ChevronRight className="h-5 w-5" />
              </Link>
            </div>

          </article>
        ))}
      </main>
    </>
  );
}
