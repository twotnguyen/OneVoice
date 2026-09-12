// SPDX-License-Identifier: Apache-2.0
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type FacebookInboundEvent = {
 pageId: string; providerKey: string; kind: "message" | "echo" | "postback" | "referral" | "comment" | "feed";
 senderId: string | null; recipientId: string | null; eventTimeMs: number | null; deliveryTimeMs: number | null;
 data: Record<string, unknown>;
};
export type PersistFacebookEvents = (events: FacebookInboundEvent[], signal: AbortSignal) => Promise<void>;
class WebhookFailure extends Error { constructor(readonly status: number) { super("facebook_webhook_failed"); } }
function record(value: unknown): Record<string, unknown> {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new WebhookFailure(400);
 return value as Record<string, unknown>;
}
function string(value: unknown, max = 256): string {
 if (typeof value !== "string" || value.length > max || value.length === 0) throw new WebhookFailure(400);
 return value;
}
// Current Meta payloads use milliseconds for messaging.timestamp and seconds for
// feed created_time; entry.time is delivery metadata. Normalize contemporary epoch
// values by magnitude while keeping absent source action time null.
function timestamp(value: unknown): number | null {
 if (value === undefined || value === null) return null;
 if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) throw new WebhookFailure(400);
 return value < 100000000000 ? value * 1000 : value;
}
function list(value: unknown): unknown[] { if (!Array.isArray(value) || value.length > 1000) throw new WebhookFailure(400); return value; }
function optionalId(value: unknown): string | null { return value == null ? null : string(record(value).id); }
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function referral(value: unknown) {
 const source = record(value); const output: Record<string, unknown> = {};
 for (const key of ["ref", "source", "type", "ad_id"]) if (source[key] !== undefined) output[key] = string(source[key], 2048);
 return output;
}
/** jsonb::text adds a space after structural commas and colons. Account for
 * those bytes too, so the HTTP and database limits agree for nested data.
 */
