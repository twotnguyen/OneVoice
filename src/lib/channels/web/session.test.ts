// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  WEBSITE_SESSION_COOKIE,
  WEBSITE_SESSION_CREATE_LIMIT,
  WEBSITE_SESSION_CREATE_WINDOW_MS,
  createWebsiteSession,
  createWebsiteSessionToken,
  hashWebsiteSessionToken,
  readWebsiteSession,
  websiteChannelUserKey,
  websiteSessionCookie,
  type WebsiteSessionPort,
} from "./session";

const org = "a0550000-0000-4000-8000-000000000001";
const conversation = "a0550000-0000-4000-8000-000000000099";
const httpsOrigin = "https://app.test";
const httpOrigin = "http://localhost:3000";

function tokenOf(seed: number) {
  return createWebsiteSessionToken(() => Buffer.alloc(32, seed));
}

function cookieHeader(token: string) {
  return `${WEBSITE_SESSION_COOKIE}=${token}`;
}

function post(origin: string, extra: HeadersInit = {}, url = `${origin}/api/chat/session`) {
  return new Request(url, { method: "POST", headers: { origin, ...extra } });
}

function fakePort() {
  const sessions = new Map<string, { organizationId: string; channelUserKey: string }>();
  const limits = new Map<string, { start: number; count: number }>();
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let now = 1_000;
  const rpc: WebsiteSessionPort["rpc"] = async (name, args) => {
    calls.push({ name, args });
    if (name === "create_website_session") {
      const clientKey = String(args.p_client_key);
      const window = limits.get(clientKey);
      if (!window || now - window.start >= WEBSITE_SESSION_CREATE_WINDOW_MS) limits.set(clientKey, { start: now, count: 0 });
      const current = limits.get(clientKey)!;
      if (current.count >= WEBSITE_SESSION_CREATE_LIMIT) return { data: { ok: false, code: "RATE_LIMITED" }, error: null };
      current.count += 1;
      const hash = String(args.p_token_hash);
      const channelUserKey = String(args.p_channel_user_key);
      sessions.set(hash, { organizationId: String(args.p_organization_id), channelUserKey });
      return { data: { ok: true, organizationId: args.p_organization_id, channelUserKey }, error: null };
    }
    if (name === "read_website_session") {
      const row = sessions.get(String(args.p_token_hash));
      return { data: row ? { ok: true, ...row } : null, error: null };
    }
    return { data: null, error: { code: "42883" } };
  };
  return { rpc, sessions, limits, calls, tick: (ms: number) => { now += ms; } };
}

