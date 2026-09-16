import { supabase } from "@/integrations/supabase/client";
import type { SkillAreaKey } from "@/lib/bowls";
import { endSession, startSession } from "@/lib/sessions";
import {
  bandScaleForTarget,
  parseProgression,
  parseTargetMode,
  parseWeightIntent,
  prescribedStepLabels,
  progressionLabel,
  supportsProgression,
  supportsTargetWidth,
  supportsWeightIntent,
  targetModeLabel,
  weightIntentLabel,
  type ProgressionMode,
  type TargetMode,
  type WeightIntent,
} from "@/lib/prescription";

// ─────────────────────────────────────────────────────────────────────────────
// Bowls Trainer — AI practice session persistence layer.
//
// This module owns reads/writes for the three new tables:
//   exercise_variants      — catalogue of alternative setups for EXISTING drills
//   trainer_sessions       — one generated ~30 minute practice session
//   trainer_session_blocks — the ordered blocks inside a session
//
// It deliberately contains NO generation logic (see trainer-generator.ts) and
// NO scoring logic (scoring stays in bowls.ts + the existing recorders).
// ─────────────────────────────────────────────────────────────────────────────

const sb = supabase as any;

export type TrainerSessionStatus = "planned" | "in_progress" | "completed" | "abandoned";
export type TrainerBlockStatus = "pending" | "active" | "completed" | "skipped";
/** Kept as a string so new block types can be added without a schema change. */
export type TrainerBlockType = "warmup" | "focus" | "challenge" | "cooldown" | (string & {});

export type ExerciseVariant = {
  id: string;
  slug: string;
  exercise_id: string;
  name: string;
  description: string | null;
  difficulty: number;
  target_skill: string;
  setup_parameters: Record<string, unknown>;
  scoring_parameters: Record<string, unknown>;
  tags: string[];
  active: boolean;
  sort_order: number;
};

