// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import type { StaffSession } from "@/lib/auth/session";
import { postgresUuid } from "@/lib/jobs/types";
import { LoginLimiter, sameOriginMutation } from "@/lib/auth/security";
import { draftOrderSchema } from "./repository";
type CheckoutContext = { organizationId: string; text: string; history: Array<{ text: string; decision?: unknown }>; conversationId?: string; revision?: number };

export const CONFIRMATION_TTL_MS = 86_400_000;
export const CONFIRMATION_PURPOSE = "confirmation";
const id = postgresUuid.transform((value) => value.toLowerCase());
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const address = z.object({
  line1: z.string().trim().min(1).max(300),
  ward: z.string().trim().min(1).max(120).nullable(),
  district: z.string().trim().min(1).max(120).nullable(),
  province: z.string().trim().min(1).max(120),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
}).strict();
const collectionItemSchema = z.object({
  productId: id, variantId: id.nullable(), quantity: z.number().int().min(1).max(10000), requiresVariant: z.boolean().optional(),
}).strict();
export const collectionInputSchema = z.object({
  buyerName: z.string().trim().min(1).max(200),
  phone: z.string().trim().regex(/^\+?[0-9]{8,15}$/),
  address,
  items: z.array(collectionItemSchema).min(1).max(100),
}).strict();
export type CollectionInput = z.infer<typeof collectionInputSchema>;
export type CollectionField = "items" | "variant" | "quantity" | "buyerName" | "phone" | "address";
export type ConfirmationRpcName =
  | "issue_order_confirmation_token"
  | "read_order_confirmation"
  | "save_customer_order_draft"
  | "confirm_order_quote"
  | "read_confirmed_order_quote"
  | "save_order_shipping_settings"
  | "read_order_shipping_settings";
export interface ConfirmationPort { rpc(name: ConfirmationRpcName, args: Record<string, Json>): PromiseLike<{ data: unknown; error: { code?: string } | null }> }
const quoteSchema = z.object({
  orderId: id, organizationId: id, revision: z.number().int().positive(), currency: z.literal("VND"),
  buyerName: z.string().nullable(), phone: z.string().nullable(), address: address.nullable(),
  subtotalVnd: z.number().int().min(0), shippingFeeVnd: z.number().int().min(0).nullable(), shippingRevision: z.number().int().positive().nullable(),
  totalVnd: z.number().int().min(0).nullable(),
  fulfilmentStatus: z.enum(["DRAFT", "AWAITING_PAYMENT", "PREPARING", "DELIVERING", "DELIVERED", "EXPIRED", "CANCELLED"]),
  paymentStatus: z.enum(["UNPAID", "FAILED", "PAID"]), checkoutFrozenAt: z.string().nullable(),
  items: z.array(z.object({
    productId: id, variantId: id.nullable(), productVersion: z.number().int().positive(), name: z.string(), sku: z.string().nullable(),
    quantity: z.number().int().positive(), unitPriceVnd: z.number().int().min(0), lineTotalVnd: z.number().int().min(0),
  })),
});
export type ConfirmationQuote = z.infer<typeof quoteSchema>;
const confirmExpectedSchema = z.object({
  requestId: id, orderVersion: z.number().int().positive(),
  subtotalVnd: z.number().int().min(0), shippingFeeVnd: z.number().int().min(0).nullable(), totalVnd: z.number().int().min(0).nullable(),
}).strict();
const questions: Record<CollectionField, string> = {
  items: "Bạn muốn đặt sản phẩm nào (đúng mã) và số lượng bao nhiêu?",
  variant: "Sản phẩm này có nhiều phiên bản. Bạn chọn phiên bản nào?",
  quantity: "Bạn muốn đặt số lượng bao nhiêu?",
  buyerName: "Bạn cho mình xin tên người nhận?",
  phone: "Bạn cho mình xin số điện thoại liên hệ?",
  address: "Bạn cho mình xin địa chỉ nhận hàng?",
};

