// SPDX-License-Identifier: Apache-2.0
import { execFileSync, execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  createCheckoutCollection,
  createConfirmationService,
  createConfirmationToken,
  createShippingSettingsService,
  hashConfirmationToken,
  type ConfirmationPort,
} from "@/lib/orders/confirmation";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  VNPAY_AMOUNT_MAX_VND,
  VNPAY_PRODUCTION_PAYMENT_URL,
  VNPAY_SANDBOX_PAYMENT_URL,
  VNPAY_SPEC,
  buildVnpayPaymentFields,
  buildVnpayPaymentUrl,
  canonicalizeVnpayParams,
  createVnpayCheckoutRoute,
  gmt7Stamp,
  readVnpayMerchantConfig,
  readVnpayReturn,
  renderVnpayReturnPage,
  signVnpaySecureHash,
  startCheckoutBodySchema,
  startVnpayCheckout,
  txnRefForAttempt,
  vnpayAmountFromVnd,
  vnpayUrlEncode,
  type VnpayCheckoutPort,
  type VnpayMerchantConfig,
} from "./checkout";
const sandboxEnv: Record<string, string | undefined> = { ...process.env };
for (const file of [".env", ".env.local"]) {
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/.test(key) || sandboxEnv[key]) continue;
    let value = line.slice(eq + 1);
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    sandboxEnv[key] = value;
  }
}

const origin = "https://merchant.test";
const token = createConfirmationToken(() => Uint8Array.from({ length: 32 }, (_, i) => i + 1)).token;
const requestId = "a2300000-0000-4000-8000-000000000020";
const org = "a2300000-0000-4000-8000-000000000001";
const order = "a2300000-0000-4000-8000-000000000010";
const attemptId = "a2300000-0000-4000-8000-000000000030";
const txnRef = "a2300000000040008000000000000030";
const expiresAt = "2026-09-12T05:15:00.000Z";
const createAt = new Date("2026-09-12T05:00:00.000Z");
const secret = "test-hash-secret-not-a-merchant";
const sandbox: VnpayMerchantConfig = {
  tmnCode: "TESTTMN1",
  hashSecret: secret,
  paymentUrl: VNPAY_SANDBOX_PAYMENT_URL,
  environment: "sandbox",
  paymentHost: "sandbox.vnpayment.vn",
};
const production: VnpayMerchantConfig = {
  ...sandbox,
  paymentUrl: VNPAY_PRODUCTION_PAYMENT_URL,
  environment: "production",
  paymentHost: "www.vnpayment.vn",
};

/** Hand-built per official PHP urlencode + HMACSHA512. Not imported from checkout.ts. */
const GOLDEN = {
  specUrl: "https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html",
  retrieved: "2026-09-12",
  version: "2.1.0",
  asciiHashData: "vnp_Amount=1000000&vnp_Command=pay&vnp_CreateDate=20260912120000&vnp_CurrCode=VND&vnp_ExpireDate=20260912121500&vnp_IpAddr=127.0.0.1&vnp_Locale=vn&vnp_OrderInfo=Thanh+toan+don+hang&vnp_OrderType=other&vnp_ReturnUrl=https%3A%2F%2Fmerchant.test%2Fapi%2Fpayments%2Fvnpay%2Freturn&vnp_TmnCode=TESTTMN1&vnp_TxnRef=a2230000000040008000000000000030&vnp_Version=2.1.0",
  asciiHmac: "672e4ca7a67953cdb491d0a2bbfc4cd45a9e02e22321abef037a072c9a69f3bc5593253572cdf4377101b9edfa440fb961b7f523e6f934a8ca4851c0460aefeb",
  vietOrderInfo: "Thanh toán đơn + hàng",
  vietEncoded: "Thanh+to%C3%A1n+%C4%91%C6%A1n+%2B+h%C3%A0ng",
  vietHmac: "4e352291382942622822ddc7f7ce51cd47597ac49e3d8c4978a18f81b75e4b99822f211be6ebec4b8e3914cfb091ee3b818873c8cb2cb77fb1b09985aa6f01b6",
  spacesPlusEncoded: "pay+%2B+extra++spaces",
  spacesPlusHmac: "8d5037040811ffdd37fee240cb277ee3b1c50f01f5f741e5acc9a1e4911f8b84747ff97bf0632aca1d1f10428d7e4f6a1862f1f9810f38832a7616f986395ab8",
  minHmac: "70739f491ffe48413fe1da72e7487d73877fd1b4d11eb6236dd5c7dd2cac069824ad016a7d88adaf8dac9d16b99310127984c6c1a6aa55aa844c8fd829b163d5",
  maxHmac: "3f5c5028dc641ea7e598841ce329439e12110f0e02d913b6108df89864cb60f451a9f10ac114ecad4b254d776091e9b1f7a4980c0164e7fc60fc09d5719a0741",
  docsOrderInfoEncoded: "Thanh+toan+don+hang+%3A5",
} as const;

