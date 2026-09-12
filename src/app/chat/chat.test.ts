// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAT_MESSAGES_PATH,
  CHAT_POLL_MS,
  CHAT_SESSION_PATH,
  PublicChatSession,
  conversationStatusCopy,
  initialChatSnapshot,
  mergeMessages,
  messagesCursor,
  parseMessagesPayload,
  type PublicChatMessage,
  type PublicChatStatus,
} from "./chat-state";

const chatRoot = new URL("./", import.meta.url);
const supportPage = new URL("../(app)/support/page.tsx", import.meta.url);
const supportLayout = new URL("../(app)/layout.tsx", import.meta.url);

function source(relative: string) {
  return readFileSync(new URL(relative, chatRoot), "utf8");
}

function message(partial: Partial<PublicChatMessage> & Pick<PublicChatMessage, "id" | "text">): PublicChatMessage {
  return {
    direction: "inbound",
    kind: "message",
    receivedAt: "2026-09-13T00:00:00.000Z",
    ...partial,
  };
}

function fakeChat(options: { cookie?: boolean; status?: PublicChatStatus } = {}) {
  const store: PublicChatMessage[] = [];
  let cookie = options.cookie ?? false;
  let status: PublicChatStatus = options.status ?? "AI_ACTIVE";
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  const http = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      let body: unknown;
      if (typeof init?.body === "string" && init.body) body = JSON.parse(init.body);
      calls.push({ method, url, body });
      if (url === CHAT_SESSION_PATH && method === "POST") {
        cookie = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.split("?")[0] !== CHAT_MESSAGES_PATH) return new Response(JSON.stringify({ ok: false }), { status: 404 });
      if (!cookie) return new Response(JSON.stringify({ ok: false }), { status: 401 });
      if (method === "POST") {
        const payload = body as { text?: string; requestId?: string };
        if (!store.some((row) => row.id === payload.requestId)) {
          store.push(message({
            id: payload.requestId ?? `msg-${store.length}`,
            text: payload.text ?? "",
            receivedAt: `2026-09-13T00:00:${String(store.length).padStart(2, "0")}.000Z`,
          }));
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      const cursorRaw = new URL(url, "https://app.test").searchParams.get("cursor");
      let rows = store;
      if (cursorRaw) {
        const cursor = JSON.parse(cursorRaw) as { at: string; id: string };
        rows = store.filter((row) => row.receivedAt > cursor.at || (row.receivedAt === cursor.at && row.id > cursor.id));
      }
      return new Response(JSON.stringify({ messages: rows, cursor: null, status }), { status: 200 });
    },
  };
  return {
    http,
    store,
    calls,
    dropCookie() { cookie = false; },
    setStatus(next: PublicChatStatus) { status = next; },
  };
}

