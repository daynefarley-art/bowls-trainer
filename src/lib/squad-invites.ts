import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SquadInvite = {
  id: string;
  direction: "incoming" | "outgoing";
  other_user_id: string;
  other_name: string | null;
  other_club: string | null;
  status: string;
  created_at: string;
};

export function useSquadInvites() {
  return useQuery({
    queryKey: ["squad-invites"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_squad_invites");
      if (error) throw error;
      return (data ?? []) as SquadInvite[];
    },
  });
}

export function useIncomingInvites(): SquadInvite[] {
  const q = useSquadInvites();
  return (q.data ?? []).filter((i) => i.direction === "incoming" && i.status === "pending");
}

const SESSION_KEY = "bt-squad-invite-popup-dismissed";

export function isInvitePopupDismissedThisSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInvitePopupForSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}
