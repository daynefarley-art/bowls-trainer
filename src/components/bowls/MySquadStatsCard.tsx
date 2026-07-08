import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { Crown, Users, Award, TrendingUp, Flame, Trophy } from "lucide-react";

type Stats = {
  squad_size: number;
  my_rank: number;
  my_points: number;
  challenges_led: number;
  top3_finishes: number;
  cow_wins: number;
};

export function MySquadStatsCard() {
  const q = useQuery({
    queryKey: ["my-squad-stats"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("my_squad_stats");
      if (error) throw error;
      return (data?.[0] ?? null) as Stats | null;
    },
  });

  const s = q.data;
  if (!s || s.squad_size === 0) return null;

  const items = [
    { label: "Rank", value: s.my_rank > 0 ? `#${s.my_rank}` : "—", icon: Crown },
    { label: "Points", value: s.my_points, icon: TrendingUp },
    { label: "Records", value: s.challenges_led, icon: Award },
    { label: "Top 3", value: s.top3_finishes, icon: Trophy },
    { label: "CoW Wins", value: s.cow_wins, icon: Flame },
    { label: "Squad", value: s.squad_size, icon: Users },
  ];

  return (
    <Link
      to="/squad"
      className="block rounded-2xl bg-card p-4 bt-shadow-card active:scale-[0.99] transition"
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        My Squad Statistics
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {items.map((it) => (
          <div key={it.label} className="rounded-xl bg-secondary/40 p-3 text-center">
            <it.icon className="mx-auto h-4 w-4 text-primary" />
            <p className="mt-1 font-display text-lg font-extrabold leading-none">{it.value}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{it.label}</p>
          </div>
        ))}
      </div>
    </Link>
  );
}
