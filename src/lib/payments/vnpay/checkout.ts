// SPDX-License-Identifier: Apache-2.0
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { postgresUuid } from "@/lib/jobs/types";
import { confirmationHeaders, customerMutationAllowed, hashConfirmationToken } from "@/lib/orders/confirmation";
import {
  beginPayment,
  type ReservationPort,
  type ReservationRpcName,
} from "@/lib/orders/reservations";
import { LoginLimiter } from "@/lib/auth/security";

/** Official PAY integration, retrieved 2026-09-12. HMACSHA512, API 2.1.0. */
export const VNPAY_SPEC = {
  url: "https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html",
  retrieved: "2026-09-12",
  version: "2.1.0",
  command: "pay",
  hash: "HMACSHA512",
  timezone: "Asia/Ho_Chi_Minh",
} as const;

export const VNPAY_SANDBOX_PAYMENT_URL = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
export const VNPAY_PRODUCTION_PAYMENT_URL = "https://www.vnpayment.vn/paymentv2/vpcpay.html";
export const VNPAY_RETURN_PATH = "/api/payments/vnpay/return";
export const VNPAY_AMOUNT_MAX_VND = 9_999_999_999;
const id = postgresUuid.transform((value) => value.toLowerCase());
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const startCheckoutBodySchema = z.object({ requestId: id }).strict();
export type StartCheckoutBody = z.infer<typeof startCheckoutBodySchema>;

