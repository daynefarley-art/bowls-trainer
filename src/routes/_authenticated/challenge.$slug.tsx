import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { ChallengeInstructions } from "@/components/bowls/ChallengeInstructions";
import { ChallengeLeaderboard } from "@/components/bowls/ChallengeLeaderboard";
import { normalizeChallengeConfig, type Challenge } from "@/lib/challenges";
import { LineChart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/challenge/$slug")({
  component: ChallengeDetailsPage,
});


function ChallengeDetailsPage() {
  const { slug } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  const { data: challenge, isLoading } = useQuery({
    queryKey: ["challenge", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenges")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeChallengeConfig(data as Challenge) : null;
    },
  });

  const { data: best } = useQuery({
    queryKey: ["challenge_best", user.id, challenge?.id],
    enabled: !!challenge,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenge_results")
        .select("score")
        .eq("challenge_id", challenge!.id)
        .eq("user_id", user.id)
        .order("score", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0]?.score as number | undefined) ?? null;
    },
  });

  useEffect(() => {
    if (!isLoading && !challenge) navigate({ to: "/challenges" });
  }, [isLoading, challenge, navigate]);

  return (
    <>
      <PageHeader title="Challenge Instructions" subtitle="Read through, then tap Start Challenge" />
      {challenge ? (
        <>
          <ChallengeInstructions
            challenge={challenge}
            bestScore={best ?? null}
            startLink={{ to: "/challenge-record/$slug", params: { slug: challenge.slug }, search: { start: "1" } }}
            backLink={{ to: "/challenges" }}
            backLabel="Back to challenges"
          />
          <div className="mx-auto max-w-md px-5 pb-4">
            <Link
              to="/challenge-progress/$slug"
              params={{ slug: challenge.slug }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-bold text-primary active:scale-[0.99] transition"
            >
              <LineChart className="h-4 w-4" /> View progress &amp; history
            </Link>
          </div>
          <ChallengeLeaderboard challengeId={challenge.id} challengeSlug={challenge.slug} />
        </>
      ) : (
        <main className="mx-auto max-w-md px-5 py-10 text-center text-muted-foreground">
          Loading challenge…
        </main>
      )}

    </>
  );
}