function independentHmac(hashData: string) {
  return createHmac("sha512", secret).update(hashData, "utf8").digest("hex");
}

const asciiFields = {
  vnp_Amount: "1000000",
  vnp_Command: "pay",
  vnp_CreateDate: "20260912120000",
  vnp_CurrCode: "VND",
  vnp_ExpireDate: "20260912121500",
  vnp_IpAddr: "127.0.0.1",
  vnp_Locale: "vn",
  vnp_OrderInfo: "Thanh toan don hang",
  vnp_OrderType: "other",
  vnp_ReturnUrl: "https://merchant.test/api/payments/vnpay/return",
  vnp_TmnCode: "TESTTMN1",
  vnp_TxnRef: "a2230000000040008000000000000030",
  vnp_Version: "2.1.0",
};

function fakePort(options?: {
  paymentStatus?: "UNPAID" | "PAID";
  attempt?: { attemptId: string; frozenTotalVnd: number; expiresAt: string; status: "ACTIVE" | "CONSUMED" | "RELEASED" } | null;
  persist?: Record<string, unknown>;
  begin?: Record<string, unknown>;
  returnRow?: Record<string, unknown> | null;
  mutations?: string[];
}) {
  const calls: string[] = [];
  const mutations = options?.mutations ?? [];
  const attempt = options?.attempt === undefined ? {
    attemptId, frozenTotalVnd: 10000, expiresAt, status: "ACTIVE" as const,
  } : options.attempt;
  const persist = options?.persist ?? {
    txnRef, attemptId, amountVnd: 10000, tmnCode: "TESTTMN1",
    createDate: "20260912120000", expireDate: "20260912121500", ipAddr: "127.0.0.1", paymentHost: "sandbox.vnpayment.vn",
  };
  const port: VnpayCheckoutPort = {
    async rpc(name, args) {
      calls.push(name);
      if (name === "read_vnpay_checkout_start") {
        return { data: {
          organizationId: org, orderId: order, revision: 1,
          paymentStatus: options?.paymentStatus ?? "UNPAID", fulfilmentStatus: "AWAITING_PAYMENT",
          attempt,
        }, error: null };
      }
      if (name === "read_confirmed_order_quote") {
        return { data: {
          orderId: order, organizationId: org, revision: 1, currency: "VND",
          buyerName: "Buyer", phone: "+84900000023", address: { line1: "12 Test", ward: null, district: null, province: "Hà Nội", countryCode: "VN" },
          subtotalVnd: 8000, shippingFeeVnd: 2000, shippingRevision: 1, totalVnd: 10000,
          fulfilmentStatus: "DRAFT", paymentStatus: "UNPAID", checkoutFrozenAt: null,
          items: [{ productId: "a2300000-0000-4000-8000-000000000004", variantId: null, productVersion: 1, name: "Keyboard", sku: "KB", quantity: 1, unitPriceVnd: 8000, lineTotalVnd: 8000 }],
        }, error: null };
      }
      if (name === "begin_payment") {
        if ("p_amount" in args || "p_total" in args || "p_return_url" in args) throw Error("client_total_forwarded");
        return { data: options?.begin ?? { attemptId, frozenTotalVnd: 10000, expiresAt }, error: null };
      }
      if (name === "persist_vnpay_checkout") {
        return { data: persist, error: null };
      }
      if (name === "read_vnpay_return") {
        return { data: options?.returnRow === undefined ? {
          txnRef, attemptId, frozenTotalVnd: 10000, expiresAt, attemptStatus: "ACTIVE", paymentStatus: "UNPAID", fulfilmentStatus: "AWAITING_PAYMENT",
        } : options.returnRow, error: null };
      }
      if (name === "consume_inventory_attempt" || name === "expire_inventory_attempt") {
        mutations.push(name);
        return { data: { status: "consumed", attemptId, frozenTotalVnd: 10000 }, error: null };
      }
      return { data: null, error: { message: "unexpected" } };
    },
  };
  return { port, calls, mutations };
}

