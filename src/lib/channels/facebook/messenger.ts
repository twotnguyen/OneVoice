// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { postgresUuid, type BusinessJob, type BusinessJobQueue, type JobError } from "@/lib/jobs/types";

export const MESSENGER_GRAPH_VERSION = "v25.0";
export const MESSENGER_TEXT_LIMIT = 1800;

export const MESSENGER_ERROR_CODES = ["permission", "invalid_parameter", "token", "unreachable", "rate_limit", "window", "malformed", "timeout", "unknown", "exhausted"] as const;
export type MessengerErrorCode = (typeof MESSENGER_ERROR_CODES)[number];
export type MessengerTransportResult =
  | { outcome: "accepted"; messageId: string }
  | { outcome: "rejected"; errorCode: MessengerErrorCode; retry?: boolean }
  | { outcome: "unknown"; errorCode: "malformed" | "timeout" | "unknown" };
export type MessengerSendRequest = { pageId: string; psid: string; text: string };
export type MessengerTransport = (request: MessengerSendRequest, signal: AbortSignal) => Promise<MessengerTransportResult>;
export type MessengerAuthorizeResult =
  | { action: "send"; pageId: string; psid: string; text: string; kind: "reply" | "handoff_ack"; attempt: number }
  | { action: "done"; status: string; errorCode?: string | null; remoteId?: string | null }
  | { action: "reject" };
export type MessengerRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

function metaError(code: unknown): MessengerTransportResult {
  if (code === 10) return { outcome: "rejected", errorCode: "permission" };
  if (code === 100) return { outcome: "rejected", errorCode: "invalid_parameter" };
  if (code === 190) return { outcome: "rejected", errorCode: "token" };
  if (code === 551) return { outcome: "rejected", errorCode: "unreachable" };
  if (code === 613) return { outcome: "rejected", errorCode: "rate_limit", retry: true };
  if (code === 1545041) return { outcome: "rejected", errorCode: "window" };
  return { outcome: "unknown", errorCode: "unknown" };
}

/** Graph Send API sample 2026-09-12: POST /v25.0/{PAGE_ID}/messages, messaging_type=RESPONSE. No provider idempotency key. */
export function interpretMessengerResponse(httpStatus: number, body: unknown): MessengerTransportResult {
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  const err = record?.error && typeof record.error === "object" && !Array.isArray(record.error) ? record.error as Record<string, unknown> : null;
  if (err && err.code !== undefined) {
    const classified = metaError(err.code);
    if (classified.outcome !== "unknown") return classified;
  }
  if (httpStatus === 200 && typeof record?.message_id === "string" && record.message_id.length > 0 && record.message_id.length <= 256) {
    return { outcome: "accepted", messageId: record.message_id };
  }
  if (httpStatus === 200) return { outcome: "unknown", errorCode: "malformed" };
  if (httpStatus === 429 || httpStatus >= 500) return { outcome: "rejected", errorCode: "rate_limit", retry: true };
  return err ? metaError(err.code) : { outcome: "unknown", errorCode: "unknown" };
}

export function createGraphMessengerTransport(config: { pageAccessToken: string; fetch?: typeof fetch }) {
  const send: MessengerTransport & { url(pageId: string): string } = Object.assign(
    async (request: MessengerSendRequest, signal: AbortSignal): Promise<MessengerTransportResult> => {
      if (request.text.length < 1 || request.text.length > MESSENGER_TEXT_LIMIT) return { outcome: "rejected", errorCode: "invalid_parameter" };
      const bound = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
      try {
        const response = await (config.fetch ?? fetch)(send.url(request.pageId), {
          method: "POST",
          headers: { Authorization: `Bearer ${config.pageAccessToken}`, "Content-Type": "application/json" },
          signal: bound,
          body: JSON.stringify({ recipient: { id: request.psid }, messaging_type: "RESPONSE", message: { text: request.text } }),
        });
        let parsed: unknown = null;
        try { parsed = JSON.parse(await response.text()); } catch { parsed = null; }
        return interpretMessengerResponse(response.status, parsed);
      } catch {
        return { outcome: "unknown", errorCode: bound.aborted && !signal.aborted ? "timeout" : "timeout" };
      }
    },
    { url(pageId: string) { return `https://graph.facebook.com/${MESSENGER_GRAPH_VERSION}/${pageId}/messages`; } },
  );
  return send;
}

const authorizeSchema = z.union([
  z.object({ action: z.literal("send"), pageId: z.string().regex(/^\d{1,32}$/), psid: z.string().min(1).max(256), text: z.string().min(1).max(MESSENGER_TEXT_LIMIT), kind: z.enum(["reply", "handoff_ack"]), attempt: z.number().int().positive() }),
  z.object({ action: z.literal("done"), status: z.string(), errorCode: z.string().nullable().optional(), remoteId: z.string().nullable().optional() }),
  z.object({ action: z.literal("reject") }),
]);
const completeSchema = z.object({ ok: z.boolean(), status: z.string().optional(), retry: z.boolean().optional() });
const claimed = z.object({ id: postgresUuid, organization_id: postgresUuid, entity_id: postgresUuid, kind: z.literal("outbound_message"), lease_owner: postgresUuid, lease_token: postgresUuid });

async function call(rpc: MessengerRpc, name: string, args: Record<string, unknown>) {
  const { data, error } = await Promise.resolve().then(() => rpc(name, args)).catch(() => { throw new Error("messenger_store_failed"); });
  if (error) throw new Error("messenger_store_failed");
  return data;
}

export function createMessengerStore(rpc: MessengerRpc, clock: () => string = () => new Date().toISOString()) {
  return {
    async authorize(job: BusinessJob): Promise<MessengerAuthorizeResult> {
      return authorizeSchema.parse(await call(rpc, "authorize_messenger_send", { p_job_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_now: clock() }));
    },
    async complete(job: BusinessJob, result: MessengerTransportResult) {
      const payload = result.outcome === "accepted"
        ? { outcome: "accepted", messageId: result.messageId }
        : { outcome: result.outcome, errorCode: result.errorCode };
      return completeSchema.parse(await call(rpc, "complete_messenger_send", { p_job_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_result: payload, p_now: clock() }));
    },
  };
}

export function createMessengerJobQueue(rpc: MessengerRpc): BusinessJobQueue {
  return {
    async claim(owner) {
      const rows = z.array(claimed).max(1).parse(await call(rpc, "claim_messenger_job", { p_owner: postgresUuid.parse(owner), p_lease_seconds: 60 }));
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

export function createMessengerHandler(store: { authorize(job: BusinessJob): Promise<MessengerAuthorizeResult>; complete(job: BusinessJob, result: MessengerTransportResult): Promise<{ retry?: boolean }> }, transport: MessengerTransport) {
  return async (job: BusinessJob, signal: AbortSignal) => {
    const decision = await store.authorize(job);
    if (decision.action !== "send") return;
    let result: MessengerTransportResult;
    if (signal.aborted) result = { outcome: "unknown", errorCode: "timeout" };
    else {
      try { result = await transport({ pageId: decision.pageId, psid: decision.psid, text: decision.text }, signal); }
      catch { result = { outcome: "unknown", errorCode: "timeout" }; }
    }
    const completion = await store.complete(job, result);
    if (completion.retry === true) throw new Error("handler_failed");
  };
}
