// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { consult } from "./planner";
import { createConsultationHandler } from "./worker";
import {
  STATUS_LOOKUP_LIMIT, STATUS_PURPOSE, STATUS_TTL_MS, UNVERIFIED_TEXT,
  collectOrderStatusRoute, createStatusLookup, createStatusPageService,
  extractStatusLookup, hashStatusToken, missingStatusField, normalizeCustomerPhone,
  statusHeaders, statusUrl, toPublicOrderStatus, type PublicOrderStatus, type StatusLookupPort,
} from "./status-lookup";
import { createConfirmationToken, hashConfirmationToken } from "@/lib/orders/confirmation";
import type { BusinessJob } from "@/lib/jobs/types";

const org = "a2700000-0000-4000-8000-000000000001";
const webSession = "a2700000-0000-4000-8000-000000000010";
const otherSession = "a2700000-0000-4000-8000-000000000011";
const facebookSession = "a2700000-0000-4000-8000-000000000012";
const wrongPsidSession = "a2700000-0000-4000-8000-000000000013";
const orderId = "a2700000-0000-4000-8000-000000000020";
const unboundOrder = "a2700000-0000-4000-8000-000000000021";
const otherOrder = "a2700000-0000-4000-8000-000000000022";
const warrantyId = "a2700000-0000-4000-8000-000000000030";
const origin = "http://localhost:3000";
const phone = "+84900000027";
const job = {
  id: "a2700000-0000-4000-8000-000000000040", organization_id: org,
  entity_id: "a2700000-0000-4000-8000-000000000041", kind: "inbound_event",
  lease_owner: "a2700000-0000-4000-8000-000000000042", lease_token: "a2700000-0000-4000-8000-000000000043",
} satisfies BusinessJob;

function publicStatus(overrides: Partial<PublicOrderStatus["order"]> = {}, warranty: PublicOrderStatus["warranty"] = []): PublicOrderStatus {
  return {
    asOf: "2026-09-13T00:00:00.000Z",
    order: {
      orderId, fulfilmentStatus: "PREPARING", paymentStatus: "PAID", trackingRef: "VN270",
      customerVisibleProgress: "Đang đóng gói", currency: "VND", totalVnd: 150000,
      items: [{ name: "Fixture laptop", sku: "FIX-27", quantity: 1 }],
      ...overrides,
    },
    warranty,
  };
}

