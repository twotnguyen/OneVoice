// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { postgresUuid } from "@/lib/jobs/types";
import { sameOriginMutation } from "@/lib/auth/security";

export const WEBSITE_SESSION_COOKIE = "ov_web_session";
export const WEBSITE_SESSION_CREATE_LIMIT = 5;
export const WEBSITE_SESSION_CREATE_WINDOW_MS = 60_000;
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const identitySchema = z.object({ organizationId: postgresUuid, channelUserKey: z.string().min(1).max(256) });
const noStore = { "Cache-Control": "private, no-store", "Content-Type": "application/json", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

export type WebsiteSessionRpcName = "create_website_session" | "read_website_session";
export interface WebsiteSessionPort { rpc(name: WebsiteSessionRpcName, args: Record<string, Json>): PromiseLike<{ data: unknown; error: { code?: string } | null }> }
export type WebsiteSessionIdentity = z.infer<typeof identitySchema>;

export function hashWebsiteSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
/** OV-054 WEB channel_user_key = SHA-256 hex of the opaque cookie token (same as token_hash at rest). Never the raw cookie, never conversations.id. */
export function websiteChannelUserKey(token: string) {
  return hashWebsiteSessionToken(token);
}
export function createWebsiteSessionToken(random: () => Uint8Array = () => randomBytes(32)) {
  const token = Buffer.from(random()).toString("base64url");
  if (!tokenSchema.safeParse(token).success) throw Error("WEBSITE_SESSION_TOKEN_INVALID");
  return { token, hash: hashWebsiteSessionToken(token) };
}
export function websiteSessionCookie(token: string, origin: string) {
  const value = `${WEBSITE_SESSION_COOKIE}=${tokenSchema.parse(token)}; Path=/; HttpOnly; SameSite=Lax`;
  return new URL(origin).protocol === "https:" ? `${value}; Secure` : value;
}

function cookieToken(request: Request) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${WEBSITE_SESSION_COOKIE}=`)) continue;
    const value = trimmed.slice(WEBSITE_SESSION_COOKIE.length + 1);
    return tokenSchema.safeParse(value).success ? value : null;
  }
  return null;
}
function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const identity = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(identity).digest("hex");
}
function json(status: number, extra?: HeadersInit) {
  return new Response(JSON.stringify({ ok: status === 200 }), { status, headers: { ...noStore, ...extra } });
}

export function readWebsiteSession(port: WebsiteSessionPort) {
  return async (request: Request): Promise<WebsiteSessionIdentity | null> => {
    const token = cookieToken(request);
    if (!token) return null;
    let result;
    try { result = await port.rpc("read_website_session", { p_token_hash: hashWebsiteSessionToken(token) }); }
    catch { return null; }
    if (result.error || result.data == null) return null;
    const row = result.data as Record<string, unknown>;
    const parsed = identitySchema.safeParse({ organizationId: row.organizationId, channelUserKey: row.channelUserKey });
    return parsed.success ? parsed.data : null;
  };
}

export function createWebsiteSession(port: WebsiteSessionPort, context: { organizationId: string; origin: string; random?: () => Uint8Array }) {
  const organizationId = postgresUuid.parse(context.organizationId);
  const read = readWebsiteSession(port);
  return async (request: Request) => {
    if (!sameOriginMutation(request, context.origin)) return json(403);
    if (await read(request)) return json(200);
    const issued = createWebsiteSessionToken(context.random);
    let result;
    try {
      result = await port.rpc("create_website_session", {
        p_organization_id: organizationId, p_token_hash: issued.hash, p_channel_user_key: websiteChannelUserKey(issued.token),
        p_client_key: clientKey(request), p_limit: WEBSITE_SESSION_CREATE_LIMIT, p_window_ms: WEBSITE_SESSION_CREATE_WINDOW_MS,
      });
    } catch { return json(503); }
    if (result.error) return json(503);
    const data = result.data as { ok?: boolean; code?: string } | null;
    if (data?.ok === false && data.code === "RATE_LIMITED") return json(429, { "Retry-After": "60" });
    if (data?.ok !== true) return json(503);
    return json(200, { "Set-Cookie": websiteSessionCookie(issued.token, context.origin) });
  };
}
