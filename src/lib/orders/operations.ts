// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import type { StaffSession } from "@/lib/auth/session";
import { postgresUuid } from "@/lib/jobs/types";
import { applyOrderCommand, type FulfilmentStatus, type OrderState, type PaymentStatus } from "./order-state";

const id = postgresUuid.transform((value) => value.toLowerCase());
const amount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const note = z.string().trim().max(4000).refine((value) => !/<\/?[a-z][^>]*>/i.test(value) && ![...value].some((char) => char.charCodeAt(0) < 32 && !"\n\r\t".includes(char)), "Chỉ nhập văn bản thuần.");
export const operationalStatuses = ["PREPARING", "DELIVERING", "DELIVERED"] as const;
export type OperationalStatus = (typeof operationalStatuses)[number];
export const fulfilmentStatuses = ["DRAFT", "AWAITING_PAYMENT", "PREPARING", "DELIVERING", "DELIVERED", "EXPIRED", "CANCELLED"] as const;
const paymentStatuses = ["UNPAID", "FAILED", "PAID"] as const;
export const fulfilmentLabels: Record<OperationalStatus, string> = { PREPARING: "Chuẩn bị", DELIVERING: "Đang giao", DELIVERED: "Đã giao" };

export function nextFulfilmentStatus(from: FulfilmentStatus): Exclude<OperationalStatus, "PREPARING"> | null {
  if (from === "PREPARING") return "DELIVERING";
  if (from === "DELIVERING") return "DELIVERED";
  return null;
}

export function canStaffTransition(state: Pick<OrderState, "fulfilmentStatus" | "paymentStatus" | "reconciliation">, to: FulfilmentStatus): boolean {
  try {
    applyOrderCommand({
      orderId: "order", amountVnd: 1, fulfilmentStatus: state.fulfilmentStatus, paymentStatus: state.paymentStatus,
      reservationStartedAt: null, reservationExpiresAt: null, paidPaymentId: "payment", reconciliation: state.reconciliation,
    }, { type: "STAFF_TRANSITION", to }, () => 0);
    return true;
  } catch {
    return false;
  }
}