describe("AT-023-01 golden signing vectors", () => {
  it("records official spec identity independent of this adapter", () => {
    expect(GOLDEN.specUrl).toBe(VNPAY_SPEC.url);
    expect(GOLDEN.retrieved).toBe("2026-09-12");
    expect(GOLDEN.version).toBe("2.1.0");
    expect(independentHmac(GOLDEN.asciiHashData)).toBe(GOLDEN.asciiHmac);
    expect(vnpayUrlEncode("Thanh toan don hang :5")).toBe(GOLDEN.docsOrderInfoEncoded);
  });

  it("signs Vietnamese, spaces, plus, encoded return URL, and VND amount scale", () => {
    expect(canonicalizeVnpayParams(asciiFields)).toBe(GOLDEN.asciiHashData);
    expect(signVnpaySecureHash(asciiFields, secret)).toBe(GOLDEN.asciiHmac);
    expect(vnpayUrlEncode(GOLDEN.vietOrderInfo)).toBe(GOLDEN.vietEncoded);
    expect(signVnpaySecureHash({ ...asciiFields, vnp_OrderInfo: GOLDEN.vietOrderInfo }, secret)).toBe(GOLDEN.vietHmac);
    expect(vnpayUrlEncode("pay + extra  spaces")).toBe(GOLDEN.spacesPlusEncoded);
    expect(signVnpaySecureHash({ ...asciiFields, vnp_OrderInfo: "pay + extra  spaces" }, secret)).toBe(GOLDEN.spacesPlusHmac);
    expect(vnpayAmountFromVnd(10000)).toBe(1_000_000);
    expect(vnpayAmountFromVnd(1)).toBe(100);
    expect(vnpayAmountFromVnd(VNPAY_AMOUNT_MAX_VND)).toBe(999_999_999_900);
    expect(signVnpaySecureHash({ ...asciiFields, vnp_Amount: "100" }, secret)).toBe(GOLDEN.minHmac);
    expect(signVnpaySecureHash({ ...asciiFields, vnp_Amount: "999999999900" }, secret)).toBe(GOLDEN.maxHmac);
    expect(() => vnpayAmountFromVnd(0)).toThrow("VNPAY_AMOUNT_INVALID");
    expect(() => vnpayAmountFromVnd(VNPAY_AMOUNT_MAX_VND + 1)).toThrow("VNPAY_AMOUNT_INVALID");
    expect(gmt7Stamp(createAt)).toBe("20260912120000");
    expect(gmt7Stamp(new Date(expiresAt))).toBe("20260912121500");
  });
});