function jsonbBytes(value: unknown): number {
 const json = JSON.stringify(value);
 let bytes = Buffer.byteLength(json); let quoted = false; let escaped = false;
 for (const char of json) {
  if (quoted) {
   if (escaped) escaped = false;
   else if (char === "\\") escaped = true;
   else if (char === '"') quoted = false;
  } else if (char === '"') quoted = true;
  else if (char === "," || char === ":") bytes++;
 }
 return bytes;
}
/** Allowlisted fields only. URLs are metadata and never fetched by this adapter. */
export function normalizeFacebookEvents(input: unknown, pageId: string): FacebookInboundEvent[] {
 const envelope = record(input);
 if (envelope.object !== "page") throw new WebhookFailure(400);
 const events: FacebookInboundEvent[] = [];
 for (const item of list(envelope.entry)) {
  const entry = record(item);
  if (entry.id !== pageId) throw new WebhookFailure(403);
  const deliveredAt = timestamp(entry.time);
  for (const raw of list(entry.messaging ?? [])) {
   const event = record(raw);
   const senderId = optionalId(event.sender); const recipientId = optionalId(event.recipient);
   const eventTimeMs = timestamp(event.timestamp);
   if (event.message !== undefined) {
    if (!senderId || !recipientId) throw new WebhookFailure(400);
    const message = record(event.message); const echo = message.is_echo === true;
    if ((echo ? senderId : recipientId) !== pageId) throw new WebhookFailure(403);
    const mid = string(message.mid); const data: Record<string, unknown> = {};
    if (message.text !== undefined) data.text = string(message.text, 16000);
    if (message.attachments !== undefined) {
     const attachments = list(message.attachments); if (attachments.length > 20) throw new WebhookFailure(400);
     data.attachments = attachments.map(rawAttachment => {
      const attachment = record(rawAttachment); const payload = record(attachment.payload ?? {});
      return { type: string(attachment.type, 64), ...(payload.url === undefined ? {} : { url: string(payload.url, 2048) }) };
     });
    }
    if (message.reply_to !== undefined) { const reply = record(message.reply_to); if (reply.mid !== undefined) data.replyToMid = string(reply.mid); }
    if (event.referral !== undefined) data.referral = referral(event.referral);
    events.push({ pageId, providerKey: `${echo ? "echo" : "message"}:${mid}`, kind: echo ? "echo" : "message", senderId, recipientId, eventTimeMs, deliveryTimeMs: deliveredAt, data });
   } else if (event.postback !== undefined || event.referral !== undefined) {
    if (!senderId || !recipientId) throw new WebhookFailure(400);
    if (recipientId !== pageId) throw new WebhookFailure(403);
    const kind = event.postback !== undefined ? "postback" : "referral";
    const data: Record<string, unknown> = {};
    if (event.postback !== undefined) {
     const postback = record(event.postback);
     for (const key of ["title", "payload"]) if (postback[key] !== undefined) data[key] = string(postback[key], 2048);
     if (postback.referral !== undefined) data.referral = referral(postback.referral);
    }
    if (event.referral !== undefined) data.referral = referral(event.referral);
    events.push({ pageId, providerKey: `${kind}:${hash([senderId, recipientId, eventTimeMs, data])}`, kind, senderId, recipientId, eventTimeMs, deliveryTimeMs: deliveredAt, data });
   }
   // Delivery/read/unknown subscriptions do not become conversational input.
  }
  for (const raw of list(entry.changes ?? [])) {
   const change = record(raw); if (change.field !== "feed") continue;
   const value = record(change.value); const data: Record<string, unknown> = {};
   for (const key of ["item", "verb", "comment_id", "post_id", "parent_id"]) if (value[key] !== undefined) data[key] = string(value[key]);
   if (value.message !== undefined) data.text = string(value.message, 16000);
   if (value.photo !== undefined && typeof value.photo === "string") data.photoUrl = string(value.photo, 2048);
   const senderId = value.from === undefined ? null : optionalId(value.from);
   const eventTimeMs = timestamp(value.created_time ?? value.timestamp);
   const kind = value.item === "comment" ? "comment" : "feed";
   // The verb + action timestamp + normalized fields preserve edits/removals.
   events.push({ pageId, providerKey: `${kind}:${hash([senderId, eventTimeMs, data])}`, kind, senderId, recipientId: pageId, eventTimeMs, deliveryTimeMs: deliveredAt, data });
  }
  if (events.length > 1000) throw new WebhookFailure(400);
 }
 for (const event of events) if (jsonbBytes(event.data) > 65536) throw new WebhookFailure(413);
 if (jsonbBytes(events) > 1048576) throw new WebhookFailure(413);
 return events;
}
function response(status: number, text = status === 200 ? "EVENT_RECEIVED" : "Request rejected") { return new Response(text, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" } }); }
function equalToken(left: string, right: string) { return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest()); }
export function createFacebookWebhook(config: { appSecret: string; verifyToken: string; pageId: string; persist: PersistFacebookEvents }) {
 if (!config.appSecret || !config.verifyToken || !/^\d{1,32}$/.test(config.pageId)) throw new Error("facebook_configuration_invalid");
 return {
  async GET(request: Request): Promise<Response> {
   const params = new URL(request.url).searchParams;
   const token = params.get("hub.verify_token") ?? ""; const challenge = params.get("hub.challenge");
   if (params.get("hub.mode") !== "subscribe" || !equalToken(token, config.verifyToken) || !challenge || challenge.length > 2048) return response(403);
   return response(200, challenge);
  },
  async POST(request: Request): Promise<Response> {
   const abort = new AbortController();
   let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
   let timeout: ReturnType<typeof setTimeout> | undefined;
   const operation = async () => {
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) throw new WebhookFailure(401);
    const size = request.headers.get("content-length");
    if (size && (!/^\d+$/.test(size) || Number(size) > 1048576)) throw new WebhookFailure(413);
    reader = request.body?.getReader();
    if (!reader) throw new WebhookFailure(400);
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) {
     const chunk = await reader.read(); if (abort.signal.aborted) throw new WebhookFailure(503);
     if (chunk.done) break;
     total += chunk.value.byteLength; if (total > 1048576) throw new WebhookFailure(413);
     chunks.push(chunk.value);
    }
    const bytes = Buffer.concat(chunks, total);
    const actual = createHmac("sha256", config.appSecret).update(bytes).digest();
    if (!timingSafeEqual(actual, Buffer.from(signature.slice(7), "hex"))) throw new WebhookFailure(401);
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new WebhookFailure(400); }
    const events = normalizeFacebookEvents(parsed, config.pageId);
    if (events.length) await config.persist(events, abort.signal);
    return response(200);
   };
   try {
    return await Promise.race([operation(), new Promise<Response>((_, reject) => {
     timeout = setTimeout(() => { abort.abort(); reject(new WebhookFailure(503)); }, 4000);
    })]);
   } catch (error) { return response(error instanceof WebhookFailure ? error.status : 503); }
   finally { if (timeout) clearTimeout(timeout); abort.abort(); void reader?.cancel().catch(() => {}); }
  },
 };
}
