// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CONFIRMATION_TTL_MS,
  collectCheckoutRoute,
  confirmationUrl,
  createCheckoutCollection,
  createConfirmationService,
  createConfirmationToken,
  createShippingSettingsService,
  hashConfirmationToken,
  missingCollectionField,
  readConfirmedQuote,
  type ConfirmationPort,
} from "./confirmation";
import { consult } from "@/lib/consultation/planner";

const org = "a2100000-0000-4000-8000-000000000001";
const owner = "a2100000-0000-4000-8000-000000000002";
const conversation = "a2100000-0000-4000-8000-000000000003";
const product = "a2100000-0000-4000-8000-000000000004";
const variant = "a2100000-0000-4000-8000-000000000005";
const parentProduct = "a2100000-0000-4000-8000-000000000006";
const request = "a2100000-0000-4000-8000-000000000010";
const origin = "http://localhost:3000";
const address = { line1: "12 Test", ward: null, district: null, province: "Hà Nội", countryCode: "VN" };
const complete = {
  buyerName: "Nguyen Van A",
  phone: "+84900000021",
  address,
  items: [{ productId: parentProduct, variantId: null, quantity: 1 }],
};

function tokenOf(seed: number) {
  const bytes = Buffer.alloc(32, seed);
  return createConfirmationToken(() => bytes);
}