export const orderOperationsQuerySchema = z.strictObject({
  status: z.enum(operationalStatuses).default("PREPARING"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
const trackingRef = z.string().trim().min(1).max(80).nullable().optional();
export const transitionCommandSchema = z.strictObject({
  expectedVersion: z.number().int().min(1).max(2147483646),
  to: z.enum(["DELIVERING", "DELIVERED"]),
  requestId: id,
  trackingRef,
  customerVisibleProgress: note.optional().default(""),
  internalNote: note.optional().default(""),
});
export type TransitionCommand = z.infer<typeof transitionCommandSchema>;
export const acknowledgeCommandSchema = z.strictObject({ exceptionId: id, requestId: id });

const historyEntrySchema = z.strictObject({
  version: z.number().int().positive(), fulfilmentStatus: z.enum(operationalStatuses), trackingRef: z.string().nullable(),
  customerVisibleProgress: z.string(), internalNote: z.string(), createdAt: z.string(),
});
const listItemSchema = z.strictObject({
  orderId: id, revision: z.number().int().positive(), buyerName: z.string().nullable(), phone: z.string().nullable(),
  totalVnd: amount.nullable(), currency: z.literal("VND"), fulfilmentStatus: z.enum(fulfilmentStatuses),
  paymentStatus: z.enum(paymentStatuses), reconciliation: z.enum(["NONE", "MANUAL_REVIEW"]),
  trackingRef: z.string().nullable(), customerVisibleProgress: z.string(), updatedAt: z.string(),
});
export const staffOrderPageSchema = z.strictObject({ items: z.array(listItemSchema), total: z.number().int().nonnegative(), page: z.number().int().positive() });
export type StaffOrderPage = z.infer<typeof staffOrderPageSchema>;
export const staffOrderDetailSchema = listItemSchema.extend({
  internalNote: z.string(),
  items: z.array(z.strictObject({
    lineNumber: z.number().int().positive(), name: z.string(), sku: z.string().nullable(),
    quantity: z.number().int().positive(), unitPriceVnd: amount, lineTotalVnd: amount,
  })),
  history: z.array(historyEntrySchema),
});
export type StaffOrderDetail = z.infer<typeof staffOrderDetailSchema>;
export const paymentExceptionSchema = z.strictObject({
  id, orderId: id, reason: z.literal("late_payment"), createdAt: z.string(), acknowledgedAt: z.string().nullable(),
  buyerName: z.string().nullable(), totalVnd: amount.nullable(), paymentStatus: z.enum(paymentStatuses),
  fulfilmentStatus: z.enum(fulfilmentStatuses), reconciliation: z.enum(["NONE", "MANUAL_REVIEW"]),
});
export type PaymentException = z.infer<typeof paymentExceptionSchema>;

/** Drop fields that must never appear on a list DTO (OV-027 public projection later). */
export function omitInternalNotes(page: unknown): StaffOrderPage {
  const value = z.object({ page: z.number(), total: z.number(), items: z.array(z.object({}).passthrough()) }).parse(page);
  return staffOrderPageSchema.parse({
    page: value.page, total: value.total,
    items: value.items.map((item) => {
      const { internalNote: _internalNote, history: _history, items: _items, ...rest } = item as Record<string, unknown>;
      void _internalNote; void _history; void _items;
      return rest;
    }),
  });
}

export type OperationsRpcName = "list_staff_order_operations" | "read_staff_order_operations" | "staff_transition_order" | "list_payment_exceptions" | "acknowledge_payment_exception";
export interface OperationsPort { rpc(name: OperationsRpcName, args: Record<string, Json>): PromiseLike<{ data: unknown; error: { code?: string } | null }> }
export class OrderOperationsError extends Error {
  constructor(public code: "INVALID" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE") { super(code); }
}
async function call(port: OperationsPort, name: OperationsRpcName, args: Record<string, Json>) {
  let result;
  try { result = await port.rpc(name, args); } catch { throw new OrderOperationsError("UNAVAILABLE"); }
  if (result.error) throw new OrderOperationsError(result.error.code === "42501" ? "FORBIDDEN" : ["40001", "23505"].includes(result.error.code ?? "") ? "CONFLICT" : ["22023", "23514", "22P02"].includes(result.error.code ?? "") ? "INVALID" : "UNAVAILABLE");
  return result.data;
}

/** Server-verified staff only. SQL rechecks active membership and never writes totals/paid. */
export function createOrderOperationsRepository(port: OperationsPort, actor: StaffSession) {
  const scope = { p_organization_id: id.parse(actor.organizationId), p_actor_id: id.parse(actor.userId) };
  return {
    async list(input: z.infer<typeof orderOperationsQuerySchema>) {
      const query = orderOperationsQuerySchema.parse(input);
      return omitInternalNotes(await call(port, "list_staff_order_operations", { ...scope, p_status: query.status, p_page: query.page }));
    },
    async get(orderId: string): Promise<StaffOrderDetail | null> {
      const result = await call(port, "read_staff_order_operations", { ...scope, p_order_id: id.parse(orderId) });
      return result === null ? null : staffOrderDetailSchema.parse(result);
    },
    async transition(orderId: string, input: TransitionCommand) {
      const command = transitionCommandSchema.parse(input);
      return z.strictObject({ orderId: id, revision: z.number().int().positive(), fulfilmentStatus: z.enum(operationalStatuses) }).parse(await call(port, "staff_transition_order", {
        ...scope, p_order_id: id.parse(orderId), p_expected_version: command.expectedVersion, p_to: command.to, p_request_id: command.requestId,
        p_tracking_ref: command.trackingRef ?? null, p_customer_visible_progress: command.customerVisibleProgress, p_internal_note: command.internalNote,
      }));
    },
    async exceptions() {
      return z.array(paymentExceptionSchema).parse(await call(port, "list_payment_exceptions", scope));
    },
    async acknowledge(input: z.infer<typeof acknowledgeCommandSchema>) {
      const command = acknowledgeCommandSchema.parse(input);
      return z.strictObject({ id, acknowledgedAt: z.string() }).parse(await call(port, "acknowledge_payment_exception", { ...scope, p_exception_id: command.exceptionId, p_request_id: command.requestId }));
    },
  };
}

export function asOperationsPort(client: { rpc: (name: never, args: never) => PromiseLike<{ data: unknown; error: { code?: string } | null }> }): OperationsPort {
  return { rpc: (name, args) => client.rpc(name as never, args as never) };
}

export type { FulfilmentStatus, PaymentStatus };
