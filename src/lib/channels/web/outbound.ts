// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { postgresUuid, type BusinessJob, type BusinessJobQueue, type JobError } from "@/lib/jobs/types";

export const WEB_OUTBOUND_TEXT_LIMIT = 1800;
export type WebOutboundAuthorizeResult =
  | { action: "visible"; text: string; kind: "reply" | "handoff_ack" }
  | { action: "done"; status: string }
  | { action: "reject" };
export type WebOutboundRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

const authorizeSchema = z.union([
  z.object({ action: z.literal("visible"), text: z.string().min(1).max(WEB_OUTBOUND_TEXT_LIMIT), kind: z.enum(["reply", "handoff_ack"]) }),
  z.object({ action: z.literal("done"), status: z.string() }),
  z.object({ action: z.literal("reject") }),
]);
const claimed = z.object({
  id: postgresUuid,
  organization_id: postgresUuid,
  entity_id: postgresUuid,
  kind: z.literal("outbound_message"),
  lease_owner: postgresUuid,
  lease_token: postgresUuid,
});

async function call(rpc: WebOutboundRpc, name: string, args: Record<string, unknown>) {
  const { data, error } = await Promise.resolve().then(() => rpc(name, args)).catch(() => { throw new Error("web_outbound_store_failed"); });
  if (error) throw new Error("web_outbound_store_failed");
  return data;
}

export function createWebOutboundStore(rpc: WebOutboundRpc, clock: () => string = () => new Date().toISOString()) {
  return {
    async authorize(job: BusinessJob): Promise<WebOutboundAuthorizeResult> {
      return authorizeSchema.parse(await call(rpc, "authorize_web_outbound", { p_job_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_now: clock() }));
    },
  };
}

export function createWebOutboundJobQueue(rpc: WebOutboundRpc): BusinessJobQueue {
  return {
    async claim(owner) {
      const rows = z.array(claimed).max(1).parse(await call(rpc, "claim_web_outbound_job", { p_owner: postgresUuid.parse(owner), p_lease_seconds: 60 }));
      return rows[0] ?? null;
    },
    async heartbeat(job) {
      return z.boolean().parse(await call(rpc, "heartbeat_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_lease_seconds: 60 }));
    },
    async finish(job, error?: JobError) {
      return z.boolean().parse(await call(rpc, "finish_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_error: error ?? null }));
    },
  };
}

export function createWebOutboundHandler(store: { authorize(job: BusinessJob): Promise<WebOutboundAuthorizeResult> }) {
  return async (job: BusinessJob, signal: AbortSignal) => {
    if (signal.aborted) return;
    await store.authorize(job);
  };
}