function fakePort(seed?: { limit?: number }) {
  const orders = new Map<string, {
    organizationId: string; conversationId: string | null; phone: string; channel: "WEB" | "FACEBOOK";
    pageId: string | null; psid: string | null; internalNote: string; address: string; status: PublicOrderStatus;
  }>();
  const conversations = new Map<string, { organizationId: string; channel: "WEB" | "FACEBOOK"; channelUserKey: string; pageId: string | null; psid: string | null }>();
  const tokens = new Map<string, { orderId: string; purpose: string; expiresAt: number }>();
  const windows = new Map<string, { count: number; start: number }>();
  const limit = seed?.limit ?? STATUS_LOOKUP_LIMIT;
  conversations.set(webSession, { organizationId: org, channel: "WEB", channelUserKey: "web-session-a", pageId: null, psid: null });
  conversations.set(otherSession, { organizationId: org, channel: "WEB", channelUserKey: "web-session-b", pageId: null, psid: null });
  conversations.set(facebookSession, { organizationId: org, channel: "FACEBOOK", channelUserKey: "20000000027", pageId: "10000000027", psid: "20000000027" });
  conversations.set(wrongPsidSession, { organizationId: org, channel: "FACEBOOK", channelUserKey: "20000000028", pageId: "10000000027", psid: "20000000028" });
  const warranty = [{
    id: warrantyId, status: "INSPECTING" as const, customerNote: "Đang kiểm tra nguồn", updatedAt: "2026-09-13T00:00:00.000Z",
    history: [{ version: 1, status: "RECEIVED" as const, customerNote: "Đã nhận máy", createdAt: "2026-09-12T00:00:00.000Z" }],
  }];
  orders.set(orderId, {
    organizationId: org, conversationId: webSession, phone, channel: "WEB", pageId: null, psid: null,
    internalNote: "SECRET_NOTE", address: "12 Private Street", status: publicStatus({}, warranty),
  });
  orders.set(unboundOrder, {
    organizationId: org, conversationId: null, phone, channel: "WEB", pageId: null, psid: null,
    internalNote: "LEGACY_SECRET", address: "Legacy address", status: publicStatus({ orderId: unboundOrder }, []),
  });
  orders.set(otherOrder, {
    organizationId: org, conversationId: otherSession, phone, channel: "WEB", pageId: null, psid: null,
    internalNote: "OTHER_SECRET", address: "Other address",
    status: publicStatus({ orderId: otherOrder }, [{ id: "a2700000-0000-4000-8000-000000000031", status: "RECEIVED", customerNote: "Máy người khác", updatedAt: "2026-09-13T00:00:00.000Z", history: [] }]),
  });
  const facebookOrder = "a2700000-0000-4000-8000-000000000023";
  orders.set(facebookOrder, {
    organizationId: org, conversationId: facebookSession, phone, channel: "FACEBOOK", pageId: "10000000027", psid: "20000000027",
    internalNote: "FB_SECRET", address: "FB address", status: publicStatus({ orderId: facebookOrder }, []),
  });
  function rateKey(conversationId: string, requestOrigin: string) {
    const conv = conversations.get(conversationId);
    return `${org}\0${conv?.channel ?? "missing"}\0${conv?.channelUserKey ?? conversationId}\0${requestOrigin}`;
  }
  function consume(conversationId: string, requestOrigin: string, now: number) {
    const key = rateKey(conversationId, requestOrigin);
    const current = windows.get(key) ?? { count: 0, start: now };
    current.count += 1;
    windows.set(key, current);
    return current.count <= limit;
  }
  const rpc: StatusLookupPort["rpc"] = async (name, args) => {
    try {
      const now = args.p_now ? Date.parse(String(args.p_now)) : Date.now();
      if (name === "verify_customer_order_status") {
        const conversationId = String(args.p_conversation_id);
        if (!consume(conversationId, String(args.p_origin ?? ""), now)) return { data: { ok: false, code: "RATE_LIMITED" }, error: null };
        const conv = conversations.get(conversationId);
        const code = String(args.p_order_code ?? "").toLowerCase();
        const normalized = normalizeCustomerPhone(String(args.p_phone ?? ""));
        const row = orders.get(code);
        if (!conv || conv.organizationId !== String(args.p_organization_id) || !row || row.organizationId !== conv.organizationId || row.phone !== normalized) {
          return { data: { ok: false, code: "UNVERIFIED" }, error: null };
        }
        if (row.conversationId == null) return { data: { ok: false, code: "HANDOFF" }, error: null };
        if (row.conversationId !== conversationId) return { data: { ok: false, code: "UNVERIFIED" }, error: null };
        if (conv.channel === "WEB" && (conv.psid != null || conv.pageId != null)) return { data: { ok: false, code: "UNVERIFIED" }, error: null };
        if (conv.channel === "FACEBOOK" && (conv.pageId !== row.pageId || conv.psid !== row.psid)) return { data: { ok: false, code: "UNVERIFIED" }, error: null };
        tokens.set(String(args.p_token_hash), { orderId: row.status.order.orderId, purpose: STATUS_PURPOSE, expiresAt: Date.parse(String(args.p_expires_at)) });
        return { data: { ok: true, status: row.status, expiresAt: args.p_expires_at }, error: null };
      }
      if (name === "read_order_status") {
        const token = tokens.get(String(args.p_token_hash));
        if (!token || token.purpose !== STATUS_PURPOSE || token.expiresAt <= now) return { data: null, error: null };
        const row = orders.get(token.orderId);
        return { data: row?.status ?? null, error: null };
      }
      return { data: null, error: { code: "42883" } };
    } catch {
      return { data: { ok: false, code: "UNVERIFIED" }, error: null };
    }
  };
  return { rpc, orders, tokens, windows, facebookOrder };
}

