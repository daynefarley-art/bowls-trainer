import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { LadderList, useChallengeLadder } from "@/components/bowls/ChallengeLeaderboard";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/squad/ladder/$slug")({
  component: LadderPage,
});

function LadderPage() {
  const { slug } = useParams({ from: "/_authenticated/squad/ladder/$slug" });

  const challenge = useQuery({
    queryKey: ["squad-challenge-summary", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("challenges")
        .select("id, name, slug")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; slug: string } | null;
    },
  });

  const ladder = useChallengeLadder(challenge.data?.id);
  const rows = ladder.data ?? [];

  return (
    <>
      <PageHeader title={challenge.data?.name ?? "Ladder"} subtitle="My Squad" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        <Link
          to="/squad"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          <ChevronLeft className="h-4 w-4" /> Back to My Squad
        </Link>

        {ladder.isLoading || !challenge.data ? (
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center bt-shadow-card">
            <p className="text-sm font-semibold">No results yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Play this challenge to open the ladder.
            </p>
            <Link
              to="/challenge/$slug"
              params={{ slug }}
              className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
            >
              Open challenge
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl bg-card p-4 bt-shadow-card">
            <LadderList
              rows={rows}
              challengeSlug={challenge.data.slug}
              challengeId={challenge.data.id}
            />
          </div>
        )}
      </main>
    </>
  );
}
