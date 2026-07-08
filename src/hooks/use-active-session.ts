import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { ACTIVE_SESSION_QK, getActiveSession, type TrainingSession } from "@/lib/sessions";

export function useActiveSession() {
  const [userId, setUserId] = useState<string | undefined>();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, []);

  const query = useQuery({
    queryKey: userId ? ACTIVE_SESSION_QK(userId) : ["training_sessions", "active", "anon"],
    enabled: !!userId,
    queryFn: async () => (userId ? await getActiveSession(userId) : null),
    refetchInterval: 60_000,
  });

  return {
    userId,
    activeSession: (query.data ?? null) as TrainingSession | null,
    isLoading: query.isLoading,
  };
}
