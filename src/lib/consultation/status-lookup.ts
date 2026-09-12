// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { postgresUuid } from "@/lib/jobs/types";
import { confirmationHeaders, createConfirmationToken, hashConfirmationToken } from "@/lib/orders/confirmation";
import { customerProgressSchema } from "@/lib/warranty/management";

const id = postgresUuid.transform((value) => value.toLowerCase());
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const amount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
const fulfilmentStatuses = ["DRAFT", "AWAITING_PAYMENT", "PREPARING", "DELIVERING", "DELIVERED", "EXPIRED", "CANCELLED"] as const;
const paymentStatuses = ["UNPAID", "FAILED", "PAID"] as const;

export const STATUS_TTL_MS = 1_800_000;
export const STATUS_PURPOSE = "status";
export const STATUS_LOOKUP_LIMIT = 5;
export const STATUS_LOOKUP_WINDOW_MS = 600_000;
export const UNVERIFIED_TEXT = "Không xác minh được đơn hàng. Vui lòng kiểm tra lại mã đơn và số điện thoại, hoặc chờ nhân viên hỗ trợ.";
const questions = {
  orderCode: "Bạn cho mình mã đơn hàng?",
  phone: "Bạn cho mình xin số điện thoại trên đơn?",
} as const;
export type StatusLookupField = keyof typeof questions;

export const publicOrderStatusSchema = z.strictObject({
  asOf: z.string(),
  order: z.strictObject({
    orderId: id,
    fulfilmentStatus: z.enum(fulfilmentStatuses),
    paymentStatus: z.enum(paymentStatuses),
    trackingRef: z.string().nullable(),
    customerVisibleProgress: z.string(),
    currency: z.literal("VND"),
    totalVnd: amount,
    items: z.array(z.strictObject({
      name: z.string(),
      sku: z.string().nullable(),
      quantity: z.number().int().positive(),
    })),
  }),
  warranty: z.array(customerProgressSchema),
});
export type PublicOrderStatus = z.infer<typeof publicOrderStatusSchema>;

export type StatusLookupRpcName = "verify_customer_order_status" | "read_order_status";
export interface StatusLookupPort {
  rpc(name: StatusLookupRpcName, args: Record<string, Json>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}

type LookupContext = { organizationId: string; text: string; history: Array<{ text: string; decision?: unknown }>; conversationId?: string };

export type StatusVerifyResult =
  | { ok: true; url: string; status: PublicOrderStatus; expiresAt: string }
  | { ok: false; code: "UNVERIFIED" | "HANDOFF" | "RATE_LIMITED" | "UNAVAILABLE" };

const genericUnverified = { ok: false as const, code: "UNVERIFIED" as const };

export function normalizeCustomerPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const national = digits.startsWith("84") && digits.length >= 10 ? digits.slice(2) : digits.replace(/^0/, "");
  return national.length >= 8 && national.length <= 12 ? `+84${national}` : null;
}

export function extractStatusLookup(context: LookupContext): { orderCode: string; phone: string } {
  const text = [context.text, ...context.history.map((turn) => turn.text)].join("\n");
  const orderMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const withoutCodes = text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, " ");
  const phoneMatch = withoutCodes.match(/(?:\+?84|0)(?:3|5|7|8|9)(?:\d[\s.]*){7,10}/);
  return {
    orderCode: orderMatch ? orderMatch[0].toLowerCase() : "",
    phone: phoneMatch ? normalizeCustomerPhone(phoneMatch[0]) ?? "" : "",
  };
}

export function missingStatusField(value: unknown): StatusLookupField | null {
  if (!value || typeof value !== "object") return "orderCode";
  const record = value as Record<string, unknown>;
  if (typeof record.orderCode !== "string" || !id.safeParse(record.orderCode).success) return "orderCode";
  if (typeof record.phone !== "string" || !normalizeCustomerPhone(record.phone)) return "phone";
  return null;
}

/** Drop staff-only notes/address so a later public projection cannot leak OV-025 internals. */
export function toPublicOrderStatus(value: unknown): PublicOrderStatus {
  const raw = z.object({
    asOf: z.string(),
    order: z.object({}).passthrough(),
    warranty: z.array(z.object({}).passthrough()).optional().default([]),
  }).parse(value);
  const order = raw.order as Record<string, unknown>;
  const {
    internalNote: _internalNote, address: _address, reconciliation: _reconciliation, buyerName: _buyerName, phone: _phone, history: _history,
    ...orderRest
  } = order;
  void _internalNote; void _address; void _reconciliation; void _buyerName; void _phone; void _history;
  const items = Array.isArray(order.items) ? order.items.map((item) => {
    const row = z.object({}).passthrough().parse(item);
    const { unitPriceVnd: _unit, lineTotalVnd: _line, lineNumber: _lineNumber, internalNote: _itemNote, ...rest } = row as Record<string, unknown>;
    void _unit; void _line; void _lineNumber; void _itemNote;
    return { name: String(rest.name ?? ""), sku: rest.sku == null ? null : String(rest.sku), quantity: Number(rest.quantity) };
  }) : [];
  const warranty = raw.warranty.map((entry) => {
    const row = entry as Record<string, unknown>;
    const { privateNote: _private, ...rest } = row;
    void _private;
    const history = Array.isArray(rest.history) ? rest.history.map((h) => {
      const item = h as Record<string, unknown>;
      const { privateNote: _hPrivate, ...keep } = item;
      void _hPrivate;
      return keep;
    }) : [];
    return customerProgressSchema.parse({ ...rest, history });
  });
  return publicOrderStatusSchema.parse({
    asOf: raw.asOf,
    order: {
      orderId: orderRest.orderId, fulfilmentStatus: orderRest.fulfilmentStatus, paymentStatus: orderRest.paymentStatus,
      trackingRef: orderRest.trackingRef ?? null, customerVisibleProgress: orderRest.customerVisibleProgress ?? "",
      currency: orderRest.currency ?? "VND", totalVnd: orderRest.totalVnd ?? null, items,
    },
    warranty,
  });
}

