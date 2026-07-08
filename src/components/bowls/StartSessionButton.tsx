import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Play, ChevronRight, StopCircle } from "lucide-react";
import { useActiveSession } from "@/hooks/use-active-session";
import { ACTIVE_SESSION_QK, formatElapsed } from "@/lib/sessions";
import { Link } from "@tanstack/react-router";
import { EndSessionDialog } from "@/components/bowls/EndSessionDialog";
import { StartSessionDialog } from "@/components/bowls/StartSessionDialog";

export function StartSessionButton() {
  const { activeSession, userId } = useActiveSession();
  const [endOpen, setEndOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const qc = useQueryClient();


  if (activeSession) {
    const startedAt = new Date(activeSession.session_started_at);
    return (
      <>
        <div className="rounded-2xl bg-card p-4 bt-shadow-card">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Training Session Active
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat
              label="Elapsed"
              value={
                <span suppressHydrationWarning>{formatElapsed(activeSession.session_started_at)}</span>
              }
            />
            <Stat
              label="Started"
              value={startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            />
            <Stat label="Activities" value={String(activeSession.total_activities)} />
          </div>

          <div className="mt-3 flex gap-2">
            <Link
              to="/sessions/$id"
              params={{ id: activeSession.id }}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-secondary px-3 py-2 text-sm font-bold active:scale-[0.99] transition"
            >
              View <ChevronRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setEndOpen(true)}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-destructive px-3 py-2 text-sm font-bold text-destructive-foreground active:scale-[0.99] transition"
            >
              <StopCircle className="h-4 w-4" /> End Session
            </button>
          </div>
        </div>
        <EndSessionDialog
          open={endOpen}
          onOpenChange={setEndOpen}
          session={activeSession}
          onEnded={() => {}}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setStartOpen(true)}
        disabled={!userId}
        className="flex w-full flex-col items-start gap-1 rounded-2xl bt-gradient-primary p-4 text-left text-primary-foreground bt-shadow-elevated active:scale-[0.99] transition disabled:opacity-60"
      >
        <div className="flex w-full items-center gap-2">
          <Play className="h-5 w-5" />
          <span className="font-display text-base font-extrabold">Start Training Session</span>
        </div>
        <span className="text-xs opacity-90">Track your practice time</span>
      </button>
      {userId && (
        <StartSessionDialog
          open={startOpen}
          onOpenChange={setStartOpen}
          userId={userId}
          onStarted={() => qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(userId) })}
        />
      )}
    </>
  );
}


function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-secondary/50 px-2 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-sm font-extrabold">{value}</p>
    </div>
  );
}