export function hashConfirmationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function createConfirmationToken(random: () => Uint8Array = () => randomBytes(32)) {
  const token = Buffer.from(random()).toString("base64url");
  if (!tokenSchema.safeParse(token).success) throw Error("CONFIRMATION_TOKEN_INVALID");
  return { token, hash: hashConfirmationToken(token) };
}
export function confirmationUrl(origin: string, token: string) {
  const base = new URL(origin);
  return `${base.origin}/order-confirmation/${tokenSchema.parse(token)}`;
}
export function missingCollectionField(value: unknown): CollectionField | null {
  if (!value || typeof value !== "object") return "items";
  const record = value as Record<string, unknown>;
  const items = record.items;
  if (!Array.isArray(items) || items.length < 1) return "items";
  for (const item of items) {
    if (!item || typeof item !== "object") return "items";
    const line = item as Record<string, unknown>;
    if (line.requiresVariant === true && (line.variantId == null || line.variantId === "")) return "variant";
    if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1) return "quantity";
    if (typeof line.productId !== "string") return "items";
  }
  if (typeof record.buyerName !== "string" || record.buyerName.trim().length < 1) return "buyerName";
  if (typeof record.phone !== "string" || !/^\+?[0-9]{8,15}$/.test(record.phone.trim())) return "phone";
  const parsed = address.safeParse(record.address);
  if (!parsed.success) return "address";
  return collectionInputSchema.safeParse({ ...record, address: parsed.data }) .success ? null : "items";
}

function phoneFrom(text: string) {
  const match = text.match(/(?:\+?84|0)(?:\d[\s.]*){8,12}/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, "");
  const national = digits.startsWith("84") ? digits.slice(2) : digits.replace(/^0/, "");
  return national.length >= 8 && national.length <= 12 ? `+84${national}` : null;
}
function catalogItems(history: CheckoutContext["history"]) {
  const items: Array<{ productId: string; variantId: string | null; requiresVariant?: boolean }> = [];
  for (const turn of history) {
    const decision = turn.decision;
    if (!decision || typeof decision !== "object" || !("catalogItems" in decision)) continue;
    const listed = decision.catalogItems;
    if (!Array.isArray(listed)) continue;
    for (const item of listed) {
      if (!item || typeof item !== "object" || !("productId" in item) || typeof item.productId !== "string") continue;
      const variantId = "variantId" in item && typeof item.variantId === "string" ? item.variantId : null;
      items.push({ productId: item.productId, variantId, requiresVariant: variantId == null && "sku" in item ? undefined : variantId == null });
    }
  }
  const unique = new Map<string, (typeof items)[number]>();
  for (const item of items) unique.set(`${item.productId}:${item.variantId ?? ""}`, item);
  return [...unique.values()];
}
export function extractCheckoutCollection(context: CheckoutContext): Record<string, unknown> {
  const text = [context.text, ...context.history.map((turn) => turn.text)].join("\n");
  const listed = catalogItems(context.history);
  const quantityMatch = text.match(/(?:số lượng|đặt)\s*[:\s]*(\d{1,5})|(\d{1,5})\s*(?:cái|chiếc|máy)/iu);
  const quantity = quantityMatch ? Number(quantityMatch[1] ?? quantityMatch[2]) : null;
  const nameMatch = text.match(/(?:tên tôi là|tôi tên(?: là)?|tên người nhận[:\s]+)\s*([^\n,]{2,80})/iu);
  const addressMatch = text.match(/(?:địa chỉ|giao về|giao tới)[:\s]+([^\n]{5,300})/iu);
  let addressValue: unknown = null;
  if (addressMatch) {
    const parts = addressMatch[1].split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) addressValue = { line1: parts[0], ward: null, district: null, province: parts[parts.length - 1], countryCode: "VN" };
  }
  return {
    buyerName: nameMatch?.[1]?.trim() ?? "",
    phone: phoneFrom(text) ?? "",
    address: addressValue,
    items: listed.length === 1 && quantity ? [{ ...listed[0], quantity }] : listed.length ? listed.map((item) => ({ ...item, quantity: quantity ?? 0 })) : [],
  };
}

