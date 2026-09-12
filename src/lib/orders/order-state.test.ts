// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { applyOrderCommand, createDraftOrder, type OrderState } from "./order-state";

const draft = () => createDraftOrder("order-1", 150000);
const checkout = () => applyOrderCommand(draft(), { type: "START_CHECKOUT", customerConfirmed: true }, () => 1000);
const payment = { type: "VERIFIED_PAYMENT", paymentId: "payment-1", orderId: "order-1", amountVnd: 150000, successful: true } as const;
const pay = (state = checkout(), now = 2000) => applyOrderCommand(state, payment, () => now);

describe("order reservation rules", () => {
  it("holds stock for fifteen minutes only after customer-confirmed checkout", () => {
    const original = draft();
    expect(original).toMatchObject({ fulfilmentStatus: "DRAFT", paymentStatus: "UNPAID", reservationExpiresAt: null });
    expect(() => applyOrderCommand(original, { type: "START_CHECKOUT", customerConfirmed: false }, () => 1000)).toThrow("CUSTOMER_CONFIRMATION_REQUIRED");
    expect(checkout()).toMatchObject({ fulfilmentStatus: "AWAITING_PAYMENT", reservationExpiresAt: 901000 });
    expect(original.fulfilmentStatus).toBe("DRAFT");
    expect(Object.isFrozen(checkout())).toBe(true);
  });

  it("does not extend an existing reservation on repeated checkout", () => {
    expect(() => applyOrderCommand(checkout(), { type: "START_CHECKOUT", customerConfirmed: true }, () => 2000)).toThrow("INVALID_TRANSITION");
  });

  it("expires at the exact boundary, not a millisecond earlier", () => {
    const order = checkout();
    expect(applyOrderCommand(order, { type: "EXPIRE" }, () => 900999).fulfilmentStatus).toBe("AWAITING_PAYMENT");
    expect(applyOrderCommand(order, { type: "EXPIRE" }, () => 901000).fulfilmentStatus).toBe("EXPIRED");
    expect(pay(order, 900999)).toMatchObject({ fulfilmentStatus: "PREPARING", paymentStatus: "PAID" });
  });

  it("never prepares from a return URL or a verified failed payment", () => {
    expect(applyOrderCommand(checkout(), { type: "PAYMENT_RETURN" }, () => 2000).paymentStatus).toBe("UNPAID");
    const failed = applyOrderCommand(checkout(), { ...payment, successful: false }, () => 2000);
    expect(failed).toMatchObject({ fulfilmentStatus: "AWAITING_PAYMENT", paymentStatus: "FAILED" });
    expect(pay(failed).fulfilmentStatus).toBe("PREPARING");
  });

  it.each(["AWAITING_PAYMENT", "EXPIRED", "CANCELLED"] as const)("records late successful payment on %s for manager review without fulfilment", (status) => {
    const order: OrderState = { ...checkout(), fulfilmentStatus: status };
    const result = pay(order, 901000);
    expect(result).toMatchObject({ fulfilmentStatus: status === "CANCELLED" ? "CANCELLED" : "EXPIRED", paymentStatus: "PAID", reconciliation: "MANUAL_REVIEW", paidPaymentId: "payment-1" });
    expect(pay(result, 902000)).toEqual(result);
  });

  it("keeps successful callbacks idempotent after delivery has advanced", () => {
    const delivering = applyOrderCommand(pay(), { type: "STAFF_TRANSITION", to: "DELIVERING" }, () => 3000);
    const delivered = applyOrderCommand(delivering, { type: "STAFF_TRANSITION", to: "DELIVERED" }, () => 4000);
    expect(pay(delivered, 999999)).toEqual(delivered);
    expect(applyOrderCommand(delivered, { ...payment, successful: false }, () => 999999)).toEqual(delivered);
    expect(() => applyOrderCommand(delivered, { ...payment, paymentId: "other" }, () => 5000)).toThrow("PAYMENT_CONFLICT");
  });

  it("rejects order and amount mismatches even on repeated successful callbacks", () => {
    expect(() => applyOrderCommand(checkout(), { ...payment, orderId: "order-2" }, () => 2000)).toThrow("PAYMENT_ORDER_MISMATCH");
    expect(() => applyOrderCommand(pay(), { ...payment, amountVnd: 1 }, () => 2000)).toThrow("PAYMENT_AMOUNT_MISMATCH");
    expect(() => pay(draft())).toThrow("INVALID_TRANSITION");
  });

  it.each([
    ["AWAITING_PAYMENT", "PREPARING"], ["PREPARING", "DELIVERED"],
    ["DELIVERING", "PREPARING"], ["DELIVERED", "DELIVERING"], ["EXPIRED", "PREPARING"],
  ] as const)("rejects staff transition %s to %s", (from, to) => {
    expect(() => applyOrderCommand({ ...pay(), fulfilmentStatus: from }, { type: "STAFF_TRANSITION", to }, () => 2000)).toThrow("INVALID_TRANSITION");
  });

  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER])("rejects invalid checkout time %s", (now) => {
    expect(() => applyOrderCommand(draft(), { type: "START_CHECKOUT", customerConfirmed: true }, () => now)).toThrow("INVALID_TIMESTAMP");
  });

  it("rejects a payment clock before checkout and malformed reservation timestamps", () => {
    expect(() => pay(checkout(), 999)).toThrow("INVALID_TIMESTAMP");
    expect(() => pay({ ...checkout(), reservationExpiresAt: NaN })).toThrow("INVALID_TIMESTAMP");
  });

  it("rejects invalid order identities, amounts, and payment identities", () => {
    expect(() => createDraftOrder(" ", 100)).toThrow("INVALID_ORDER");
    expect(() => createDraftOrder("order-1", 1.5)).toThrow("INVALID_ORDER");
    expect(() => applyOrderCommand(checkout(), { ...payment, paymentId: "" }, () => 2000)).toThrow("INVALID_PAYMENT");
  });

  it("returns independent frozen snapshots even for no-op commands on hydrated mutable input", () => {
    const waiting = { ...checkout() };
    for (const type of ["EXPIRE", "PAYMENT_RETURN"] as const) {
      const result = applyOrderCommand(waiting, { type }, () => 2000);
      expect(result).toEqual(waiting);
      expect(result).not.toBe(waiting);
      expect(Object.isFrozen(result)).toBe(true);
    }
    const paid = { ...pay() };
    const duplicate = pay(paid);
    expect(duplicate).toEqual(paid);
    expect(duplicate).not.toBe(paid);
    expect(Object.isFrozen(duplicate)).toBe(true);
  });
});
