import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { DrillInstructions } from "@/components/bowls/DrillInstructions";
import { type Drill, isDrawDrillSlug } from "@/lib/bowls";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/drill/$slug")({
  component: DrillDetailsPage,
});

function DrillDetailsPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const { data: drill, isLoading } = useQuery({
    queryKey: ["drill", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drills")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Drill | null;
    },
  });

  useEffect(() => {
    if (!isLoading && !drill) navigate({ to: "/record" });
  }, [isLoading, drill, navigate]);

  return (
    <>
      <PageHeader title="Drill Instructions" subtitle="Read through, then tap Start Drill" />
      {drill ? (
        <DrillInstructions
          drill={drill}
          startLink={
            isDrawDrillSlug(drill.slug)
              ? { to: "/record-draw/$slug", params: { slug: drill.slug }, search: { start: "1" } }
              : { to: "/record", search: { drill: drill.slug, start: "1" } }
          }
          backLink={{ to: "/drills" }}
          backLabel="Back to library"
        />
      ) : (
        <main className="mx-auto max-w-md px-5 py-10 text-center text-muted-foreground">
          Loading drill…
        </main>
      )}
    </>
  );
}
