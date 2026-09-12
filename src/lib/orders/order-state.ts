// SPDX-License-Identifier: Apache-2.0
/** Pure rules only: persistence must atomically reserve/release stock and deduplicate
 * payments in the integration layer. This module performs no authentication,
 * gateway signature verification, refunds, cancellation approval, or stock writes.
 */
export const RESERVATION_DURATION_MS = 900_000;

export type FulfilmentStatus = "DRAFT" | "AWAITING_PAYMENT" | "PREPARING" | "DELIVERING" | "DELIVERED" | "EXPIRED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "FAILED" | "PAID";

export type OrderState = Readonly<{
  orderId: string;
  amountVnd: number;
  fulfilmentStatus: FulfilmentStatus;
  paymentStatus: PaymentStatus;
  reservationStartedAt: number | null;
  reservationExpiresAt: number | null;
  paidPaymentId: string | null;
  reconciliation: "NONE" | "MANUAL_REVIEW";
}>;

export type OrderCommand =
  | { type: "START_CHECKOUT"; customerConfirmed: boolean }
  | { type: "EXPIRE" }
  | { type: "PAYMENT_RETURN" }
  // Trusted server adapter must verify the callback and bind order/amount before
  // constructing this command. Its name is NOT a security or signature check.
  | { type: "VERIFIED_PAYMENT"; paymentId: string; orderId: string; amountVnd: number; successful: boolean }
  | { type: "STAFF_TRANSITION"; to: FulfilmentStatus };

export type OrderStateErrorCode = "INVALID_ORDER" | "INVALID_TIMESTAMP" | "INVALID_PAYMENT" | "CUSTOMER_CONFIRMATION_REQUIRED" | "INVALID_TRANSITION" | "PAYMENT_ORDER_MISMATCH" | "PAYMENT_AMOUNT_MISMATCH" | "PAYMENT_CONFLICT";

export class OrderStateError extends Error {
  constructor(public readonly code: OrderStateErrorCode) {
    super(code);
    this.name = "OrderStateError";
  }
}

function fail(code: OrderStateErrorCode): never {
  throw new OrderStateError(code);
}

function validTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createDraftOrder(orderId: string, amountVnd: number): OrderState {
  if (!orderId.trim() || !Number.isSafeInteger(amountVnd) || amountVnd <= 0) fail("INVALID_ORDER");
  return Object.freeze({ orderId, amountVnd, fulfilmentStatus: "DRAFT", paymentStatus: "UNPAID", reservationStartedAt: null, reservationExpiresAt: null, paidPaymentId: null, reconciliation: "NONE" });
}

/** Clock is explicitly injected; receipt time, not a gateway-supplied timestamp,
 * decides expiry. Staff authorization and customer confirmation provenance are
 * enforced by later server adapters, never by a caller-controlled command alone.
 */
export function applyOrderCommand(state: OrderState, command: OrderCommand, clock: () => number): OrderState {
  const now = clock();
  if (!validTimestamp(now)) fail("INVALID_TIMESTAMP");
  const { reservationStartedAt: start, reservationExpiresAt: expiry } = state;
  if (start !== null || expiry !== null) {
    if (start === null || expiry === null || !validTimestamp(start) || !validTimestamp(expiry) || expiry - start !== RESERVATION_DURATION_MS || now < start) fail("INVALID_TIMESTAMP");
  } else if (state.fulfilmentStatus === "AWAITING_PAYMENT") {
    fail("INVALID_TIMESTAMP");
  }

  const expired = state.fulfilmentStatus === "AWAITING_PAYMENT" && expiry !== null && now >= expiry;
  const expire = (): OrderState => Object.freeze({ ...state, fulfilmentStatus: expired ? "EXPIRED" : state.fulfilmentStatus });

  switch (command.type) {
    case "START_CHECKOUT":
      if (command.customerConfirmed !== true) fail("CUSTOMER_CONFIRMATION_REQUIRED");
      if (state.fulfilmentStatus !== "DRAFT" || state.paymentStatus !== "UNPAID") fail("INVALID_TRANSITION");
      if (!validTimestamp(now + RESERVATION_DURATION_MS)) fail("INVALID_TIMESTAMP");
      return Object.freeze({ ...state, fulfilmentStatus: "AWAITING_PAYMENT", reservationStartedAt: now, reservationExpiresAt: now + RESERVATION_DURATION_MS });
    case "EXPIRE":
    case "PAYMENT_RETURN":
      return expire();
    case "VERIFIED_PAYMENT": {
      if (!command.paymentId.trim() || typeof command.successful !== "boolean") fail("INVALID_PAYMENT");
      if (command.orderId !== state.orderId) fail("PAYMENT_ORDER_MISMATCH");
      if (command.amountVnd !== state.amountVnd) fail("PAYMENT_AMOUNT_MISMATCH");
      if (state.paymentStatus === "PAID") {
        if (!command.successful || command.paymentId === state.paidPaymentId) return Object.freeze({ ...state });
        fail("PAYMENT_CONFLICT");
      }
      if (!["AWAITING_PAYMENT", "EXPIRED", "CANCELLED"].includes(state.fulfilmentStatus)) fail("INVALID_TRANSITION");
      const current = expire();
      if (!command.successful) return Object.freeze({ ...current, paymentStatus: "FAILED" });
      const canPrepare = current.fulfilmentStatus === "AWAITING_PAYMENT";
      return Object.freeze({ ...current, paymentStatus: "PAID", paidPaymentId: command.paymentId, fulfilmentStatus: canPrepare ? "PREPARING" : current.fulfilmentStatus, reconciliation: canPrepare ? "NONE" : "MANUAL_REVIEW" });
    }
    case "STAFF_TRANSITION": {
      const allowed = (state.fulfilmentStatus === "PREPARING" && command.to === "DELIVERING") || (state.fulfilmentStatus === "DELIVERING" && command.to === "DELIVERED");
      if (!allowed || state.paymentStatus !== "PAID" || state.reconciliation !== "NONE") fail("INVALID_TRANSITION");
      return Object.freeze({ ...state, fulfilmentStatus: command.to });
    }
    default:
      return fail("INVALID_TRANSITION");
  }
}