describe("AT-023-02 client tamper and expiry", () => {
  it("rejects client amount, currency, and returnUrl and ignores them on the signed URL", async () => {
    expect(startCheckoutBodySchema.safeParse({ requestId, amount: 1 }).success).toBe(false);
    expect(startCheckoutBodySchema.safeParse({ requestId, currency: "USD" }).success).toBe(false);
    expect(startCheckoutBodySchema.safeParse({ requestId, returnUrl: "https://evil.test" }).success).toBe(false);
    const { port } = fakePort();
    const started = await startVnpayCheckout(port, sandbox, origin, token, { requestId }, { ip: "127.0.0.1", now: () => createAt });
    expect(started.status).toBe("redirect");
    if (started.status !== "redirect") throw Error("expected redirect");
    const url = new URL(started.paymentUrl);
    expect(url.searchParams.get("vnp_Amount")).toBe("1000000");
    expect(url.searchParams.get("vnp_CurrCode")).toBe("VND");
    expect(url.searchParams.get("vnp_ReturnUrl")).toBe(`${origin}/api/payments/vnpay/return`);
    expect(url.searchParams.get("vnp_TxnRef")).toBe(txnRef);
    expect(started.paymentUrl).not.toContain(secret);
    expect(url.searchParams.get("vnp_TmnCode")).toBe("TESTTMN1");
  });

  it("does not emit a signed URL for an expired attempt", async () => {
    const { port, calls } = fakePort({ attempt: { attemptId, frozenTotalVnd: 10000, expiresAt: "2026-09-12T04:59:59.000Z", status: "ACTIVE" } });
    const started = await startVnpayCheckout(port, sandbox, origin, token, { requestId }, { ip: "127.0.0.1", now: () => createAt });
    expect(started).toMatchObject({ status: "expired", attemptId, frozenTotalVnd: 10000 });
    expect(started.paymentUrl).toBeUndefined();
    expect(calls).toEqual(["read_vnpay_checkout_start"]);
  });
});

describe("AT-023-03 replay and sandbox isolation", () => {
  it("replays the same active attempt reference without a second reservation", async () => {
    const { port, calls } = fakePort();
    const first = await startVnpayCheckout(port, sandbox, origin, token, { requestId }, { ip: "10.0.0.1", now: () => createAt });
    const second = await startVnpayCheckout(port, sandbox, origin, token, { requestId: "a2300000-0000-4000-8000-000000000021" }, { ip: "10.0.0.2", now: () => new Date("2026-09-12T05:01:00.000Z") });
    expect(first).toEqual(second);
    expect(calls.filter((name) => name === "begin_payment")).toEqual([]);
    expect(calls.filter((name) => name === "persist_vnpay_checkout")).toHaveLength(2);
    if (first.status !== "redirect") throw Error("expected redirect");
    expect(first.txnRef).toBe(txnRef);
    expect(txnRefForAttempt(attemptId)).toBe(txnRef);
  });

  it("begins payment from trusted identifiers only when no active attempt exists", async () => {
    const { port, calls } = fakePort({ attempt: null });
    const started = await startVnpayCheckout(port, sandbox, origin, token, { requestId }, { ip: "127.0.0.1", now: () => createAt });
    expect(started.status).toBe("redirect");
    expect(calls).toEqual(["read_vnpay_checkout_start", "read_confirmed_order_quote", "begin_payment", "persist_vnpay_checkout"]);
  });

  it("keeps sandbox URLs off production credentials and rejects mock hosts", () => {
    const sandboxUrl = buildVnpayPaymentUrl(sandbox, buildVnpayPaymentFields({
      frozenTotalVnd: 10000, txnRef, tmnCode: sandbox.tmnCode, createDate: "20260912120000",
      expireDate: "20260912121500", ipAddr: "127.0.0.1", returnUrl: `${origin}/api/payments/vnpay/return`,
    }));
    const productionUrl = buildVnpayPaymentUrl(production, buildVnpayPaymentFields({
      frozenTotalVnd: 10000, txnRef, tmnCode: production.tmnCode, createDate: "20260912120000",
      expireDate: "20260912121500", ipAddr: "127.0.0.1", returnUrl: `${origin}/api/payments/vnpay/return`,
    }));
    expect(sandboxUrl.startsWith(VNPAY_SANDBOX_PAYMENT_URL)).toBe(true);
    expect(sandboxUrl).not.toContain("www.vnpayment.vn");
    expect(productionUrl.startsWith(VNPAY_PRODUCTION_PAYMENT_URL)).toBe(true);
    expect(productionUrl).not.toContain("sandbox.vnpayment.vn");
    expect(readVnpayMerchantConfig({
      VNPAY_TMN_CODE: "TESTTMN1", VNPAY_HASH_SECRET: secret, VNPAY_PAYMENT_URL: "https://example.test/vnpay",
    })).toEqual({ ok: false, missing: [], invalid: ["VNPAY_PAYMENT_URL"] });
  });
});

