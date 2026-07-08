import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "coach" | "player";

export function useUserRoles(userId: string | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ["user-roles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
  const roles = data ?? [];
  return {
    roles,
    isAdmin: roles.includes("admin"),
    isCoach: roles.includes("coach"),
    isPlayer: roles.length === 0 || roles.includes("player"),
    isLoading,
  };
}

// Back-compat shim used by existing callers
export function useIsAdmin(userId: string | undefined) {
  const { isAdmin, isLoading } = useUserRoles(userId);
  return { isAdmin, isLoading };
}

export function useCurrentUserId() {
  const [userId, setUserId] = useState<string | undefined>();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return userId;
}