function fakePort(initial?: { fee?: number | null; writes?: { count: number } }) {
  const writes = initial?.writes ?? { count: 0 };
  const catalog = new Map<string, { price: number; version: number; sku: string; name: string; variant?: boolean }>([
    [parentProduct, { price: 100000, version: 1, sku: "PARENT-1", name: "Fixture parent" }],
    [`${product}:${variant}`, { price: 250000, version: 1, sku: "VAR-1", name: "Fixture / Variant", variant: true }],
  ]);
  const shipping = { fee: initial?.fee === undefined ? 20000 : initial.fee, revision: initial?.fee == null ? 1 : 1 };
  const orders = new Map<string, {
    organizationId: string; ownerId: string; conversationId: string; revision: number;
    document: typeof complete; subtotal: number; shippingFee: number | null; shippingRevision: number | null;
    total: number | null; fulfilment: string; payment: string; items: Array<{ productId: string; variantId: string | null; quantity: number; unitPriceVnd: number; productVersion: number; sku: string; name: string }>;
  }>();
  const tokens = new Map<string, { orderId: string; expiresAt: number; purpose: string }>();
  const quotes = new Map<string, { orderId: string; revision: number; requestId: string; quote: Record<string, unknown> }>();
  const drafts = new Map<string, unknown>();
  function line(item: { productId: string; variantId: string | null; quantity: number }) {
    const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
    const row = catalog.get(key);
    if (!row) throw Object.assign(Error("ORDER_PRODUCT_UNAVAILABLE"), { code: "22023" });
    if (item.variantId == null && catalog.has(`${item.productId}:${variant}`) && item.productId === product) throw Object.assign(Error("ORDER_VARIANT_REQUIRED"), { code: "22023" });
    return { ...item, unitPriceVnd: row.price, productVersion: row.version, sku: row.sku, name: row.name };
  }
  function quoteOf(orderId: string) {
    const order = orders.get(orderId)!;
    return {
      orderId, organizationId: order.organizationId, revision: order.revision, currency: "VND",
      buyerName: order.document.buyerName, phone: order.document.phone, address: order.document.address,
      subtotalVnd: order.subtotal, shippingFeeVnd: order.shippingFee, shippingRevision: order.shippingRevision, totalVnd: order.total,
      fulfilmentStatus: order.fulfilment, paymentStatus: order.payment, checkoutFrozenAt: null,
      items: order.items.map((item) => ({ ...item, lineTotalVnd: item.unitPriceVnd * item.quantity })),
    };
  }
  function requote(orderId: string) {
    const order = orders.get(orderId)!;
    const items = order.document.items.map(line);
    const subtotal = items.reduce((sum, item) => sum + item.unitPriceVnd * item.quantity, 0);
    const shippingFee = shipping.fee;
    const total = shippingFee == null ? null : subtotal + shippingFee;
    const changed = items.some((item, i) => item.unitPriceVnd !== order.items[i]?.unitPriceVnd || item.productVersion !== order.items[i]?.productVersion)
      || order.shippingFee !== shippingFee || order.shippingRevision !== shipping.revision;
    if (changed) {
      writes.count++;
      order.revision += 1;
      order.items = items;
      order.subtotal = subtotal;
      order.shippingFee = shippingFee;
      order.shippingRevision = shipping.revision;
      order.total = total;
    }
    return changed;
  }
  const rpc: ConfirmationPort["rpc"] = async (name, args) => {
    try {
      if (name === "issue_order_confirmation_token") {
        writes.count++;
        const document = args.p_document as typeof complete;
        const missing = missingCollectionField(document);
        if (missing) return { data: null, error: { code: "22023" } };
        const existing = [...orders.entries()].find(([, row]) => row.conversationId === args.p_conversation_id);
        const orderId = existing?.[0] ?? String(args.p_order_id);
        const items = document.items.map(line);
        const subtotal = items.reduce((sum, item) => sum + item.unitPriceVnd * item.quantity, 0);
        const shippingFee = shipping.fee;
        orders.set(orderId, {
          organizationId: String(args.p_organization_id), ownerId: String(args.p_owner_id), conversationId: String(args.p_conversation_id),
          revision: (existing?.[1].revision ?? 0) + 1, document, subtotal, shippingFee, shippingRevision: shipping.revision,
          total: shippingFee == null ? null : subtotal + shippingFee, fulfilment: "DRAFT", payment: "UNPAID", items,
        });
        tokens.set(String(args.p_token_hash), { orderId, expiresAt: Date.parse(String(args.p_expires_at)), purpose: "confirmation" });
        return { data: { orderId, revision: orders.get(orderId)!.revision, expiresAt: args.p_expires_at }, error: null };
      }
      if (name === "read_order_confirmation") {
        const token = tokens.get(String(args.p_token_hash));
        if (!token || token.purpose !== "confirmation" || token.expiresAt <= (args.p_now ? Date.parse(String(args.p_now)) : Date.now())) return { data: null, error: null };
        return { data: quoteOf(token.orderId), error: null };
      }
      if (name === "save_customer_order_draft") {
        writes.count++;
        const token = tokens.get(String(args.p_token_hash));
        if (!token || token.expiresAt <= 1_000) return { data: null, error: null };
        const document = args.p_document as typeof complete;
        const order = orders.get(token.orderId)!;
        const items = document.items.map(line);
        const subtotal = items.reduce((sum, item) => sum + item.unitPriceVnd * item.quantity, 0);
        order.revision += 1;
        order.document = document;
        order.items = items;
        order.subtotal = subtotal;
        order.shippingFee = shipping.fee;
        order.shippingRevision = shipping.revision;
        order.total = shipping.fee == null ? null : subtotal + shipping.fee;
        drafts.set(String(args.p_request_id), quoteOf(token.orderId));
        return { data: quoteOf(token.orderId), error: null };
      }
      if (name === "confirm_order_quote") {
        const token = tokens.get(String(args.p_token_hash));
        if (!token || token.expiresAt <= 1_000) return { data: null, error: null };
        if (!orders.get(token.orderId)) return { data: null, error: null };
        if (shipping.fee == null) return { data: { status: "blocked", code: "ORDER_SHIPPING_UNKNOWN", quote: quoteOf(token.orderId) }, error: null };
        requote(token.orderId);
        const current = quoteOf(token.orderId);
        const expected = args.p_expected_quote as { orderVersion: number; subtotalVnd: number; shippingFeeVnd: number | null; totalVnd: number | null };
        if (expected.orderVersion !== current.revision || expected.subtotalVnd !== current.subtotalVnd || expected.shippingFeeVnd !== current.shippingFeeVnd || expected.totalVnd !== current.totalVnd) {
          return { data: { status: "changed", quote: current }, error: null };
        }
        const prior = [...quotes.values()].find((row) => row.orderId === token.orderId && row.revision === current.revision);
        if (prior) return { data: { status: "confirmed", quote: prior.quote }, error: null };
        writes.count++;
        quotes.set(String(args.p_request_id), { orderId: token.orderId, revision: current.revision, requestId: String(args.p_request_id), quote: current });
        return { data: { status: "confirmed", quote: current }, error: null };
      }
      if (name === "read_confirmed_order_quote") {
        const order = orders.get(String(args.p_order_id));
        if (!order || order.organizationId !== args.p_organization_id) return { data: null, error: null };
        const match = [...quotes.values()].find((row) => row.orderId === args.p_order_id && row.revision === order.revision);
        return { data: match?.quote ?? null, error: null };
      }
      if (name === "save_order_shipping_settings") {
        writes.count++;
        if (args.p_role !== "manager") return { data: null, error: { code: "42501" } };
        shipping.fee = args.p_flat_fee_vnd as number;
        shipping.revision += 1;
        return { data: { revision: shipping.revision, flatFeeVnd: shipping.fee }, error: null };
      }
      if (name === "read_order_shipping_settings") {
        return { data: { revision: shipping.revision, flatFeeVnd: shipping.fee }, error: null };
      }
      return { data: null, error: { code: "42883" } };
    } catch (error) {
      return { data: null, error: { code: (error as { code?: string }).code ?? "XX000" } };
    }
  };
  return { rpc, writes, catalog, shipping, orders, quotes, bumpPrice(id: string, price: number) { const row = catalog.get(id)!; catalog.set(id, { ...row, price, version: row.version + 1 }); } };
}

