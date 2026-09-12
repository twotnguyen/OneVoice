// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { draftOrderSchema, createStaffOrdersRepository, createAutomationOrdersRepository, type OrdersPort } from "./repository";
const uuid = "a0000000-0000-4000-8000-000000000001";
const draft = { orderId: uuid, requestId: uuid, expectedRevision: 0, document: { buyerName: "Test Buyer", phone: "+84900000000", address: { line1: "Test street", ward: null, district: null, province: "Test city", countryCode: "VN" }, items: [{ productId: uuid, variantId: null, quantity: 2 }] } };
describe("native draft order boundary", () => {
  it("accepts incomplete drafts but never client prices or fees", () => {
    expect(draftOrderSchema.parse(draft).document.items[0].quantity).toBe(2);
    expect(draftOrderSchema.safeParse({ ...draft, document: { ...draft.document, shippingFeeVnd: 0 } }).success).toBe(false);
    expect(draftOrderSchema.safeParse({ ...draft, document: { ...draft.document, items: [{ ...draft.document.items[0], unitPriceVnd: 1 }] } }).success).toBe(false);
    expect(draftOrderSchema.parse({ ...draft, document: { ...draft.document, buyerName: null, phone: null, address: null } }).document.phone).toBeNull();
  });
  it.each([0, -1, 1.5, 10001])("rejects invalid quantity %s", (quantity) => {
    expect(draftOrderSchema.safeParse({ ...draft, document: { ...draft.document, items: [{ ...draft.document.items[0], quantity }] } }).success).toBe(false);
  });
  it("rejects invalid phone/address and duplicate SKUs", () => {
    expect(draftOrderSchema.safeParse({ ...draft, document: { ...draft.document, phone: "call me" } }).success).toBe(false);
    expect(draftOrderSchema.safeParse({ ...draft, document: { ...draft.document, address: { ...draft.document.address, line1: " " } } }).success).toBe(false);
    expect(draftOrderSchema.safeParse({ ...draft, document: { ...draft.document, items: [draft.document.items[0], draft.document.items[0]] } }).success).toBe(false);
  });
  it("staff adapter supplies verified actor and scope separately from draft data", async () => {
    const rpc = vi.fn<OrdersPort["rpc"]>(async () => ({ data: { orderId: uuid, revision: 1 }, error: null }));
    const repository = createStaffOrdersRepository({ rpc }, { userId: uuid, organizationId: uuid, role: "staff", displayName: "Test" });
    expect(await repository.save(draft)).toEqual({ orderId: uuid, revision: 1 });
    expect(rpc.mock.calls[0]?.[0]).toBe("save_staff_order_draft");
  });
  it("automation adapter binds a workflow owner instead of forging staff", async () => {
    const rpc = vi.fn<OrdersPort["rpc"]>(async () => ({ data: { orderId: uuid, revision: 1 }, error: null }));
    const repository = createAutomationOrdersRepository({ rpc }, { organizationId: uuid, ownerId: uuid, conversationId: null });
    await repository.save(draft);
    expect(rpc.mock.calls[0]?.[0]).toBe("save_automation_order_draft");
  });
  it("maps database conflicts without exposing PII or database errors", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "40001", message: "private address" } }));
    const repository = createStaffOrdersRepository({ rpc }, { userId: uuid, organizationId: uuid, role: "staff", displayName: "Test" });
    await expect(repository.save(draft)).rejects.toThrow("ORDER_CONFLICT");
  });
  it("reports a frozen draft without allowing another write", async () => {
    const rpc = vi.fn<OrdersPort["rpc"]>(async () => ({ data: null, error: { code: "55000" } }));
    await expect(createStaffOrdersRepository({ rpc }, { userId: uuid, organizationId: uuid, role: "staff", displayName: "Test" }).save(draft)).rejects.toThrow("ORDER_FROZEN");
  });
});
