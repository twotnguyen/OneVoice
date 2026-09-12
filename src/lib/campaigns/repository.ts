// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types";
import type { StaffSession } from "../auth/session";
import { postgresUuid } from "../jobs/types";
import type { OpportunityDecision } from "../opportunities/engine";
import { validateCampaignDecision } from "./decision";
import { campaignPageSchema, campaignSchema, manualCampaignSchema, type ManualCampaign } from "./management";
function checked<T>(result: { data: T; error: { code?: string; message?: string } | null }): T { if (result.error) throw Error(result.error.message === "SETTINGS_REQUIRED" ? "SETTINGS_REQUIRED" : result.error.code === "42501" ? "FORBIDDEN" : ["40001", "23505"].includes(result.error.code ?? "") ? "CONFLICT" : ["22023", "22P02", "23514"].includes(result.error.code ?? "") ? "INVALID" : "UNAVAILABLE"); return result.data; }
const resultSchema = z.object({ id: postgresUuid, version: z.number().int().positive(), controlRevision: z.number().optional() });
/** All staff reads and manager writes receive a verified session; SQL rechecks it. */
export function createCampaignRepository(client: SupabaseClient<Database>, actor: StaffSession) {
 const scope = { p_org: actor.organizationId, p_actor: actor.userId };
 return {
  async list(page = 1) { return campaignPageSchema.parse(checked(await client.rpc("read_campaigns", { ...scope, p_page: z.number().int().min(1).max(10000).parse(page) }).abortSignal(AbortSignal.timeout(10000)))); },
  async get(id: string) { const data = checked(await client.rpc("read_campaigns", { ...scope, p_id: postgresUuid.parse(id) }).abortSignal(AbortSignal.timeout(10000))); return data === null ? null : campaignSchema.parse(data); },
  async priority(input: ManualCampaign) { const value = manualCampaignSchema.parse(input); return resultSchema.parse(checked(await client.rpc("create_priority_campaign", { ...scope, p_id: value.id, p_request: value.requestId, p_revision: value.expectedControlRevision, p_document: { sourceKind: value.sourceKind, sourceId: value.sourceId, objective: value.objective } }).abortSignal(AbortSignal.timeout(10000)))); },
 };
}
/** Trusted worker/scheduler scope. No browser route exposes opportunity or terminal writes.
 * No job generation, publish side effects, auto-enable or content references here. */
export function createCampaignService(client: SupabaseClient<Database>, organizationId: string) {
 const org = postgresUuid.parse(organizationId);
 return {
  async fromOpportunity(input: { id: string; requestId: string; expectedControlRevision: number; decision: OpportunityDecision }) {
   const decision = validateCampaignDecision(input.decision); if (decision.snapshot.organizationId.toLowerCase() !== org.toLowerCase()) throw Error("FORBIDDEN");
   return resultSchema.parse(checked(await client.rpc("create_opportunity_campaign", { p_org: org, p_id: postgresUuid.parse(input.id), p_request: postgresUuid.parse(input.requestId), p_revision: z.number().int().min(0).parse(input.expectedControlRevision), p_decision: decision as unknown as Json }).abortSignal(AbortSignal.timeout(10000))));
  },
  async finish(input: { id: string; requestId: string; expectedVersion: number; status: "COMPLETED" | "FAILED" }) { return resultSchema.parse(checked(await client.rpc("finish_campaign", { p_org: org, p_id: postgresUuid.parse(input.id), p_request: postgresUuid.parse(input.requestId), p_version: z.number().int().positive().parse(input.expectedVersion), p_status: z.enum(["COMPLETED", "FAILED"]).parse(input.status) }).abortSignal(AbortSignal.timeout(10000)))); },
 };
}
