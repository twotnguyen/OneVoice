// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffSession } from "@/lib/auth/session";
import { applyOrderCommand, createDraftOrder } from "./order-state";
import {
  acknowledgeCommandSchema, canStaffTransition, createOrderOperationsRepository, nextFulfilmentStatus,
  omitInternalNotes, staffOrderPageSchema, transitionCommandSchema, type OperationsPort,
} from "./operations";

const uuid = "a2500000-0000-4000-8000-000000000001";
const actor: StaffSession = { userId: uuid, organizationId: uuid, role: "staff", displayName: "Fixture" };
const paid = { fulfilmentStatus: "PREPARING" as const, paymentStatus: "PAID" as const, reconciliation: "NONE" as const };
const listRow = {
  orderId: uuid, revision: 2, buyerName: "Buyer", phone: "+84900000025", totalVnd: 120000, currency: "VND",
  fulfilmentStatus: "PREPARING", paymentStatus: "PAID", reconciliation: "NONE", trackingRef: null,
  customerVisibleProgress: "", updatedAt: "2026-09-13T00:00:00Z",
};
const transition = { expectedVersion: 2, to: "DELIVERING" as const, requestId: uuid, trackingRef: "OV25TRACK", customerVisibleProgress: "Đã bàn giao vận chuyển", internalNote: "SECRET_NOTE" };