export type VnpayRpcName = ReservationRpcName | "read_vnpay_checkout_start" | "persist_vnpay_checkout" | "read_vnpay_return";
export interface VnpayCheckoutPort {
  rpc(name: VnpayRpcName, args: Record<string, Json>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export type VnpayMerchantConfig = {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  environment: "sandbox" | "production";
  paymentHost: string;
};

export type VnpayMerchantRead =
  | { ok: true; merchant: VnpayMerchantConfig }
  | { ok: false; missing: string[]; invalid: string[] };

const startContextSchema = z.object({
  organizationId: id,
  orderId: id,
  revision: z.number().int().positive(),
  paymentStatus: z.enum(["UNPAID", "FAILED", "PAID"]),
  fulfilmentStatus: z.enum(["DRAFT", "AWAITING_PAYMENT", "PREPARING", "DELIVERING", "DELIVERED", "EXPIRED", "CANCELLED"]),
  attempt: z.object({
    attemptId: id,
    frozenTotalVnd: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    expiresAt: z.string().min(1),
    status: z.enum(["ACTIVE", "CONSUMED", "RELEASED"]),
  }).strict().nullable(),
}).strict();

const persistSchema = z.object({
  txnRef: z.string().regex(/^[A-Za-z0-9]{1,100}$/),
  attemptId: id,
  amountVnd: z.number().int().positive().max(VNPAY_AMOUNT_MAX_VND),
  tmnCode: z.string().regex(/^[A-Za-z0-9]{8}$/),
  createDate: z.string().regex(/^[0-9]{14}$/),
  expireDate: z.string().regex(/^[0-9]{14}$/),
  ipAddr: z.string().min(7).max(45),
  paymentHost: z.string().min(1),
}).strict();

const returnRowSchema = z.object({
  txnRef: z.string().min(1),
  attemptId: id,
  frozenTotalVnd: z.number().int().positive(),
  expiresAt: z.string().min(1),
  attemptStatus: z.enum(["ACTIVE", "CONSUMED", "RELEASED"]),
  paymentStatus: z.enum(["UNPAID", "FAILED", "PAID"]),
  fulfilmentStatus: z.enum(["DRAFT", "AWAITING_PAYMENT", "PREPARING", "DELIVERING", "DELIVERED", "EXPIRED", "CANCELLED"]),
}).strict();

async function call(port: VnpayCheckoutPort, name: VnpayRpcName, args: Record<string, Json>) {
  let result;
  try { result = await port.rpc(name, args); } catch { throw Error("ORDER_UNAVAILABLE"); }
  if (result.error) {
    const message = result.error.message;
    if (message && /^(ORDER_|CATALOG_|PAYMENT_|VNPAY_)/.test(message)) throw Error(message);
    throw Error(result.error.code === "42501" ? "ORDER_FORBIDDEN" : result.error.code === "55000" ? "ORDER_FROZEN" : ["40001", "23505"].includes(result.error.code ?? "") ? "ORDER_CONFLICT" : ["22023", "23514", "22P02"].includes(result.error.code ?? "") ? "ORDER_INVALID" : "ORDER_UNAVAILABLE");
  }
  return result.data;
}

/** PHP `urlencode` as used by the official PAY 2.1.0 PHP sample (space → +, UTF-8 bytes). */
export function vnpayUrlEncode(value: string) {
  return Array.from(Buffer.from(value, "utf8"), (byte) => {
    const char = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.]/.test(char)) return char;
    if (char === " ") return "+";
    return `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }).join("");
}

export function canonicalizeVnpayParams(params: Record<string, string>) {
  return Object.keys(params)
    .filter((key) => key !== "vnp_SecureHash" && key !== "vnp_SecureHashType" && params[key] !== "")
    .sort()
    .map((key) => `${vnpayUrlEncode(key)}=${vnpayUrlEncode(params[key]!)}`)
    .join("&");
}

export function signVnpaySecureHash(params: Record<string, string>, hashSecret: string) {
  return createHmac("sha512", hashSecret).update(canonicalizeVnpayParams(params), "utf8").digest("hex");
}

export function gmt7Stamp(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VNPAY_SPEC.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const take = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${take("year")}${take("month")}${take("day")}${take("hour")}${take("minute")}${take("second")}`;
}

export function vnpayAmountFromVnd(frozenTotalVnd: number) {
  if (!Number.isSafeInteger(frozenTotalVnd) || frozenTotalVnd < 1 || frozenTotalVnd > VNPAY_AMOUNT_MAX_VND) throw Error("VNPAY_AMOUNT_INVALID");
  return frozenTotalVnd * 100;
}

export function txnRefForAttempt(attemptId: string) {
  return id.parse(attemptId).replace(/-/g, "");
}

export function vnpayReturnUrl(origin: string) {
  return `${origin}${VNPAY_RETURN_PATH}`;
}

export function clientIpFrom(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const raw = forwarded || request.headers.get("x-real-ip")?.trim() || "";
  return /^[A-Za-z0-9.:]{7,45}$/.test(raw) ? raw : "127.0.0.1";
}

function missingName(value: string | undefined, name: string, missing: string[]) {
  if (value == null || value.trim() === "") missing.push(name);
}

export function readVnpayMerchantConfig(source: Record<string, string | undefined> = process.env): VnpayMerchantRead {
  const missing: string[] = [];
  missingName(source.VNPAY_TMN_CODE, "VNPAY_TMN_CODE", missing);
  missingName(source.VNPAY_HASH_SECRET, "VNPAY_HASH_SECRET", missing);
  missingName(source.VNPAY_PAYMENT_URL, "VNPAY_PAYMENT_URL", missing);
  if (missing.length > 0) return { ok: false, missing, invalid: [] };
  const tmnCode = source.VNPAY_TMN_CODE!.trim();
  const hashSecret = source.VNPAY_HASH_SECRET!.trim();
  const paymentUrl = source.VNPAY_PAYMENT_URL!.trim();
  const invalid: string[] = [];
  if (!/^[A-Za-z0-9]{8}$/.test(tmnCode)) invalid.push("VNPAY_TMN_CODE");
  if (hashSecret.length < 1) invalid.push("VNPAY_HASH_SECRET");
  let environment: "sandbox" | "production" | undefined;
  if (paymentUrl === VNPAY_SANDBOX_PAYMENT_URL) environment = "sandbox";
  else if (paymentUrl === VNPAY_PRODUCTION_PAYMENT_URL) environment = "production";
  else invalid.push("VNPAY_PAYMENT_URL");
  if (invalid.length > 0 || environment == null) return { ok: false, missing: [], invalid };
  return {
    ok: true,
    merchant: { tmnCode, hashSecret, paymentUrl, environment, paymentHost: new URL(paymentUrl).host },
  };
}

export function buildVnpayPaymentFields(input: {
  frozenTotalVnd: number;
  txnRef: string;
  tmnCode: string;
  createDate: string;
  expireDate: string;
  ipAddr: string;
  returnUrl: string;
  orderInfo?: string;
}) {
  if (input.returnUrl.includes("://") === false) throw Error("ORDER_INVALID");
  return {
    vnp_Amount: String(vnpayAmountFromVnd(input.frozenTotalVnd)),
    vnp_Command: VNPAY_SPEC.command,
    vnp_CreateDate: input.createDate,
    vnp_CurrCode: "VND",
    vnp_ExpireDate: input.expireDate,
    vnp_IpAddr: input.ipAddr,
    vnp_Locale: "vn",
    vnp_OrderInfo: input.orderInfo ?? "Thanh toan don hang",
    vnp_OrderType: "other",
    vnp_ReturnUrl: input.returnUrl,
    vnp_TmnCode: input.tmnCode,
    vnp_TxnRef: input.txnRef,
    vnp_Version: VNPAY_SPEC.version,
  };
}

export function buildVnpayPaymentUrl(merchant: VnpayMerchantConfig, fields: Record<string, string>) {
  if (fields.vnp_TmnCode !== merchant.tmnCode) throw Error("ORDER_INVALID");
  const signed = { ...fields };
  delete signed.vnp_SecureHash;
  delete signed.vnp_SecureHashType;
  const hash = signVnpaySecureHash(signed, merchant.hashSecret);
  return `${merchant.paymentUrl}?${canonicalizeVnpayParams(signed)}&vnp_SecureHash=${hash}`;
}

function hashesEqual(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyVnpayChecksum(query: Record<string, string>, hashSecret: string) {
  const secureHash = query.vnp_SecureHash ?? "";
  if (!/^[0-9a-f]{128}$/i.test(secureHash)) return false;
  const params = { ...query };
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;
  return hashesEqual(signVnpaySecureHash(params, hashSecret).toLowerCase(), secureHash.toLowerCase());
}

export type CheckoutStartResult =
  | { status: "redirect"; paymentUrl: string; txnRef: string; attemptId: string; frozenTotalVnd: number; expiresAt: string }
  | { status: "expired"; paymentUrl?: undefined; attemptId: string; frozenTotalVnd: number; expiresAt: string }
  | { status: "verified"; paymentUrl?: undefined; attemptId: string | null; frozenTotalVnd: number | null; expiresAt: string | null };

export async function startVnpayCheckout(
  port: VnpayCheckoutPort,
  merchant: VnpayMerchantConfig,
  origin: string,
  token: string,
  body: unknown,
  context: { ip: string; now?: () => Date },
): Promise<CheckoutStartResult> {
  const parsedToken = tokenSchema.parse(token);
  const parsedBody = startCheckoutBodySchema.parse(body);
  const now = context.now ?? (() => new Date());
  const data = await call(port, "read_vnpay_checkout_start", { p_token_hash: hashConfirmationToken(parsedToken) });
  if (data == null) throw Error("LINK_UNAVAILABLE");
  const start = startContextSchema.parse(data);
  if (start.paymentStatus === "PAID") {
    return { status: "verified", attemptId: start.attempt?.attemptId ?? null, frozenTotalVnd: start.attempt?.frozenTotalVnd ?? null, expiresAt: start.attempt?.expiresAt ?? null };
  }
  let attempt = start.attempt?.status === "ACTIVE" ? start.attempt : null;
  if (attempt == null) {
    const created = await beginPayment(port as ReservationPort, start.organizationId, {
      orderId: start.orderId, expectedVersion: start.revision, requestId: parsedBody.requestId,
    });
    attempt = { attemptId: created.attemptId, frozenTotalVnd: created.frozenTotalVnd, expiresAt: created.expiresAt, status: "ACTIVE" };
  }
  if (Date.parse(attempt.expiresAt) <= now().getTime()) {
    return { status: "expired", attemptId: attempt.attemptId, frozenTotalVnd: attempt.frozenTotalVnd, expiresAt: attempt.expiresAt };
  }
  const persisted = persistSchema.parse(await call(port, "persist_vnpay_checkout", {
    p_organization_id: start.organizationId,
    p_attempt_id: attempt.attemptId,
    p_txn_ref: txnRefForAttempt(attempt.attemptId),
    p_tmn_code: merchant.tmnCode,
    p_amount_vnd: attempt.frozenTotalVnd,
    p_create_date: gmt7Stamp(now()),
    p_expire_date: gmt7Stamp(new Date(attempt.expiresAt)),
    p_ip_addr: context.ip,
    p_payment_host: merchant.paymentHost,
  }));
  if (persisted.amountVnd !== attempt.frozenTotalVnd || persisted.tmnCode !== merchant.tmnCode || persisted.paymentHost !== merchant.paymentHost) {
    throw Error("ORDER_REQUEST_CONFLICT");
  }
  const paymentUrl = buildVnpayPaymentUrl(merchant, buildVnpayPaymentFields({
    frozenTotalVnd: attempt.frozenTotalVnd,
    txnRef: persisted.txnRef,
    tmnCode: merchant.tmnCode,
    createDate: persisted.createDate,
    expireDate: persisted.expireDate,
    ipAddr: persisted.ipAddr,
    returnUrl: vnpayReturnUrl(origin),
  }));
  return { status: "redirect", paymentUrl, txnRef: persisted.txnRef, attemptId: attempt.attemptId, frozenTotalVnd: attempt.frozenTotalVnd, expiresAt: attempt.expiresAt };
}

export type ReturnView = {
  status: "pending" | "verified" | "expired" | "invalid" | "unconfigured";
  paymentStatus: "UNPAID" | "FAILED" | "PAID" | null;
  attemptStatus: "ACTIVE" | "CONSUMED" | "RELEASED" | null;
  checksumOk: boolean | null;
  responseCode: string | null;
};

export async function readVnpayReturn(
  port: VnpayCheckoutPort,
  query: Record<string, string>,
  merchant: VnpayMerchantConfig | null,
): Promise<ReturnView> {
  const txnRef = query.vnp_TxnRef ?? "";
  const responseCode = query.vnp_ResponseCode ?? null;
  const checksumOk = merchant ? verifyVnpayChecksum(query, merchant.hashSecret) : null;
  const data = txnRef ? await call(port, "read_vnpay_return", { p_txn_ref: txnRef }) : null;
  const row = data == null ? null : returnRowSchema.parse(data);
  if (merchant && checksumOk === false) {
    return { status: "invalid", paymentStatus: row?.paymentStatus ?? null, attemptStatus: row?.attemptStatus ?? null, checksumOk: false, responseCode };
  }
  if (row == null) {
    return { status: merchant ? "invalid" : "unconfigured", paymentStatus: null, attemptStatus: null, checksumOk, responseCode };
  }
  if (row.paymentStatus === "PAID") {
    return { status: "verified", paymentStatus: row.paymentStatus, attemptStatus: row.attemptStatus, checksumOk, responseCode };
  }
  if (row.attemptStatus === "RELEASED" || row.fulfilmentStatus === "EXPIRED") {
    return { status: "expired", paymentStatus: row.paymentStatus, attemptStatus: row.attemptStatus, checksumOk, responseCode };
  }
  return { status: "pending", paymentStatus: row.paymentStatus, attemptStatus: row.attemptStatus, checksumOk, responseCode };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

export function renderVnpayReturnPage(view: ReturnView) {
  const copy = {
    pending: "Đang chờ xác nhận thanh toán. Trạng thái lấy từ hệ thống, không phải từ địa chỉ trả về.",
    verified: "Thanh toán đã được xác nhận.",
    expired: "Phiên thanh toán đã hết hạn.",
    invalid: "Phản hồi cổng thanh toán không hợp lệ.",
    unconfigured: "Cổng thanh toán chưa được cấu hình.",
  }[view.status];
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Kết quả thanh toán</title></head><body><main><p>ONEVOICE</p><h1>Kết quả thanh toán</h1><p role="status">${escapeHtml(copy)}</p></main></body></html>`;
}

function jsonError(code: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ error: { code, ...extra } }, { status, headers: confirmationHeaders() });
}

function mapStartError(error: unknown) {
  const code = error instanceof Error ? error.message : "ORDER_UNAVAILABLE";
  if (code === "LINK_UNAVAILABLE") return jsonError(code, 404);
  if (code === "ORDER_FORBIDDEN") return jsonError(code, 403);
  if (code === "PAYMENT_EXPIRED") return jsonError(code, 410);
  if (code === "MERCHANT_UNCONFIGURED") return jsonError(code, 503);
  if (code === "ORDER_CONFLICT" || code === "ORDER_REQUEST_CONFLICT" || code === "ORDER_FROZEN" || code === "ORDER_VERSION_CONFLICT") return jsonError(code, 409);
  if (code.startsWith("ORDER_") || code.startsWith("VNPAY_") || code === "INVALID_REQUEST") return jsonError(code, 400);
  return jsonError("ORDER_UNAVAILABLE", 503);
}

export function createVnpayCheckoutRoute(deps: {
  port: VnpayCheckoutPort;
  origin: string;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  limiter?: LoginLimiter;
}) {
  const limiter = deps.limiter ?? new LoginLimiter(Date.now, 20, 200, 60_000);
  return {
    async POST(request: Request, token: string) {
      if (!customerMutationAllowed(request, deps.origin)) return jsonError("FORBIDDEN", 403);
      if (!tokenSchema.safeParse(token).success) return jsonError("LINK_UNAVAILABLE", 404);
      if (!limiter.take(hashConfirmationToken(token))) return jsonError("RATE_LIMITED", 429);
      if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return jsonError("INVALID_REQUEST", 400);
      let body: unknown;
      try { body = JSON.parse(await request.text()); } catch { return jsonError("INVALID_REQUEST", 400); }
      const merchantRead = readVnpayMerchantConfig(deps.env ?? process.env);
      if (!merchantRead.ok) return jsonError("MERCHANT_UNCONFIGURED", 503, { missing: merchantRead.missing, invalid: merchantRead.invalid });
      try {
        const result = await startVnpayCheckout(deps.port, merchantRead.merchant, deps.origin, token, body, { ip: clientIpFrom(request), now: deps.now });
        if (result.status === "expired") return jsonError("PAYMENT_EXPIRED", 410);
        if (result.status === "verified") return Response.json({ status: "verified" }, { headers: confirmationHeaders() });
        return Response.json({
          status: "redirect",
          paymentUrl: result.paymentUrl,
          txnRef: result.txnRef,
          attemptId: result.attemptId,
          frozenTotalVnd: result.frozenTotalVnd,
          expiresAt: result.expiresAt,
        }, { headers: confirmationHeaders() });
      } catch (error) {
        if (error instanceof z.ZodError) return jsonError("INVALID_REQUEST", 400);
        return mapStartError(error);
      }
    },
    async GET_RETURN(request: Request) {
      const url = new URL(request.url);
      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => { query[key] = value; });
      const merchantRead = readVnpayMerchantConfig(deps.env ?? process.env);
      const view = await readVnpayReturn(deps.port, query, merchantRead.ok ? merchantRead.merchant : null);
      return new Response(renderVnpayReturnPage(view), {
        status: 200,
        headers: { ...confirmationHeaders(), "Content-Type": "text/html; charset=utf-8" },
      });
    },
  };
}
