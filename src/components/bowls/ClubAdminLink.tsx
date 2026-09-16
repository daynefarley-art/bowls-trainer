import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shield } from "lucide-react";

/** Shows a link to the club-admin onboarding area when the user administers a club. */
export function ClubAdminLink() {
  const { data: count = 0 } = useQuery({
    queryKey: ["club-admin-clubs-count"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("club_admin_my_clubs");
      if (error) return 0;
      return (data ?? []).length as number;
    },
  });

  if (!count) return null;

  return (
    <Link
      to="/club-admin"
      className="flex h-11 w-full items-center justify-between rounded-xl bg-secondary px-4 text-sm font-semibold"
    >
      <span className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        Club admin · invite members
      </span>
      <span aria-hidden className="text-muted-foreground">›</span>
    </Link>
  );
}