describe("AT-025-01 illegal transitions and CAS", () => {
  it("rejects UNPAID shipping, skips, and backwards moves", () => {
    expect(canStaffTransition({ ...paid, paymentStatus: "UNPAID" }, "DELIVERING")).toBe(false);
    expect(canStaffTransition({ ...paid, fulfilmentStatus: "AWAITING_PAYMENT" }, "DELIVERING")).toBe(false);
    expect(canStaffTransition(paid, "DELIVERED")).toBe(false);
    expect(canStaffTransition({ ...paid, fulfilmentStatus: "DELIVERING" }, "PREPARING")).toBe(false);
    expect(canStaffTransition({ ...paid, fulfilmentStatus: "DELIVERED" }, "DELIVERING")).toBe(false);
    expect(canStaffTransition({ ...paid, reconciliation: "MANUAL_REVIEW" }, "DELIVERING")).toBe(false);
    expect(() => applyOrderCommand({ ...createDraftOrder("order-1", 150000), ...paid, paidPaymentId: "payment-1" }, { type: "STAFF_TRANSITION", to: "DELIVERING" }, () => 3000)).not.toThrow();
  });
  it("maps a stale expectedVersion to one CAS winner", async () => {
    const rpc = vi.fn<OperationsPort["rpc"]>()
      .mockResolvedValueOnce({ data: { orderId: uuid, revision: 3, fulfilmentStatus: "DELIVERING" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    const repo = createOrderOperationsRepository({ rpc }, actor);
    expect(await repo.transition(uuid, transition)).toEqual({ orderId: uuid, revision: 3, fulfilmentStatus: "DELIVERING" });
    await expect(repo.transition(uuid, { ...transition, requestId: "b2500000-0000-4000-8000-000000000001" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("AT-025-02 staff cannot change totals or paid; inactive and cross-org", () => {
  it("rejects totals, paid, catalog, and policy fields on the transition command", () => {
    expect(transitionCommandSchema.parse(transition).to).toBe("DELIVERING");
    for (const patch of [{ totalVnd: 1 }, { paymentStatus: "PAID" }, { subtotalVnd: 1 }, { catalogId: uuid }, { policy: "x" }, { actorId: uuid }, { organizationId: uuid }, { to: "SHIPPING" }, { to: "PREPARING" }]) {
      expect(transitionCommandSchema.safeParse({ ...transition, ...patch }).success).toBe(false);
    }
  });
  it("binds verified actor scope and maps inactive or foreign membership", async () => {
    const rpc = vi.fn<OperationsPort["rpc"]>().mockResolvedValue({ data: null, error: { code: "42501" } });
    const repo = createOrderOperationsRepository({ rpc }, actor);
    await expect(repo.list({ status: "PREPARING", page: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_organization_id: uuid, p_actor_id: uuid });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_total_vnd");
  });
});

describe("AT-025-03 list DTO omits internal notes; empty list is empty", () => {
  it("strips internal notes from a staff list that could leak later", () => {
    const page = omitInternalNotes({ page: 1, total: 1, items: [{ ...listRow, internalNote: "SECRET_NOTE", history: [{ internalNote: "SECRET_NOTE" }] }] });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty("internalNote");
    expect(JSON.stringify(page)).not.toContain("SECRET_NOTE");
    expect(staffOrderPageSchema.safeParse({ page: 1, total: 1, items: [{ ...listRow, internalNote: "SECRET_NOTE" }] }).success).toBe(false);
  });
  it("returns an empty items array rather than fake rows", async () => {
    const rpc = vi.fn<OperationsPort["rpc"]>().mockResolvedValue({ data: { page: 1, total: 0, items: [] }, error: null });
    const page = await createOrderOperationsRepository({ rpc }, actor).list({ status: "DELIVERING", page: 1 });
    expect(page).toEqual({ page: 1, total: 0, items: [] });
    expect(page.items.some((item) => item.orderId)).toBe(false);
  });
});

describe("AT-025-04 PREPARING to DELIVERING to DELIVERED", () => {
  it("advances only the allowed fulfilment path", () => {
    const preparing = { ...createDraftOrder("order-1", 150000), ...paid, paidPaymentId: "payment-1" };
    const delivering = applyOrderCommand(preparing, { type: "STAFF_TRANSITION", to: "DELIVERING" }, () => 3000);
    const delivered = applyOrderCommand(delivering, { type: "STAFF_TRANSITION", to: "DELIVERED" }, () => 4000);
    expect(delivering.fulfilmentStatus).toBe("DELIVERING");
    expect(delivered.fulfilmentStatus).toBe("DELIVERED");
    expect(delivered.paymentStatus).toBe("PAID");
    expect(delivered.amountVnd).toBe(150000);
    expect(nextFulfilmentStatus("PREPARING")).toBe("DELIVERING");
    expect(nextFulfilmentStatus("DELIVERING")).toBe("DELIVERED");
    expect(nextFulfilmentStatus("DELIVERED")).toBeNull();
  });
  it("persists each step through the transition RPC without rewriting paid totals", async () => {
    const rpc = vi.fn<OperationsPort["rpc"]>()
      .mockResolvedValueOnce({ data: { orderId: uuid, revision: 3, fulfilmentStatus: "DELIVERING" }, error: null })
      .mockResolvedValueOnce({ data: { orderId: uuid, revision: 4, fulfilmentStatus: "DELIVERED" }, error: null });
    const repo = createOrderOperationsRepository({ rpc }, actor);
    expect(await repo.transition(uuid, transition)).toEqual({ orderId: uuid, revision: 3, fulfilmentStatus: "DELIVERING" });
    expect(await repo.transition(uuid, { ...transition, expectedVersion: 3, to: "DELIVERED", requestId: "c2500000-0000-4000-8000-000000000001" })).toEqual({ orderId: uuid, revision: 4, fulfilmentStatus: "DELIVERED" });
    expect(rpc.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ p_to: "DELIVERING", p_expected_version: 2, p_internal_note: "SECRET_NOTE" }),
      expect.objectContaining({ p_to: "DELIVERED", p_expected_version: 3 }),
    ]);
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_payment_status");
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_total_vnd");
  });
});

const state = vi.hoisted(() => {
  const rpc = vi.fn();
  return { actor: null as StaffSession | null, rpc, client: vi.fn(() => ({ rpc })) };
});
vi.mock("@/lib/auth/routes", () => ({ createAuthContext: async () => ({ session: async () => state.actor, finish: (response: Response) => response }) }));
vi.mock("@/lib/auth/config", () => ({ readAuthConfig: () => ({ origin: "https://app.test" }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseDataClient: state.client }));

import { GET, POST as postList } from "@/app/api/orders/route";
import { GET as getDetail, POST as postDetail } from "@/app/api/orders/[id]/route";

const context = { params: Promise.resolve({ id: uuid }) };
const post = (url: string, origin = "https://app.test", value: unknown = transition) => new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) });

describe("order operations HTTP boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.actor = { ...actor };
    state.rpc.mockResolvedValue({ data: { page: 1, total: 0, items: [] }, error: null });
  });
  it("rejects anonymous before composition", async () => {
    state.actor = null;
    expect((await GET(new Request("https://app.test/api/orders"))).status).toBe(401);
    expect((await postDetail(post(`https://app.test/api/orders/${uuid}`), context)).status).toBe(401);
    expect(state.client).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes and actor injection", async () => {
    expect((await postDetail(post(`https://app.test/api/orders/${uuid}`, "https://evil.test"), context)).status).toBe(403);
    expect((await postDetail(post(`https://app.test/api/orders/${uuid}`, "https://app.test", { ...transition, actorId: "forged" }), context)).status).toBe(400);
    expect((await postDetail(post(`https://app.test/api/orders/${uuid}`, "https://app.test", { ...transition, totalVnd: 1, paymentStatus: "UNPAID" }), context)).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("returns 409 when CAS loses and never invents list rows", async () => {
    expect(await (await GET(new Request("https://app.test/api/orders?status=PREPARING"))).json()).toEqual({ page: 1, total: 0, items: [] });
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    expect((await postDetail(post(`https://app.test/api/orders/${uuid}`), context)).status).toBe(409);
  });
  it("lets authorized staff transition and keeps acknowledge manager-only", async () => {
    state.rpc.mockResolvedValueOnce({ data: { orderId: uuid, revision: 3, fulfilmentStatus: "DELIVERING" }, error: null });
    expect((await postDetail(post(`https://app.test/api/orders/${uuid}`), context)).status).toBe(200);
    expect((await postList(post("https://app.test/api/orders", "https://app.test", { exceptionId: uuid, requestId: uuid }))).status).toBe(403);
    expect(acknowledgeCommandSchema.parse({ exceptionId: uuid, requestId: uuid }).exceptionId).toBe(uuid);
    state.actor = { ...actor, role: "manager" };
    state.rpc.mockResolvedValueOnce({ data: { id: uuid, acknowledgedAt: "2026-09-13T00:00:00Z" }, error: null });
    expect((await postList(post("https://app.test/api/orders", "https://app.test", { exceptionId: uuid, requestId: uuid }))).status).toBe(200);
    state.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect((await GET(new Request("https://app.test/api/orders?exceptions=true"))).status).toBe(200);
  });
  it("loads a detail record for staff", async () => {
    state.rpc.mockResolvedValueOnce({
      data: { ...listRow, internalNote: "SECRET_NOTE", items: [{ lineNumber: 1, name: "Keyboard", sku: "KB", quantity: 1, unitPriceVnd: 100000, lineTotalVnd: 100000 }], history: [] },
      error: null,
    });
    const response = await getDetail(new Request(`https://app.test/api/orders/${uuid}`), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ orderId: uuid, internalNote: "SECRET_NOTE", paymentStatus: "PAID" });
  });
});
