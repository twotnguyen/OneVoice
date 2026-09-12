// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { consult, explicitHandoff } from "./planner";
import { createConsultationHandler } from "./worker";
import {
  collectCheckoutRoute,
  createCheckoutCollection,
  createConfirmationToken,
  hashConfirmationToken,
  type ConfirmationPort,
} from "@/lib/orders/confirmation";
import {
  STATUS_PURPOSE,
  UNVERIFIED_TEXT,
  collectOrderStatusRoute,
  createStatusLookup,
  createStatusPageService,
  hashStatusToken,
  statusUrl,
  type PublicOrderStatus,
  type StatusLookupPort,
} from "./status-lookup";
import {
  WEBSITE_SESSION_COOKIE,
  createWebsiteSessionToken,
} from "@/lib/channels/web/session";
import { createWebsiteMessagesRoute } from "@/lib/channels/web/messages";
import type { BusinessJob } from "@/lib/jobs/types";

const org = "a0600000-0000-4000-8000-000000000001";
const conversation = "a0600000-0000-4000-8000-000000000010";
const otherConversation = "a0600000-0000-4000-8000-000000000011";
const product = "a0600000-0000-4000-8000-000000000020";
const orderId = "a0600000-0000-4000-8000-000000000030";
const origin = "https://app.test";
const phone = "+84900000060";
const job = {
  id: "a0600000-0000-4000-8000-000000000040",
  organization_id: org,
  entity_id: "a0600000-0000-4000-8000-000000000041",
  kind: "inbound_event",
  lease_owner: "a0600000-0000-4000-8000-000000000042",
  lease_token: "a0600000-0000-4000-8000-000000000043",
} satisfies BusinessJob;

const checkoutText = "Đặt 1 cái. Tên tôi là Nguyen Van A. SĐT +84900000060. Địa chỉ: 12 Test, Hà Nội";
const checkoutHistory = [{ text: "SKU WEB-60", decision: { catalogItems: [{ productId: product, variantId: null, sku: "WEB-60", name: "Fixture web" }] } }];
const checkoutContext = {
  organizationId: org,
  conversationId: conversation,
  revision: 1,
  introduce: false,
  text: checkoutText,
  history: checkoutHistory,
};

function publicStatus(): PublicOrderStatus {
  return {
    asOf: "2026-09-13T00:00:00.000Z",
    order: {
      orderId,
      fulfilmentStatus: "PREPARING",
      paymentStatus: "PAID",
      trackingRef: "VN060",
      customerVisibleProgress: "Đang đóng gói",
      currency: "VND",
      totalVnd: 150000,
      items: [{ name: "Fixture web", sku: "WEB-60", quantity: 1 }],
    },
    warranty: [],
  };
}

function statusPort() {
  const tokens = new Map<string, { orderId: string; purpose: string; expiresAt: number }>();
  const rpc: StatusLookupPort["rpc"] = async (name, args) => {
    if (name === "verify_customer_order_status") {
      const conversationId = String(args.p_conversation_id);
      const code = String(args.p_order_code ?? "").toLowerCase();
      const givenPhone = String(args.p_phone ?? "");
      if (conversationId !== conversation || code !== orderId || givenPhone !== phone) {
        return { data: { ok: false, code: "UNVERIFIED" }, error: null };
      }
      tokens.set(String(args.p_token_hash), { orderId, purpose: STATUS_PURPOSE, expiresAt: Date.parse(String(args.p_expires_at)) });
      return { data: { ok: true, status: publicStatus(), expiresAt: args.p_expires_at }, error: null };
    }
    if (name === "read_order_status") {
      const token = tokens.get(String(args.p_token_hash));
      if (!token || token.purpose !== STATUS_PURPOSE) return { data: null, error: null };
      return { data: publicStatus(), error: null };
    }
    return { data: null, error: { code: "42883" } };
  };
  return { rpc, tokens };
}