async function call(port: ConfirmationPort, name: ConfirmationRpcName, args: Record<string, Json>) {
  let result;
  try { result = await port.rpc(name, args); } catch { throw Error("ORDER_UNAVAILABLE"); }
  if (result.error) throw Error(result.error.code === "42501" ? "ORDER_FORBIDDEN" : result.error.code === "55000" ? "ORDER_FROZEN" : ["40001", "23505"].includes(result.error.code ?? "") ? "ORDER_CONFLICT" : ["22023", "23514", "22P02"].includes(result.error.code ?? "") ? "ORDER_INVALID" : "ORDER_UNAVAILABLE");
  return result.data;
}

export function createCheckoutCollection(port: ConfirmationPort, context: { organizationId: string; ownerId: string; conversationId: string; origin: string; now?: () => number; random?: () => Uint8Array }) {
  const organizationId = id.parse(context.organizationId);
  const ownerId = id.parse(context.ownerId);
  const conversationId = id.parse(context.conversationId);
  const now = context.now ?? Date.now;
  return {
    async collect(input: unknown, requestId: string) {
      const field = missingCollectionField(input);
      if (field) return { ok: false as const, field, code: "COLLECTION_INCOMPLETE" as const };
      const document = collectionInputSchema.parse(input);
      const issued = createConfirmationToken(context.random);
      const expiresAt = new Date(now() + CONFIRMATION_TTL_MS).toISOString();
      const data = await call(port, "issue_order_confirmation_token", {
        p_organization_id: organizationId, p_owner_id: ownerId, p_conversation_id: conversationId,
        p_order_id: crypto.randomUUID(), p_request_id: id.parse(requestId), p_expected_revision: 0,
        p_document: { buyerName: document.buyerName, phone: document.phone, address: document.address, items: document.items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })) } as Json,
        p_token_hash: issued.hash, p_purpose: CONFIRMATION_PURPOSE, p_expires_at: expiresAt,
      });
      const saved = z.object({ orderId: id, revision: z.number().int().positive(), expiresAt: z.string() }).parse(data);
      return { ok: true as const, orderId: saved.orderId, revision: saved.revision, url: confirmationUrl(context.origin, issued.token), expiresAt: saved.expiresAt, token: issued.token };
    },
  };
}

const generic = { ok: false as const, code: "LINK_UNAVAILABLE" as const };
function asQuote(data: unknown) {
  const parsed = quoteSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function createConfirmationService(port: ConfirmationPort, context: { origin: string; now?: () => number; limiter?: LoginLimiter }) {
  const now = context.now ?? Date.now;
  const limiter = context.limiter ?? new LoginLimiter(now, 20, 200, 60_000);
  async function guarded<T>(token: string, run: (hash: string) => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; code: "LINK_UNAVAILABLE" | "RATE_LIMITED" }> {
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) return generic;
    const hash = hashConfirmationToken(parsed.data);
    if (!limiter.take(hash)) return { ok: false as const, code: "RATE_LIMITED" as const };
    try {
      const data = await run(hash);
      if (data == null) return generic;
      return { ok: true as const, data };
    } catch { return generic; }
  }
  return {
    async read(token: string) {
      const result = await guarded(token, (hash) => call(port, "read_order_confirmation", { p_token_hash: hash, p_now: new Date(now()).toISOString() }));
      if (!result.ok) return result;
      const quote = asQuote(result.data);
      return quote ? { ok: true as const, quote } : generic;
    },
    async save(token: string, document: unknown, requestId: string) {
      const parsed = draftOrderSchema.shape.document.safeParse(document);
      if (!parsed.success) return { ok: false as const, code: "ORDER_INVALID" as const };
      const result = await guarded(token, (hash) => call(port, "save_customer_order_draft", { p_token_hash: hash, p_request_id: id.parse(requestId), p_document: parsed.data as Json }));
      if (!result.ok) return result;
      const quote = asQuote(result.data);
      return quote ? { ok: true as const, quote } : generic;
    },
    async confirm(token: string, expected: unknown) {
      const parsed = confirmExpectedSchema.safeParse(expected);
      if (!parsed.success) return generic;
      const result = await guarded(token, (hash) => call(port, "confirm_order_quote", {
        p_token_hash: hash, p_request_id: parsed.data.requestId,
        p_expected_quote: { orderVersion: parsed.data.orderVersion, subtotalVnd: parsed.data.subtotalVnd, shippingFeeVnd: parsed.data.shippingFeeVnd, totalVnd: parsed.data.totalVnd } as Json,
      }));
      if (!result.ok) return result;
      const body = z.object({ status: z.enum(["confirmed", "changed", "blocked"]), code: z.string().optional(), quote: quoteSchema }).safeParse(result.data);
      if (!body.success) return generic;
      if (body.data.status === "blocked") return { ok: true as const, status: "blocked" as const, code: body.data.code ?? "ORDER_SHIPPING_UNKNOWN", quote: body.data.quote };
      if (body.data.status === "changed") return { ok: true as const, status: "changed" as const, quote: body.data.quote };
      return { ok: true as const, status: "confirmed" as const, quote: body.data.quote };
    },
  };
}

