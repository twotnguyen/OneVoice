// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import type { StaffSession } from "@/lib/auth/session";
import { postgresUuid } from "@/lib/jobs/types";
const id = postgresUuid.transform((value) => value.toLowerCase());
const amount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const address = z.object({ line1: z.string().trim().min(1).max(300), ward: z.string().trim().min(1).max(120).nullable(), district: z.string().trim().min(1).max(120).nullable(), province: z.string().trim().min(1).max(120), countryCode: z.string().regex(/^[A-Z]{2}$/) }).strict();
export const draftOrderSchema = z.object({
  orderId: id, requestId: id, expectedRevision: z.number().int().min(0).max(2147483646),
  document: z.object({
    buyerName: z.string().trim().min(1).max(200).nullable(), phone: z.string().trim().regex(/^\+?[0-9]{8,15}$/).nullable(), address: address.nullable(),
    items: z.array(z.object({ productId: id, variantId: id.nullable(), quantity: z.number().int().min(1).max(10000) }).strict()).min(1).max(100),
  }).strict().refine((value) => new Set(value.items.map((item) => `${item.productId}:${item.variantId ?? "parent"}`)).size === value.items.length, "DUPLICATE_SKU"),
}).strict();
const savedSchema = z.object({ orderId: id, revision: z.number().int().positive() });
export const orderSnapshotSchema = z.object({
  orderId: id, organizationId: id, revision: z.number().int().positive(), currency: z.literal("VND"),
  buyerName: z.string().nullable(), phone: z.string().nullable(), address: address.nullable(),
  subtotalVnd: amount, shippingFeeVnd: amount.nullable(), shippingRevision: z.number().int().positive().nullable(), totalVnd: amount.nullable(),
  fulfilmentStatus: z.enum(["DRAFT", "AWAITING_PAYMENT", "PREPARING", "DELIVERING", "DELIVERED", "EXPIRED", "CANCELLED"]),
  paymentStatus: z.enum(["UNPAID", "FAILED", "PAID"]), checkoutFrozenAt: z.string().nullable(), conversationId: id.nullable(),
  reservationId: id.nullable(), paymentId: id.nullable(), fulfilmentId: id.nullable(),
  items: z.array(z.object({ productId: id, variantId: id.nullable(), productVersion: z.number().int().positive(), name: z.string(), sku: z.string().nullable(), quantity: z.number().int().positive(), unitPriceVnd: amount, lineTotalVnd: amount, sourceName: z.string().nullable(), sourceUrl: z.string().nullable() })),
});
export type DraftOrderInput = z.infer<typeof draftOrderSchema>;
export type OrderSnapshot = z.infer<typeof orderSnapshotSchema>;
export type OrdersRpcName = "save_staff_order_draft" | "save_automation_order_draft" | "read_staff_order" | "read_automation_order";
export interface OrdersPort { rpc(name: OrdersRpcName, args: Record<string, Json>): PromiseLike<{ data: unknown; error: { code?: string } | null }> }
async function call(port: OrdersPort, name: OrdersRpcName, args: Record<string, Json>) {
  let result;
  try { result = await port.rpc(name, args); } catch { throw Error("ORDER_UNAVAILABLE"); }
  if (result.error) throw Error(result.error.code === "42501" ? "ORDER_FORBIDDEN" : result.error.code === "55000" ? "ORDER_FROZEN" : ["40001", "23505"].includes(result.error.code ?? "") ? "ORDER_CONFLICT" : ["22023", "23514", "22P02"].includes(result.error.code ?? "") ? "ORDER_INVALID" : "ORDER_UNAVAILABLE");
  return result.data;
}
/** Server-verified staff only. SQL rechecks active membership on every read/save. */
export function createStaffOrdersRepository(port: OrdersPort, actor: StaffSession) {
  const scope = { p_organization_id: id.parse(actor.organizationId), p_actor_id: id.parse(actor.userId) };
  return {
    async save(input: DraftOrderInput) {
      const data = draftOrderSchema.parse(input);
      return savedSchema.parse(await call(port, "save_staff_order_draft", { ...scope, p_order_id: data.orderId, p_request_id: data.requestId, p_expected_revision: data.expectedRevision, p_document: data.document as Json }));
    },
    async get(orderId: string): Promise<OrderSnapshot | null> {
      const result = await call(port, "read_staff_order", { ...scope, p_order_id: id.parse(orderId) });
      return result === null ? null : orderSnapshotSchema.parse(result);
    },
  };
}
/** Trusted automation port; owner is a durable server workflow ID, never model/client
 * input. Unknown attribution is valid, but does not remove workflow ownership checks.
 * No checkout, stock reservation or payment operation is exposed here.
 */
export function createAutomationOrdersRepository(port: OrdersPort, context: { organizationId: string; ownerId: string; conversationId: string | null }) {
  const scope = { p_organization_id: id.parse(context.organizationId), p_owner_id: id.parse(context.ownerId), p_conversation_id: context.conversationId === null ? null : id.parse(context.conversationId) };
  return {
    async save(input: DraftOrderInput) {
      const data = draftOrderSchema.parse(input);
      return savedSchema.parse(await call(port, "save_automation_order_draft", { ...scope, p_order_id: data.orderId, p_request_id: data.requestId, p_expected_revision: data.expectedRevision, p_document: data.document as Json }));
    },
    async get(orderId: string): Promise<OrderSnapshot | null> {
      const result = await call(port, "read_automation_order", { p_organization_id: scope.p_organization_id, p_owner_id: scope.p_owner_id, p_order_id: id.parse(orderId) });
      return result === null ? null : orderSnapshotSchema.parse(result);
    },
  };
}
