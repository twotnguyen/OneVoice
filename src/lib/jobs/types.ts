import { z } from "zod";
export const postgresUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const referencePayload = z.object({ entityId: postgresUuid }).strict();
export const jobKinds = ["inbound_event", "outbound_message", "automation_tick", "knowledge_ingest"] as const;
export type JobKind = (typeof jobKinds)[number];
export type JobError = "handler_failed" | "shutdown" | "unsupported_kind";
// Deliberately ignores exception messages, provider responses and customer content.
export function normalizeJobError(_error: unknown): JobError { void _error; return "handler_failed"; }
export type BusinessJob = { id: string; organization_id: string; kind: JobKind; entity_id: string; lease_owner: string; lease_token: string };
export interface BusinessJobQueue {
 claim(owner: string): Promise<BusinessJob | null>;
 heartbeat(job: BusinessJob): Promise<boolean>;
 finish(job: BusinessJob, error?: JobError): Promise<boolean>;
}
export type BusinessJobHandlers = Partial<Record<JobKind, (job: BusinessJob, signal: AbortSignal) => Promise<void>>>;
