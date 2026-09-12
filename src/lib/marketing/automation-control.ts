// SPDX-License-Identifier: Apache-2.0
import { canPerformBusinessAction } from "../business/permissions";

export type AutomationState =
  | Readonly<{ status: "RUNNING"; priorityId: null }>
  | Readonly<{ status: "PAUSED"; priorityId: string | null }>;
export type AutomationModes = Readonly<{
  goalSelection: "auto" | "manager";
  timing: "auto" | "constrained";
}>;
export type MarketingJob =
  | Readonly<{ kind: "ordinary"; priorityId?: null }>
  | Readonly<{ kind: "priority"; priorityId: string }>;
export type AutomationControlErrorCode = "INVALID_STATE" | "FORBIDDEN" | "INVALID_PRIORITY_ID" | "PRIORITY_CONFLICT" | "PRIORITY_IN_PROGRESS" | "PRIORITY_MISMATCH" | "INVALID_MODES";

export class AutomationControlError extends Error {
  constructor(public readonly code: AutomationControlErrorCode) {
    super(code);
    this.name = "AutomationControlError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isState(value: unknown): value is AutomationState {
  if (!isRecord(value)) return false;
  return (value.status === "RUNNING" && value.priorityId === null) ||
    (value.status === "PAUSED" && (value.priorityId === null || isId(value.priorityId)));
}

function requireState(value: unknown): asserts value is AutomationState {
  if (!isState(value)) throw new AutomationControlError("INVALID_STATE");
}

function requireManager(actor: unknown): void {
  if (!isRecord(actor) || !isId(actor.id) || !canPerformBusinessAction(actor.role, "manage_marketing")) {
    throw new AutomationControlError("FORBIDDEN");
  }
}

function requirePriorityId(value: unknown): asserts value is string {
  if (!isId(value)) throw new AutomationControlError("INVALID_PRIORITY_ID");
}

function snapshot(state: AutomationState): AutomationState {
  return Object.freeze({ status: state.status, priorityId: state.priorityId }) as AutomationState;
}

/**
 * Pure policy only. Callers must verify session/actor and installation scope on
 * the server, then atomically serialize and deduplicate persistent transitions.
 * Pausing cannot recall content already published.
 */
export function pauseAutomation(state: unknown, actor: unknown): AutomationState {
  requireState(state);
  requireManager(actor);
  return snapshot({ status: "PAUSED", priorityId: state.priorityId });
}

/** Only this explicit manager action resumes ordinary automation. */
export function resumeAutomation(state: unknown, actor: unknown): AutomationState {
  requireState(state);
  requireManager(actor);
  if (state.priorityId !== null) throw new AutomationControlError("PRIORITY_IN_PROGRESS");
  return snapshot({ status: "RUNNING", priorityId: null });
}

/** IDs identify unique requests; durable replay prevention belongs to persistence. */
export function requestPriority(state: unknown, actor: unknown, priorityId: unknown): AutomationState {
  requireState(state);
  requireManager(actor);
  requirePriorityId(priorityId);
  if (state.priorityId !== null && state.priorityId !== priorityId) {
    throw new AutomationControlError("PRIORITY_CONFLICT");
  }
  return snapshot({ status: "PAUSED", priorityId });
}

function finishPriority(state: unknown, priorityId: unknown): AutomationState {
  requireState(state);
  requirePriorityId(priorityId);
  if (state.priorityId !== priorityId) throw new AutomationControlError("PRIORITY_MISMATCH");
  return snapshot({ status: "PAUSED", priorityId: null });
}

/**
 * Trusted worker terminal event, not a user command. The caller must authenticate
 * the worker, verify job/installation ownership and serialize against current
 * state. Never expose directly to an untrusted actor. No forged manager needed.
 */
export function completePriority(state: unknown, priorityId: unknown): AutomationState {
  return finishPriority(state, priorityId);
}

/** Same trusted worker boundary as completePriority; failure never resumes. */
export function failPriority(state: unknown, priorityId: unknown): AutomationState {
  return finishPriority(state, priorityId);
}

/**
 * Shared scheduler/publisher gate, fail closed on malformed data. Workers must
 * recheck persisted state immediately before publishing; this is not a lock.
 */
export function canPublishMarketingJob(state: unknown, job: unknown): boolean {
  if (!isState(state) || !isRecord(job)) return false;
  if (job.kind === "ordinary") {
    return state.status === "RUNNING" && state.priorityId === null &&
      (job.priorityId === undefined || job.priorityId === null);
  }
  return job.kind === "priority" && state.status === "PAUSED" &&
    isId(job.priorityId) && job.priorityId === state.priorityId;
}

/** Mode axes only. Goal payloads, caps/windows and setup validation belong to OV-008. */
export function parseAutomationModes(value: unknown): AutomationModes {
  if (!isRecord(value) || (value.goalSelection !== "auto" && value.goalSelection !== "manager") ||
    (value.timing !== "auto" && value.timing !== "constrained")) {
    throw new AutomationControlError("INVALID_MODES");
  }
  return Object.freeze({ goalSelection: value.goalSelection, timing: value.timing });
}
