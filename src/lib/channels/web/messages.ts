// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { postgresUuid } from "@/lib/jobs/types";
import { sameOriginMutation } from "@/lib/auth/security";
import { readWebsiteSession } from "./session";

export const WEBSITE_MESSAGE_TEXT_MAX = 1800;
export const WEBSITE_MESSAGE_SEND_LIMIT = 20;
export const WEBSITE_MESSAGE_SEND_WINDOW_MS = 60_000;
export const WEBSITE_MESSAGE_PAGE = 50;
const noStore = { "Cache-Control": "private, no-store", "Content-Type": "application/json", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);
const textSchema = z.string().min(1).max(WEBSITE_MESSAGE_TEXT_MAX);
const time = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/);
const cursorSchema = z.object({ at: time, id: z.string().min(1).max(64) }).strict();
const statusSchema = z.enum(["AI_ACTIVE", "WAITING_STAFF", "STAFF_ACTIVE"]);
const publicKind = z.enum(["message", "reply", "handoff_ack"]);

export type WebsiteMessagesRpcName = "read_website_session" | "take_website_rate_limit" | "ingest_web_event";
export interface WebsiteMessagesPort {
  rpc(name: WebsiteMessagesRpcName, args: Record<string, Json>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  listPublicMessages(input: {
    organizationId: string;
    channelUserKey: string;
    cursor?: { at: string; id: string };
    limit: number;
  }): PromiseLike<{
    messages: Array<Record<string, unknown>>;
    status: string;
    hasMore: boolean;
  }>;
}

export function websiteMessageProviderKey(requestId: string) {
  return `message:${requestIdSchema.parse(requestId)}`;
}

export function websiteMessageSendKey(channelUserKey: string, origin: string) {
  return createHash("sha256").update(`${channelUserKey}\0${origin}`).digest("hex");
}

function json(status: number, body: unknown = { ok: status === 200 }) {
  return new Response(JSON.stringify(body), { status, headers: noStore });
}

function publicMessage(row: Record<string, unknown>) {
  const kind = publicKind.safeParse(row.kind);
  if (!kind.success) return null;
  const id = typeof row.id === "string" ? row.id : null;
  const receivedAt = typeof row.receivedAt === "string" ? row.receivedAt : null;
  const text = typeof row.text === "string" ? row.text.slice(0, WEBSITE_MESSAGE_TEXT_MAX) : "";
  if (!id || !receivedAt) return null;
  return { id, text, direction: kind.data === "message" ? "inbound" : "outbound", kind: kind.data, receivedAt };
}

export function createWebsiteMessagesRoute(port: WebsiteMessagesPort, context: { origin: string; now?: () => number; pageSize?: number }) {
  const read = readWebsiteSession({ rpc: (name, args) => port.rpc(name as WebsiteMessagesRpcName, args) });
  const pageSize = context.pageSize ?? WEBSITE_MESSAGE_PAGE;
  return {
    async GET(request: Request) {
      const identity = await read(request);
      if (!identity) return json(401);
      const raw = new URL(request.url).searchParams.get("cursor");
      let cursor: z.infer<typeof cursorSchema> | undefined;
      if (raw) {
        try { cursor = cursorSchema.parse(JSON.parse(raw)); }
        catch { return json(400); }
      }
      let listed;
      try { listed = await port.listPublicMessages({ organizationId: identity.organizationId, channelUserKey: identity.channelUserKey, cursor, limit: pageSize }); }
      catch { return json(503); }
      const messages = listed.messages.map(publicMessage).filter((row): row is NonNullable<typeof row> => row !== null);
      const last = messages.at(-1);
      return json(200, {
        messages,
        cursor: listed.hasMore && last ? JSON.stringify({ at: last.receivedAt, id: last.id }) : null,
        status: statusSchema.safeParse(listed.status).success ? listed.status : "AI_ACTIVE",
      });
    },
    async POST(request: Request) {
      if (!sameOriginMutation(request, context.origin)) return json(403);
      const identity = await read(request);
      if (!identity) return json(401);
      if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json(400);
      let body: unknown;
      try { body = JSON.parse(await request.text()); } catch { return json(400); }
      const parsed = z.object({ text: textSchema, requestId: requestIdSchema }).strict().safeParse(body);
      if (!parsed.success) return json(400);
      let limited;
      try {
        limited = await port.rpc("take_website_rate_limit", {
          p_scope: "message_send",
          p_client_key: websiteMessageSendKey(identity.channelUserKey, context.origin),
          p_limit: WEBSITE_MESSAGE_SEND_LIMIT,
          p_window_ms: WEBSITE_MESSAGE_SEND_WINDOW_MS,
        });
      } catch { return json(503); }
      if (limited.error) return json(503);
      if (limited.data !== true) return new Response(JSON.stringify({ ok: false }), { status: 429, headers: { ...noStore, "Retry-After": "60" } });
      let ingested;
      try {
        ingested = await port.rpc("ingest_web_event", {
          p_organization_id: postgresUuid.parse(identity.organizationId),
          p_event: {
            providerKey: websiteMessageProviderKey(parsed.data.requestId),
            senderKey: identity.channelUserKey,
            kind: "message",
            eventTimeMs: (context.now ?? Date.now)(),
            data: { text: parsed.data.text },
          },
        });
      } catch { return json(503); }
      if (ingested.error || ingested.data == null) return json(503);
      return json(200);
    },
  };
}

type Query = {
  select(columns: string): Query;
  eq(column: string, value: string): Query;
  or(filter: string): Query;
  order(column: string, options: { ascending: boolean }): Query;
  limit(count: number): Query & PromiseLike<{ data: unknown[] | null; error: { code?: string } | null }>;
  maybeSingle(): PromiseLike<{ data: { id?: string; status?: string } | null; error: { code?: string } | null }>;
};

function asRecord(row: unknown) {
  return row && typeof row === "object" ? row as Record<string, unknown> : {};
}

function mergePublic(inbound: unknown[], outbound: unknown[], limit: number) {
  const inboundRows = inbound.map((row) => {
    const item = asRecord(row);
    const data = item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data as Record<string, unknown> : {};
    return { id: item.id, kind: item.kind, text: data.text, receivedAt: item.received_at };
  });
  const outboundRows = outbound.map((row) => {
    const item = asRecord(row);
    return { id: item.id, kind: item.kind, text: item.text, receivedAt: item.created_at };
  });
  const merged = [...inboundRows, ...outboundRows].sort((a, b) => {
    const at = String(a.receivedAt ?? "").localeCompare(String(b.receivedAt ?? ""));
    return at !== 0 ? at : String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
  return { messages: merged.slice(0, limit), hasMore: merged.length > limit };
}

export function createSupabaseWebsiteMessagesPort(client: { rpc: WebsiteMessagesPort["rpc"]; from: (table: string) => Query }): WebsiteMessagesPort {
  return {
    rpc: (name, args) => client.rpc(name, args),
    async listPublicMessages(input) {
      let inbound = client.from("web_inbound_events").select("id,kind,data,received_at").eq("organization_id", input.organizationId).eq("sender_key", input.channelUserKey);
      if (input.cursor) inbound = inbound.or(`received_at.gt.${input.cursor.at},and(received_at.eq.${input.cursor.at},id.gt.${input.cursor.id})`);
      const conversation = await client.from("conversations").select("id,status").eq("organization_id", input.organizationId).eq("channel", "WEB").eq("channel_user_key", input.channelUserKey).maybeSingle();
      if (conversation.error) throw Error("UNAVAILABLE");
      let outbound = conversation.data?.id
        ? client.from("web_outbound").select("id,kind,text,created_at").eq("organization_id", input.organizationId).eq("conversation_id", conversation.data.id).eq("status", "VISIBLE")
        : null;
      if (outbound && input.cursor) outbound = outbound.or(`created_at.gt.${input.cursor.at},and(created_at.eq.${input.cursor.at},id.gt.${input.cursor.id})`);
      const [events, replies] = await Promise.all([
        inbound.order("received_at", { ascending: true }).order("id", { ascending: true }).limit(input.limit + 1),
        outbound
          ? outbound.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(input.limit + 1)
          : Promise.resolve({ data: [] as unknown[], error: null }),
      ]);
      if (events.error || replies.error) throw Error("UNAVAILABLE");
      const page = mergePublic(events.data ?? [], replies.data ?? [], input.limit);
      return { messages: page.messages, status: conversation.data?.status ?? "AI_ACTIVE", hasMore: page.hasMore };
    },
  };
}
