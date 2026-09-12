// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  WEBSITE_MESSAGE_PAGE,
  WEBSITE_MESSAGE_SEND_LIMIT,
  WEBSITE_MESSAGE_SEND_WINDOW_MS,
  WEBSITE_MESSAGE_TEXT_MAX,
  createWebsiteMessagesRoute,
  websiteMessageProviderKey,
  websiteMessageSendKey,
  type WebsiteMessagesPort,
} from "./messages";
import {
  WEBSITE_SESSION_COOKIE,
  createWebsiteSessionToken,
  hashWebsiteSessionToken,
} from "./session";

const org = "a0560000-0000-4000-8000-000000000001";
const origin = "https://app.test";
const other = "a0560000-0000-4000-8000-000000000099";

function tokenOf(seed: number) {
  return createWebsiteSessionToken(() => Buffer.alloc(32, seed));
}

function cookieHeader(token: string) {
  return `${WEBSITE_SESSION_COOKIE}=${token}`;
}

function post(token: string, body: unknown, extra: HeadersInit = {}, url = `${origin}/api/chat/messages`) {
  return new Request(url, {
    method: "POST",
    headers: { origin, cookie: cookieHeader(token), "content-type": "application/json", ...extra },
    body: JSON.stringify(body),
  });
}

function get(token: string, cursor?: string, extra: HeadersInit = {}) {
  const url = new URL(`${origin}/api/chat/messages`);
  if (cursor !== undefined) url.searchParams.set("cursor", cursor);
  return new Request(url, { method: "GET", headers: { cookie: cookieHeader(token), ...extra } });
}