describe("AT-021-01 collection refuses incomplete checkout", () => {
  it.each([
    ["buyerName", { ...complete, buyerName: "" }],
    ["phone", { ...complete, phone: "call me" }],
    ["address", { ...complete, address: { ...address, line1: " " } }],
    ["quantity", { ...complete, items: [{ productId: parentProduct, variantId: null, quantity: 0 }] }],
    ["variant", { ...complete, items: [{ productId: product, variantId: null, quantity: 1, requiresVariant: true }] }],
  ])("missing %s does not issue a link", async (field, document) => {
    expect(missingCollectionField(document)).toBe(field);
    const port = fakePort();
    const collection = createCheckoutCollection(port, { organizationId: org, ownerId: owner, conversationId: conversation, origin, now: () => 1_000 });
    const result = await collection.collect(document, request);
    expect(result).toMatchObject({ ok: false, field });
    expect(port.writes.count).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/\+849|Nguyen|12 Test/);
  });
  it("complete collection issues an opaque path token without PII", async () => {
    const bytes = Buffer.alloc(32, 7);
    const collection = createCheckoutCollection(fakePort(), { organizationId: org, ownerId: owner, conversationId: conversation, origin, now: () => 1_000, random: () => bytes });
    const result = await collection.collect(complete, request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe(`${origin}/order-confirmation/${bytes.toString("base64url")}`);
    expect(result.url).not.toContain("?");
    expect(result.url).not.toContain(complete.phone);
    expect(result.url).not.toContain(complete.buyerName);
    expect(result.expiresAt).toBe(new Date(1_000 + CONFIRMATION_TTL_MS).toISOString());
  });
});