export async function readConfirmedQuote(port: ConfirmationPort, organizationId: string, orderId: string) {
  const data = await call(port, "read_confirmed_order_quote", { p_organization_id: id.parse(organizationId), p_order_id: id.parse(orderId) });
  return data == null ? null : quoteSchema.parse(data);
}

export function createShippingSettingsService(port: ConfirmationPort, actor: StaffSession) {
  if (actor.role !== "manager") {
    return {
      async read(): Promise<{ revision: number; flatFeeVnd: number | null }> { throw Error("ORDER_FORBIDDEN"); },
      async save(_input: { requestId: string; expectedRevision: number; flatFeeVnd: number }): Promise<{ revision: number; flatFeeVnd: number }> { void _input; throw Error("ORDER_FORBIDDEN"); },
    };
  }
  const scope = { p_organization_id: id.parse(actor.organizationId), p_actor_id: id.parse(actor.userId), p_role: actor.role };
  return {
    async read() {
      return z.object({ revision: z.number().int().positive(), flatFeeVnd: z.number().int().min(0).nullable() }).parse(await call(port, "read_order_shipping_settings", scope));
    },
    async save(input: { requestId: string; expectedRevision: number; flatFeeVnd: number }) {
      const flatFeeVnd = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(input.flatFeeVnd);
      return z.object({ revision: z.number().int().positive(), flatFeeVnd: z.number().int().min(0) }).parse(await call(port, "save_order_shipping_settings", {
        ...scope, p_request_id: id.parse(input.requestId), p_expected_revision: z.number().int().min(0).parse(input.expectedRevision), p_flat_fee_vnd: flatFeeVnd,
      }));
    },
  };
}

export async function collectCheckoutRoute(context: CheckoutContext, checkout: { collect: (input: unknown, requestId: string) => Promise<{ ok: false; field: CollectionField } | { ok: true; url: string }> }) {
  const extracted = extractCheckoutCollection(context);
  const field = missingCollectionField(extracted);
  if (field || !context.conversationId) return { type: "route" as const, intent: "checkout" as const, route: "checkout" as const, field: field ?? "items", text: questions[field ?? "items"] };
  const result = await checkout.collect(extracted, crypto.randomUUID());
  if (!result.ok) return { type: "route" as const, intent: "checkout" as const, route: "checkout" as const, field: result.field, text: questions[result.field] };
  return { type: "route" as const, intent: "checkout" as const, route: "checkout" as const, confirmationUrl: result.url, text: `Bạn kiểm tra và xác nhận đơn tại ${result.url}` };
}

export function confirmationHeaders(): HeadersInit {
  return { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
}
export function customerMutationAllowed(request: Request, origin: string) {
  return sameOriginMutation(request, origin);
}
export const confirmationLimiter = new LoginLimiter(Date.now, 20, 200, 60_000);
