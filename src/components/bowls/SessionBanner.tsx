import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Clock, Pause, Play, StopCircle } from "lucide-react";
import { useActiveSession } from "@/hooks/use-active-session";
import {
  ACTIVE_SESSION_QK,
  SESSIONS_QK,
  formatElapsed,
  pauseSession,
  resumeSession,
} from "@/lib/sessions";
import { EndSessionDialog } from "./EndSessionDialog";

export function SessionBanner() {
  const { activeSession, userId } = useActiveSession();
  const [, setTick] = useState(0);
  const [endOpen, setEndOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isPaused = activeSession?.status === "paused";

  useEffect(() => {
    if (!activeSession || isPaused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeSession, isPaused]);

  if (!activeSession || pathname.startsWith("/sessions/")) return null;

  const invalidate = () => {
    if (userId) qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(userId) });
  };

  const handleTogglePause = async () => {
    if (!activeSession || busy) return;
    setBusy(true);
    try {
      if (isPaused) await resumeSession(activeSession.id);
      else await pauseSession(activeSession.id);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-md px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-lg ${isPaused ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}>
            <span className="relative flex h-2.5 w-2.5">
              {!isPaused && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              )}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isPaused ? "bg-foreground/40" : "bg-white"}`} />
            </span>
            <Link to="/sessions/$id" params={{ id: activeSession.id }} className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">
                {isPaused ? "Paused" : "Training session"}
              </p>
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Clock className="h-3.5 w-3.5" />
                <span suppressHydrationWarning>
                  {formatElapsed(
                    activeSession.session_started_at,
                    undefined,
                    activeSession.total_paused_seconds ?? 0,
                    activeSession.paused_at,
                  )}
                </span>
                <span className="opacity-70">·</span>
                <span>{activeSession.total_activities} {activeSession.total_activities === 1 ? "activity" : "activities"}</span>
              </p>
            </Link>
            <button
              type="button"
              onClick={handleTogglePause}
              disabled={busy}
              aria-label={isPaused ? "Resume session" : "Pause session"}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide active:scale-95 transition disabled:opacity-50 ${isPaused ? "bg-foreground/10" : "bg-primary-foreground/15"}`}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setEndOpen(true)}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide active:scale-95 transition ${isPaused ? "bg-foreground/10" : "bg-primary-foreground/15"}`}
            >
              <StopCircle className="h-4 w-4" /> End
            </button>
          </div>
        </div>
      </div>
      <div aria-hidden className="h-14" />

      <EndSessionDialog
        open={endOpen}
        onOpenChange={setEndOpen}
        session={activeSession}
        onEnded={() => {
          if (userId) {
            qc.invalidateQueries({ queryKey: ACTIVE_SESSION_QK(userId) });
            qc.invalidateQueries({ queryKey: SESSIONS_QK(userId) });
          }
        }}
      />
    </>
  );
}
