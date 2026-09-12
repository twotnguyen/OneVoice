// SPDX-License-Identifier: Apache-2.0
import { canPerformBusinessAction } from "../business/permissions";

export type HandoffReason = "return_request" | "warranty_request" | "customer_requested" | "missing_evidence" | "lookup_failed";
export type HandoffRequestReason = HandoffReason | "policy_question";
export type HandoffState =
  | Readonly<{ status: "AI_ACTIVE"; reason: null; claimedBy: null }>
  | Readonly<{ status: "WAITING_STAFF"; reason: HandoffReason; claimedBy: null }>
  | Readonly<{ status: "STAFF_ACTIVE"; reason: HandoffReason; claimedBy: string }>;
export type HandoffActor = Readonly<{ id: string; role: unknown }>;
export type HandoffErrorCode = "INVALID_STATE" | "INVALID_REASON" | "FORBIDDEN" | "INVALID_TRANSITION" | "ALREADY_CLAIMED" | "NOT_CLAIMANT";

export class HandoffError extends Error {
  constructor(public readonly code: HandoffErrorCode) {
    super(code);
    this.name = "HandoffError";
  }
}

function isReason(value: unknown): value is HandoffReason {
  return value === "return_request" || value === "warranty_request" || value === "customer_requested" || value === "missing_evidence" || value === "lookup_failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isState(value: unknown): value is HandoffState {
  if (!isRecord(value)) return false;
  if (value.status === "AI_ACTIVE") return value.reason === null && value.claimedBy === null;
  if (!isReason(value.reason)) return false;
  return (value.status === "WAITING_STAFF" && value.claimedBy === null) || (value.status === "STAFF_ACTIVE" && isId(value.claimedBy));
}

function requireState(value: unknown): asserts value is HandoffState {
  if (!isState(value)) throw new HandoffError("INVALID_STATE");
}

function requireActor(value: unknown, action: "claim_handoff" | "complete_handoff"): asserts value is HandoffActor {
  if (!isRecord(value) || !isId(value.id) || !canPerformBusinessAction(value.role, action)) throw new HandoffError("FORBIDDEN");
}

function snapshot(state: HandoffState): HandoffState {
  // Copy only the state contract, never retain caller-owned objects or extra data.
  return Object.freeze({ status: state.status, reason: state.reason, claimedBy: state.claimedBy }) as HandoffState;
}

/** Invalid persisted data must never enable an AI response. */
export function canAiRespond(state: unknown): boolean {
  return isState(state) && state.status === "AI_ACTIVE";
}

/** Pure transitions only: persistence must atomically deduplicate and serialize updates. */
export function requestHandoff(state: unknown, reason: unknown): HandoffState {
  requireState(state);
  if (reason !== "policy_question" && !isReason(reason)) throw new HandoffError("INVALID_REASON");
  if (reason === "policy_question" || state.status !== "AI_ACTIVE") return snapshot(state);
  return snapshot({ status: "WAITING_STAFF", reason, claimedBy: null });
}

/** The caller must supply an authenticated, server-verified actor and scope. */
export function claimHandoff(state: unknown, actor: unknown): HandoffState {
  requireState(state);
  requireActor(actor, "claim_handoff");
  if (state.status === "AI_ACTIVE") throw new HandoffError("INVALID_TRANSITION");
  if (state.status === "STAFF_ACTIVE") {
    if (state.claimedBy !== actor.id) throw new HandoffError("ALREADY_CLAIMED");
    return snapshot(state);
  }
  return snapshot({ status: "STAFF_ACTIVE", reason: state.reason, claimedBy: actor.id });
}

/** Completion is explicit; elapsed time or a lost session never resumes AI. */
export function completeHandoff(state: unknown, actor: unknown): HandoffState {
  requireState(state);
  requireActor(actor, "complete_handoff");
  if (state.status !== "STAFF_ACTIVE") throw new HandoffError("INVALID_TRANSITION");
  if (actor.id !== state.claimedBy && actor.role !== "manager") throw new HandoffError("NOT_CLAIMANT");
  return snapshot({ status: "AI_ACTIVE", reason: null, claimedBy: null });
}
