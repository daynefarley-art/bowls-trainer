import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye } from "lucide-react";
import { listClubs } from "@/lib/club.functions";
import { useClub } from "./ClubProvider";

/**
 * Super Admin only. Lets the platform admin explicitly enter a club context to
 * preview its branding. No membership is created and no profile data changes.
 */
export function ViewAsClubCard() {
  const { isPlatformAdmin, activeClub, setActiveClubId } = useClub();
  const listClubsFn = useServerFn(listClubs);

  const { data: clubs = [] } = useQuery({
    queryKey: ["admin-clubs-preview"],
    queryFn: () => listClubsFn({}),
    enabled: isPlatformAdmin,
    staleTime: 5 * 60 * 1000,
  });

  if (!isPlatformAdmin) return null;

  const options = [{ id: null as string | null, name: "Bowls Trainer / Platform" }, ...clubs.map((c) => ({ id: c.id as string | null, name: c.name }))];

  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-elevated">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-bold">View as club</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Your Super Admin account always signs in to Bowls Trainer platform context. Choose a club
        below to preview its branding for this session only.
      </p>
      <div className="space-y-2">
        {options.map((o) => {
          const selected = (activeClub?.id ?? null) === o.id;
          return (
            <button
              key={o.id ?? "platform"}
              onClick={() => setActiveClubId(o.id)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                selected ? "border-primary bg-primary/5 text-primary" : "border-border"
              }`}
            >
              <span className="truncate">{o.name}</span>
              {selected && <span className="text-xs font-bold uppercase">Active</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
