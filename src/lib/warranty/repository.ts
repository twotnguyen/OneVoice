// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { StaffSession } from "@/lib/auth/session";
import type { Database, Json } from "@/lib/supabase/database.types";
import { postgresUuid } from "@/lib/jobs/types";
import { customerProgressSchema, eligibleItemsSchema, warrantyCommandSchema, warrantyPageSchema, warrantyQuerySchema, warrantyRecordSchema, type WarrantyCommand } from "./management";
type RpcName = "save_warranty_case" | "read_staff_warranty" | "read_customer_warranty";
type RpcArgs = Database["public"]["Functions"][RpcName]["Args"];
export interface WarrantyPort { rpc(name: RpcName, args: RpcArgs): PromiseLike<{ data: unknown; error: { code?: string } | null }> }
export class WarrantyError extends Error { constructor(public code: "INVALID" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE") { super(code); } }
async function call(port: WarrantyPort, name: Parameters<WarrantyPort["rpc"]>[0], args: Record<string, Json>) {
 let result; try { result = await port.rpc(name, args as RpcArgs); } catch { throw new WarrantyError("UNAVAILABLE"); }
 if (result.error) throw new WarrantyError(result.error.code === "42501" ? "FORBIDDEN" : ["40001", "23505"].includes(result.error.code ?? "") ? "CONFLICT" : ["22023", "23514", "22P02"].includes(result.error.code ?? "") ? "INVALID" : "UNAVAILABLE");
 return result.data;
}
/** Only server-verified staff sessions; SQL freshly checks active membership. */
export function createWarrantyRepository(port: WarrantyPort, actor: StaffSession) {
 const scope = { p_organization_id: actor.organizationId, p_actor_id: actor.userId };
 return {
  async list(input: z.infer<typeof warrantyQuerySchema>) { const query = warrantyQuerySchema.parse(input); return warrantyPageSchema.parse(await call(port, "read_staff_warranty", { ...scope, p_page: query.page, p_search: query.search })); },
  async get(id: string) { const result = await call(port, "read_staff_warranty", { ...scope, p_id: postgresUuid.parse(id) }); return result === null ? null : warrantyRecordSchema.parse(result); },
  async eligible(input: z.infer<typeof warrantyQuerySchema>) { const query = warrantyQuerySchema.parse(input); return eligibleItemsSchema.parse(await call(port, "read_staff_warranty", { ...scope, p_orders: true, p_page: query.page, p_search: query.search })); },
  async save(input: WarrantyCommand) { const value = warrantyCommandSchema.parse(input); return z.object({ id: postgresUuid, version: z.number().int().positive() }).parse(await call(port, "save_warranty_case", { ...scope, p_id: value.id, p_request_id: value.requestId, p_expected_version: value.expectedVersion, p_order_id: value.orderId, p_line_number: value.lineNumber, p_status: value.status, p_customer_note: value.customerNote, p_private_note: value.privateNote })); },
 };
}
/** Trusted channel adapter must verify customer/conversation ownership before binding
 * this context. No browser route, model-supplied identity or write method. Warranty
 * requests still require staff handoff; this reader never grants eligibility.
 */
export function createCustomerWarrantyReader(port: WarrantyPort, context: { organizationId: string; conversationId: string }) {
 const scope = { p_organization_id: postgresUuid.parse(context.organizationId), p_conversation_id: postgresUuid.parse(context.conversationId) };
 return { async get(orderId: string) { return z.array(customerProgressSchema).parse(await call(port, "read_customer_warranty", { ...scope, p_order_id: postgresUuid.parse(orderId) })); } };
}
