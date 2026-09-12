// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { confirmationHeaders } from "@/lib/orders/confirmation";
import { consumeInventoryAttempt, type ReservationPort, type ReservationRpcName } from "@/lib/orders/reservations";
import {
  canonicalizeVnpayParams,
  readVnpayMerchantConfig,
  verifyVnpayChecksum,
  type VnpayMerchantConfig,
} from "./checkout";

/** Official IPN ACK, same PAY 2.1.0 page as checkout. HMAC before any mutation. */
export const VNPAY_IPN_ACK = {
  url: "https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html",
  retrieved: "2026-09-13",
  method: "GET",
  retryEnds: ["00", "02"],
  retryContinues: ["01", "04", "97", "99"],
  messages: {
    "00": "Confirm Success",
    "01": "Order not found",
    "02": "Order already confirmed",
    "04": "invalid amount",
    "97": "Invalid signature",
    "99": "Unknow error",
  },
} as const;

export const VNPAY_IPN_PATH = "/api/payments/vnpay/ipn";
export type VnpayIpnRspCode = keyof typeof VNPAY_IPN_ACK.messages;
export type VnpayIpnAck = { RspCode: VnpayIpnRspCode; Message: string };

export type VnpayIpnRpcName = ReservationRpcName | "finalize_vnpay_ipn";
export interface VnpayIpnPort {
  rpc(name: VnpayIpnRpcName, args: Record<string, Json>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

const finalizeResultSchema = z.object({
  RspCode: z.enum(["00", "01", "02", "04", "99"]),
  Message: z.string().min(1),
}).passthrough();

function ack(code: VnpayIpnRspCode): VnpayIpnAck {
  return { RspCode: code, Message: VNPAY_IPN_ACK.messages[code] };
}

function vnpParams(query: Record<string, string>) {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("vnp_") && value !== "") params[key] = value;
  }
  return params;
}

export function ipnPayloadDigest(params: Record<string, string>) {
  return createHash("sha256").update(canonicalizeVnpayParams(params), "utf8").digest("hex");
}

async function call(port: VnpayIpnPort, name: VnpayIpnRpcName, args: Record<string, Json>) {
  let result;
  try { result = await port.rpc(name, args); } catch { throw Error("ORDER_UNAVAILABLE"); }
  if (result.error) {
    const message = result.error.message;
    if (message && /^(ORDER_|CATALOG_|PAYMENT_|VNPAY_)/.test(message)) throw Error(message);
    throw Error(result.error.code === "42501" ? "ORDER_FORBIDDEN" : result.error.code === "55000" ? "ORDER_FROZEN" : ["40001", "23505"].includes(result.error.code ?? "") ? "ORDER_CONFLICT" : ["22023", "23514", "22P02"].includes(result.error.code ?? "") ? "ORDER_INVALID" : "ORDER_UNAVAILABLE");
  }
  return result.data;
}

/**
 * HMAC is verified before this function may call the port. SQL finalize_vnpay_ipn
 * then atomically matches merchant/amount/currency/ref and either consumes via
 * consume_inventory_attempt (same lock order as OV-022) or records MANUAL_REVIEW.
 */
export async function handleVnpayIpn(
  port: VnpayIpnPort,
  query: Record<string, string>,
  merchant: VnpayMerchantConfig | null,
): Promise<VnpayIpnAck> {
  if (merchant == null) return ack("99");
  const params = vnpParams(query);
  if (!params.vnp_TxnRef || !params.vnp_SecureHash || !params.vnp_Amount || !params.vnp_TmnCode || !params.vnp_ResponseCode || !params.vnp_TransactionStatus || !params.vnp_TransactionNo) {
    return ack("99");
  }
  if (!verifyVnpayChecksum(params, merchant.hashSecret)) return ack("97");
  if (params.vnp_TmnCode !== merchant.tmnCode) return ack("01");
  const currCode = params.vnp_CurrCode || "VND";
  if (currCode !== "VND" || !/^[0-9]{1,12}$/.test(params.vnp_Amount) || !/^[0-9]{1,15}$/.test(params.vnp_TransactionNo) || !/^[0-9]{2}$/.test(params.vnp_ResponseCode) || !/^[0-9]{2}$/.test(params.vnp_TransactionStatus) || !/^[A-Za-z0-9]{1,100}$/.test(params.vnp_TxnRef)) {
    return currCode !== "VND" || !/^[0-9]{1,12}$/.test(params.vnp_Amount) ? ack("04") : ack("99");
  }
  try {
    const data = await call(port, "finalize_vnpay_ipn", {
      p_txn_ref: params.vnp_TxnRef,
      p_tmn_code: params.vnp_TmnCode,
      p_amount: Number(params.vnp_Amount),
      p_curr_code: currCode,
      p_response_code: params.vnp_ResponseCode,
      p_transaction_status: params.vnp_TransactionStatus,
      p_transaction_no: params.vnp_TransactionNo,
      p_payload_digest: ipnPayloadDigest(params),
    });
    const parsed = finalizeResultSchema.parse(data);
    return { RspCode: parsed.RspCode, Message: parsed.Message };
  } catch {
    return ack("99");
  }
}

export function createVnpayIpnRoute(deps: {
  port: VnpayIpnPort;
  env?: Record<string, string | undefined>;
}) {
  return {
    async GET(request: Request) {
      const url = new URL(request.url);
      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => { query[key] = value; });
      const merchantRead = readVnpayMerchantConfig(deps.env ?? process.env);
      const result = await handleVnpayIpn(deps.port, query, merchantRead.ok ? merchantRead.merchant : null);
      return Response.json({ RspCode: result.RspCode, Message: result.Message }, {
        status: 200,
        headers: { ...confirmationHeaders(), "Content-Type": "application/json" },
      });
    },
  };
}

export type { ReservationPort };
export { consumeInventoryAttempt };