function confirmationPort() {
  const tokens = new Map<string, { purpose: string }>();
  const rpc: ConfirmationPort["rpc"] = async (name, args) => {
    if (name === "issue_order_confirmation_token") {
      tokens.set(String(args.p_token_hash), { purpose: "confirmation" });
      return { data: { orderId, revision: 1, expiresAt: args.p_expires_at }, error: null };
    }
    if (name === "read_order_confirmation") {
      const token = tokens.get(String(args.p_token_hash));
      if (!token || token.purpose !== "confirmation") return { data: null, error: null };
      return { data: { orderId, fulfilmentStatus: "DRAFT", paymentStatus: "UNPAID" }, error: null };
    }
    return { data: null, error: { code: "42883" } };
  };
  return { rpc, tokens };
}

function noLookup() {
  return async () => {
    throw Error("must not lookup");
  };
}

function classify(intent: string) {
  return { generateText: async () => ({ text: JSON.stringify({ intent }), model: "fixture" }) };
}

describe("AT-060-01 WEB checkout collection", () => {
  it("missing field does not create a confirmation link", async () => {
    const collect = { collect: async () => ({ ok: true as const, url: `${origin}/order-confirmation/should-not-issue` }) };
    const missing = await collectCheckoutRoute(
      { organizationId: org, conversationId: conversation, revision: 1, text: "Tôi đặt máy này", history: [] },
      collect,
    );
    expect(missing).toMatchObject({ type: "route", route: "checkout", field: "items" });
    expect(missing.confirmationUrl).toBeUndefined();
    expect(missing.text).not.toContain("/order-confirmation/");
    const planned = await consult(
      { organizationId: org, conversationId: conversation, introduce: false, text: "Tôi đặt máy này", history: [] },
      { ai: classify("checkout"), lookup: noLookup(), checkout: collect },
      new AbortController().signal,
    );
    expect(planned.confirmationUrl).toBeUndefined();
    expect(JSON.stringify(planned)).not.toContain("graph.facebook.com");
  });

  it("complete fields put an opaque confirmation URL on the WEB consult outcome", async () => {
    const bytes = Buffer.alloc(32, 60);
    const checkout = createCheckoutCollection(confirmationPort(), {
      organizationId: org, ownerId: conversation, conversationId: conversation, origin, now: () => 1_000, random: () => bytes,
    });
    const result = await consult(checkoutContext, { ai: classify("checkout"), lookup: noLookup(), checkout }, new AbortController().signal);
    expect(result).toMatchObject({ type: "route", route: "checkout" });
    expect(result.confirmationUrl).toBe(`${origin}/order-confirmation/${bytes.toString("base64url")}`);
    expect(result.text).toContain("/order-confirmation/");
    expect(result.confirmationUrl).not.toContain("Nguyen");
    expect(result.confirmationUrl).not.toContain("0900000060");
    const writes: unknown[] = [];
    const handler = createConsultationHandler(
      { context: () => checkoutContext, finish: async (_job, outcome) => { writes.push(outcome); } },
      { ai: classify("checkout"), lookup: noLookup(), confirmation: confirmationPort(), origin, statusLookup: statusPort() },
    );
    await handler(job, new AbortController().signal);
    expect(writes).toEqual([expect.objectContaining({ type: "route", route: "checkout", confirmationUrl: expect.stringContaining("/order-confirmation/") })]);
    expect(JSON.stringify(writes)).not.toContain("graph.facebook.com");
    expect(JSON.stringify(writes)).not.toContain("messenger_outbox");
  });
});

