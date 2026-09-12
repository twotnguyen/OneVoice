// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { StaffSession } from "@/lib/auth/session";
import { sourceDocumentSchema } from "./sources";
import type { IngestionWorkerPort } from "./ingestion-worker";
import type { BusinessJob, BusinessJobQueue } from "@/lib/jobs/types";
import { postgresUuid } from "@/lib/jobs/types";
const timeout = (signal?: AbortSignal) => signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
function checked<T>(result: { data: T; error: { code?: string } | null }): T { if (result.error) throw Error(result.error.code === "42501" ? "FORBIDDEN" : result.error.code === "40001" ? "CONFLICT" : "UNAVAILABLE"); return result.data; }
export const ingestionRequestSchema = z.strictObject({ sourceId: z.string().uuid(), version: z.number().int().positive() });
export const ingestionStatusSchema = z.object({ sourceVersion: z.number(), status: z.string(), error: z.string().nullable(), attempts: z.number(), fetchedAt: z.string().nullable(), expiresAt: z.string().nullable() });
export type IngestionStatus = z.infer<typeof ingestionStatusSchema>;
export function createIngestionManager(client: SupabaseClient<Database>, actor: StaffSession) {
 return {
  async status(sourceId: string) { const data = checked(await client.rpc("knowledge_ingestion_status", { p_organization_id: actor.organizationId, p_actor_id: actor.userId, p_source_id: z.string().uuid().parse(sourceId) }).abortSignal(timeout())); return data === null ? null : ingestionStatusSchema.parse(data); },
  async refresh(sourceId: string, version: number) { const value = ingestionRequestSchema.parse({ sourceId, version }); return checked(await client.rpc("request_knowledge_ingestion", { p_organization_id: actor.organizationId, p_actor_id: actor.userId, p_source_id: value.sourceId, p_version: value.version }).abortSignal(timeout())); },
 };
}
export function createIngestionWorkerStore(client: SupabaseClient<Database>): IngestionWorkerPort & { queue: BusinessJobQueue; enqueueDue(): Promise<number> } {
 const fence = (job: BusinessJob) => ({ p_job_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token });
 return {
  async enqueueDue() { return z.number().parse(checked(await client.rpc("enqueue_due_knowledge", {}).abortSignal(timeout()))); },
  queue: {
   async claim(owner) { const rows = checked(await client.rpc("claim_knowledge_ingestion", { p_owner: owner }).abortSignal(timeout())); const row = rows?.[0]; return row ? { id: row.id, organization_id: row.organization_id, entity_id: row.entity_id, kind: "knowledge_ingest", lease_owner: row.lease_owner!, lease_token: row.lease_token! } : null; },
   async heartbeat(job) { return z.boolean().parse(checked(await client.rpc("heartbeat_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token }).abortSignal(timeout()))); },
   async finish(job, error) { return z.boolean().parse(checked(await client.rpc("finish_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_error: error }).abortSignal(timeout()))); },
  },
  async load(job, signal) {
   const run = checked(await client.from("knowledge_ingestion_runs").select("source_id,source_version").eq("id", job.entity_id).eq("job_id", job.id).eq("organization_id", job.organization_id).abortSignal(timeout(signal)).maybeSingle()); if (!run) return null;
   const source = checked(await client.from("knowledge_sources").select("*").eq("id", run.source_id).eq("organization_id", job.organization_id).eq("version", run.source_version).abortSignal(timeout(signal)).maybeSingle()); if (!source) return null;
   const document = sourceDocumentSchema.parse(source.document); return document.active ? { id: source.id, version: source.version, document, updatedAt: source.updated_at } : null;
  },
  async publish(job, content, signal) { return z.boolean().parse(checked(await client.rpc("publish_knowledge_ingestion", { ...fence(job), p_hash: content.hash, p_chunks: content.chunks, p_final_url: content.finalUrl, p_content_type: content.contentType }).abortSignal(timeout(signal)))); },
  async fail(job, code) { return checked(await client.rpc("fail_knowledge_ingestion", { ...fence(job), p_error: code }).abortSignal(timeout())); },
 };
}
/** Trusted conversation-scoped adapter only. Returns untrusted source text with provenance;
 * OV016 owns ranking and instruction separation. No stale/disabled fallback. */
export async function readCurrentKnowledge(client: SupabaseClient<Database>, organizationId: string, sourceId: string) {
 return checked(await client.rpc("read_current_knowledge", { p_organization_id: postgresUuid.parse(organizationId), p_source_id: postgresUuid.parse(sourceId) }).abortSignal(timeout()));
}
