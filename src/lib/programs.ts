import { supabase } from "@/integrations/supabase/client";
import { isDrawDrillSlug } from "@/lib/bowls";

// ─────────────────────────────────────────────────────────────────────────────
// Bowls Trainer — canonical TRAINING PROGRAM layer.
//
// ONE architecture serves Tournament Training, coach custom programs and (later)
// AI Coach / club programs. Programs REFERENCE canonical drills and challenges;
// they never clone exercise definitions, scoring, BSI or practice timing.
//
// Completion is resolved from canonical results (results / challenge_results)
// that were saved after the player launched the activity. That means recording
// through a program is byte-for-byte the normal recording flow: same drill
// screens, same BSI maths, same practice_activities timer, counted exactly once.
// ─────────────────────────────────────────────────────────────────────────────

const sb = supabase as any;

export type ProgramType = "TOURNAMENT_PREP" | "COACH_CUSTOM" | (string & {});
export type ProgramStatus = "draft" | "active" | "completed" | "archived";
export type ActivityKind = "drill" | "challenge";
export type ActivityStatus = "not_started" | "in_progress" | "completed";
export type SessionStatus = "not_started" | "in_progress" | "completed";
export type ProgramPhase = "BUILD" | "SHARPEN" | "TAPER" | (string & {});