describe("return page does not mark paid", () => {
  it("stays pending when the querystring claims success and never consumes stock", async () => {
    const { port, mutations } = fakePort();
    const fields = buildVnpayPaymentFields({
      frozenTotalVnd: 10000, txnRef, tmnCode: sandbox.tmnCode, createDate: "20260912120000",
      expireDate: "20260912121500", ipAddr: "127.0.0.1", returnUrl: `${origin}/api/payments/vnpay/return`,
    });
    const query = { ...fields, vnp_ResponseCode: "00", vnp_TransactionStatus: "00", vnp_SecureHash: signVnpaySecureHash({ ...fields, vnp_ResponseCode: "00", vnp_TransactionStatus: "00" }, secret) };
    const view = await readVnpayReturn(port, query, sandbox);
    expect(view).toMatchObject({ status: "pending", paymentStatus: "UNPAID", checksumOk: true, responseCode: "00" });
    expect(mutations).toEqual([]);
    const html = renderVnpayReturnPage(view);
    expect(html).toContain("Đang chờ xác nhận thanh toán");
    expect(html).not.toContain(secret);
    const paid = fakePort({
      returnRow: { txnRef, attemptId, frozenTotalVnd: 10000, expiresAt, attemptStatus: "CONSUMED", paymentStatus: "PAID", fulfilmentStatus: "PREPARING" },
    });
    expect(await readVnpayReturn(paid.port, query, sandbox)).toMatchObject({ status: "verified", paymentStatus: "PAID" });
  });
});