describe("AT-021-02 GET is read-only and generic on bad tokens", () => {
  it("GET does not mutate and never returns another order or raw token", async () => {
    const issued = tokenOf(9);
    const port = fakePort();
    const collection = createCheckoutCollection(port, { organizationId: org, ownerId: owner, conversationId: conversation, origin, now: () => 1_000, random: () => Buffer.alloc(32, 9) });
    await collection.collect(complete, request);
    const writes = port.writes.count;
    const service = createConfirmationService(port, { origin, now: () => 1_000 });
    const view = await service.read(issued.token);
    expect(view.ok).toBe(true);
    expect(port.writes.count).toBe(writes);
    const expired = createConfirmationService(port, { origin, now: () => 1_000 + CONFIRMATION_TTL_MS + 1 });
    const bad = [
      await service.read("not-a-token"),
      await service.read(tokenOf(3).token),
      await expired.read(issued.token),
    ];
    for (const result of bad) {
      expect(result).toEqual({ ok: false, code: "LINK_UNAVAILABLE" });
      expect(JSON.stringify(result)).not.toMatch(/Nguyen|\+849|a2100000/);
    }
  });
});

describe("AT-021-03 confirm is idempotent and edits invalidate", () => {
  it("double POST keeps one confirmed revision; later edit drops the old quote", async () => {
    const issued = tokenOf(11);
    const port = fakePort();
    await createCheckoutCollection(port, { organizationId: org, ownerId: owner, conversationId: conversation, origin, now: () => 1_000, random: () => Buffer.alloc(32, 11) }).collect(complete, request);
    const service = createConfirmationService(port, { origin, now: () => 1_000 });
    const viewed = await service.read(issued.token);
    expect(viewed.ok).toBe(true);
    if (!viewed.ok) return;
    const first = await service.confirm(issued.token, { requestId: request, orderVersion: viewed.quote.revision, subtotalVnd: viewed.quote.subtotalVnd, shippingFeeVnd: viewed.quote.shippingFeeVnd, totalVnd: viewed.quote.totalVnd });
    const second = await service.confirm(issued.token, { requestId: request, orderVersion: viewed.quote.revision, subtotalVnd: viewed.quote.subtotalVnd, shippingFeeVnd: viewed.quote.shippingFeeVnd, totalVnd: viewed.quote.totalVnd });
    expect(first).toMatchObject({ ok: true, status: "confirmed" });
    expect(second).toEqual(first);
    if (!first.ok || first.status !== "confirmed") return;
    expect(first.quote.fulfilmentStatus).toBe("DRAFT");
    expect(first.quote.paymentStatus).toBe("UNPAID");
    expect(await readConfirmedQuote(port, org, first.quote.orderId)).toMatchObject({ revision: viewed.quote.revision });
    const saved = await service.save(issued.token, { ...complete, buyerName: "Updated Buyer", items: complete.items }, "a2100000-0000-4000-8000-000000000011");
    expect(saved.ok).toBe(true);
    expect(await readConfirmedQuote(port, org, first.quote.orderId)).toBeNull();
  });
});