describe("AT-057-01 GET /chat is public", () => {
  it("renders a chat form without login redirect or staff chrome", () => {
    const page = source("page.tsx");
    const client = source("chat-client.tsx");
    const files = [page, client, source("chat-state.ts"), source("session/route.ts")].join("\n");
    expect(page).toContain('from "./chat-client"');
    expect(page).not.toMatch(/requirePagePermission|getStaffSession|redirect\(/);
    expect(page).not.toContain("(app)");
    expect(client).toMatch(/<form[\s\S]*onSubmit/);
    expect(client).toMatch(/htmlFor="chat-message"|htmlFor='chat-message'/);
    expect(files).not.toMatch(/Đăng xuất|AppNav|app-header|graph\.facebook\.com/);
    expect(files).not.toMatch(/\bpsid\b/i);
    expect(files).not.toContain("/login");
    expect(CHAT_SESSION_PATH).toBe("/chat/session");
    expect(CHAT_MESSAGES_PATH).toBe("/api/chat/messages");
  });
});

describe("AT-057-02 send, cursor poll, reload history", () => {
  it("shows the persisted inbound after POST+poll and keeps it on reload while the cookie remains", async () => {
    const world = fakeChat();
    const session = new PublicChatSession(world.http);
    expect(session.snapshot).toEqual(initialChatSnapshot);
    await session.load();
    expect(world.calls[0]).toEqual({ method: "POST", url: CHAT_SESSION_PATH, body: undefined });
    expect(session.snapshot.phase).toBe("empty");
    expect(session.snapshot.messages).toEqual([]);

    const sent = await session.send("xin chào");
    expect(sent).toEqual({ ok: true });
    expect(session.snapshot.phase).toBe("ready");
    expect(session.snapshot.messages.map((row) => row.text)).toEqual(["xin chào"]);
    expect(world.calls.some((call) => call.method === "POST" && call.url === CHAT_MESSAGES_PATH && (call.body as { text: string }).text === "xin chào")).toBe(true);

    world.store.push(message({ id: "ai-later", text: "đã nhận", direction: "outbound", kind: "reply", receivedAt: "2026-09-13T00:01:00.000Z" }));
    await session.poll(true);
    expect(session.snapshot.messages.map((row) => row.text)).toEqual(["xin chào", "đã nhận"]);
    expect(messagesCursor(session.snapshot.messages)).toContain("ai-later");

    const reloaded = new PublicChatSession(world.http);
    await reloaded.load();
    expect(reloaded.snapshot.messages.map((row) => row.text)).toEqual(["xin chào", "đã nhận"]);

    world.dropCookie();
    await session.poll(true);
    expect(session.snapshot.phase).toBe("error");
    expect(session.snapshot.messages).toEqual([]);
  });

  it("does not add a transcript row when POST fails", async () => {
    const session = new PublicChatSession({
      fetch: async (input, init) => {
        if (String(input) === CHAT_SESSION_PATH) return new Response(JSON.stringify({ ok: true }), { status: 200 });
        if ((init?.method ?? "GET") === "POST") return new Response(JSON.stringify({ ok: false }), { status: 503 });
        return new Response(JSON.stringify({ messages: [], cursor: null, status: "AI_ACTIVE" }), { status: 200 });
      },
    });
    await session.load();
    expect(await session.send("xin chào")).toEqual({ ok: false });
    expect(session.snapshot.messages).toEqual([]);
    expect(session.snapshot.notice).toMatch(/Không thể gửi/);
  });
});

describe("AT-057-03 loading error empty and handoff states", () => {
  it("exposes loading, empty, error, and status copy without AI text or Graph", async () => {
    expect(initialChatSnapshot.phase).toBe("loading");
    expect(conversationStatusCopy("AI_ACTIVE", [])).toBe("Đang tư vấn");
    expect(conversationStatusCopy("AI_ACTIVE", [message({ id: "1", text: "câu hỏi" })])).toBe("AI đang xử lý");
    expect(conversationStatusCopy("WAITING_STAFF", [])).toBe("Đang chờ nhân viên");
    expect(conversationStatusCopy("STAFF_ACTIVE", [])).toBe("Nhân viên đang hỗ trợ");
    expect(parseMessagesPayload({ messages: [{ id: "1", text: "", direction: "inbound", kind: "message", receivedAt: "2026-09-13T00:00:00.000Z" }], cursor: null, status: "WAITING_STAFF" })).toMatchObject({
      status: "WAITING_STAFF",
      messages: [expect.objectContaining({ text: "" })],
    });

    const failing = new PublicChatSession({
      fetch: async (input) => {
        if (String(input) === CHAT_SESSION_PATH) return new Response(JSON.stringify({ ok: true }), { status: 200 });
        return new Response(JSON.stringify({ ok: false }), { status: 503 });
      },
    });
    await failing.load();
    expect(failing.snapshot.phase).toBe("error");
    expect(failing.snapshot.messages).toEqual([]);
    const world = fakeChat({ status: "STAFF_ACTIVE" });
    const session = new PublicChatSession(world.http);
    await session.load();
    expect(session.snapshot.phase).toBe("empty");
    expect(session.snapshot.status).toBe("STAFF_ACTIVE");
    expect(conversationStatusCopy(session.snapshot.status, session.snapshot.messages)).toBe("Nhân viên đang hỗ trợ");
    world.setStatus("WAITING_STAFF");
    await session.poll(true);
    expect(session.snapshot.status).toBe("WAITING_STAFF");
    await session.poll(false);
    expect(world.calls.filter((call) => call.method === "GET").length).toBe(2);
    expect(CHAT_POLL_MS).toBe(10_000);
    expect(mergeMessages([], [message({ id: "a", text: "x" })]).map((row) => row.id)).toEqual(["a"]);
  });
});

describe("AT-057-04 a11y and responsive composer", () => {
  it("labels the composer, submits by keyboard, and stays usable without hover on a narrow viewport", () => {
    const client = source("chat-client.tsx");
    const css = source("chat.module.css");
    expect(client).toContain('htmlFor="chat-message"');
    expect(client).toContain("Tin nhắn");
    expect(client).toMatch(/<form[\s\S]*onSubmit/);
    expect(client).toContain('aria-live="polite"');
    expect(client).toContain("maxLength={CHAT_TEXT_MAX}");
    expect(client).toContain("type=\"submit\"");
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/@media \(max-width:/);
    expect(css).toMatch(/button:disabled/);
    expect(css).not.toMatch(/button\s*\{[^}]*display:\s*none/);
    expect(css).not.toMatch(/:hover[^{]*\{[^}]*display:\s*none/);
  });
});

describe("AT-057-05 staff /support is unchanged and public chat has no staff chrome", () => {
  it("keeps the support login gate and does not reuse staff layout", () => {
    const support = readFileSync(supportPage, "utf8");
    const layout = readFileSync(supportLayout, "utf8");
    const page = source("page.tsx");
    const client = source("chat-client.tsx");
    expect(support).toContain('requirePagePermission("read_operations","/support")');
    expect(support).toContain("hộp thư Meta");
    expect(layout).toContain('href="/support"');
    expect(layout).toContain("Đăng xuất");
    expect(page).not.toContain("requirePagePermission");
    expect(page).not.toContain("AppNav");
    expect(client).not.toContain("Đăng xuất");
    expect(client).not.toContain('href="/support"');
    expect(source("session/route.ts")).toContain("createWebsiteSession");
    expect(source("session/route.ts")).not.toMatch(/graph\.facebook\.com|consult\s*\(/);
  });
});
