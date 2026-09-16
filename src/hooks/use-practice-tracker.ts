import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ACTIVE_PRACTICE_QK,
  SAVED_PRACTICES_QK,
  completeActivity,
  findResumable,
  getActivity,
  pauseActivity,
  patchState,
  startActivity,
  type PracticeActivity,
  type PracticeKind,
} from "@/lib/practice";
import {
  CURRENT_MEASURE_V,
  measureVersionForPractice,
  type MeasureVersion,
} from "@/lib/measurement";

type Options = {
  userId: string | undefined;
  kind: PracticeKind;
  slug: string | undefined | null;
  drillId?: string | null;
  challengeId?: string | null;
  title?: string | null;
  initialState?: Record<string, unknown>;
  bowlsDelivered?: number;
  /** When true, create/resume a practice_activity for this session. */
  enabled: boolean;
  /** If set, adopt this existing activity id (resume from Saved). */
  resumeId?: string | null;
};

/**
 * Owns lifecycle of a single practice_activity for a drill/challenge recorder.
 * - Creates or resumes a row when enabled becomes true
 * - Exposes helpers to autosave state, bump bowls, and mark completed
 * - On unmount without completion, pauses the activity so time stops accruing
 */
export function usePracticeTracker(opts: Options) {
  const qc = useQueryClient();
  const [activity, setActivity] = useState<PracticeActivity | null>(null);
  const activityRef = useRef<PracticeActivity | null>(null);
  activityRef.current = activity;
  const completedRef = useRef(false);
  const initingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!opts.enabled || !opts.userId || !opts.slug) {
        console.log("[tracker] init skipped", { enabled: opts.enabled, userId: opts.userId, slug: opts.slug });
        return;
      }
      if (initingRef.current || activityRef.current) return;
      initingRef.current = true;
      try {
        let row: PracticeActivity | null = null;
        if (opts.resumeId) {
          console.log("[tracker] resume by id", opts.resumeId);
          row = await getActivity(opts.resumeId);
        }
        if (!row) {
          row = await findResumable(opts.userId, opts.kind, opts.slug);
          if (row) console.log("[tracker] found resumable", row.id, row.status);
        }
        if (!row) {
          console.log("[tracker] no resumable, starting new");
          row = await startActivity({
            userId: opts.userId,
            kind: opts.kind,
            drillId: opts.drillId ?? null,
            challengeId: opts.challengeId ?? null,
            slug: opts.slug,
            title: opts.title ?? null,
            // Pin the measurement version at CREATION time. A practice
            // started before this deployment has no measure_v in its state and
            // therefore stays V1 for its whole life, even when resumed later.
            initialState: { measure_v: CURRENT_MEASURE_V, ...(opts.initialState ?? {}) },
            bowlsDelivered: opts.bowlsDelivered ?? 0,
          });
        } else if (row.status === "paused") {
          // Resume: flip to active so time starts accruing again.
          const { resumeActivity } = await import("@/lib/practice");
          row = (await resumeActivity(row.id)) ?? row;
        } else if (row.status === "active") {
          // Row was left active (app force-closed mid-drill). Trim only the
          // idle time beyond the abandon grace, then keep the timer running.
          const { reconcileStaleActive } = await import("@/lib/practice");
          row = (await reconcileStaleActive(row.id)) ?? row;
        }
        if (!cancelled) {
          setActivity(row);
          qc.invalidateQueries({ queryKey: ACTIVE_PRACTICE_QK(opts.userId) });
          qc.invalidateQueries({ queryKey: SAVED_PRACTICES_QK(opts.userId) });
        }
      } catch (err) {
        console.error("[tracker] init failed", err);
      } finally {
        initingRef.current = false;
      }
    }
    init();
    return () => { cancelled = true; };
    // Only re-init if enablement/keys change meaningfully.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, opts.userId, opts.kind, opts.slug, opts.resumeId]);

  // Pause on unmount unless we marked completed.
  useEffect(() => {
    return () => {
      const cur = activityRef.current;
      if (!cur) return;
      if (completedRef.current) return;
      if (cur.status === "active") {
        console.log("[tracker] unmount → pausing", cur.id);
        pauseActivity(cur.id).catch((e) => console.error("[tracker] unmount pause failed", e));
      }
    };
  }, []);

  async function saveState(patch: Record<string, unknown>, bowlsDelivered?: number) {
    const cur = activityRef.current;
    if (!cur) return;
    await patchState(cur.id, patch, bowlsDelivered !== undefined ? { bowlsDelivered } : undefined);
  }

  async function markCompleted(extra?: { resultId?: string | null; challengeResultId?: string | null }) {
    const cur = activityRef.current;
    if (!cur) return;
    completedRef.current = true;
    await completeActivity(cur.id, extra);
    if (opts.userId) {
      qc.invalidateQueries({ queryKey: ACTIVE_PRACTICE_QK(opts.userId) });
      qc.invalidateQueries({ queryKey: SAVED_PRACTICES_QK(opts.userId) });
    }
  }

  /**
   * Measurement version for any result produced by this practice.
   * Derived from the state stored when the row was first created, so resuming
   * a legacy paused practice never silently upgrades it to V2.
   */
  const measureVersion: MeasureVersion = activity
    ? measureVersionForPractice(activity.state)
    : CURRENT_MEASURE_V;

  return { activity, saveState, markCompleted, measureVersion };
}
