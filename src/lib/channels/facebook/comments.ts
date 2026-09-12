// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { postgresUuid, type BusinessJob, type BusinessJobQueue, type JobError } from "@/lib/jobs/types";
import type { FacebookInboundEvent } from "./webhook";

export const PUBLIC_COMMENT_GRAPH_VERSION = "v25.0";
export const PUBLIC_COMMENT_INVITE_TEXT = "Cảm ơn bạn đã quan tâm. Vui lòng nhắn tin riêng cho Page để được hỗ trợ.";

export const PUBLIC_COMMENT_ERROR_CODES = ["permission", "invalid_parameter", "token", "unreachable", "rate_limit", "window", "malformed", "timeout", "unknown", "exhausted"] as const;
export type PublicCommentErrorCode = (typeof PUBLIC_COMMENT_ERROR_CODES)[number];
export type PublicCommentDisposition = "INVITE" | "IGNORE";
export type PublicCommentTransportResult =
  | { outcome: "accepted"; remoteId: string }
  | { outcome: "rejected"; errorCode: PublicCommentErrorCode; retry?: boolean }
  | { outcome: "unknown"; errorCode: "malformed" | "timeout" | "unknown" };
export type PublicCommentSendRequest = { pageId: string; commentId: string; text: string };
export type PublicCommentTransport = (request: PublicCommentSendRequest, signal: AbortSignal) => Promise<PublicCommentTransportResult>;
export type PublicCommentAuthorizeResult =
  | { action: "send"; pageId: string; commentId: string; text: string; attempt: number }
  | { action: "done"; status: string; errorCode?: string | null; remoteId?: string | null }
  | { action: "reject" };
export type PublicCommentRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
export type PublicCommentClaim = FacebookInboundEvent;

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();
}

const INVITE = /(?:^|[^a-z0-9])(gia|bao[\s-]*nhieu|con[\s-]*hang|con[\s-]*khong|dat[\s-]*hang|bao[\s-]*hanh|doi[\s-]*tra|doi[\s-]*lai|khieu[\s-]*nai|hoan[\s-]*tien|thanh[\s-]*toan|muon[\s-]*mua|dat[\s-]*mua|can[\s-]*tu[\s-]*van|giao[\s-]*hang)(?:[^a-z0-9]|$)/;

export function classifyPublicComment(text: string): PublicCommentDisposition {
  return INVITE.test(fold(text)) ? "INVITE" : "IGNORE";
}

export function parsePublicComment(event: FacebookInboundEvent): { skip: true; reason: "self_echo" | "deleted" | "unsupported" } | { skip: false; commentId: string; text: string } {
  if (event.kind !== "comment") return { skip: true, reason: "unsupported" };
  const data = event.data;
  const verb = typeof data.verb === "string" ? data.verb : "";
  const commentId = typeof data.comment_id === "string" ? data.comment_id : "";
  if (verb === "remove" || verb === "hide") return { skip: true, reason: "deleted" };
  if (!commentId) return { skip: true, reason: "unsupported" };
  if (event.senderId && event.senderId === event.pageId) return { skip: true, reason: "self_echo" };
  const text = typeof data.text === "string" ? data.text : "";
  return { skip: false, commentId, text };
}

function metaError(code: unknown): PublicCommentTransportResult {
  if (code === 10) return { outcome: "rejected", errorCode: "permission" };
  if (code === 100) return { outcome: "rejected", errorCode: "invalid_parameter" };
  if (code === 190) return { outcome: "rejected", errorCode: "token" };
  if (code === 551) return { outcome: "rejected", errorCode: "unreachable" };
  if (code === 613) return { outcome: "rejected", errorCode: "rate_limit", retry: true };
  return { outcome: "unknown", errorCode: "unknown" };
}