export function statusUrl(origin: string, token: string) {
  const base = new URL(origin);
  return `${base.origin}/order-status/${tokenSchema.parse(token)}`;
}

export function statusHeaders(): HeadersInit {
  return confirmationHeaders();
}

export function hashStatusToken(token: string) {
  return hashConfirmationToken(token);
}

async function call(port: StatusLookupPort, name: StatusLookupRpcName, args: Record<string, Json>) {
  let result;
  try { result = await port.rpc(name, args); } catch { throw Error("STATUS_UNAVAILABLE"); }
  if (result.error) throw Error("STATUS_UNAVAILABLE");
  return result.data;
}

export function createStatusLookup(port: StatusLookupPort, context: {
  organizationId: string; conversationId: string; origin: string; now?: () => number; random?: () => Uint8Array;
}) {
  const organizationId = id.parse(context.organizationId);
  const conversationId = id.parse(context.conversationId);
  const now = context.now ?? Date.now;
  return {
    async verify(input: unknown): Promise<StatusVerifyResult> {
      const field = missingStatusField(input);
      if (field) return genericUnverified;
      const record = input as { orderCode: string; phone: string };
      const phone = normalizeCustomerPhone(record.phone);
      if (!phone) return genericUnverified;
      const issued = createConfirmationToken(context.random);
      const expiresAt = new Date(now() + STATUS_TTL_MS).toISOString();
      let data: unknown;
      try {
        data = await call(port, "verify_customer_order_status", {
          p_organization_id: organizationId, p_conversation_id: conversationId, p_order_code: id.parse(record.orderCode),
          p_phone: phone, p_origin: context.origin, p_token_hash: issued.hash, p_expires_at: expiresAt,
          p_now: new Date(now()).toISOString(),
        });
      } catch { return genericUnverified; }
      const parsed = z.object({
        ok: z.boolean(),
        code: z.enum(["UNVERIFIED", "HANDOFF", "RATE_LIMITED"]).optional(),
        status: z.unknown().optional(),
        expiresAt: z.string().optional(),
      }).safeParse(data);
      if (!parsed.success) return genericUnverified;
      if (!parsed.data.ok) {
        if (parsed.data.code === "HANDOFF") return { ok: false, code: "HANDOFF" };
        if (parsed.data.code === "RATE_LIMITED") return { ok: false, code: "RATE_LIMITED" };
        return genericUnverified;
      }
      const status = toPublicOrderStatus(parsed.data.status);
      return { ok: true, url: statusUrl(context.origin, issued.token), status, expiresAt: parsed.data.expiresAt ?? expiresAt };
    },
  };
}

export function createStatusPageService(port: StatusLookupPort, context: { now?: () => number } = {}) {
  const now = context.now ?? Date.now;
  return {
    async read(token: string): Promise<{ ok: true; status: PublicOrderStatus } | { ok: false; code: "LINK_UNAVAILABLE" }> {
      const parsed = tokenSchema.safeParse(token);
      if (!parsed.success) return { ok: false, code: "LINK_UNAVAILABLE" };
      try {
        const data = await call(port, "read_order_status", {
          p_token_hash: hashStatusToken(parsed.data), p_now: new Date(now()).toISOString(),
        });
        if (data == null) return { ok: false, code: "LINK_UNAVAILABLE" };
        return { ok: true, status: toPublicOrderStatus(data) };
      } catch { return { ok: false, code: "LINK_UNAVAILABLE" }; }
    },
  };
}

export async function collectOrderStatusRoute(
  context: LookupContext,
  status: { verify: (input: unknown) => Promise<StatusVerifyResult> },
) {
  const extracted = extractStatusLookup(context);
  const field = missingStatusField(extracted);
  if (field || !context.conversationId) {
    return { type: "route" as const, intent: "order_status" as const, route: "order_status" as const, field: field ?? "orderCode", text: questions[field ?? "orderCode"] };
  }
  const result = await status.verify(extracted);
  if (!result.ok) {
    if (result.code === "HANDOFF") return { type: "gap" as const, intent: "order_status", reason: "lookup_failed" as const, field: "service" };
    return { type: "route" as const, intent: "order_status" as const, route: "order_status" as const, text: UNVERIFIED_TEXT };
  }
  return { type: "route" as const, intent: "order_status" as const, route: "order_status" as const, statusUrl: result.url, text: `Bạn xem tiến độ đơn tại ${result.url}` };
}

