import { z } from "zod";
import { postgresUuid, jobKinds, type BusinessJobQueue, type JobError } from "./types";

/** Structural RPC port: supply a trusted service-role Supabase client's rpc wrapper.
 * No browser client and no service credentials are created by this module.
 */
export type JobRpc = (name: "enqueue_business_job" | "claim_business_job" | "heartbeat_business_job" | "finish_business_job", args: Record<string, string | number | null>) => PromiseLike<{ data: unknown; error: unknown }>;
const claimed = z.object({ id: postgresUuid, organization_id: postgresUuid, entity_id: postgresUuid, kind: z.enum(jobKinds), lease_owner: postgresUuid, lease_token: postgresUuid });
export function createBusinessJobQueue(rpc: JobRpc): BusinessJobQueue & {
 enqueue(input: { organizationId: string; kind: typeof jobKinds[number]; entityId: string; dedupKey: string; availableAt: string; maxAttempts?: number }): Promise<string>;
} {
 async function call(name: Parameters<JobRpc>[0], args: Parameters<JobRpc>[1]) {
  const { data, error } = await Promise.resolve().then(() => rpc(name, args)).catch(() => { throw new Error("job_store_failed"); });
  if (error) throw new Error("job_store_failed");
  return data;
 }
 return {
  async enqueue(input) {
   return postgresUuid.parse(await call("enqueue_business_job", { p_organization_id: postgresUuid.parse(input.organizationId), p_kind: z.enum(jobKinds).parse(input.kind), p_entity_id: postgresUuid.parse(input.entityId), p_dedup_key: postgresUuid.parse(input.dedupKey), p_available_at: z.iso.datetime({ offset: true }).parse(input.availableAt), p_max_attempts: z.number().int().min(1).max(20).parse(input.maxAttempts ?? 5) }));
  },
  async claim(owner) {
   const rows = z.array(claimed).max(1).parse(await call("claim_business_job", { p_owner: postgresUuid.parse(owner), p_lease_seconds: 60 }));
   return rows[0] ?? null;
  },
  async heartbeat(job) { return z.boolean().parse(await call("heartbeat_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_lease_seconds: 60 })); },
  async finish(job, error?: JobError) { return z.boolean().parse(await call("finish_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_error: error ?? null })); },
 };
}