describe("phone and field extraction", () => {
  it("normalizes VN numbers and asks for missing order code or phone", () => {
    expect(normalizeCustomerPhone("0900000027")).toBe(phone);
    expect(normalizeCustomerPhone("+84 900.000.027")).toBe(phone);
    expect(missingStatusField(extractStatusLookup({ organizationId: org, text: "Cho mình xem tiến độ", history: [] }))).toBe("orderCode");
    expect(missingStatusField(extractStatusLookup({ organizationId: org, text: `Mã ${orderId}`, history: [] }))).toBe("phone");
    expect(missingStatusField(extractStatusLookup({ organizationId: org, text: `Tra cứu ${orderId} sđt 0900000027`, history: [] }))).toBeNull();
  });
});

describe("AT-027-01 WEB session verify; wrong owner is uniform unverified", () => {
  it("returns public DTO for website session without PSID", async () => {
    const port = fakePort();
    const lookup = createStatusLookup(port, { organizationId: org, conversationId: webSession, origin, random: () => Buffer.alloc(32, 7) });
    const result = await lookup.verify({ orderCode: orderId, phone: "0900000027" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error("expected verify");
    expect(result.status.order.orderId).toBe(orderId);
    expect(result.status.order.customerVisibleProgress).toBe("Đang đóng gói");
    expect(JSON.stringify(result.status)).not.toContain("SECRET_NOTE");
    expect(JSON.stringify(result.status)).not.toContain("12 Private Street");
    expect(result.url).toBe(statusUrl(origin, createConfirmationToken(() => Buffer.alloc(32, 7)).token));
    expect(port.orders.get(orderId)?.psid).toBeNull();
  });
  it("wrong session, phone, or code share one unverified shape and leak no existence", async () => {
    const port = fakePort();
    const wrongOwner = createStatusLookup(port, { organizationId: org, conversationId: otherSession, origin });
    const owner = createStatusLookup(port, { organizationId: org, conversationId: webSession, origin });
    const replies = [
      await wrongOwner.verify({ orderCode: orderId, phone }),
      await owner.verify({ orderCode: orderId, phone: "+84900000999" }),
      await owner.verify({ orderCode: "a2700000-0000-4000-8000-000000000099", phone }),
    ];
    for (const reply of replies) {
      expect(reply).toEqual({ ok: false, code: "UNVERIFIED" });
      expect(JSON.stringify(reply)).not.toContain("SECRET_NOTE");
      expect(JSON.stringify(reply)).not.toContain(orderId);
    }
  });
  it("unbound legacy hands off and does not auto-bind", async () => {
    const port = fakePort();
    const lookup = createStatusLookup(port, { organizationId: org, conversationId: webSession, origin });
    const result = await lookup.verify({ orderCode: unboundOrder, phone });
    expect(result).toEqual({ ok: false, code: "HANDOFF" });
    expect(port.orders.get(unboundOrder)?.conversationId).toBeNull();
  });
  it("Facebook adapter rejects the wrong PSID without blocking WEB", async () => {
    const port = fakePort();
    const facebook = createStatusLookup(port, { organizationId: org, conversationId: facebookSession, origin });
    const wrong = createStatusLookup(port, { organizationId: org, conversationId: wrongPsidSession, origin });
    const web = createStatusLookup(port, { organizationId: org, conversationId: webSession, origin });
    expect((await facebook.verify({ orderCode: port.facebookOrder, phone })).ok).toBe(true);
    expect(await wrong.verify({ orderCode: port.facebookOrder, phone })).toEqual({ ok: false, code: "UNVERIFIED" });
    expect((await web.verify({ orderCode: orderId, phone })).ok).toBe(true);
  });
});

describe("AT-027-02 persisted rate limit survives restart", () => {
  it("limits bulk guesses after a new service instance attaches to the same store", async () => {
    const port = fakePort();
    const first = createStatusLookup(port, { organizationId: org, conversationId: webSession, origin, now: () => 1_000 });
    for (let i = 0; i < STATUS_LOOKUP_LIMIT; i++) {
      expect(await first.verify({ orderCode: orderId, phone: "+84900000999" })).toEqual({ ok: false, code: "UNVERIFIED" });
    }
    expect([...port.windows.values()].map((window) => window.count)).toEqual([STATUS_LOOKUP_LIMIT]);
    const restarted = createStatusLookup(port, { organizationId: org, conversationId: webSession, origin, now: () => 1_000 });
    const limited = await restarted.verify({ orderCode: orderId, phone });
    expect(limited).toEqual({ ok: false, code: "RATE_LIMITED" });
    expect(JSON.stringify(limited)).not.toContain("SECRET_NOTE");
    expect(JSON.stringify(limited)).not.toMatch(/PREPARING|Đang đóng gói/);
  });
});

describe("AT-027-03 warranty public progress omits private notes and other customers", () => {
  it("keeps customer notes and drops staff secrets from mixed payloads", () => {
    const leaked = toPublicOrderStatus({
      asOf: "2026-09-13T00:00:00.000Z",
      order: {
        orderId, fulfilmentStatus: "PREPARING", paymentStatus: "PAID", trackingRef: "VN270",
        customerVisibleProgress: "Đang đóng gói", currency: "VND", totalVnd: 150000, internalNote: "SECRET_NOTE",
        address: "12 Private Street", buyerName: "Hidden", phone, reconciliation: "MANUAL_REVIEW",
        items: [{ name: "Fixture laptop", sku: "FIX-27", quantity: 1, unitPriceVnd: 1, internalNote: "SECRET_NOTE" }],
        history: [{ internalNote: "SECRET_NOTE" }],
      },
      warranty: [{
        id: warrantyId, status: "INSPECTING", customerNote: "Đang kiểm tra nguồn", privateNote: "PRIVATE staff",
        updatedAt: "2026-09-13T00:00:00.000Z",
        history: [{ version: 1, status: "RECEIVED", customerNote: "Đã nhận máy", privateNote: "PRIVATE staff", createdAt: "2026-09-12T00:00:00.000Z" }],
      }],
    });
    expect(leaked.warranty[0]?.customerNote).toBe("Đang kiểm tra nguồn");
    expect(JSON.stringify(leaked)).not.toContain("SECRET_NOTE");
    expect(JSON.stringify(leaked)).not.toContain("PRIVATE");
    expect(JSON.stringify(leaked)).not.toContain("12 Private Street");
    expect(leaked).not.toHaveProperty("order.internalNote");
  });
  it("does not return another customer's warranty on a verified order", async () => {
    const port = fakePort();
    const mine = await createStatusLookup(port, { organizationId: org, conversationId: webSession, origin }).verify({ orderCode: orderId, phone });
    expect(mine.ok).toBe(true);
    if (!mine.ok) throw Error("expected mine");
    expect(mine.status.warranty.map((row) => row.id)).toEqual([warrantyId]);
    expect(JSON.stringify(mine.status.warranty)).not.toContain("Máy người khác");
  });
});

describe("AT-027-04 website worker stores route; tokens cannot cross purpose", () => {
  it("asks then verifies then stores a status link without Messenger transport", async () => {
    const port = fakePort();
    const status = createStatusLookup(port, { organizationId: org, conversationId: webSession, origin, random: () => Buffer.alloc(32, 9) });
    const asking = await consult(
      { organizationId: org, text: "Cho mình xem tiến độ đơn", history: [], introduce: false, conversationId: webSession },
      { ai: { generateText: async () => ({ text: JSON.stringify({ intent: "order_status" }), model: "fixture" }) }, lookup: async () => { throw Error("no lookup"); }, status },
      new AbortController().signal,
    );
    expect(asking).toMatchObject({ type: "route", route: "order_status", field: "orderCode" });
    const verified = await consult(
      { organizationId: org, text: `Tra cứu đơn ${orderId} số 0900000027`, history: [], introduce: false, conversationId: webSession },
      { ai: { generateText: async () => ({ text: JSON.stringify({ intent: "order_status" }), model: "fixture" }) }, lookup: async () => { throw Error("no lookup"); }, status },
      new AbortController().signal,
    );
    expect(verified.type).toBe("route");
    expect(verified).toMatchObject({ route: "order_status", statusUrl: statusUrl(origin, createConfirmationToken(() => Buffer.alloc(32, 9)).token) });
    expect(verified.text).toContain("/order-status/");
    const writes: unknown[] = [];
    const workerPort = fakePort();
    const handler = createConsultationHandler(
      { context: () => ({ organizationId: org, text: `Tra cứu đơn ${orderId} số 0900000027`, history: [], introduce: false, conversationId: webSession }), finish: async (_job, outcome) => { writes.push(outcome); } },
      { ai: { generateText: async () => ({ text: JSON.stringify({ intent: "order_status" }), model: "fixture" }) }, lookup: async () => { throw Error("no lookup"); }, statusLookup: workerPort, origin },
    );
    await handler(job, new AbortController().signal);
    expect(writes).toEqual([expect.objectContaining({ type: "route", route: "order_status", statusUrl: expect.stringContaining("/order-status/") })]);
    expect(JSON.stringify(writes)).not.toContain("graph.facebook.com");
  });
  it("handoff and warranty execution win over status lookup", async () => {
    const status = { verify: async () => { throw Error("must not verify"); } };
    for (const text of ["Máy tôi hỏng, muốn gửi bảo hành", "Tôi muốn đổi trả máy", "Cho tôi gặp nhân viên"]) {
      const result = await consult(
        { organizationId: org, text, history: [], introduce: false, conversationId: webSession },
        { ai: { generateText: async () => ({ text: JSON.stringify({ intent: "order_status" }), model: "fixture" }) }, lookup: async () => { throw Error("no lookup"); }, status },
        new AbortController().signal,
      );
      expect(result.type).toBe("handoff");
    }
  });
  it("status token cannot confirm or pay and confirmation token cannot read status", async () => {
    const port = fakePort();
    const issued = createConfirmationToken(() => Buffer.alloc(32, 3));
    port.tokens.set(issued.hash, { orderId, purpose: "confirmation", expiresAt: Date.now() + STATUS_TTL_MS });
    const page = createStatusPageService(port);
    expect(await page.read(issued.token)).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    const statusToken = createConfirmationToken(() => Buffer.alloc(32, 4));
    port.tokens.set(hashStatusToken(statusToken.token), { orderId, purpose: STATUS_PURPOSE, expiresAt: Date.now() + STATUS_TTL_MS });
    expect(hashConfirmationToken(statusToken.token)).toBe(hashStatusToken(statusToken.token));
    const statusRead = await page.read(statusToken.token);
    expect(statusRead.ok).toBe(true);
    expect(createHash("sha256").update(statusToken.token).digest("hex")).toHaveLength(64);
  });
  it("unbound collect route becomes lookup_failed gap for staff, not an auto-bind", async () => {
    const port = fakePort();
    const status = createStatusLookup(port, { organizationId: org, conversationId: webSession, origin });
    const result = await collectOrderStatusRoute(
      { organizationId: org, text: `Tra cứu ${unboundOrder} 0900000027`, history: [], conversationId: webSession },
      status,
    );
    expect(result).toMatchObject({ type: "gap", reason: "lookup_failed", field: "service" });
    expect(port.orders.get(unboundOrder)?.conversationId).toBeNull();
  });
  it("wrong owner collect route uses the same unverified copy", async () => {
    const port = fakePort();
    const status = createStatusLookup(port, { organizationId: org, conversationId: otherSession, origin });
    const result = await collectOrderStatusRoute(
      { organizationId: org, text: `Tra cứu ${orderId} 0900000027`, history: [], conversationId: otherSession },
      status,
    );
    expect(result).toMatchObject({ type: "route", route: "order_status", text: UNVERIFIED_TEXT });
    expect(JSON.stringify(result)).not.toContain("SECRET_NOTE");
  });
});

describe("public token page contract", () => {
  it("invalid token is generic and headers forbid store/referrer", async () => {
    const page = createStatusPageService(fakePort());
    expect(await page.read("not-a-token")).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect(await page.read(Buffer.from(randomBytes(32)).toString("base64url"))).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect(statusHeaders()).toMatchObject({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" });
    expect(STATUS_TTL_MS).toBe(1_800_000);
  });
});
