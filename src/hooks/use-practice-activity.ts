import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_PRACTICE_QK,
  SAVED_PRACTICES_QK,
  creditBackgroundGap,
  listSaved,
  patchState,
  type PracticeActivity,
} from "@/lib/practice";

/**
 * Track the currently authenticated user id (lightweight — matches the
 * pattern used by useActiveSession so we don't fetch on every render).
 */
function useAuthUserId(): string | undefined {
  const [userId, setUserId] = useState<string | undefined>();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return userId;
}

/**
 * Reads the most-recently active/paused practice activity, if any.
 * Polls lightly so the Continue Practice card and banner stay fresh.
 */
export function useActiveOrPausedPractice() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: userId ? ACTIVE_PRACTICE_QK(userId) : ["practice_activities", "anon"],
    enabled: !!userId,
    queryFn: async (): Promise<PracticeActivity | null> => {
      const rows = await listSaved(userId!);
      return rows[0] ?? null;
    },
    refetchInterval: 30_000,
  });
  return { userId, activity: (query.data ?? null) as PracticeActivity | null, isLoading: query.isLoading };
}

export function useSavedPractices() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: userId ? SAVED_PRACTICES_QK(userId) : ["practice_activities", "saved", "anon"],
    enabled: !!userId,
    queryFn: async () => listSaved(userId!),
  });
  return { userId, activities: query.data ?? [], isLoading: query.isLoading };
}

/**
 * Auto-save practice activity state with a short debounce so we survive
 * app crashes, force-closes and lost connections without spamming writes.
 * The recorder owns the in-memory state; this hook mirrors it to the
 * `state` jsonb on the practice_activities row.
 *
 * Also flushes on visibility change / pagehide so we never lose the
 * latest state when iOS suspends the tab.
 */
export function useActivityAutosave(
  activityId: string | null | undefined,
  state: Record<string, unknown> | null | undefined,
  opts?: { debounceMs?: number; bowlsDelivered?: number },
) {
  const debounce = opts?.debounceMs ?? 500;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state);
  const latestBowls = useRef(opts?.bowlsDelivered);
  latest.current = state;
  latestBowls.current = opts?.bowlsDelivered;

  useEffect(() => {
    if (!activityId || !state) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!activityId || !latest.current) return;
      patchState(
        activityId,
        latest.current,
        latestBowls.current !== undefined ? { bowlsDelivered: latestBowls.current } : undefined,
      ).catch(() => {});
    }, debounce);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [activityId, state, debounce]);

  // Flush on tab hide / pagehide so we don't lose the debounced write.
  useEffect(() => {
    if (!activityId) return;
    const flush = () => {
      if (!latest.current || !activityId) return;
      console.log("[practice] autosave flush", activityId);
      patchState(
        activityId,
        latest.current,
        latestBowls.current !== undefined ? { bowlsDelivered: latestBowls.current } : undefined,
      ).catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    let removeAppState: (() => void) | undefined;
    import("@capacitor/app")
      .then(({ App }) => App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) flush();
      }))
      .then((handle) => {
        removeAppState = () => { handle.remove(); };
      })
      .catch(() => {});
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      removeAppState?.();
    };
  }, [activityId]);
}

/**
 * Keeps practice time honest across backgrounding WITHOUT throwing away real
 * bowls practice.
 *
 * A bowler delivers, walks up the rink, inspects the head, walks back and
 * retrieves bowls — often several minutes with the phone locked in a pocket.
 * That is genuine practice, so the timer keeps running while the drill is
 * open. We only trim background time beyond BACKGROUND_GRACE_SECONDS, which
 * is where "still practising" becomes "left the drill open".
 *
 * Explicit signals (Pause button, leaving the drill screen, completing) remain
 * the hard stops — they are handled by the tracker / pause sheet.
 */
export function useBackgroundPauseGuard(activity: PracticeActivity | null | undefined) {
  const qc = useQueryClient();
  const hiddenSince = useRef<number | null>(null);
  const activityId = activity?.id;

  useEffect(() => {
    if (!activityId) return;
    const onHidden = () => {
      hiddenSince.current = Date.now();
    };
    const onVisible = async () => {
      if (hiddenSince.current == null) return;
      const hidden = (Date.now() - hiddenSince.current) / 1000;
      hiddenSince.current = null;
      try {
        const trimmed = await creditBackgroundGap(activityId, hidden);
        if (trimmed) qc.invalidateQueries({ queryKey: ["practice_activities"] });
      } catch (e) {
        console.error("[practice] background reconcile failed", e);
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") onHidden();
      else void onVisible();
    };
    document.addEventListener("visibilitychange", onVis);
    let removeAppState: (() => void) | undefined;
    import("@capacitor/app")
      .then(({ App }) => App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void onVisible();
        else onHidden();
      }))
      .then((handle) => {
        removeAppState = () => { handle.remove(); };
      })
      .catch(() => {});
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      removeAppState?.();
    };
  }, [activityId, qc]);
}


/** Human-readable "2 hours ago" style formatting for last_active_at. */
export function useRelativeTime(iso: string | null | undefined): string {
  return useMemo(() => {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    const secs = Math.floor((Date.now() - then) / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }, [iso]);
}