/** Graph public reply sample 2026-09-12: POST /v25.0/{comment-id}/comments with message. Not the PSID Send API; does not open a private window. */
export function interpretPublicCommentResponse(httpStatus: number, body: unknown): PublicCommentTransportResult {
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  const err = record?.error && typeof record.error === "object" && !Array.isArray(record.error) ? record.error as Record<string, unknown> : null;
  if (err && err.code !== undefined) {
    const classified = metaError(err.code);
    if (classified.outcome !== "unknown") return classified;
  }
  if (httpStatus === 200 && typeof record?.id === "string" && record.id.length > 0 && record.id.length <= 256) {
    return { outcome: "accepted", remoteId: record.id };
  }
  if (httpStatus === 200) return { outcome: "unknown", errorCode: "malformed" };
  if (httpStatus === 429 || httpStatus >= 500) return { outcome: "rejected", errorCode: "rate_limit", retry: true };
  return err ? metaError(err.code) : { outcome: "unknown", errorCode: "unknown" };
}

export function createGraphPublicCommentTransport(config: { pageAccessToken: string; fetch?: typeof fetch }) {
  const send: PublicCommentTransport & { url(commentId: string): string } = Object.assign(
    async (request: PublicCommentSendRequest, signal: AbortSignal): Promise<PublicCommentTransportResult> => {
      if (request.text !== PUBLIC_COMMENT_INVITE_TEXT) return { outcome: "rejected", errorCode: "invalid_parameter" };
      const bound = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
      try {
        const response = await (config.fetch ?? fetch)(send.url(request.commentId), {
          method: "POST",
          headers: { Authorization: `Bearer ${config.pageAccessToken}`, "Content-Type": "application/json" },
          signal: bound,
          body: JSON.stringify({ message: request.text }),
        });
        let parsed: unknown = null;
        try { parsed = JSON.parse(await response.text()); } catch { parsed = null; }
        return interpretPublicCommentResponse(response.status, parsed);
      } catch {
        return { outcome: "unknown", errorCode: "timeout" };
      }
    },
    { url(commentId: string) { return `https://graph.facebook.com/${PUBLIC_COMMENT_GRAPH_VERSION}/${encodeURIComponent(commentId)}/comments`; } },
  );
  return send;
}

const eventSchema = z.object({
  pageId: z.string().regex(/^\d{1,32}$/),
  providerKey: z.string().min(1).max(320),
  kind: z.literal("comment"),
  senderId: z.string().min(1).max(256).nullable(),
  recipientId: z.string().min(1).max(256).nullable(),
  eventTimeMs: z.number().int().nonnegative().nullable().optional(),
  deliveryTimeMs: z.number().int().nonnegative().nullable().optional(),
  data: z.record(z.string(), z.unknown()),
});
const inboundClaim = z.object({
  job: z.object({ id: postgresUuid, organization_id: postgresUuid, entity_id: postgresUuid, kind: z.literal("inbound_event"), lease_owner: postgresUuid, lease_token: postgresUuid }),
  event: eventSchema,
});
const authorizeSchema = z.union([
  z.object({ action: z.literal("send"), pageId: z.string().regex(/^\d{1,32}$/), commentId: z.string().min(1).max(256), text: z.literal(PUBLIC_COMMENT_INVITE_TEXT), attempt: z.number().int().positive() }),
  z.object({ action: z.literal("done"), status: z.string(), errorCode: z.string().nullable().optional(), remoteId: z.string().nullable().optional() }),
  z.object({ action: z.literal("reject") }),
]);
const completeSchema = z.object({ ok: z.boolean(), status: z.string().optional(), retry: z.boolean().optional() });
const claimed = z.object({ id: postgresUuid, organization_id: postgresUuid, entity_id: postgresUuid, kind: z.literal("outbound_comment"), lease_owner: postgresUuid, lease_token: postgresUuid });

async function call(rpc: PublicCommentRpc, name: string, args: Record<string, unknown>) {
  const { data, error } = await Promise.resolve().then(() => rpc(name, args)).catch(() => { throw new Error("comment_store_failed"); });
  if (error) throw new Error("comment_store_failed");
  return data;
}

