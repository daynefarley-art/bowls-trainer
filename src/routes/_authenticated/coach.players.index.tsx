import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/coach/players/")({
  component: CoachPlayersPage,
});

function CoachPlayersPage() {
  const { data: players = [], isLoading } = useQuery({
    queryKey: ["coach-players"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("coach_list_players");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <main className="mx-auto max-w-md space-y-3 px-5">
      <h2 className="font-display text-lg font-bold">My Players</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : players.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No accepted players yet. Approve a request to see them here.
        </p>
      ) : (
        <ul className="space-y-2">
          {players.map((p) => (
            <li key={p.player_id}>
              <Link
                to="/coach/players/$playerId"
                params={{ playerId: p.player_id }}
                className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 bt-shadow-card"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.full_name ?? p.player_email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.club ?? "—"} · {p.player_email}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