export type TrainingProgram = {
  id: string;
  program_type: ProgramType;
  name: string;
  description: string | null;
  owner_id: string;
  status: ProgramStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ProgramSession = {
  id: string;
  program_id: string;
  sequence: number;
  title: string;
  objective: string | null;
  phase: ProgramPhase | null;
  week_number: number | null;
  scheduled_date: string | null;
  coach_note: string | null;
  meta: Record<string, unknown>;
};

export type ProgramActivity = {
  id: string;
  program_id: string;
  session_id: string;
  sequence: number;
  kind: ActivityKind;
  drill_id: string | null;
  challenge_id: string | null;
  required_completions: number;
  target_score: number | null;
  focus: string | null;
  coach_note: string | null;
  meta: Record<string, unknown>;
};

export type ActivityProgress = {
  id: string;
  program_id: string;
  activity_id: string;
  player_id: string;
  status: ActivityStatus;
  completions: number;
  launched_at: string | null;
  completed_at: string | null;
  result_id: string | null;
  challenge_result_id: string | null;
  player_note: string | null;
};

export type ProgramAssignment = {
  id: string;
  program_id: string;
  player_id: string;
  assigned_by: string | null;
  status: "active" | "completed" | "archived";
  source: string | null;
  created_at: string;
};

/** Canonical library reference resolved for display. */
export type ActivityRef = {
  name: string;
  category: string | null;
  description: string | null;
  slug: string;
  /** Drills feed BSI; challenges never do. */
  affectsBsi: boolean;
};

export type ResolvedActivity = ProgramActivity & {
  ref: ActivityRef | null;
  progress: ActivityProgress | null;
  status: ActivityStatus;
  /** BSI of the canonical result that satisfied this activity, when known. */
  resultBsi: number | null;
  resultScore: number | null;
};

export type ResolvedSession = ProgramSession & {
  activities: ResolvedActivity[];
  status: SessionStatus;
  completedCount: number;
};

export type ProgramDetail = {
  program: TrainingProgram;
  sessions: ResolvedSession[];
  assignment: ProgramAssignment | null;
  totalActivities: number;
  completedActivities: number;
  totalSessions: number;
  completedSessions: number;
  nextSession: ResolvedSession | null;
  nextActivity: ResolvedActivity | null;
};

export const MY_PROGRAMS_QK = (userId: string) => ["training_programs", "mine", userId];
export const COACH_PROGRAMS_QK = (userId: string) => ["training_programs", "owned", userId];
export const PROGRAM_DETAIL_QK = (programId: string, playerId: string) => [
  "training_programs",
  "detail",
  programId,
  playerId,
];

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Programs assigned to this player (tournament prep + coach programs). */
export async function listMyPrograms(userId: string): Promise<
  Array<{ program: TrainingProgram; assignment: ProgramAssignment; ownerName: string | null }>
> {
  const { data, error } = await sb
    .from("program_assignments")
    .select("*, training_programs(*)")
    .eq("player_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Array<ProgramAssignment & { training_programs: TrainingProgram }>;
  const ownerIds = [...new Set(rows.map((r) => r.training_programs?.owner_id).filter(Boolean))];
  const names = new Map<string, string | null>();
  if (ownerIds.length) {
    const { data: profs } = await sb.from("profiles").select("id, full_name").in("id", ownerIds);
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
      names.set(p.id, p.full_name);
    }
  }
  return rows
    .filter((r) => !!r.training_programs)
    .map(({ training_programs, ...assignment }) => ({
      program: training_programs,
      assignment: assignment as ProgramAssignment,
      ownerName: training_programs.owner_id === userId ? null : names.get(training_programs.owner_id) ?? null,
    }));
}

/** Programs this user created (coach view). */
export async function listOwnedPrograms(userId: string): Promise<TrainingProgram[]> {
  const { data, error } = await sb
    .from("training_programs")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TrainingProgram[];
}

async function libraryRefs(): Promise<{ drills: Map<string, ActivityRef>; challenges: Map<string, ActivityRef> }> {
  const [{ data: drills }, { data: challenges }] = await Promise.all([
    sb.from("drills").select("id, slug, name, category, description"),
    sb.from("challenges").select("id, slug, name, category, description"),
  ]);
  const dMap = new Map<string, ActivityRef>();
  for (const d of (drills ?? []) as any[]) {
    dMap.set(d.id, {
      name: d.name,
      category: d.category ?? null,
      description: d.description ?? null,
      slug: d.slug,
      affectsBsi: true,
    });
  }
  const cMap = new Map<string, ActivityRef>();
  for (const c of (challenges ?? []) as any[]) {
    cMap.set(c.id, {
      name: c.name,
      category: c.category ?? null,
      description: c.description ?? null,
      slug: c.slug,
      affectsBsi: false,
    });
  }
  return { drills: dMap, challenges: cMap };
}

export function deriveSessionStatus(activities: ResolvedActivity[]): SessionStatus {
  if (activities.length === 0) return "not_started";
  if (activities.every((a) => a.status === "completed")) return "completed";
  if (activities.some((a) => a.status !== "not_started")) return "in_progress";
  return "not_started";
}

/**
 * Full program for a given player, with that player's own progress only.
 * Coaches call it with the player id they are monitoring.
 */
export async function getProgramDetail(programId: string, playerId: string): Promise<ProgramDetail | null> {
  const [{ data: program }, { data: sessions }, { data: activities }, { data: progress }, { data: assignment }, refs] =
    await Promise.all([
      sb.from("training_programs").select("*").eq("id", programId).maybeSingle(),
      sb.from("program_sessions").select("*").eq("program_id", programId).order("sequence"),
      sb.from("program_activities").select("*").eq("program_id", programId).order("sequence"),
      sb
        .from("program_activity_progress")
        .select("*")
        .eq("program_id", programId)
        .eq("player_id", playerId),
      sb
        .from("program_assignments")
        .select("*")
        .eq("program_id", programId)
        .eq("player_id", playerId)
        .maybeSingle(),
      libraryRefs(),
    ]);
  if (!program) return null;

  const progressByActivity = new Map<string, ActivityProgress>();
  for (const p of (progress ?? []) as ActivityProgress[]) progressByActivity.set(p.activity_id, p);

  // Scores for completed activities come from canonical result rows.
  const resultIds = (progress ?? []).map((p: ActivityProgress) => p.result_id).filter(Boolean) as string[];
  const chIds = (progress ?? []).map((p: ActivityProgress) => p.challenge_result_id).filter(Boolean) as string[];
  const bsiById = new Map<string, { bsi: number | null; score: number | null }>();
  if (resultIds.length) {
    const { data } = await sb.from("results").select("id, bsi, score").in("id", resultIds);
    for (const r of (data ?? []) as any[]) bsiById.set(r.id, { bsi: r.bsi ?? null, score: r.score ?? null });
  }
  if (chIds.length) {
    const { data } = await sb.from("challenge_results").select("id, score").in("id", chIds);
    for (const r of (data ?? []) as any[]) bsiById.set(r.id, { bsi: null, score: r.score ?? null });
  }

  const resolvedSessions: ResolvedSession[] = ((sessions ?? []) as ProgramSession[]).map((s) => {
    const acts = ((activities ?? []) as ProgramActivity[])
      .filter((a) => a.session_id === s.id)
      .sort((a, b) => a.sequence - b.sequence)
      .map<ResolvedActivity>((a) => {
        const prog = progressByActivity.get(a.id) ?? null;
        const ref = a.kind === "drill"
          ? refs.drills.get(a.drill_id ?? "") ?? null
          : refs.challenges.get(a.challenge_id ?? "") ?? null;
        const resKey = prog?.result_id ?? prog?.challenge_result_id ?? null;
        const scored = resKey ? bsiById.get(resKey) ?? null : null;
        return {
          ...a,
          ref,
          progress: prog,
          status: prog?.status ?? "not_started",
          resultBsi: scored?.bsi ?? null,
          resultScore: scored?.score ?? null,
        };
      });
    return {
      ...s,
      activities: acts,
      status: deriveSessionStatus(acts),
      completedCount: acts.filter((a) => a.status === "completed").length,
    };
  });

  const allActs = resolvedSessions.flatMap((s) => s.activities);
  const nextSession = resolvedSessions.find((s) => s.status !== "completed") ?? null;
  const nextActivity = nextSession?.activities.find((a) => a.status !== "completed") ?? null;

  return {
    program: program as TrainingProgram,
    sessions: resolvedSessions,
    assignment: (assignment ?? null) as ProgramAssignment | null,
    totalActivities: allActs.length,
    completedActivities: allActs.filter((a) => a.status === "completed").length,
    totalSessions: resolvedSessions.length,
    completedSessions: resolvedSessions.filter((s) => s.status === "completed").length,
    nextSession,
    nextActivity,
  };
}

// ─── Progress ────────────────────────────────────────────────────────────────

/**
 * Record that the player is about to record this activity. We only stamp
 * launched_at — the actual result is saved by the canonical drill/challenge
 * flow, and matched back here by syncProgramProgress.
 */
export async function launchActivity(activity: ProgramActivity, playerId: string): Promise<void> {
  const { error } = await sb.from("program_activity_progress").upsert(
    {
      program_id: activity.program_id,
      activity_id: activity.id,
      player_id: playerId,
      status: "in_progress",
      launched_at: new Date().toISOString(),
    },
    { onConflict: "activity_id,player_id", ignoreDuplicates: false },
  );
  if (error) console.error("[programs] launchActivity failed", error);
}

/**
 * Resolve completion from canonical results. For every in-progress activity we
 * look for a result of that exact drill/challenge saved by this player at or
 * after launch. Nothing is written to results, BSI or the practice timer —
 * this only mirrors what already happened.
 */
export async function syncProgramProgress(detail: ProgramDetail, playerId: string): Promise<boolean> {
  const pending = detail.sessions
    .flatMap((s) => s.activities)
    .filter((a) => a.status === "in_progress" && a.progress?.launched_at);
  if (pending.length === 0) return false;

  const since = pending
    .map((a) => a.progress!.launched_at!)
    .sort()[0]!;

  const [{ data: results }, { data: chResults }] = await Promise.all([
    sb
      .from("results")
      .select("id, drill_id, played_at, created_at")
      .eq("user_id", playerId)
      .gte("created_at", since)
      .order("created_at"),
    sb
      .from("challenge_results")
      .select("id, challenge_id, created_at")
      .eq("user_id", playerId)
      .gte("created_at", since)
      .order("created_at"),
  ]);

  const usedResults = new Set<string>(
    detail.sessions
      .flatMap((s) => s.activities)
      .flatMap((a) => [a.progress?.result_id, a.progress?.challenge_result_id])
      .filter(Boolean) as string[],
  );

  let changed = false;
  for (const act of pending) {
    const launched = act.progress!.launched_at!;
    const needed = Math.max(1, act.required_completions);
    if (act.kind === "drill") {
      const matches = ((results ?? []) as any[]).filter(
        (r) => r.drill_id === act.drill_id && r.created_at >= launched && !usedResults.has(r.id),
      );
      if (matches.length === 0) continue;
      const completions = (act.progress?.completions ?? 0) + matches.length;
      const last = matches[matches.length - 1];
      matches.forEach((m) => usedResults.add(m.id));
      await sb
        .from("program_activity_progress")
        .update({
          completions,
          result_id: last.id,
          status: completions >= needed ? "completed" : "in_progress",
          completed_at: completions >= needed ? new Date().toISOString() : null,
          launched_at: completions >= needed ? act.progress!.launched_at : new Date().toISOString(),
        })
        .eq("id", act.progress!.id);
      changed = true;
    } else {
      const matches = ((chResults ?? []) as any[]).filter(
        (r) => r.challenge_id === act.challenge_id && r.created_at >= launched && !usedResults.has(r.id),
      );
      if (matches.length === 0) continue;
      const completions = (act.progress?.completions ?? 0) + matches.length;
      const last = matches[matches.length - 1];
      matches.forEach((m) => usedResults.add(m.id));
      await sb
        .from("program_activity_progress")
        .update({
          completions,
          challenge_result_id: last.id,
          status: completions >= needed ? "completed" : "in_progress",
          completed_at: completions >= needed ? new Date().toISOString() : null,
          launched_at: completions >= needed ? act.progress!.launched_at : new Date().toISOString(),
        })
        .eq("id", act.progress!.id);
      changed = true;
    }
  }
  return changed;
}

export async function savePlayerNote(progressId: string, note: string): Promise<void> {
  await sb.from("program_activity_progress").update({ player_note: note }).eq("id", progressId);
}

// ─── Writes: program structure ───────────────────────────────────────────────

export type NewSessionInput = {
  title: string;
  objective?: string | null;
  phase?: ProgramPhase | null;
  weekNumber?: number | null;
  scheduledDate?: string | null;
  coachNote?: string | null;
  activities: Array<{
    kind: ActivityKind;
    drillId?: string | null;
    challengeId?: string | null;
    requiredCompletions?: number;
    targetScore?: number | null;
    focus?: string | null;
    coachNote?: string | null;
  }>;
};

export type CreateProgramInput = {
  ownerId: string;
  programType: ProgramType;
  name: string;
  description?: string | null;
  status?: ProgramStatus;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  settings?: Record<string, unknown>;
  sessions?: NewSessionInput[];
  /** Players to assign. A squad program is ONE program with many assignments. */
  assignTo?: string[];
};

export async function createProgram(input: CreateProgramInput): Promise<TrainingProgram> {
  const { data: program, error } = await sb
    .from("training_programs")
    .insert({
      owner_id: input.ownerId,
      program_type: input.programType,
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "draft",
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      notes: input.notes ?? null,
      settings: input.settings ?? {},
    })
    .select("*")
    .single();
  if (error) throw error;

  // Bulk-insert sessions then activities: a program can be a dozen sessions and
  // 40 activities, and row-at-a-time writes are slow enough to be interrupted
  // by a navigation, which would leave a half-built plan.
  const sessionInputs = input.sessions ?? [];
  if (sessionInputs.length > 0) {
    const { data: createdSessions, error: sErr } = await sb
      .from("program_sessions")
      .insert(
        sessionInputs.map((s, i) => ({
          program_id: program.id,
          sequence: i + 1,
          title: s.title,
          objective: s.objective ?? null,
          phase: s.phase ?? null,
          week_number: s.weekNumber ?? null,
          scheduled_date: s.scheduledDate ?? null,
          coach_note: s.coachNote ?? null,
        })),
      )
      .select("id, sequence");
    if (sErr) throw sErr;
    const idBySeq = new Map<number, string>(
      ((createdSessions ?? []) as Array<{ id: string; sequence: number }>).map((r) => [r.sequence, r.id]),
    );
    const activityRows = sessionInputs.flatMap((s, i) =>
      s.activities.map((a, j) => ({
        program_id: program.id,
        session_id: idBySeq.get(i + 1)!,
        sequence: j + 1,
        kind: a.kind,
        drill_id: a.drillId ?? null,
        challenge_id: a.challengeId ?? null,
        required_completions: a.requiredCompletions ?? 1,
        target_score: a.targetScore ?? null,
        focus: a.focus ?? null,
        coach_note: a.coachNote ?? null,
      })),
    );
    if (activityRows.length > 0) {
      const { error: aErr } = await sb.from("program_activities").insert(activityRows);
      if (aErr) throw aErr;
    }
  }
  for (const playerId of input.assignTo ?? []) {
    await assignProgram(program.id, playerId, input.ownerId);
  }
  return program as TrainingProgram;
}

export async function addSession(
  programId: string,
  session: NewSessionInput,
  sequence: number,
): Promise<ProgramSession> {
  const { data, error } = await sb
    .from("program_sessions")
    .insert({
      program_id: programId,
      sequence,
      title: session.title,
      objective: session.objective ?? null,
      phase: session.phase ?? null,
      week_number: session.weekNumber ?? null,
      scheduled_date: session.scheduledDate ?? null,
      coach_note: session.coachNote ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  for (const [i, a] of session.activities.entries()) {
    await addActivity(programId, data.id, a, i + 1);
  }
  return data as ProgramSession;
}

export async function addActivity(
  programId: string,
  sessionId: string,
  activity: NewSessionInput["activities"][number],
  sequence: number,
): Promise<ProgramActivity> {
  const { data, error } = await sb
    .from("program_activities")
    .insert({
      program_id: programId,
      session_id: sessionId,
      sequence,
      kind: activity.kind,
      drill_id: activity.drillId ?? null,
      challenge_id: activity.challengeId ?? null,
      required_completions: activity.requiredCompletions ?? 1,
      target_score: activity.targetScore ?? null,
      focus: activity.focus ?? null,
      coach_note: activity.coachNote ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ProgramActivity;
}

// ─── Editing rules ───────────────────────────────────────────────────────────
//
// A coach may keep shaping FUTURE work after a program has gone out, but
// anything a player has already RECORDED is frozen: the completed activity, its
// canonical result, BSI and practice time are never rewritten or removed.
// "Completed by anyone" locks an activity, because the activity row is the
// shared definition of what that player recorded. Players at different stages
// therefore only ever see edits to work still ahead of them.

/** Activity ids in this program that at least one player has completed. */
export async function lockedActivityIds(programId: string): Promise<Set<string>> {
  const { data } = await sb
    .from("program_activity_progress")
    .select("activity_id, status, completions")
    .eq("program_id", programId);
  const locked = new Set<string>();
  for (const p of (data ?? []) as Array<{ activity_id: string; status: string; completions: number | null }>) {
    if (p.status === "completed" || (p.completions ?? 0) > 0) locked.add(p.activity_id);
  }
  return locked;
}

async function assertActivityUnlocked(activityId: string): Promise<void> {
  const { data } = await sb
    .from("program_activity_progress")
    .select("status, completions")
    .eq("activity_id", activityId);
  const done = ((data ?? []) as Array<{ status: string; completions: number | null }>).some(
    (p) => p.status === "completed" || (p.completions ?? 0) > 0,
  );
  if (done) throw new Error("A player has already recorded this — it stays exactly as they did it.");
}

export async function updateSession(
  sessionId: string,
  patch: Partial<Pick<ProgramSession, "title" | "objective" | "coach_note" | "scheduled_date" | "sequence">>,
): Promise<void> {
  const { error } = await sb.from("program_sessions").update(patch).eq("id", sessionId);
  if (error) throw error;
}

/** True when no player has recorded anything in this session yet. */
export async function canEditSession(sessionId: string): Promise<boolean> {
  const { data: acts } = await sb.from("program_activities").select("id").eq("session_id", sessionId);
  const ids = ((acts ?? []) as Array<{ id: string }>).map((a) => a.id);
  if (ids.length === 0) return true;
  const { data } = await sb
    .from("program_activity_progress")
    .select("activity_id, status, completions")
    .in("activity_id", ids);
  return !((data ?? []) as Array<{ status: string; completions: number | null }>).some(
    (p) => p.status === "completed" || (p.completions ?? 0) > 0,
  );
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!(await canEditSession(sessionId))) {
    throw new Error("This session already has recorded practice, so it stays in the program.");
  }
  const { error } = await sb.from("program_sessions").delete().eq("id", sessionId);
  if (error) throw error;
}

export async function deleteActivity(activityId: string): Promise<void> {
  await assertActivityUnlocked(activityId);
  const { error } = await sb.from("program_activities").delete().eq("id", activityId);
  if (error) throw error;
}

/** Coach note, focus, target score and number of runs on work not yet recorded. */
export async function updateActivity(
  activityId: string,
  patch: Partial<Pick<ProgramActivity, "coach_note" | "focus" | "target_score" | "required_completions">>,
): Promise<void> {
  await assertActivityUnlocked(activityId);
  const { error } = await sb.from("program_activities").update(patch).eq("id", activityId);
  if (error) throw error;
}

/** Sequence only — never touches results, BSI or timing. */
export async function reorderActivities(ids: string[]): Promise<void> {
  for (const [i, id] of ids.entries()) {
    await sb.from("program_activities").update({ sequence: i + 1 }).eq("id", id);
  }
}

export async function assignProgram(
  programId: string,
  playerId: string,
  assignedBy: string,
  source = "manual",
): Promise<void> {
  const { error } = await sb
    .from("program_assignments")
    .upsert(
      { program_id: programId, player_id: playerId, assigned_by: assignedBy, source, status: "active" },
      { onConflict: "program_id,player_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

// ─── Squad assignment ────────────────────────────────────────────────────────

export type SquadCandidate = {
  playerId: string;
  name: string | null;
  /** Coaching access accepted — required before a program can be assigned. */
  authorised: boolean;
};

/**
 * The coach's own squad, flagged with who has accepted them as coach.
 * Squad membership alone is not authority to assign training; accepted coach
 * access is, which is exactly what the database policy enforces too.
 */
export async function listSquadCandidates(): Promise<SquadCandidate[]> {
  const [{ data: squad }, { data: players }] = await Promise.all([
    sb.rpc("list_my_squad"),
    sb.rpc("coach_list_players"),
  ]);
  const authorised = new Set(
    ((players ?? []) as Array<{ player_id: string }>).map((p) => p.player_id),
  );
  return ((squad ?? []) as Array<{ member_user_id: string; full_name: string | null }>).map((m) => ({
    playerId: m.member_user_id,
    name: m.full_name,
    authorised: authorised.has(m.member_user_id),
  }));
}

/**
 * Assign ONE shared program definition to every authorised squad member.
 * There is no per-player copy: each member simply gets their own assignment and
 * their own progress rows, so one player finishing an activity never touches
 * another player's plan.
 */
export async function assignProgramToSquad(
  programId: string,
  assignedBy: string,
): Promise<{ assigned: number; skipped: SquadCandidate[] }> {
  const candidates = await listSquadCandidates();
  const skipped = candidates.filter((c) => !c.authorised);
  let assigned = 0;
  for (const c of candidates.filter((x) => x.authorised)) {
    await assignProgram(programId, c.playerId, assignedBy, "squad");
    assigned += 1;
  }
  return { assigned, skipped };
}



export async function setProgramStatus(programId: string, status: ProgramStatus): Promise<void> {
  const { error } = await sb.from("training_programs").update({ status }).eq("id", programId);
  if (error) throw error;
}

export async function updateProgram(
  programId: string,
  patch: Partial<Pick<TrainingProgram, "name" | "description" | "start_date" | "end_date" | "notes">>,
): Promise<void> {
  const { error } = await sb.from("training_programs").update(patch).eq("id", programId);
  if (error) throw error;
}

/** Draft programs with no recorded progress may be deleted; anything else archives. */
export async function deleteOrArchiveProgram(programId: string): Promise<"deleted" | "archived"> {
  const { data } = await sb.from("program_activity_progress").select("id").eq("program_id", programId).limit(1);
  if ((data ?? []).length > 0) {
    await setProgramStatus(programId, "archived");
    return "archived";
  }
  const { error } = await sb.from("training_programs").delete().eq("id", programId);
  if (error) throw error;
  return "deleted";
}

// ─── Coach monitoring ────────────────────────────────────────────────────────

export type PlayerProgressRow = {
  playerId: string;
  name: string | null;
  completedActivities: number;
  totalActivities: number;
  completedSessions: number;
  totalSessions: number;
  lastActivityAt: string | null;
  percent: number;
};

export async function programPlayerProgress(programId: string): Promise<PlayerProgressRow[]> {
  const [{ data: assignments }, { data: activities }, { data: progress }, { data: sessions }] = await Promise.all([
    sb.from("program_assignments").select("player_id").eq("program_id", programId),
    sb.from("program_activities").select("id, session_id").eq("program_id", programId),
    sb
      .from("program_activity_progress")
      .select("player_id, activity_id, status, completed_at")
      .eq("program_id", programId),
    sb.from("program_sessions").select("id").eq("program_id", programId),
  ]);
  const playerIds = ((assignments ?? []) as any[]).map((a) => a.player_id);
  const names = new Map<string, string | null>();
  if (playerIds.length) {
    const { data: profs } = await sb.from("profiles").select("id, full_name").in("id", playerIds);
    for (const p of (profs ?? []) as any[]) names.set(p.id, p.full_name);
  }
  const acts = (activities ?? []) as Array<{ id: string; session_id: string }>;
  const totalSessions = ((sessions ?? []) as any[]).length;

  return playerIds.map((pid) => {
    const mine = ((progress ?? []) as any[]).filter((p) => p.player_id === pid);
    const doneIds = new Set(mine.filter((p) => p.status === "completed").map((p) => p.activity_id));
    const sessionsDone = [...new Set(acts.map((a) => a.session_id))].filter((sid) => {
      const inSession = acts.filter((a) => a.session_id === sid);
      return inSession.length > 0 && inSession.every((a) => doneIds.has(a.id));
    }).length;
    const last = mine
      .map((p) => p.completed_at)
      .filter(Boolean)
      .sort()
      .pop() as string | undefined;
    return {
      playerId: pid,
      name: names.get(pid) ?? null,
      completedActivities: doneIds.size,
      totalActivities: acts.length,
      completedSessions: sessionsDone,
      totalSessions,
      lastActivityAt: last ?? null,
      percent: acts.length ? Math.round((doneIds.size / acts.length) * 100) : 0,
    };
  });
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export function daysUntil(dateIso: string | null | undefined, now = new Date()): number | null {
  if (!dateIso) return null;
  const target = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
}

export function countdownLabel(dateIso: string | null | undefined, now = new Date()): string | null {
  const d = daysUntil(dateIso, now);
  if (d === null) return null;
  if (d > 1) return `in ${d} days`;
  if (d === 1) return "tomorrow";
  if (d === 0) return "today";
  return "finished";
}

export function programTypeLabel(type: ProgramType): string {
  if (type === "TOURNAMENT_PREP") return "Tournament Training";
  if (type === "COACH_CUSTOM") return "Coach Program";
  return "Training Program";
}

export function phaseLabel(phase: ProgramPhase | null | undefined): string | null {
  if (!phase) return null;
  if (phase === "BUILD") return "Build";
  if (phase === "SHARPEN") return "Sharpen";
  if (phase === "TAPER") return "Match ready";
  return String(phase);
}

/** Where a program activity should send the player to record it. */
export function activityLaunchTarget(activity: ResolvedActivity):
  | { to: "/record-draw/$slug"; params: { slug: string }; search: { start: "1" } }
  | { to: "/record"; search: { drill: string; start: "1" } }
  | { to: "/challenge-record/$slug"; params: { slug: string }; search: { start: "1" } }
  | null {
  const slug = activity.ref?.slug;
  if (!slug) return null;
  if (activity.kind === "challenge") {
    return { to: "/challenge-record/$slug", params: { slug }, search: { start: "1" } };
  }
  if (isDrawDrillSlug(slug)) {
    return { to: "/record-draw/$slug", params: { slug }, search: { start: "1" } };
  }
  return { to: "/record", search: { drill: slug, start: "1" } };
}