describe("AT-060-02 WEB status lookup identity", () => {
  it("correct session+code+phone returns a public DTO and status URL", async () => {
    const bytes = Buffer.alloc(32, 61);
    const status = createStatusLookup(statusPort(), { organizationId: org, conversationId: conversation, origin, random: () => bytes });
    const verified = await consult(
      { organizationId: org, conversationId: conversation, introduce: false, text: `Tra cứu đơn ${orderId} số 0900000060`, history: [] },
      { ai: classify("order_status"), lookup: noLookup(), status },
      new AbortController().signal,
    );
    expect(verified).toMatchObject({ type: "route", route: "order_status", statusUrl: statusUrl(origin, createConfirmationToken(() => bytes).token) });
    expect(verified.text).toContain("/order-status/");
    expect(JSON.stringify(verified)).not.toContain("SECRET_NOTE");
  });

  it("wrong session, phone, or code share one unverified message", async () => {
    const status = createStatusLookup(statusPort(), { organizationId: org, conversationId: otherConversation, origin });
    const owner = createStatusLookup(statusPort(), { organizationId: org, conversationId: conversation, origin });
    const replies = [
      await collectOrderStatusRoute({ organizationId: org, text: `Tra cứu ${orderId} 0900000060`, history: [], conversationId: otherConversation }, status),
      await collectOrderStatusRoute({ organizationId: org, text: `Tra cứu ${orderId} 09000000999`, history: [], conversationId: conversation }, owner),
      await collectOrderStatusRoute({ organizationId: org, text: `Tra cứu a0600000-0000-4000-8000-000000000099 0900000060`, history: [], conversationId: conversation }, owner),
    ];
    for (const reply of replies) {
      expect(reply).toMatchObject({ type: "route", route: "order_status", text: UNVERIFIED_TEXT });
      expect(reply).not.toHaveProperty("statusUrl");
      expect(JSON.stringify(reply)).not.toContain(orderId);
    }
  });
});

describe("AT-060-03 handoff wins over lookup and stops AI", () => {
  it("human/return/warranty requests hand off without verifying status", async () => {
    const status = { verify: async () => { throw Error("must not verify"); } };
    const checkout = { collect: async () => { throw Error("must not collect"); } };
    for (const text of ["Cho tôi gặp nhân viên", "Tôi muốn đổi trả máy", "Máy tôi hỏng, muốn gửi bảo hành"]) {
      const result = await consult(
        { organizationId: org, conversationId: conversation, introduce: false, text, history: [] },
        { ai: classify("order_status"), lookup: noLookup(), status, checkout },
        new AbortController().signal,
      );
      expect(result.type).toBe("handoff");
    }
    expect(explicitHandoff("Bảo hành bao lâu?")).toBeNull();
    expect(explicitHandoff("Chính sách đổi trả thế nào?")).toBeNull();
  });
});