function fakePort() {
  const sessions = new Map<string, { organizationId: string; channelUserKey: string }>();
  const events = new Map<string, { id: string; organizationId: string; providerKey: string; senderKey: string; kind: string; data: Record<string, unknown>; receivedAt: string }>();
  const jobs = new Map<string, { kind: string; entityId: string }>();
  const limits = new Map<string, { start: number; count: number }>();
  const conversations = new Map<string, { status: "AI_ACTIVE" | "WAITING_STAFF" | "STAFF_ACTIVE" }>();
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let now = 1_000;
  let seq = 0;
  const rpc: WebsiteMessagesPort["rpc"] = async (name, args) => {
    calls.push({ name, args });
    if (name === "read_website_session") {
      const row = sessions.get(String(args.p_token_hash));
      return { data: row ? { ok: true, ...row } : null, error: null };
    }
    if (name === "take_website_rate_limit") {
      const key = String(args.p_client_key);
      const limit = Number(args.p_limit);
      const windowMs = Number(args.p_window_ms);
      const window = limits.get(key);
      if (!window || now - window.start >= windowMs) limits.set(key, { start: now, count: 0 });
      const current = limits.get(key)!;
      if (current.count >= limit) return { data: false, error: null };
      current.count += 1;
      return { data: true, error: null };
    }
    if (name === "ingest_web_event") {
      const event = args.p_event as { providerKey: string; senderKey: string; kind: string; data: Record<string, unknown> };
      const organizationId = String(args.p_organization_id);
      const existing = [...events.values()].find((row) => row.organizationId === organizationId && row.providerKey === event.providerKey);
      if (existing) return { data: existing.id, error: null };
      const id = `a0560000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
      events.set(id, {
        id, organizationId, providerKey: event.providerKey, senderKey: event.senderKey, kind: event.kind,
        data: event.data, receivedAt: new Date(now).toISOString(),
      });
      jobs.set(id, { kind: "inbound_event", entityId: id });
      return { data: id, error: null };
    }
    return { data: null, error: { code: "42883" } };
  };
  const port: WebsiteMessagesPort = {
    rpc,
    async listPublicMessages(input) {
      const rows = [...events.values()]
        .filter((row) => row.organizationId === input.organizationId && row.senderKey === input.channelUserKey)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
      const start = input.cursor ? rows.findIndex((row) => row.receivedAt === input.cursor!.at && row.id === input.cursor!.id) + 1 : 0;
      const slice = rows.slice(Math.max(start, 0));
      const page = slice.slice(0, input.limit);
      return {
        messages: page.map((row) => ({
          id: row.id,
          text: typeof row.data.text === "string" ? row.data.text : "",
          direction: "inbound" as const,
          kind: row.kind,
          receivedAt: row.receivedAt,
          privateNote: row.data.privateNote,
          psid: row.data.psid,
          staffId: row.data.staffId,
        })),
        status: conversations.get(`${input.organizationId}:${input.channelUserKey}`)?.status ?? "AI_ACTIVE",
        hasMore: slice.length > input.limit,
      };
    },
  };
  return {
    port, sessions, events, jobs, limits, conversations, calls,
    seed(token: string, organizationId = org) {
      sessions.set(hashWebsiteSessionToken(token), { organizationId, channelUserKey: hashWebsiteSessionToken(token) });
    },
    tick(ms: number) { now += ms; },
  };
}

describe("AT-056-01 POST+GET idempotent inbound_event", () => {
  it("persists one inbound and one inbound_event job; replay does not duplicate", async () => {
    const issued = tokenOf(56);
    const fake = fakePort();
    fake.seed(issued.token);
    const route = createWebsiteMessagesRoute(fake.port, { origin, now: () => 1_700_000_000_000 });
    const body = { text: "xin chào", requestId: "req-056-01" };
    const first = await route.POST(post(issued.token, body));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    const second = await route.POST(post(issued.token, body));
    expect(second.status).toBe(200);
    expect([...fake.events.values()]).toHaveLength(1);
    expect([...fake.jobs.values()]).toEqual([{ kind: "inbound_event", entityId: [...fake.events.keys()][0] }]);
    expect(fake.calls.filter((call) => call.name === "ingest_web_event")).toHaveLength(2);
    expect(fake.calls.find((call) => call.name === "ingest_web_event")?.args.p_event).toMatchObject({
      providerKey: websiteMessageProviderKey("req-056-01"),
      senderKey: hashWebsiteSessionToken(issued.token),
      kind: "message",
      data: { text: "xin chào" },
    });
    const listed = await route.GET(get(issued.token));
    expect(listed.status).toBe(200);
    const payload = await listed.json() as { messages: Array<{ text: string; direction: string }>; status: string };
    expect(payload.messages).toEqual([expect.objectContaining({ text: "xin chào", direction: "inbound", kind: "message" })]);
    expect(payload.status).toBe("AI_ACTIVE");
    expect(JSON.stringify(payload)).not.toMatch(/psid|pageId|page_id/i);
  });
});

describe("AT-056-02 cookie isolation and Origin", () => {
  it("rejects missing cookie and foreign session history; POST Origin must match", async () => {
    const a = tokenOf(1);
    const b = tokenOf(2);
    const fake = fakePort();
    fake.seed(a.token);
    fake.seed(b.token);
    const route = createWebsiteMessagesRoute(fake.port, { origin, now: () => 1 });
    expect((await route.POST(new Request(`${origin}/api/chat/messages`, {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ text: "x", requestId: "req-056-02a" }),
    }))).status).toBe(401);
    expect((await route.GET(new Request(`${origin}/api/chat/messages`))).status).toBe(401);
    expect((await route.POST(post(a.token, { text: "secret-a", requestId: "req-056-02b" }, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await route.POST(new Request(`${origin}/api/chat/messages`, {
      method: "POST", headers: { cookie: cookieHeader(a.token), "content-type": "application/json" }, body: JSON.stringify({ text: "x", requestId: "req-056-02c" }),
    }))).status).toBe(403);
    expect(fake.events.size).toBe(0);
    expect((await route.POST(post(a.token, { text: "secret-a", requestId: "req-056-02d" }))).status).toBe(200);
    const fromB = await route.GET(get(b.token));
    expect(fromB.status).toBe(200);
    expect(await fromB.json()).toMatchObject({ messages: [] });
    const fromA = await route.GET(get(a.token));
    const payload = await fromA.json() as { messages: Array<{ text: string }> };
    expect(payload.messages.map((row) => row.text)).toEqual(["secret-a"]);
    expect((await route.GET(get(other))).status).toBe(401);
  });
});

describe("AT-056-03 length and persisted send rate-limit", () => {
  it("rejects text over 1800 and keeps send limiter after a new handler binding", async () => {
    const issued = tokenOf(3);
    const fake = fakePort();
    fake.seed(issued.token);
    const route = createWebsiteMessagesRoute(fake.port, { origin, now: () => 1 });
    expect(WEBSITE_MESSAGE_TEXT_MAX).toBe(1800);
    expect((await route.POST(post(issued.token, { text: "a".repeat(1801), requestId: "req-056-03-long" }))).status).toBe(400);
    expect(fake.events.size).toBe(0);
    expect((await route.POST(post(issued.token, { text: "a".repeat(1800), requestId: "req-056-03-ok" }))).status).toBe(200);
    for (let i = 1; i < WEBSITE_MESSAGE_SEND_LIMIT; i++) {
      expect((await route.POST(post(issued.token, { text: `n${i}`, requestId: `req-056-03-${i}` }))).status).toBe(200);
    }
    expect((await route.POST(post(issued.token, { text: "blocked", requestId: "req-056-03-block" }))).status).toBe(429);
    const restarted = createWebsiteMessagesRoute(fake.port, { origin, now: () => 1 });
    expect((await restarted.POST(post(issued.token, { text: "still-blocked", requestId: "req-056-03-restart" }))).status).toBe(429);
    expect(fake.limits.size).toBe(1);
    expect([...fake.limits.keys()][0]).toBe(websiteMessageSendKey(hashWebsiteSessionToken(issued.token), origin));
    expect([...fake.limits.keys()][0]).toMatch(/^[0-9a-f]{64}$/);
    expect(WEBSITE_MESSAGE_SEND_WINDOW_MS).toBe(60_000);
    expect(JSON.stringify(fake.calls)).not.toContain(issued.token);
  });
});

describe("AT-056-04 cursor pagination and private notes", () => {
  it("pages by cursor, reloads history, and omits private notes from JSON", async () => {
    const issued = tokenOf(4);
    const fake = fakePort();
    fake.seed(issued.token);
    const route = createWebsiteMessagesRoute(fake.port, { origin, now: () => 1, pageSize: 2 });
    expect((await route.GET(get(issued.token, "{"))).status).toBe(400);
    for (const [id, text] of [["req-056-04-a", "one"], ["req-056-04-b", "two"], ["req-056-04-c", "three"]] as const) {
      expect((await route.POST(post(issued.token, { text, requestId: id }))).status).toBe(200);
    }
    const inboundId = [...fake.events.values()][0]!.id;
    fake.events.set("note-row", {
      id: "note-row",
      organizationId: org,
      providerKey: "note:secret",
      senderKey: hashWebsiteSessionToken(issued.token),
      kind: "note",
      data: { text: "hidden", privateNote: "SECRET_NOTE", psid: "20000000056", staffId: other },
      receivedAt: "2099-01-01T00:00:00.000Z",
    });
    fake.conversations.set(`${org}:${hashWebsiteSessionToken(issued.token)}`, { status: "WAITING_STAFF" });
    const first = await route.GET(get(issued.token));
    const page = await first.json() as { messages: Array<{ id: string; text: string }>; cursor: string | null; status: string };
    expect(page.messages.map((row) => row.text)).toEqual(["one", "two"]);
    expect(page.cursor).toEqual(expect.any(String));
    expect(page.status).toBe("WAITING_STAFF");
    const next = await route.GET(get(issued.token, page.cursor!));
    const rest = await next.json() as { messages: Array<{ text: string }>; cursor: string | null };
    expect(rest.messages.map((row) => row.text)).toEqual(["three"]);
    expect(JSON.stringify(rest)).not.toContain("SECRET_NOTE");
    expect(JSON.stringify(rest)).not.toContain("20000000056");
    expect(JSON.stringify(rest)).not.toMatch(/privateNote|staffId|psid/);
    const reload = await route.GET(get(issued.token));
    const again = await reload.json() as { messages: Array<{ id: string; text: string }> };
    expect(again.messages.map((row) => row.text)).toEqual(["one", "two"]);
    expect(again.messages[0]?.id).toBe(inboundId);
    expect(WEBSITE_MESSAGE_PAGE).toBe(50);
  });
});

describe("AT-056-05 no Graph consult or Messenger", () => {
  it("sends without page_id/psid and does not import consult, Graph, or messenger_outbox", async () => {
    const issued = tokenOf(5);
    const fake = fakePort();
    fake.seed(issued.token);
    const route = createWebsiteMessagesRoute(fake.port, { origin, now: () => 1 });
    const sent = await route.POST(post(issued.token, { text: "no facebook", requestId: "req-056-05" }));
    expect(sent.status).toBe(200);
    const event = fake.calls.find((call) => call.name === "ingest_web_event")?.args.p_event as Record<string, unknown>;
    expect(event).not.toHaveProperty("pageId");
    expect(event).not.toHaveProperty("psid");
    expect(JSON.stringify(event)).not.toMatch(/page_id|psid/);
    const source = [
      readFileSync(new URL("./messages.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../../app/api/chat/messages/route.ts", import.meta.url), "utf8"),
    ].join("\n");
    expect(source).not.toMatch(/\bconsult\s*\(/);
    expect(source).not.toContain("finish_consultation");
    expect(source).not.toContain("messenger_outbox");
    expect(source).not.toContain("graph.facebook.com");
    expect(source).not.toContain("enqueue_messenger_outbox_from_receipt");
    expect(createHash("sha256").update(source).digest("hex")).toHaveLength(64);
  });
});