describe("AT-055-01 cookie flags", () => {
  it("issues ≥32 opaque bytes, HttpOnly SameSite=Lax, Secure only on HTTPS, and omits the token from JSON", async () => {
    const raw = randomBytes(32);
    const issued = createWebsiteSessionToken(() => raw);
    expect(raw.byteLength).toBe(32);
    expect(issued.token).toBe(raw.toString("base64url"));
    expect(issued.token).toHaveLength(43);
    expect(issued.token).not.toBe(conversation);
    expect(websiteSessionCookie(issued.token, httpsOrigin)).toMatch(new RegExp(`^${WEBSITE_SESSION_COOKIE}=${issued.token}; Path=/; HttpOnly; SameSite=Lax; Secure$`));
    expect(websiteSessionCookie(issued.token, httpOrigin)).toBe(`${WEBSITE_SESSION_COOKIE}=${issued.token}; Path=/; HttpOnly; SameSite=Lax`);
    expect(websiteSessionCookie(issued.token, httpOrigin)).not.toMatch(/Secure/);
    expect(websiteSessionCookie(issued.token, httpsOrigin)).not.toMatch(/SameSite=None/);
    const port = fakePort();
    const created = await createWebsiteSession(port, { organizationId: org, origin: httpsOrigin, random: () => raw })(post(httpsOrigin, { "x-forwarded-for": "203.0.113.10" }));
    expect(created.status).toBe(200);
    const body = await created.json() as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain(issued.token);
    expect(created.headers.get("set-cookie")).toContain("HttpOnly");
    expect(created.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(created.headers.get("set-cookie")).toContain("Secure");
    expect(created.headers.get("set-cookie")).toContain(`${WEBSITE_SESSION_COOKIE}=`);
    expect(WEBSITE_SESSION_COOKIE).not.toMatch(/sb-|supabase|staff/i);
  });
});

describe("AT-055-02 hash at rest", () => {
  it("persists SHA-256 hex only; plaintext is not the conversation id or channel_user_key", async () => {
    const issued = tokenOf(55);
    expect(hashWebsiteSessionToken(issued.token)).toBe(createHash("sha256").update(issued.token).digest("hex"));
    expect(issued.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.hash).not.toBe(issued.token);
    expect(websiteChannelUserKey(issued.token)).toBe(issued.hash);
    expect(websiteChannelUserKey(issued.token)).not.toBe(conversation);
    const port = fakePort();
    await createWebsiteSession(port, { organizationId: org, origin: httpsOrigin, random: () => Buffer.alloc(32, 55) })(post(httpsOrigin, { "x-forwarded-for": "203.0.113.11" }));
    expect(port.calls[0]?.name).toBe("create_website_session");
    expect(JSON.stringify(port.calls)).not.toContain(issued.token);
    expect(port.calls[0]?.args.p_token_hash).toBe(issued.hash);
    expect(port.calls[0]?.args.p_channel_user_key).toBe(issued.hash);
    expect([...port.sessions.keys()]).toEqual([issued.hash]);
    expect([...port.sessions.values()][0]?.channelUserKey).toBe(issued.hash);
  });
});

describe("AT-055-03 isolation", () => {
  it("does not let session A read session B, and a guessed conversation UUID is not a cookie", async () => {
    const port = fakePort();
    const create = createWebsiteSession(port, { organizationId: org, origin: httpsOrigin });
    const first = await create(post(httpsOrigin, { "x-forwarded-for": "203.0.113.12" }));
    const second = await create(post(httpsOrigin, { "x-forwarded-for": "203.0.113.13" }));
    const tokenA = first.headers.get("set-cookie")?.split(";")[0]?.split("=")[1] ?? "";
    const tokenB = second.headers.get("set-cookie")?.split(";")[0]?.split("=")[1] ?? "";
    expect(tokenA).not.toBe(tokenB);
    expect(tokenA).not.toBe(conversation);
    const identityA = await readWebsiteSession(port)(new Request(httpsOrigin, { headers: { cookie: cookieHeader(tokenA) } }));
    const identityB = await readWebsiteSession(port)(new Request(httpsOrigin, { headers: { cookie: cookieHeader(tokenB) } }));
    expect(identityA?.channelUserKey).toBe(hashWebsiteSessionToken(tokenA));
    expect(identityB?.channelUserKey).toBe(hashWebsiteSessionToken(tokenB));
    expect(identityA?.channelUserKey).not.toBe(identityB?.channelUserKey);
    expect(await readWebsiteSession(port)(new Request(httpsOrigin, { headers: { cookie: cookieHeader(conversation) } }))).toBeNull();
    expect(await readWebsiteSession(port)(new Request(httpsOrigin, { headers: { cookie: cookieHeader(tokenB) } }))).toEqual(identityB);
    expect(await readWebsiteSession(port)(new Request(httpsOrigin))).toBeNull();
  });
});

describe("AT-055-04 persisted rate-limit create", () => {
  it("blocks after the persisted threshold even with a new process-like service, not LoginLimiter", async () => {
    const port = fakePort();
    const headers = { "x-forwarded-for": "203.0.113.14" };
    for (let i = 0; i < WEBSITE_SESSION_CREATE_LIMIT; i++) {
      expect((await createWebsiteSession(port, { organizationId: org, origin: httpsOrigin })(post(httpsOrigin, headers))).status).toBe(200);
    }
    expect((await createWebsiteSession(port, { organizationId: org, origin: httpsOrigin })(post(httpsOrigin, headers))).status).toBe(429);
    expect((await createWebsiteSession(port, { organizationId: org, origin: httpsOrigin })(post(httpsOrigin, headers))).status).toBe(429);
    expect(port.sessions.size).toBe(WEBSITE_SESSION_CREATE_LIMIT);
    expect(port.limits.size).toBe(1);
    expect([...port.limits.keys()][0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(port.calls)).not.toContain("203.0.113.14");
  });
});

describe("AT-055-05 Origin CSRF", () => {
  it("rejects missing or wrong Origin on POST and does not insert a session row", async () => {
    const port = fakePort();
    const create = createWebsiteSession(port, { organizationId: org, origin: httpsOrigin });
    expect((await create(new Request(`${httpsOrigin}/api/chat/session`, { method: "POST", headers: { "x-forwarded-for": "203.0.113.15" } }))).status).toBe(403);
    expect((await create(post("https://evil.test", { "x-forwarded-for": "203.0.113.15" }))).status).toBe(403);
    expect((await create(new Request(`${httpsOrigin}/api/chat/session`, { method: "GET", headers: { origin: httpsOrigin } }))).status).toBe(403);
    expect(port.sessions.size).toBe(0);
    expect(port.calls).toEqual([]);
    const ok = await create(post(httpsOrigin, { "x-forwarded-for": "203.0.113.15" }));
    expect(ok.status).toBe(200);
    expect(port.sessions.size).toBe(1);
    const token = ok.headers.get("set-cookie")?.split(";")[0]?.split("=")[1] ?? "";
    const again = await create(post(httpsOrigin, { cookie: cookieHeader(token), "x-forwarded-for": "203.0.113.16" }));
    expect(again.status).toBe(200);
    expect(port.sessions.size).toBe(1);
    expect(JSON.stringify(await again.json())).not.toContain(token);
  });
});