describe("AT-060-04 confirmation URL is chat text; tokens cannot cross purpose", () => {
  it("GET transcript can surface the confirmation URL and rejects cross-purpose tokens", async () => {
    const issued = createWebsiteSessionToken(() => Buffer.alloc(32, 60));
    const confirmation = `${origin}/order-confirmation/${createConfirmationToken(() => Buffer.alloc(32, 62)).token}`;
    const inbound = [{ id: "in-1", kind: "message", text: checkoutText, receivedAt: "2026-09-13T00:00:00.000Z" }];
    const outbound = [{ id: "out-1", kind: "reply", text: `Bạn kiểm tra và xác nhận đơn tại ${confirmation}`, receivedAt: "2026-09-13T00:00:01.000Z" }];
    const route = createWebsiteMessagesRoute({
      rpc: async (name) => name === "read_website_session"
        ? { data: { ok: true, organizationId: org, channelUserKey: "web-060" }, error: null }
        : { data: null, error: { code: "42883" } },
      async listPublicMessages() {
        return { messages: [...inbound, ...outbound], status: "AI_ACTIVE", hasMore: false };
      },
    }, { origin });
    const first = await route.GET(new Request(`${origin}/api/chat/messages`, { headers: { cookie: `${WEBSITE_SESSION_COOKIE}=${issued.token}` } }));
    const reload = await route.GET(new Request(`${origin}/api/chat/messages`, { headers: { cookie: `${WEBSITE_SESSION_COOKIE}=${issued.token}` } }));
    expect(first.status).toBe(200);
    expect(reload.status).toBe(200);
    const body = await first.json() as { messages: Array<{ text: string; direction: string }> };
    const again = await reload.json() as { messages: Array<{ text: string; direction: string }> };
    expect(body.messages.some((row) => row.direction === "outbound" && row.text.includes("/order-confirmation/"))).toBe(true);
    expect(again.messages.map((row) => row.text)).toEqual(body.messages.map((row) => row.text));
    const confirmToken = createConfirmationToken(() => Buffer.alloc(32, 63));
    const statusToken = createConfirmationToken(() => Buffer.alloc(32, 64));
    const port = statusPort();
    port.tokens.set(hashConfirmationToken(confirmToken.token), { orderId, purpose: "confirmation", expiresAt: Date.now() + 60_000 });
    port.tokens.set(hashStatusToken(statusToken.token), { orderId, purpose: STATUS_PURPOSE, expiresAt: Date.now() + 60_000 });
    const page = createStatusPageService(port);
    expect(await page.read(confirmToken.token)).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
    expect((await page.read(statusToken.token)).ok).toBe(true);
  });

  it("consultation and web outbound sources never call Graph", () => {
    for (const file of ["./planner.ts", "./worker.ts", "../channels/web/outbound.ts", "../channels/web/messages.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toContain("graph.facebook.com");
      expect(source).not.toContain("createGraphMessengerTransport");
    }
  });
});

describe("local supabase_db_onevoice", () => {
  const psql = (text: string) => execFileSync("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-At", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const sweep = (orgId: string) => {
    if (!orgId) return;
    psql(`update public.business_jobs set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where organization_id='${orgId}' and status in ('queued','running');`);
  };
  function namedRpc(name: string, args: Record<string, unknown>) {
    const parts = Object.entries(args).map(([key, value]) => {
      if (value == null) return `${key}:=null`;
      if (typeof value === "number" || typeof value === "boolean") return `${key}:=${value}`;
      if (typeof value === "object") return `${key}:='${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
      const text = String(value).replaceAll("'", "''");
      if (key === "p_expires_at" || key === "p_now") return `${key}:='${text}'::timestamptz`;
      if (key === "p_expected_revision") return `${key}:=${Number(value)}`;
      if (/_id$/.test(key)) return `${key}:='${text}'::uuid`;
      return `${key}:='${text}'`;
    });
    try {
      return Promise.resolve({ data: JSON.parse(psql(`select coalesce(to_json(public.${name}(${parts.join(",")})),'null');`)), error: null });
    } catch {
      return Promise.resolve({ data: null, error: { code: "XX000" } });
    }
  }

  it("AT-060-01..04 local WEB outbound, status, handoff, no Messenger", async () => {
    const fixtureOrg = randomUUID();
    const productId = randomUUID();
    const owner = randomUUID();
    const sender = `web-${fixtureOrg.replaceAll("-", "").slice(0, 24)}`;
    try {
      psql(`insert into public.organizations(id,name,slug) values('${fixtureOrg}','OV060 web','${fixtureOrg}');
insert into public.products(id,organization_id,source_url,canonical_url,name,sku,price_vnd,in_stock,stock_quantity,quality,specifications)
values('${productId}','${fixtureOrg}','https://fixture.example/${productId}','https://fixture.example/${productId}','OV060 Laptop','WEB-60',150000,true,4,'usable','[]');
select public.ingest_web_event('${fixtureOrg}','{"providerKey":"message:ov060-checkout","senderKey":"${sender}","kind":"message","eventTimeMs":${Date.now()},"data":{"text":"dat hang"}}');`);
      const missingClaim = JSON.parse(psql(`select public.claim_consultation_job('${owner}','${fixtureOrg}');`));
      const missingHandler = createConsultationHandler({
        context: () => ({
          organizationId: missingClaim.organizationId, text: "Tôi đặt máy này", history: [], introduce: false,
          conversationId: missingClaim.conversationId, revision: missingClaim.revision,
        }),
        finish: async (claimedJob, outcome) => {
          const payload = JSON.stringify(outcome).replaceAll("'", "''");
          const ok = psql(`select public.finish_consultation('${claimedJob.id}','${claimedJob.lease_owner}','${claimedJob.lease_token}','${payload}'::jsonb);`);
          if (ok !== "t") throw Error("consultation_finish_rejected");
        },
      }, {
        ai: classify("checkout"),
        lookup: noLookup(),
        confirmation: { rpc: (name, args) => namedRpc(name, args) },
        statusLookup: { rpc: (name, args) => namedRpc(name, args) },
        origin,
      });
      await missingHandler(missingClaim.job, new AbortController().signal);
      expect(psql(`select candidate->>'text' from public.consultation_receipts where event_id='${missingClaim.job.entity_id}';`)).toContain("sản phẩm");
      expect(psql(`select coalesce(candidate->>'text','') like '%/order-confirmation/%' from public.consultation_receipts where event_id='${missingClaim.job.entity_id}';`)).toBe("f");
      expect(psql(`select count(*) from public.web_outbound where organization_id='${fixtureOrg}' and inbound_event_id='${missingClaim.job.entity_id}';`)).toBe("1");
      expect(psql(`select count(*) from public.messenger_outbox where organization_id='${fixtureOrg}';`)).toBe("0");

      psql(`select public.ingest_web_event('${fixtureOrg}','{"providerKey":"message:ov060-complete","senderKey":"${sender}","kind":"message","eventTimeMs":${Date.now() + 1},"data":{"text":"${checkoutText.replaceAll('"', '\\"')}"}}');`);
      const completeClaim = JSON.parse(psql(`select public.claim_consultation_job('${owner}','${fixtureOrg}');`));
      const completeHandler = createConsultationHandler({
        context: () => ({
          organizationId: completeClaim.organizationId, text: checkoutText, introduce: false,
          conversationId: completeClaim.conversationId, revision: completeClaim.revision,
          history: [{ text: "SKU WEB-60", decision: { catalogItems: [{ productId: productId, variantId: null, sku: "WEB-60", name: "OV060 Laptop" }] } }],
        }),
        finish: async (claimedJob, outcome) => {
          const payload = JSON.stringify(outcome).replaceAll("'", "''");
          const ok = psql(`select public.finish_consultation('${claimedJob.id}','${claimedJob.lease_owner}','${claimedJob.lease_token}','${payload}'::jsonb);`);
          if (ok !== "t") throw Error("consultation_finish_rejected");
        },
      }, {
        ai: classify("checkout"),
        lookup: noLookup(),
        confirmation: { rpc: (name, args) => namedRpc(name, args) },
        statusLookup: { rpc: (name, args) => namedRpc(name, args) },
        origin,
      });
      await completeHandler(completeClaim.job, new AbortController().signal);
      const confirmationText = psql(`select text from public.web_outbound where inbound_event_id='${completeClaim.job.entity_id}';`);
      expect(confirmationText).toContain("/order-confirmation/");
      expect(confirmationText).not.toContain("Nguyen Van A");
      expect(psql(`select count(*) from public.messenger_outbox where organization_id='${fixtureOrg}';`)).toBe("0");
      expect(psql(`select fulfilment_status from public.orders where organization_id='${fixtureOrg}';`)).toBe("DRAFT");
      expect(psql(`select payment_status from public.orders where organization_id='${fixtureOrg}';`)).toBe("UNPAID");
      const tokenHash = psql(`select token_hash from public.order_confirmation_tokens where organization_id='${fixtureOrg}' and purpose='confirmation';`);
      expect(tokenHash).toHaveLength(64);
      expect(psql(`select public.read_order_status('${tokenHash}') is null;`)).toBe("t");

      psql(`update public.business_jobs j set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null from public.web_outbound o where j.entity_id=o.id and j.kind='outbound_message' and j.status in ('queued','running') and o.organization_id is distinct from '${fixtureOrg}';`);
      let authorizedText = "";
      for (let i = 0; i < 8; i++) {
        const next = JSON.parse(psql(`select coalesce(json_agg(j),'[]') from public.claim_web_outbound_job('${owner}') j;`))[0] as BusinessJob | undefined;
        if (!next) break;
        const authorized = JSON.parse(psql(`select public.authorize_web_outbound('${next.id}','${next.lease_owner}','${next.lease_token}');`));
        if (authorized.action === "visible" && typeof authorized.text === "string" && authorized.text.includes("/order-confirmation/")) authorizedText = authorized.text;
      }
      expect(authorizedText).toContain("/order-confirmation/");
      const listed = await createWebsiteMessagesRoute({
        rpc: async (name) => name === "read_website_session"
          ? { data: { ok: true, organizationId: fixtureOrg, channelUserKey: sender }, error: null }
          : { data: null, error: { code: "42883" } },
        async listPublicMessages() {
          const inboundRows = JSON.parse(psql(`select coalesce(json_agg(json_build_object('id',id,'kind',kind,'text',data->>'text','receivedAt',received_at) order by received_at,id),'[]') from public.web_inbound_events where organization_id='${fixtureOrg}' and sender_key='${sender}';`)) as Array<Record<string, unknown>>;
          const replyRows = JSON.parse(psql(`select coalesce(json_agg(json_build_object('id',id,'kind',kind,'text',text,'receivedAt',created_at) order by created_at,id),'[]') from public.web_outbound where organization_id='${fixtureOrg}' and status='VISIBLE';`)) as Array<Record<string, unknown>>;
          return { messages: [...inboundRows, ...replyRows], status: psql(`select status from public.conversations where organization_id='${fixtureOrg}' and channel='WEB';`), hasMore: false };
        },
      }, { origin }).GET(new Request(`${origin}/api/chat/messages`, { headers: { cookie: `${WEBSITE_SESSION_COOKIE}=${createWebsiteSessionToken(() => Buffer.alloc(32, 60)).token}` } }));
      expect(listed.status).toBe(200);
      const chat = await listed.json() as { messages: Array<{ text: string; direction: string }> };
      expect(chat.messages.some((row) => row.direction === "outbound" && row.text.includes("/order-confirmation/"))).toBe(true);

      const orderCode = psql(`select id from public.orders where organization_id='${fixtureOrg}';`);
      const statusClaimText = `Tra cứu đơn ${orderCode} số 0900000060`;
      psql(`select public.ingest_web_event('${fixtureOrg}','{"providerKey":"message:ov060-status","senderKey":"${sender}","kind":"message","eventTimeMs":${Date.now() + 2},"data":{"text":"${statusClaimText}"}}');`);
      const statusClaim = JSON.parse(psql(`select public.claim_consultation_job('${owner}','${fixtureOrg}');`));
      const statusHandler = createConsultationHandler({
        context: () => ({
          organizationId: statusClaim.organizationId, text: statusClaimText, history: [], introduce: false,
          conversationId: statusClaim.conversationId, revision: statusClaim.revision,
        }),
        finish: async (claimedJob, outcome) => {
          const payload = JSON.stringify(outcome).replaceAll("'", "''");
          const ok = psql(`select public.finish_consultation('${claimedJob.id}','${claimedJob.lease_owner}','${claimedJob.lease_token}','${payload}'::jsonb);`);
          if (ok !== "t") throw Error("consultation_finish_rejected");
        },
      }, {
        ai: classify("order_status"),
        lookup: noLookup(),
        confirmation: { rpc: (name, args) => namedRpc(name, args) },
        statusLookup: { rpc: (name, args) => namedRpc(name, args) },
        origin,
      });
      await statusHandler(statusClaim.job, new AbortController().signal);
      const statusText = psql(`select candidate->>'text' from public.consultation_receipts where event_id='${statusClaim.job.entity_id}';`);
      expect(statusText).toContain("/order-status/");
      const statusHash = psql(`select token_hash from public.order_confirmation_tokens where organization_id='${fixtureOrg}' and purpose='status';`);
      expect(psql(`select public.read_order_confirmation('${statusHash}') is null;`)).toBe("t");
      expect(psql(`select public.read_order_status('${statusHash}') is not null;`)).toBe("t");
      psql(`select public.ingest_web_event('${fixtureOrg}','{"providerKey":"message:ov060-wrong","senderKey":"${sender}","kind":"message","eventTimeMs":${Date.now() + 3},"data":{"text":"Tra cứu ${orderCode} 09000000999"}}');`);
      const wrongClaim = JSON.parse(psql(`select public.claim_consultation_job('${owner}','${fixtureOrg}');`));
      const wrongHandler = createConsultationHandler({
        context: () => ({
          organizationId: wrongClaim.organizationId, text: `Tra cứu ${orderCode} 09000000999`, history: [], introduce: false,
          conversationId: wrongClaim.conversationId, revision: wrongClaim.revision,
        }),
        finish: async (claimedJob, outcome) => {
          const payload = JSON.stringify(outcome).replaceAll("'", "''");
          const ok = psql(`select public.finish_consultation('${claimedJob.id}','${claimedJob.lease_owner}','${claimedJob.lease_token}','${payload}'::jsonb);`);
          if (ok !== "t") throw Error("consultation_finish_rejected");
        },
      }, {
        ai: classify("order_status"),
        lookup: noLookup(),
        confirmation: { rpc: (name, args) => namedRpc(name, args) },
        statusLookup: { rpc: (name, args) => namedRpc(name, args) },
        origin,
      });
      await wrongHandler(wrongClaim.job, new AbortController().signal);
      expect(psql(`select candidate->>'text' from public.consultation_receipts where event_id='${wrongClaim.job.entity_id}';`)).toBe(UNVERIFIED_TEXT);

      psql(`select public.ingest_web_event('${fixtureOrg}','{"providerKey":"message:ov060-handoff","senderKey":"${sender}","kind":"message","eventTimeMs":${Date.now() + 4},"data":{"text":"Cho toi gap nhan vien"}}');`);
      const handoffClaim = JSON.parse(psql(`select public.claim_consultation_job('${owner}','${fixtureOrg}');`));
      const handoffHandler = createConsultationHandler({
        context: () => ({
          organizationId: handoffClaim.organizationId, text: "Cho tôi gặp nhân viên", history: [], introduce: false,
          conversationId: handoffClaim.conversationId, revision: handoffClaim.revision,
        }),
        finish: async (claimedJob, outcome) => {
          const payload = JSON.stringify(outcome).replaceAll("'", "''");
          const ok = psql(`select public.finish_consultation('${claimedJob.id}','${claimedJob.lease_owner}','${claimedJob.lease_token}','${payload}'::jsonb);`);
          if (ok !== "t") throw Error("consultation_finish_rejected");
        },
      }, {
        ai: classify("order_status"),
        lookup: noLookup(),
        confirmation: { rpc: (name, args) => namedRpc(name, args) },
        statusLookup: { rpc: async () => { throw Error("must not verify after handoff request"); } },
        origin,
      });
      await handoffHandler(handoffClaim.job, new AbortController().signal);
      expect(psql(`select status from public.conversations where organization_id='${fixtureOrg}' and channel='WEB';`)).toBe("WAITING_STAFF");
      expect(psql(`select candidate->>'type' from public.consultation_receipts where event_id='${handoffClaim.job.entity_id}';`)).toBe("handoff_ack");
      psql(`select public.ingest_web_event('${fixtureOrg}','{"providerKey":"message:ov060-after","senderKey":"${sender}","kind":"message","eventTimeMs":${Date.now() + 5},"data":{"text":"van muon dat"}}');`);
      const afterRaw = psql(`select coalesce(to_json(public.claim_consultation_job('${owner}','${fixtureOrg}')),'null');`);
      expect(JSON.parse(afterRaw)).toBeNull();
      expect(psql(`select count(*) from public.messenger_outbox where organization_id='${fixtureOrg}';`)).toBe("0");
    } finally {
      sweep(fixtureOrg);
    }
  }, 30000);
});