describe("AT-021-04 requote, null shipping, manager-only fee", () => {
  it("price change requires reconfirm; null fee is blocked; staff cannot patch shipping", async () => {
    const issued = tokenOf(13);
    const port = fakePort({ fee: null });
    await createCheckoutCollection(port, { organizationId: org, ownerId: owner, conversationId: conversation, origin, now: () => 1_000, random: () => Buffer.alloc(32, 13) }).collect(complete, request);
    const service = createConfirmationService(port, { origin, now: () => 1_000 });
    const viewed = await service.read(issued.token);
    expect(viewed.ok).toBe(true);
    if (!viewed.ok) return;
    expect(viewed.quote.shippingFeeVnd).toBeNull();
    expect(viewed.quote.totalVnd).toBeNull();
    const blocked = await service.confirm(issued.token, { requestId: request, orderVersion: viewed.quote.revision, subtotalVnd: viewed.quote.subtotalVnd, shippingFeeVnd: 0, totalVnd: viewed.quote.subtotalVnd });
    expect(blocked).toMatchObject({ ok: true, status: "blocked", code: "ORDER_SHIPPING_UNKNOWN" });
    const staff = createShippingSettingsService(port, { userId: owner, organizationId: org, role: "staff", displayName: "Staff" });
    await expect(staff.save({ requestId: request, expectedRevision: 1, flatFeeVnd: 0 })).rejects.toThrow("ORDER_FORBIDDEN");
    const manager = createShippingSettingsService(port, { userId: owner, organizationId: org, role: "manager", displayName: "Manager" });
    expect(await manager.save({ requestId: request, expectedRevision: 1, flatFeeVnd: 20000 })).toMatchObject({ flatFeeVnd: 20000 });
    const refreshed = await service.read(issued.token);
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    port.bumpPrice(parentProduct, 130000);
    const changed = await service.confirm(issued.token, { requestId: "a2100000-0000-4000-8000-000000000012", orderVersion: refreshed.quote.revision, subtotalVnd: refreshed.quote.subtotalVnd, shippingFeeVnd: 20000, totalVnd: (refreshed.quote.subtotalVnd ?? 0) + 20000 });
    expect(changed).toMatchObject({ ok: true, status: "changed" });
    if (!changed.ok || changed.status !== "changed") return;
    const confirmed = await service.confirm(issued.token, { requestId: "a2100000-0000-4000-8000-000000000013", orderVersion: changed.quote.revision, subtotalVnd: changed.quote.subtotalVnd, shippingFeeVnd: changed.quote.shippingFeeVnd, totalVnd: changed.quote.totalVnd });
    expect(confirmed).toMatchObject({ ok: true, status: "confirmed" });
  });
});

describe("consultation checkout collection wiring", () => {
  it("asks the missing field and does not invent a SKU or URL", async () => {
    const checkout = { collect: vi.fn() };
    const outcome = await collectCheckoutRoute({ organizationId: org, conversationId: conversation, revision: 1, text: "Tôi đặt máy này", history: [] }, checkout);
    expect(outcome).toMatchObject({ type: "route", route: "checkout", field: "items" });
    expect(outcome.confirmationUrl).toBeUndefined();
    expect(checkout.collect).not.toHaveBeenCalled();
  });
  it("planner checkout with a collection port keeps route type and opaque URL", async () => {
    const bytes = Buffer.alloc(32, 21);
    const port = fakePort();
    const checkout = createCheckoutCollection(port, { organizationId: org, ownerId: owner, conversationId: conversation, origin, now: () => 1_000, random: () => bytes });
    const result = await consult(
      {
        organizationId: org, conversationId: conversation, revision: 1, introduce: false,
        text: "Đặt 1 cái. Tên tôi là Nguyen Van A. SĐT +84900000021. Địa chỉ: 12 Test, Hà Nội",
        history: [{ text: "SKU PARENT-1", decision: { catalogItems: [{ productId: parentProduct, variantId: null, sku: "PARENT-1", name: "Fixture parent" }] } }],
      },
      { ai: { generateText: async () => ({ text: '{"intent":"checkout"}', model: "fixture" }) }, lookup: async () => { throw Error("unused"); }, checkout },
      new AbortController().signal,
    );
    expect(result.type).toBe("route");
    expect(result.route).toBe("checkout");
    expect(result.confirmationUrl).toBe(`${origin}/order-confirmation/${bytes.toString("base64url")}`);
    expect(result.text).toContain("/order-confirmation/");
    expect(result.confirmationUrl).not.toContain(complete.phone);
  });
});

describe("token encoding", () => {
  it("hashes 32 random bytes and never puts the secret in query string", () => {
    const raw = randomBytes(32);
    const issued = createConfirmationToken(() => raw);
    expect(issued.token).toBe(raw.toString("base64url"));
    expect(issued.hash).toBe(createHash("sha256").update(issued.token).digest("hex"));
    expect(hashConfirmationToken(issued.token)).toBe(issued.hash);
    expect(confirmationUrl(origin, issued.token)).not.toContain("?");
  });
});
