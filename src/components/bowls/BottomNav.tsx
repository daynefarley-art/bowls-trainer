import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Dumbbell, Trophy, LineChart, User, GraduationCap } from "lucide-react";
import { useCurrentUserId, useUserRoles } from "@/hooks/use-role";
import { useIncomingInvites } from "@/lib/squad-invites";

type NavItem = { to: string; label: string; icon: typeof Home; primary?: boolean };

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const userId = useCurrentUserId();
  const { isAdmin, isCoach } = useUserRoles(userId);
  const inviteCount = useIncomingInvites().length;

  // Coach-only users see a slim coach-focused nav
  const items: NavItem[] = isCoach && !isAdmin
    ? [
        { to: "/dashboard", label: "Dashboard", icon: Home },
        { to: "/coach", label: "Coach", icon: GraduationCap, primary: true },
        { to: "/profile", label: "Profile", icon: User },
      ]
    : [
        { to: "/dashboard", label: "Dashboard", icon: Home },
        { to: "/drills", label: "Drills", icon: Dumbbell },
        { to: "/challenges", label: "Challenges", icon: Trophy },
        { to: "/progress", label: "Progress", icon: LineChart },
        { to: "/profile", label: "Profile", icon: User },
      ];

  const cols = items.length === 3 ? "grid-cols-3" : "grid-cols-5";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <div className={`mx-auto grid max-w-md ${cols} px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]`}>
        {items.map(({ to, label, icon: Icon, primary }) => {
          const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to));
          const showBadge = to === "/profile" && inviteCount > 0;
          if (primary) {
            return (
              <Link key={to} to={to} className="flex flex-col items-center justify-end gap-0.5 -mt-6">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bt-gradient-primary text-white bt-shadow-elevated">
                  <Icon className="h-7 w-7" strokeWidth={2.5} />
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={to}
              to={to}
              className={`relative flex flex-col items-center gap-1 py-2 text-[11px] font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <span className="relative">
                <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 2} />
                {showBadge && (
                  <span
                    aria-label={`${inviteCount} pending squad invitation${inviteCount === 1 ? "" : "s"}`}
                    className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground shadow"
                  >
                    {inviteCount}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
