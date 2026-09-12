// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { postgresUuid } from "@/lib/jobs/types";
import { readConfirmedQuote, type ConfirmationPort } from "./confirmation";

const id = postgresUuid.transform((value) => value.toLowerCase());
export const beginPaymentInputSchema = z.object({
  orderId: id, expectedVersion: z.number().int().positive(), requestId: id,
}).strict();
export type BeginPaymentInput = z.infer<typeof beginPaymentInputSchema>;
export const paymentAttemptSchema = z.object({
  attemptId: id, frozenTotalVnd: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), expiresAt: z.string().min(1),
}).strict();
export type PaymentAttempt = z.infer<typeof paymentAttemptSchema>;
export const reservationOutcomeSchema = z.object({
  status: z.enum(["active", "consumed", "released"]), attemptId: id, frozenTotalVnd: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type ReservationOutcome = z.infer<typeof reservationOutcomeSchema>;
export type ReservationRpcName = "begin_payment" | "expire_inventory_attempt" | "consume_inventory_attempt" | "read_confirmed_order_quote";
export interface ReservationPort { rpc(name: ReservationRpcName, args: Record<string, Json>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> }

async function call(port: ReservationPort, name: ReservationRpcName, args: Record<string, Json>) {
  let result;
  try { result = await port.rpc(name, args); } catch { throw Error("ORDER_UNAVAILABLE"); }
  if (result.error) {
    const message = result.error.message;
    if (message && /^(ORDER_|CATALOG_)/.test(message)) throw Error(message);
    throw Error(result.error.code === "42501" ? "ORDER_FORBIDDEN" : result.error.code === "55000" ? "ORDER_FROZEN" : ["40001", "23505"].includes(result.error.code ?? "") ? "ORDER_CONFLICT" : ["22023", "23514", "22P02"].includes(result.error.code ?? "") ? "ORDER_INVALID" : "ORDER_UNAVAILABLE");
  }
  return result.data;
}

/** Trusted identifiers only. Confirmed quote is re-read; client totals are never forwarded. */
export async function beginPayment(port: ReservationPort, organizationId: string, input: unknown) {
  const parsed = beginPaymentInputSchema.parse(input);
  const organization = id.parse(organizationId);
  const quote = await readConfirmedQuote(port as ConfirmationPort, organization, parsed.orderId);
  if (quote == null) throw Error("ORDER_QUOTE_REQUIRED");
  if (quote.revision !== parsed.expectedVersion) throw Error("ORDER_CONFLICT");
  return paymentAttemptSchema.parse(await call(port, "begin_payment", {
    p_organization_id: organization, p_order_id: parsed.orderId, p_expected_version: parsed.expectedVersion, p_request_id: parsed.requestId,
  }));
}

export async function expireInventoryAttempt(port: ReservationPort, organizationId: string, attemptId: string) {
  return reservationOutcomeSchema.parse(await call(port, "expire_inventory_attempt", { p_organization_id: id.parse(organizationId), p_attempt_id: id.parse(attemptId) }));
}

export async function consumeInventoryAttempt(port: ReservationPort, organizationId: string, attemptId: string) {
  return reservationOutcomeSchema.parse(await call(port, "consume_inventory_attempt", { p_organization_id: id.parse(organizationId), p_attempt_id: id.parse(attemptId) }));
}