describe("AT-023-04 sandbox merchant config", () => {
  it("names exact missing env vars and does not treat mocks as sandbox proof", () => {
    expect(readVnpayMerchantConfig({
      VNPAY_TMN_CODE: "", VNPAY_HASH_SECRET: "", VNPAY_PAYMENT_URL: "",
    })).toEqual({ ok: false, missing: ["VNPAY_TMN_CODE", "VNPAY_HASH_SECRET", "VNPAY_PAYMENT_URL"], invalid: [] });
    expect(readVnpayMerchantConfig({
      VNPAY_TMN_CODE: "TESTTMN1", VNPAY_HASH_SECRET: secret, VNPAY_PAYMENT_URL: "https://example.test/pay",
    })).toEqual({ ok: false, missing: [], invalid: ["VNPAY_PAYMENT_URL"] });
    const live = readVnpayMerchantConfig(sandboxEnv);
    expect(live.ok).toBe(true);
    if (!live.ok) throw Error("sandbox merchant env is required for AT-023-04");
    expect(live.merchant.environment).toBe("sandbox");
    expect(live.merchant.paymentHost).toBe("sandbox.vnpayment.vn");
    expect(live.merchant.paymentUrl).toBe(VNPAY_SANDBOX_PAYMENT_URL);
    expect(live.merchant.paymentUrl).not.toContain("www.vnpayment.vn");
  });

  it("opens a signed sandbox session from a local confirmed order", async () => {
    const appSupabaseHost = new URL(sandboxEnv.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid.invalid").host;
    expect(appSupabaseHost).not.toMatch(/^(localhost|127\.0\.0\.1)(:\d+)?$/);
    const origin = sandboxEnv.ONEVOICE_APP_ORIGIN;
    if (!origin) throw Error("ONEVOICE_APP_ORIGIN missing");
    const live = readVnpayMerchantConfig(sandboxEnv);
    expect(live.ok).toBe(true);
    if (!live.ok) throw Error("MERCHANT_UNCONFIGURED");
    expect(live.merchant.environment).toBe("sandbox");
    let raw: string;
    try {
      raw = execSync("pnpm exec supabase status --output json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      throw Error("local_supabase_unavailable");
    }
    const status = JSON.parse(raw.slice(raw.indexOf("{"))) as { API_URL: string; SERVICE_ROLE_KEY: string };
    const localUrl = new URL(status.API_URL);
    if (localUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(localUrl.hostname)) throw Error("local_only");
    const sql = (query: string) => execFileSync("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, windowsHide: true, encoding: "utf8" }).trim();
    const org = randomUUID();
    const actor = randomUUID();
    const conversation = randomUUID();
    const product = randomUUID();
    const page = String(Date.now());
    const client = createClient<Database>(localUrl.href, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const rpc = (name: string, args: Record<string, Json>) => client.rpc(name as never, args as never);
    const confirmationPort = { rpc } as ConfirmationPort;
    const checkoutPort: VnpayCheckoutPort = { rpc };
    sql(`insert into public.organizations(id,name,slug) values('${org}','OV023 sandbox','${org}');
insert into auth.users(id) values('${actor}');
insert into public.staff_profiles(user_id,organization_id,role,active) values('${actor}','${org}','manager',true);
insert into public.conversations(id,organization_id,page_id,psid) values('${conversation}','${org}','${page}','${page}2');`);
    try {
      const document = JSON.stringify({
        name: "OV023 sandbox keyboard", sku: `OV023-${product.slice(0, 8)}`, brand: null, productType: "keyboard",
        descriptionText: null, priceVnd: 10000, stockQuantity: 2, inStock: true, active: true,
        specifications: [], images: [], variants: [],
      }).replaceAll("'", "''");
      sql(`select public.save_catalog_product('${org}','${actor}','${randomUUID()}','${product}',0,'${document}'::jsonb);`);
      const shipping = createShippingSettingsService(confirmationPort, { userId: actor, organizationId: org, role: "manager", displayName: "OV023" });
      const current = await shipping.read();
      await shipping.save({ requestId: randomUUID(), expectedRevision: current.revision, flatFeeVnd: 20000 });
      const collected = await createCheckoutCollection(confirmationPort, {
        organizationId: org, ownerId: conversation, conversationId: conversation, origin,
      }).collect({
        buyerName: "Nguyen Van A", phone: "+84900000023",
        address: { line1: "12 Test", ward: null, district: null, province: "Ha Noi", countryCode: "VN" },
        items: [{ productId: product, variantId: null, quantity: 1 }],
      }, randomUUID());
      if (!collected.ok) throw Error(`collect_${collected.field}`);
      const service = createConfirmationService(confirmationPort, { origin });
      const viewed = await service.read(collected.token);
      if (!viewed.ok) throw Error(viewed.code);
      const confirmed = await service.confirm(collected.token, {
        requestId: randomUUID(), orderVersion: viewed.quote.revision,
        subtotalVnd: viewed.quote.subtotalVnd, shippingFeeVnd: viewed.quote.shippingFeeVnd, totalVnd: viewed.quote.totalVnd,
      });
      if (!confirmed.ok || confirmed.status !== "confirmed") throw Error(!confirmed.ok ? confirmed.code : confirmed.status);
      const route = createVnpayCheckoutRoute({ port: checkoutPort, origin, env: sandboxEnv });
      const started = await route.POST(new Request(`${origin}/api/payments/vnpay/${collected.token}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ requestId: randomUUID() }),
      }), collected.token);
      const payload = await started.json() as { status?: string; paymentUrl?: string; error?: { code?: string } };
      expect(payload.error?.code).not.toBe("MERCHANT_UNCONFIGURED");
      expect(started.status).toBe(200);
      expect(payload.status).toBe("redirect");
      if (typeof payload.paymentUrl !== "string") throw Error("missing_payment_url");
      const payment = new URL(payload.paymentUrl);
      const secureHash = payment.searchParams.get("vnp_SecureHash") ?? "";
      expect(payment.protocol).toBe("https:");
      expect(payment.host).toBe("sandbox.vnpayment.vn");
      expect(payment.pathname).toBe("/paymentv2/vpcpay.html");
      expect(payload.paymentUrl).not.toContain("www.vnpayment.vn");
      expect(payment.searchParams.has("vnp_SecureHash")).toBe(true);
      expect(secureHash).toMatch(/^[0-9a-f]{128}$/i);
      expect(payment.searchParams.has("vnp_TxnRef")).toBe(true);
      expect(payment.searchParams.has("vnp_Amount")).toBe(true);
      const sandboxRes = await fetch(payload.paymentUrl, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(20000) });
      const sandboxHost = new URL(sandboxRes.url).host;
      expect(sandboxHost).toBe("sandbox.vnpayment.vn");
      expect(sandboxHost).not.toBe("www.vnpayment.vn");
      expect(sandboxRes.status).toBeGreaterThanOrEqual(200);
      expect(sandboxRes.status).toBeLessThan(400);
      console.log(JSON.stringify({
        at: "AT-023-04",
        diagnosis: "ORDER_UNAVAILABLE because Next uses remote supabase while fixtures are local",
        appSupabaseHost,
        localApiHost: localUrl.host,
        postStatus: started.status,
        paymentHost: payment.host,
        hasSecureHash: true,
        sandboxStatus: sandboxRes.status,
        sandboxHost,
      }));
    } finally {
      sql(`update public.products set disabled_at=clock_timestamp() where id='${product}' and organization_id='${org}';
update public.staff_profiles set active=false where user_id='${actor}';`);
    }
  }, 60_000);
});

describe("HTTP start and return", () => {
  it("starts from a confirmed token POST and serves pending HTML without secrets", async () => {
    const { port } = fakePort();
    const route = createVnpayCheckoutRoute({
      port, origin, env: { VNPAY_TMN_CODE: "TESTTMN1", VNPAY_HASH_SECRET: secret, VNPAY_PAYMENT_URL: VNPAY_SANDBOX_PAYMENT_URL },
      now: () => createAt,
    });
    const denied = await route.POST(new Request(`${origin}/api/payments/vnpay/${token}`, { method: "POST", headers: { origin, "sec-fetch-site": "same-origin" }, body: JSON.stringify({ requestId }) }), token);
    expect(denied.status).toBe(400);
    const started = await route.POST(new Request(`${origin}/api/payments/vnpay/${token}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ requestId, amount: 9, currency: "USD", returnUrl: "https://evil.test" }),
    }), token);
    expect(started.status).toBe(400);
    const ok = await route.POST(new Request(`${origin}/api/payments/vnpay/${token}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ requestId }),
    }), token);
    const payload = await ok.json() as { paymentUrl: string; txnRef: string };
    expect(ok.status).toBe(200);
    expect(payload.txnRef).toBe(txnRef);
    expect(payload.paymentUrl).toContain("sandbox.vnpayment.vn");
    expect(JSON.stringify(payload)).not.toContain(secret);
    const missing = createVnpayCheckoutRoute({ port, origin, env: {} });
    const blocked = await missing.POST(new Request(`${origin}/api/payments/vnpay/${token}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ requestId }),
    }), token);
    expect(blocked.status).toBe(503);
    expect(await blocked.json()).toEqual({ error: { code: "MERCHANT_UNCONFIGURED", missing: ["VNPAY_TMN_CODE", "VNPAY_HASH_SECRET", "VNPAY_PAYMENT_URL"], invalid: [] } });
    const returnFields = { ...buildVnpayPaymentFields({
      frozenTotalVnd: 10000, txnRef, tmnCode: sandbox.tmnCode, createDate: "20260912120000",
      expireDate: "20260912121500", ipAddr: "127.0.0.1", returnUrl: `${origin}/api/payments/vnpay/return`,
    }), vnp_ResponseCode: "00" };
    const html = await route.GET_RETURN(new Request(`${origin}/api/payments/vnpay/return?${new URLSearchParams({ ...returnFields, vnp_SecureHash: signVnpaySecureHash(returnFields, secret) })}`));
    const body = await html.text();
    expect(html.headers.get("content-type")).toMatch(/text\/html/);
    expect(body).toContain("Đang chờ xác nhận thanh toán");
    expect(body).not.toContain(secret);
    expect(hashConfirmationToken(token).length).toBe(64);
  });
});
