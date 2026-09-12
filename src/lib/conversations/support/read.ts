// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { postgresUuid } from "@/lib/jobs/types";
const time = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/);
const cursorSchema = z.object({ at: time, id: postgresUuid }).strict();
export const supportQuery = z.object({ status: z.enum(["all", "WAITING_STAFF", "STAFF_ACTIVE"]).default("all"), limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().max(300).optional() }).strict();
function cursor(value?: string) { return value ? cursorSchema.parse(JSON.parse(value)) : undefined; }
function safeAttachmentUrl(value: unknown) {
 try { if (typeof value !== "string" || value.length > 2048) return null; const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.searchParams.has("access_token") ? url.href : null; } catch { return null; }
}
export function metaInboxUrl(value: string | undefined, pageId: string): string | null {
 if (!value) return null;
 try {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["business.facebook.com", "www.facebook.com", "facebook.com"].includes(url.hostname) || url.username || url.password || url.hash || url.port || !/^\/(?:latest\/inbox(?:\/[a-z-]+)?|messages\/?)$/.test(url.pathname)) return null;
  if ([...url.searchParams.keys()].some(key => key !== "asset_id") || (url.searchParams.has("asset_id") && url.searchParams.get("asset_id") !== pageId)) return null;
  return url.href;
 } catch { return null; }
}
export function publicMessage(value: unknown) {
 const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
 const attachments = Array.isArray(data.attachments) ? data.attachments.slice(0, 20).map(raw => {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return { type: typeof item.type === "string" ? item.type.slice(0,64) : "file", url: safeAttachmentUrl(item.url) };
 }) : [];
 return { text: typeof data.text === "string" ? data.text.slice(0,16000) : typeof data.title === "string" ? data.title.slice(0,2048) : null, attachments };
}
export type SupportMessage = { id: string; kind: string; eventTimeMs: number | null; receivedAt: string; aiDisposition: string; text: string | null; attachments: { type: string; url: string | null }[] };
export type SupportDetail = { id: string; channel: "FACEBOOK" | "WEB"; channelUserKey: string; pageId: string; psid: string; status: string; revision: number; handoff: { id: string; reason: string; claimedBy: string | null; requestedAt: string; claimedAt: string | null } | null; messages: SupportMessage[]; nextCursor: string | null; inboxUrl: string | null; assignees: { id: string; name: string }[] };
/** WEB composer only for STAFF_ACTIVE claimant or manager. Facebook never composes in OneVoice. */
export function canComposeStaffWebReply(detail: { channel?: string; status: string; handoff: { claimedBy: string | null } | null }, viewer: { id: string; role: string }) {
 return detail.channel === "WEB" && detail.status === "STAFF_ACTIVE" && (viewer.role === "manager" || detail.handoff?.claimedBy === viewer.id);
}
/** Caller must verify a fresh staff session and pass its trusted organization. */
export function createSupportReader(client: SupabaseClient<Database>, inboxUrl = process.env.FACEBOOK_INBOX_URL) {
 return {
  async queue(organizationId: string, input: z.input<typeof supportQuery>) {
   const parsed = supportQuery.parse(input); const after = cursor(parsed.cursor);
   let query = client.from("conversation_handoffs").select("id,reason,status,claimed_by,requested_at,conversations!conversation_handoffs_conversation_id_fkey!inner(id,organization_id,page_id,psid,revision)").eq("conversations.organization_id", organizationId).in("status", parsed.status === "all" ? ["WAITING_STAFF", "STAFF_ACTIVE"] : [parsed.status]).order("requested_at").order("id").limit(parsed.limit+1);
   if (after) query = query.or(`requested_at.gt.${after.at},and(requested_at.eq.${after.at},id.gt.${after.id})`);
   const [rows, waiting, active] = await Promise.all([query, client.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id",organizationId).eq("status","WAITING_STAFF"), client.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id",organizationId).eq("status","STAFF_ACTIVE")]);
   if (rows.error || waiting.error || active.error) throw Error("SUPPORT_UNAVAILABLE");
   const events = rows.data.slice(0,parsed.limit).map(row => ({ id: row.id, reason: row.reason, status: row.status, claimedBy: row.claimed_by, requestedAt: row.requested_at, conversationId: row.conversations.id, pageId: row.conversations.page_id, psid: row.conversations.psid, revision: row.conversations.revision }));
   const last = events.at(-1);
   return { events, counts: { waiting: waiting.count ?? 0, active: active.count ?? 0 }, nextCursor: rows.data.length>parsed.limit && last ? JSON.stringify({ at:last.requestedAt,id:last.id }) : null };
  },
  async detail(organizationId: string, conversationId: string, manager: boolean, cursorInput?: string): Promise<SupportDetail | null> {
   postgresUuid.parse(conversationId); const after = cursor(cursorInput);
   const conversation = await client.from("conversations").select("id,page_id,psid,status,revision,active_handoff_id,channel,channel_user_key").eq("organization_id",organizationId).eq("id",conversationId).maybeSingle();
   if (conversation.error) throw Error("SUPPORT_UNAVAILABLE"); if (!conversation.data) return null;
   const c = conversation.data;
   let messagesQuery = client.from("conversation_messages").select("id,kind,event_time_ms,received_at,ai_disposition,data").eq("conversation_id",c.id).order("received_at",{ascending:false}).order("id",{ascending:false}).limit(31);
   if (after) messagesQuery = messagesQuery.or(`received_at.lt.${after.at},and(received_at.eq.${after.at},id.lt.${after.id})`);
   let outboundQuery = webOutbound(client).select("id,kind,text,created_at").eq("conversation_id",c.id).eq("status","VISIBLE");
   if (after) outboundQuery = outboundQuery.or(`created_at.lt.${after.at},and(created_at.eq.${after.at},id.lt.${after.id})`);
   const outboundReady = outboundQuery.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(31);
   const [messages, outbound, handoff, staff] = await Promise.all([messagesQuery, outboundReady, c.active_handoff_id ? client.from("conversation_handoffs").select("id,reason,claimed_by,requested_at,claimed_at").eq("id",c.active_handoff_id).single() : Promise.resolve({data:null,error:null}), manager ? client.from("staff_profiles").select("user_id,display_name").eq("organization_id",organizationId).eq("active",true).order("display_name").limit(100) : Promise.resolve({data:[],error:null})]);
   if (messages.error || outbound.error || handoff.error || staff.error) throw Error("SUPPORT_UNAVAILABLE");
   const inbound = messages.data.map(row=>({id:row.id,kind:row.kind,eventTimeMs:row.event_time_ms,receivedAt:row.received_at,aiDisposition:row.ai_disposition,...publicMessage(row.data)}));
   const replies = (outbound.data ?? []).map(row=>({id:row.id,kind:row.kind,eventTimeMs:null as number | null,receivedAt:row.created_at,aiDisposition:"suppressed",text:row.text,attachments:[] as SupportMessage["attachments"]}));
   const merged = [...inbound, ...replies].sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)||b.id.localeCompare(a.id));
   const visible = merged.slice(0,30); const last=visible.at(-1);
   const channel = c.channel === "WEB" ? "WEB" as const : "FACEBOOK" as const;
   return { id:c.id,channel,channelUserKey:c.channel_user_key,pageId:c.page_id,psid:c.psid,status:c.status,revision:c.revision,handoff:handoff.data ? {id:handoff.data.id,reason:handoff.data.reason,claimedBy:handoff.data.claimed_by,requestedAt:handoff.data.requested_at,claimedAt:handoff.data.claimed_at} : null,messages:visible,nextCursor:merged.length>30&&last?JSON.stringify({at:last.receivedAt,id:last.id}):null,inboxUrl:channel==="FACEBOOK"?metaInboxUrl(inboxUrl,c.page_id):null,assignees:staff.data.map(row=>({id:row.user_id,name:row.display_name||row.user_id})) };
  },
 };
}
interface WebOutboundQuery {
 eq(column: string, value: string): WebOutboundQuery;
 or(filter: string): WebOutboundQuery;
 order(column: string, options: { ascending: boolean }): WebOutboundQuery;
 limit(count: number): WebOutboundQuery & PromiseLike<{ data: Array<{ id: string; kind: string; text: string; created_at: string }> | null; error: unknown }>;
}
function webOutbound(client: SupabaseClient<Database>) {
 return (client as unknown as { from(table: "web_outbound"): { select(columns: string): WebOutboundQuery } }).from("web_outbound");
}