export function createPublicCommentInboundStore(rpc: PublicCommentRpc) {
  const contexts = new Map<string, PublicCommentClaim>();
  return {
    queue: {
      async claim(owner: string) {
        const row = await call(rpc, "claim_public_comment_job", { p_owner: postgresUuid.parse(owner), p_lease_seconds: 60 });
        if (row == null) return null;
        const claim = inboundClaim.parse(row);
        contexts.set(claim.job.id, { ...claim.event, eventTimeMs: claim.event.eventTimeMs ?? null, deliveryTimeMs: claim.event.deliveryTimeMs ?? null });
        return claim.job;
      },
      async heartbeat(job: BusinessJob) {
        return z.boolean().parse(await call(rpc, "heartbeat_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_lease_seconds: 60 }));
      },
      async finish(job: BusinessJob, error?: JobError) {
        contexts.delete(job.id);
        return z.boolean().parse(await call(rpc, "finish_business_job", { p_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_error: error ?? null }));
      },
    } satisfies BusinessJobQueue,
    context(job: BusinessJob): PublicCommentClaim {
      const event = contexts.get(job.id);
      if (!event) throw new Error("comment_context_missing");
      return event;
    },
    async record(job: BusinessJob, disposition: PublicCommentDisposition) {
      completeSchema.parse(await call(rpc, "record_public_comment_disposition", {
        p_job_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_disposition: disposition,
      }));
    },
  };
}

export function createPublicCommentDispositionHandler(store: { context(job: BusinessJob): PublicCommentClaim; record(job: BusinessJob, disposition: PublicCommentDisposition): Promise<unknown> }) {
  return async (job: BusinessJob, signal: AbortSignal) => {
    signal.throwIfAborted();
    const parsed = parsePublicComment(store.context(job));
    if (parsed.skip) return;
    await store.record(job, classifyPublicComment(parsed.text));
  };
}

export function createPublicCommentSendStore(rpc: PublicCommentRpc, clock: () => string = () => new Date().toISOString()) {
  return {
    async authorize(job: BusinessJob): Promise<PublicCommentAuthorizeResult> {
      return authorizeSchema.parse(await call(rpc, "authorize_public_comment_send", { p_job_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_now: clock() }));
    },
    async complete(job: BusinessJob, result: PublicCommentTransportResult) {
      const payload = result.outcome === "accepted"
        ? { outcome: "accepted", remoteId: result.remoteId }
        : { outcome: result.outcome, errorCode: result.errorCode };
      return completeSchema.parse(await call(rpc, "complete_public_comment_send", { p_job_id: job.id, p_owner: job.lease_owner, p_token: job.lease_token, p_result: payload, p_now: clock() }));
    },
  };
}

export function createPublicCommentSendQueue(rpc: PublicCommentRpc): BusinessJobQueue {
  return {
    async claim(owner) {
      const rows = z.array(claimed).max(1).parse(await call(rpc, "claim_public_comment_send_job", { p_owner: postgresUuid.parse(owner), p_lease_seconds: 60 }));
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

export function createPublicCommentSendHandler(store: { authorize(job: BusinessJob): Promise<PublicCommentAuthorizeResult>; complete(job: BusinessJob, result: PublicCommentTransportResult): Promise<{ retry?: boolean }> }, transport: PublicCommentTransport) {
  return async (job: BusinessJob, signal: AbortSignal) => {
    const decision = await store.authorize(job);
    if (decision.action !== "send") return;
    let result: PublicCommentTransportResult;
    if (signal.aborted) result = { outcome: "unknown", errorCode: "timeout" };
    else {
      try { result = await transport({ pageId: decision.pageId, commentId: decision.commentId, text: decision.text }, signal); }
      catch { result = { outcome: "unknown", errorCode: "timeout" }; }
    }
    const completion = await store.complete(job, result);
    if (completion.retry === true) throw new Error("handler_failed");
  };
}
