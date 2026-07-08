import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Bell, ChevronRight, Flame, Crown } from "lucide-react";

function timeAgo(ts: string) {
  const ms = Date.now() - new Date(ts).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function SquadDashboardCard() {
  const stats = useQuery({
    queryKey: ["my-squad-stats"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("my_squad_stats");
      if (error) throw error;
      return (data?.[0] ?? null) as {
        squad_size: number;
        my_rank: number;
      } | null;
    },
  });

  const unread = useQuery({
    queryKey: ["squad-unread"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("unread_squad_notifications_count");
      if (error) throw error;
      return (data ?? 0) as number;
    },
    refetchInterval: 60_000,
  });

  const cow = useQuery({
    queryKey: ["cow-current"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("current_challenge_of_the_week");
      if (error) throw error;
      return (data?.[0] ?? null) as { challenge_name: string } | null;
    },
  });

  const activity = useQuery({
    queryKey: ["squad-meaningful-activity", 1],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("squad_meaningful_activity", { _limit: 1 });
      if (error) throw error;
      return (data ?? []) as Array<{
        event_type: string;
        full_name: string | null;
        challenge_name: string | null;
        score: number | null;
        occurred_at: string;
      }>;
    },
  });

  const size = stats.data?.squad_size ?? 0;
  const rank = stats.data?.my_rank ?? 0;
  const latest = activity.data?.[0];

  return (
    <Link
      to="/squad"
      className="block rounded-2xl bg-card p-4 bt-shadow-card active:scale-[0.99] transition"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          {rank === 1 ? <Crown className="h-6 w-6" /> : <Users className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            🏆 My Squad
          </p>
          <p className="mt-0.5 font-display text-lg font-extrabold leading-tight">
            {size === 0
              ? "Add mates"
              : rank > 0
              ? `Championship · ${ordinal(rank)}`
              : `${size} member${size === 1 ? "" : "s"}`}
          </p>
        </div>
        {unread.data && unread.data > 0 ? (
          <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">
            <Bell className="h-3 w-3" /> {unread.data}
          </span>
        ) : null}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>

      {cow.data && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs">
          <Flame className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">
            <span className="font-bold text-primary">Challenge of the Week:</span>{" "}
            <span className="font-semibold">{cow.data.challenge_name}</span>
          </span>
        </div>
      )}

      {latest && (
        <p className="mt-3 truncate border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{latest.full_name ?? "Someone"}</span>{" "}
          {latest.event_type === "platinum_earned"
            ? "earned 💎 Platinum in"
            : "hit a new personal best in"}{" "}
          <span className="font-semibold">{latest.challenge_name}</span>
          <span className="text-muted-foreground/70"> · {timeAgo(latest.occurred_at)}</span>
        </p>
      )}

      <p className="mt-3 text-right text-xs font-bold text-primary">Open My Squad →</p>
    </Link>
  );
}
