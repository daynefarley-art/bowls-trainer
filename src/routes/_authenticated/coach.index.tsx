import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/coach/")({
  component: PendingRequestsPage,
});

type Row = {
  id: string;
  player_id: string;
  player_email: string;
  requested_at: string;
};

function PendingRequestsPage() {
  const qc = useQueryClient();

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["coach-pending"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("coach_list_pending_requests");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  async function respond(id: string, accept: boolean) {
    const { error } = await (supabase as any).rpc("coach_respond_access_request", {
      _request_id: id,
      _accept: accept,
    });
    if (error) return toast.error(error.message);
    toast.success(accept ? "Player accepted" : "Request declined");
    qc.invalidateQueries({ queryKey: ["coach-pending"] });
    qc.invalidateQueries({ queryKey: ["coach-players"] });
  }

  return (
    <main className="mx-auto max-w-md space-y-3 px-5">
      <h2 className="font-display text-lg font-bold">Pending Access Requests</h2>
      {error ? (
        <p className="text-sm text-destructive">Unable to load requests. Please try again.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending requests.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 rounded-2xl bg-card p-4 bt-shadow-card">
              <div>
                <p className="text-sm font-semibold">{r.player_email}</p>
                <p className="text-xs text-muted-foreground">
                  Requested {new Date(r.requested_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => respond(r.id, true)}>
                  Accept
                </Button>
                <Button className="flex-1" variant="outline" onClick={() => respond(r.id, false)}>
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