export type TrainerSession = {
  id: string;
  user_id: string;
  generated_at: string;
  status: TrainerSessionStatus;
  focus_areas: string[];
  planned_minutes: number;
  current_block: number;
  total_blocks: number;
  completed_blocks: number;
  training_session_id: string | null;
  meta: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TrainerBlock = {
  id: string;
  session_id: string;
  user_id: string;
  sequence: number;
  block_type: TrainerBlockType;
  exercise_id: string | null;
  exercise_slug: string | null;
  exercise_variant_id: string | null;
  variant_slug: string | null;
  title: string;
  target_skill: string | null;
  reason: string | null;
  planned_minutes: number;
  planned_ends: number | null;
  config: Record<string, unknown>;
  status: TrainerBlockStatus;
  result_id: string | null;
  score: number | null;
  percentage: number | null;
  started_at: string | null;
  completed_at: string | null;
};

export const TRAINER_VARIANTS_QK = ["exercise_variants"];
export const TRAINER_SESSION_QK = (id: string) => ["trainer_session", id];
export const TRAINER_CURRENT_QK = (userId: string) => ["trainer_session", "current", userId];
export const TRAINER_HISTORY_QK = (userId: string) => ["trainer_session", "history", userId];

// ─── Catalogue ───────────────────────────────────────────────────────────────

export async function listActiveVariants(): Promise<ExerciseVariant[]> {
  const { data, error } = await sb
    .from("exercise_variants")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ExerciseVariant[];
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function getTrainerSession(id: string): Promise<{ session: TrainerSession; blocks: TrainerBlock[] } | null> {
  const { data, error } = await sb.from("trainer_sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: blocks, error: bErr } = await sb
    .from("trainer_session_blocks")
    .select("*")
    .eq("session_id", id)
    .order("sequence");
  if (bErr) throw bErr;
  return { session: data as TrainerSession, blocks: (blocks ?? []) as TrainerBlock[] };
}

/** The session the player should currently be shown (planned or in progress). */
export async function getCurrentTrainerSession(userId: string) {
  const { data, error } = await sb
    .from("trainer_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["planned", "in_progress"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return getTrainerSession((data as TrainerSession).id);
}

/** Recent finished/abandoned sessions — the anti-repetition memory. */
export async function recentTrainerBlocks(userId: string, limit = 60): Promise<TrainerBlock[]> {
  const { data, error } = await sb
    .from("trainer_session_blocks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TrainerBlock[];
}

export type NewBlockInput = Omit<
  TrainerBlock,
  "id" | "session_id" | "user_id" | "status" | "result_id" | "score" | "percentage" | "started_at" | "completed_at"
>;

export async function createTrainerSession(input: {
  userId: string;
  focusAreas: SkillAreaKey[];
  plannedMinutes: number;
  meta?: Record<string, unknown>;
  blocks: NewBlockInput[];
}): Promise<{ session: TrainerSession; blocks: TrainerBlock[] }> {
  // A Bowls Trainer workout is ONE practice session in the existing
  // training_sessions system. startSession() reuses an already-active session
  // if the player has one, so this never creates a competing second session.
  let trainingSessionId: string | null = null;
  try {
    const ts = await startSession(input.userId);
    trainingSessionId = ts.id;
  } catch (e) {
    console.error("[trainer] could not attach a training session", e);
  }

  const { data: session, error } = await sb
    .from("trainer_sessions")
    .insert({
      user_id: input.userId,
      focus_areas: input.focusAreas,
      planned_minutes: input.plannedMinutes,
      total_blocks: input.blocks.length,
      meta: input.meta ?? {},
      status: "planned",
      training_session_id: trainingSessionId,
    })
    .select("*")
    .single();
  if (error) throw error;


  const rows = input.blocks.map((b) => ({ ...b, session_id: session.id, user_id: input.userId }));
  const { data: blocks, error: bErr } = await sb
    .from("trainer_session_blocks")
    .insert(rows)
    .select("*")
    .order("sequence");
  if (bErr) throw bErr;
  return { session: session as TrainerSession, blocks: (blocks ?? []) as TrainerBlock[] };
}

export async function startTrainerSession(sessionId: string): Promise<void> {
  const { error } = await sb
    .from("trainer_sessions")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "planned");
  if (error) throw error;
}

export async function abandonTrainerSession(sessionId: string): Promise<void> {
  const { error } = await sb.from("trainer_sessions").update({ status: "abandoned" }).eq("id", sessionId);
  if (error) throw error;
}

/**
 * Delete an AI Coach plan outright so it can never be resumed or leak block
 * state into a future session. Practice results are NEVER touched: only the
 * trainer plan rows, plus the linked training_session when it is empty.
 */
export async function resetTrainerSession(sessionId: string, userId: string): Promise<void> {
  const { data: session } = await sb
    .from("trainer_sessions")
    .select("id,user_id,training_session_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session) return;

  await sb.from("trainer_session_blocks").delete().eq("session_id", sessionId).eq("user_id", userId);
  await sb.from("trainer_sessions").delete().eq("id", sessionId).eq("user_id", userId);

  const tsId = (session as TrainerSession).training_session_id;
  if (!tsId) return;
  // Only clean up the linked practice session when it holds nothing worth keeping.
  const [{ count: resultCount }, { count: challengeCount }] = await Promise.all([
    sb.from("results").select("id", { count: "exact", head: true }).eq("session_id", tsId),
    sb.from("challenge_results").select("id", { count: "exact", head: true }).eq("session_id", tsId),
  ]);
  if ((resultCount ?? 0) === 0 && (challengeCount ?? 0) === 0) {
    try {
      await sb.rpc("delete_my_training_session", { _session_id: tsId });
    } catch (e) {
      console.error("[trainer] could not clean up empty training session", e);
    }
  }
}


export async function markBlockActive(blockId: string): Promise<void> {
  const { error } = await sb
    .from("trainer_session_blocks")
    .update({ status: "active", started_at: new Date().toISOString() })
    .eq("id", blockId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function skipBlock(sessionId: string, blockId: string): Promise<void> {
  await sb.from("trainer_session_blocks").update({ status: "skipped", completed_at: new Date().toISOString() }).eq("id", blockId);
  await recomputeSessionProgress(sessionId);
}

/**
 * Called from inside the EXISTING recorders once a result has been saved.
 * Attaches the result to the block, advances the session, and completes it
 * when every block is done. Never throws into the recorder's save path.
 */
export async function completeTrainerBlock(args: {
  sessionId: string;
  blockId: string;
  resultId?: string | null;
  score?: number | null;
  percentage?: number | null;
}): Promise<void> {
  try {
    await sb
      .from("trainer_session_blocks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        result_id: args.resultId ?? null,
        score: args.score ?? null,
        percentage: args.percentage ?? null,
      })
      .eq("id", args.blockId);
    await recomputeSessionProgress(args.sessionId);
  } catch (e) {
    console.error("[trainer] completeTrainerBlock failed", e);
  }
}

export async function recomputeSessionProgress(sessionId: string): Promise<void> {
  const { data: blocks } = await sb
    .from("trainer_session_blocks")
    .select("sequence,status")
    .eq("session_id", sessionId)
    .order("sequence");
  const list = (blocks ?? []) as { sequence: number; status: TrainerBlockStatus }[];
  const next = list.find((b) => b.status === "pending" || b.status === "active");
  const allDone = list.length > 0 && !next;

  const { data: current } = await sb
    .from("trainer_sessions")
    .select("started_at,training_session_id,status")
    .eq("id", sessionId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    completed_blocks: list.filter((b) => b.status === "completed").length,
    current_block: next ? next.sequence : list.length,
    status: allDone ? "completed" : "in_progress",
  };
  if (!current?.started_at) patch['started_at'] = new Date().toISOString();
  if (allDone) patch['completed_at'] = new Date().toISOString();

  await sb.from("trainer_sessions").update(patch).eq("id", sessionId);

  // Finalise the linked practice session through the EXISTING mechanism so the
  // whole workout shows up in Recent Practice as one session.
  if (allDone && current?.training_session_id && current.status !== "completed") {
    try {
      await endSession(current.training_session_id);
    } catch (e) {
      console.error("[trainer] could not finalise linked training session", e);
    }
  }
}

// ─── Trainer prescription (recorder configuration) ───────────────────────────

/** Fetch a single block — the DB is the source of truth for its variant config. */
export async function getTrainerBlock(blockId: string): Promise<TrainerBlock | null> {
  const { data, error } = await sb
    .from("trainer_session_blocks")
    .select("*")
    .eq("id", blockId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as TrainerBlock | null;
}

export const TRAINER_BLOCK_QK = (id: string) => ["trainer_block", id];

export type TrainerHand = "forehand" | "backhand" | "alternate";

export type TrainerPrescription = {
  /** Hand pattern the recorder should deliver in, when prescribed. */
  hand: TrainerHand | null;
  /** Prescribed length / target / weight etc — instructional where the recorder has no control. */
  length: string | null;
  target: string | null;
  weight: string | null;
  progression: string | null;
  ends: number | null;
  variantName: string | null;
  variantDescription: string | null;
  /** Normalised, recorder-actionable forms of target/weight/progression. */
  targetMode: TargetMode | null;
  weightIntent: WeightIntent | null;
  progressionMode: ProgressionMode | null;
};

export function trainerPrescription(block: TrainerBlock | null | undefined): TrainerPrescription | null {
  if (!block) return null;
  const cfg = (block.config ?? {}) as Record<string, any>;
  const setup = (cfg['setup_parameters'] ?? {}) as Record<string, any>;
  const hand = setup['hand'];
  const ends = Number(setup['ends']);
  return {
    hand: hand === "forehand" || hand === "backhand" || hand === "alternate" ? hand : null,
    length: typeof setup['length'] === "string" ? setup['length'] : null,
    target: typeof setup['target'] === "string" ? setup['target'] : null,
    weight: typeof setup['weight'] === "string" ? setup['weight'] : null,
    progression: typeof setup['progression'] === "string" ? setup['progression'] : null,
    ends: Number.isFinite(ends) && ends > 0 ? ends : null,
    variantName: typeof cfg['variant_name'] === "string" ? cfg['variant_name'] : null,
    variantDescription: typeof cfg['variant_description'] === "string" ? cfg['variant_description'] : null,
    targetMode: parseTargetMode(setup['target']),
    weightIntent: parseWeightIntent(setup['weight']),
    progressionMode: parseProgression(setup['progression']),
  };
}

/**
 * How the recorder should behave for a prescribed block on a given drill.
 * Only parameters the drill can actually honour become behaviour; everything
 * else stays an on-screen instruction. With no prescription this is inert
 * (scale 1, no chips, no steps) so ordinary practice is unchanged.
 */
export function recorderPrescription(
  p: TrainerPrescription | null | undefined,
  drillSlug: string | null | undefined,
  seed: string,
  bowlsPerEnd = 4,
): { bandScale: number; chips: string[]; bowlStepLabels: string[] } {
  if (!p) return { bandScale: 1, chips: [], bowlStepLabels: [] };

  const narrowApplies = p.targetMode === "narrow" && supportsTargetWidth(drillSlug);
  const chips: string[] = [];

  if (p.hand) chips.push(p.hand === "alternate" ? "Alternate hands" : `${p.hand === "forehand" ? "Forehand" : "Backhand"} only`);
  if (p.targetMode) {
    const label = targetModeLabel(p.targetMode);
    chips.push(narrowApplies ? `${label} target` : `${label} target (guide)`);
  }
  if (p.weightIntent && p.weightIntent !== "normal") {
    const label = weightIntentLabel(p.weightIntent);
    chips.push(supportsWeightIntent(drillSlug) ? `${label} weight` : `${label} weight (guide)`);
  }
  const stepsApply = !!p.progressionMode && supportsProgression(drillSlug);
  if (p.progressionMode) {
    chips.push(stepsApply ? `${progressionLabel(p.progressionMode)} order` : `${progressionLabel(p.progressionMode)} order (guide)`);
  }

  return {
    bandScale: narrowApplies ? bandScaleForTarget("narrow") : 1,
    chips,
    bowlStepLabels: stepsApply ? prescribedStepLabels(drillSlug, p.progressionMode, bowlsPerEnd, seed) : [],
  };
}

/** Short human summary of everything the Trainer prescribed for this block. */
export function prescriptionSummary(p: TrainerPrescription | null): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (p.hand) out.push(p.hand === "alternate" ? "Alternate hands" : `${p.hand === "forehand" ? "Forehand" : "Backhand"} only`);
  if (p.length) out.push(`${p.length} length`);
  const t = targetModeLabel(p.targetMode);
  if (t) out.push(`${t} target`);
  const w = weightIntentLabel(p.weightIntent);
  if (w && p.weightIntent !== "normal") out.push(`${w} weight`);
  const pr = progressionLabel(p.progressionMode);
  if (pr) out.push(`${pr} order`);
  return out;
}

/** training_session ids that belong to a Bowls Trainer workout. */
export async function trainerLinkedTrainingSessionIds(userId: string): Promise<Set<string>> {
  const { data } = await sb
    .from("trainer_sessions")
    .select("training_session_id")
    .eq("user_id", userId)
    .not("training_session_id", "is", null);
  return new Set(((data ?? []) as { training_session_id: string }[]).map((r) => r.training_session_id));
}

