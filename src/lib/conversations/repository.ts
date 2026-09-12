// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { postgresUuid, type BusinessJob } from "@/lib/jobs/types";
import type { HandoffReason } from "./handoff";
const reasonSchema = z.enum(["return_request", "warranty_request", "customer_requested", "missing_evidence", "lookup_failed"]);
export const conversationSnapshotSchema = z.object({
 id: postgresUuid, organizationId: postgresUuid, pageId: z.string(), psid: z.string(), revision: z.number().int().nonnegative(),
 status: z.enum(["AI_ACTIVE", "WAITING_STAFF", "STAFF_ACTIVE"]), activeHandoffId: postgresUuid.nullable(), reason: reasonSchema.nullable(), claimedBy: postgresUuid.nullable(), lastEventTimeMs: z.number().nullable(),
}).superRefine((value, context) => {
 const valid = value.status === "AI_ACTIVE" ? value.activeHandoffId === null && value.reason === null && value.claimedBy === null : value.activeHandoffId !== null && value.reason !== null && (value.status === "WAITING_STAFF" ? value.claimedBy === null : value.claimedBy !== null);
 if (!valid) context.addIssue({ code: "custom", message: "INVALID_CONVERSATION_STATE" });
});
export type ConversationSnapshot = z.infer<typeof conversationSnapshotSchema>;
const projectionSchema = z.discriminatedUnion("ignored", [z.object({ ignored: z.literal(true) }), z.object({ ignored: z.literal(false), inserted: z.boolean(), aiEligible: z.boolean(), conversation: conversationSnapshotSchema })]);
export type ConversationRpcName = "project_facebook_conversation" | "request_conversation_handoff" | "transition_conversation_handoff";
export interface ConversationPort {
 rpc(name: ConversationRpcName, args: Record<string, string | number>, signal: AbortSignal): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}
/** Service-owned port. Human-facing callers must independently verify the session;
 * the mutation RPC repeats active staff/scope/role checks under a database lock.
 */
export function createConversationRepository(port: ConversationPort) {
 async function call(name: ConversationRpcName, args: Record<string, string | number>, signal: AbortSignal) {
  if (signal.aborted) throw new Error("CONVERSATION_ABORTED");
  let result;
  try { result = await port.rpc(name, args, signal); } catch { throw new Error("CONVERSATION_UNAVAILABLE"); }
  if (result.error) throw new Error(result.error.code === "42501" ? "CONVERSATION_FORBIDDEN" : result.error.code === "40001" || result.error.code === "23505" ? "CONVERSATION_CONFLICT" : result.error.code === "22023" ? "CONVERSATION_INVALID_INPUT" : "CONVERSATION_UNAVAILABLE");
  return result.data;
 }
 return {
  async project(organizationId: string, eventId: string, signal: AbortSignal) {
   return projectionSchema.parse(await call("project_facebook_conversation", { p_organization_id: postgresUuid.parse(organizationId), p_event_id: postgresUuid.parse(eventId) }, signal));
  },
  async requestHandoff(organizationId: string, input: { eventId: string; expectedRevision: number; reason: HandoffReason }, signal: AbortSignal) {
   return conversationSnapshotSchema.parse(await call("request_conversation_handoff", { p_organization_id: postgresUuid.parse(organizationId), p_event_id: postgresUuid.parse(input.eventId), p_expected_revision: z.number().int().nonnegative().parse(input.expectedRevision), p_reason: reasonSchema.parse(input.reason) }, signal));
  },
  async transition(organizationId: string, actorId: string, input: { conversationId: string; expectedRevision: number; operation: "claim" | "complete"; requestId: string }, signal: AbortSignal) {
   return conversationSnapshotSchema.parse(await call("transition_conversation_handoff", { p_organization_id: postgresUuid.parse(organizationId), p_actor_id: postgresUuid.parse(actorId), p_conversation_id: postgresUuid.parse(input.conversationId), p_expected_revision: z.number().int().nonnegative().parse(input.expectedRevision), p_operation: z.enum(["claim", "complete"]).parse(input.operation), p_request_id: postgresUuid.parse(input.requestId) }, signal));
  },
 };
}
/** Opt-in projection only. OV-017 owns classification and durable consultation work.
 * No echo/public-ID merge, send job, AI call, or outbound side effect is performed.
 * OV-017 must honor persisted aiEligible and recheck revision before effects.
 * Replayed projections may still need downstream work: inserted is NOT an AI receipt.
 */
export function createInboundProjectionHandler(repository: ReturnType<typeof createConversationRepository>) {
 return async (job: BusinessJob, signal: AbortSignal): Promise<void> => {
  if (job.kind !== "inbound_event") throw new Error("INVALID_INBOUND_JOB");
  await repository.project(job.organization_id, job.entity_id, signal);
 };
}
