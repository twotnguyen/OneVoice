// SPDX-License-Identifier: Apache-2.0
import { execFileSync, execSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createConfirmationToken } from "@/lib/orders/confirmation";
import { consumeInventoryAttempt } from "@/lib/orders/reservations";
import {
  VNPAY_SANDBOX_PAYMENT_URL,
  buildVnpayPaymentFields,
  readVnpayMerchantConfig,
  readVnpayReturn,
  signVnpaySecureHash,
  type VnpayCheckoutPort,
  type VnpayMerchantConfig,
} from "./checkout";
import {
  VNPAY_IPN_ACK,
  VNPAY_IPN_PATH,
  consumeInventoryAttempt as ipnConsume,
  createVnpayIpnRoute,
  handleVnpayIpn,
  ipnPayloadDigest,
  type VnpayIpnPort,
} from "./notification";

const origin = "https://merchant.test";
const secret = "test-hash-secret-not-a-merchant";
const attemptId = "a2400000-0000-4000-8000-000000000030";
const txnRef = "a2400000000040008000000000000030";
const sandbox: VnpayMerchantConfig = {
  tmnCode: "TESTTMN1",
  hashSecret: secret,
  paymentUrl: VNPAY_SANDBOX_PAYMENT_URL,
  environment: "sandbox",
  paymentHost: "sandbox.vnpayment.vn",
};

function signedIpn(overrides: Record<string, string> = {}) {
  const fields = {
    vnp_Amount: "12000000",
    vnp_BankCode: "NCB",
    vnp_CardType: "ATM",
    vnp_OrderInfo: "Thanh toan don hang",
    vnp_PayDate: "20260912120100",
    vnp_ResponseCode: "00",
    vnp_TmnCode: sandbox.tmnCode,
    vnp_TransactionNo: "14226112",
    vnp_TransactionStatus: "00",
    vnp_TxnRef: txnRef,
    ...overrides,
  };
  return { ...fields, vnp_SecureHash: signVnpaySecureHash(fields, secret) };
}

function fakePort(options?: { finalize?: Record<string, unknown>; error?: { code?: string; message?: string } | null }) {
  const mutations: string[] = [];
  const port: VnpayIpnPort = {
    async rpc(name) {
      mutations.push(name);
      if (name === "finalize_vnpay_ipn") {
        if (options?.error) return { data: null, error: options.error };
        return { data: options?.finalize ?? { RspCode: "00", Message: "Confirm Success", outcome: "PAID" }, error: null };
      }
      if (name === "consume_inventory_attempt") {
        return { data: { status: "consumed", attemptId, frozenTotalVnd: 120000 }, error: null };
      }
      return { data: null, error: { message: "unexpected" } };
    },
  };
  return { port, mutations };
}

interface PsqlSession {
  child: ChildProcess;
  done: Promise<{ code: number | null; stdout: string; stderr: string }>;
  output: () => string;
}

function psqlSession(): PsqlSession {
  const child = spawn("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { windowsHide: true });
  let stdout = "", stderr = "";
  child.stdout.on("data", (data) => { stdout += String(data); });
  child.stderr.on("data", (data) => { stderr += String(data); });
  const { promise, resolve, reject } = Promise.withResolvers<{ code: number | null; stdout: string; stderr: string }>();
  child.on("error", reject);
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  return { child, done: promise, output: () => stdout };
}

function sql(query: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, windowsHide: true, encoding: "utf8" }).trim();
}

function applyFinalizationMigration() {
  const raw = execSync("pnpm exec supabase status --output json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const status = JSON.parse(raw.slice(raw.indexOf("{")));
  const url = new URL(status.API_URL);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("local_only");
  if (!sql("select version from supabase_migrations.schema_migrations where version='20260912121000';")) {
    sql(readFileSync("supabase/migrations/20260912121000_vnpay_payment_finalization.sql", "utf8"));
    const columns = sql("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations';");
    if (columns.includes("statements") && columns.includes("name")) sql("insert into supabase_migrations.schema_migrations(version,name,statements) values('20260912121000','vnpay_payment_finalization','{}');");
    else if (columns.includes("name")) sql("insert into supabase_migrations.schema_migrations(version,name) values('20260912121000','vnpay_payment_finalization');");
    else sql("insert into supabase_migrations.schema_migrations(version) values('20260912121000');");
  }
}

function fixtureSql(ids: { org: string; actor: string; product: string; orderId: string; requestId: string; stock?: number; price?: number }) {
  const stock = ids.stock ?? 1;
  const price = ids.price ?? 100000;
  const document = `{"buyerName":"Buyer","phone":"+84900000024","address":{"line1":"12 Test","ward":null,"district":null,"province":"Ha Noi","countryCode":"VN"},"items":[{"productId":"${ids.product}","variantId":null,"quantity":1}]}`;
  return `
    insert into public.organizations(id,name,slug) values('${ids.org}','OV024 fixture','${ids.org}');
    insert into auth.users(id) values('${ids.actor}');
    insert into public.staff_profiles(user_id,organization_id,role,active) values('${ids.actor}','${ids.org}','manager',true);
    insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,sku,price_vnd,stock_quantity,in_stock,quality)
    values('${ids.product}','${ids.org}','Fixture','urn:test:${ids.product}','urn:test:${ids.product}','Keyboard','KB-24',${price},${stock},true,'partial');
    insert into public.order_shipping_settings(organization_id,flat_fee_vnd) values('${ids.org}',20000);
    select public.save_staff_order_draft('${ids.org}','${ids.actor}','${ids.orderId}','${ids.requestId}',0,'${document}'::jsonb);
    insert into public.order_confirmation_quotes(request_id,organization_id,order_id,revision,quote)
    select '${ids.requestId}','${ids.org}','${ids.orderId}',o.revision,public.internal_order_snapshot('${ids.org}','${ids.orderId}') from public.orders o where o.id='${ids.orderId}';
  `;
}

async function waitFor(session: PsqlSession, token: string, label: string) {
  // Peer postgres session; fake timers cannot observe another backend.
  const deadline = Date.now() + 15000;
  while (!session.output().includes(token)) {
    if (Date.now() >= deadline) throw Error(label);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("official IPN ACK contract", () => {
  it("records PAY IPN retry codes without treating mocks as sandbox proof", () => {
    expect(VNPAY_IPN_ACK.url).toBe("https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html");
    expect(VNPAY_IPN_ACK.method).toBe("GET");
    expect(VNPAY_IPN_PATH).toBe("/api/payments/vnpay/ipn");
    expect(VNPAY_IPN_ACK.messages).toEqual({
      "00": "Confirm Success",
      "01": "Order not found",
      "02": "Order already confirmed",
      "04": "invalid amount",
      "97": "Invalid signature",
      "99": "Unknow error",
    });
    expect(ipnConsume).toBe(consumeInventoryAttempt);
  });
});

describe("AT-024-01 signature merchant amount currency ref", () => {
  it("verifies HMAC before any mutation and rejects mismatch without consume", async () => {
    const { port, mutations } = fakePort();
    const unsigned = signedIpn();
    unsigned.vnp_SecureHash = "0".repeat(128);
    expect(await handleVnpayIpn(port, unsigned, sandbox)).toEqual({ RspCode: "97", Message: "Invalid signature" });
    expect(mutations).toEqual([]);
    const tampered = signedIpn({ vnp_Amount: "1" });
    tampered.vnp_SecureHash = signedIpn().vnp_SecureHash;
    expect(await handleVnpayIpn(port, tampered, sandbox)).toEqual({ RspCode: "97", Message: "Invalid signature" });
    expect(mutations).toEqual([]);
    expect(await handleVnpayIpn(port, signedIpn({ vnp_TmnCode: "OTHERTM1" }), sandbox)).toEqual({ RspCode: "01", Message: "Order not found" });
    expect(mutations).toEqual([]);
    expect(await handleVnpayIpn(port, signedIpn({ vnp_CurrCode: "USD" }), sandbox)).toEqual({ RspCode: "04", Message: "invalid amount" });
    expect(mutations).toEqual([]);
    expect(await handleVnpayIpn(port, signedIpn({ vnp_TxnRef: "" }), sandbox)).toEqual({ RspCode: "99", Message: "Unknow error" });
    expect(mutations).toEqual([]);
    const { port: amountPort, mutations: amountMutations } = fakePort({ finalize: { RspCode: "04", Message: "invalid amount" } });
    expect(await handleVnpayIpn(amountPort, signedIpn({ vnp_Amount: "100" }), sandbox)).toEqual({ RspCode: "04", Message: "invalid amount" });
    expect(amountMutations).toEqual(["finalize_vnpay_ipn"]);
    expect(amountMutations).not.toContain("consume_inventory_attempt");
  });
});

describe("AT-024-02 duplicate success and conflicting payload", () => {
  it("acks identical success once and rejects a reused ref with a different digest", async () => {
    const first = signedIpn();
    const replay = signedIpn();
    const conflict = signedIpn({ vnp_TransactionNo: "14226999" });
    expect(ipnPayloadDigest(first)).toBe(ipnPayloadDigest(replay));
    expect(ipnPayloadDigest(first)).not.toBe(ipnPayloadDigest(conflict));
    const { port, mutations } = fakePort({ finalize: { RspCode: "02", Message: "Order already confirmed", outcome: "PAID" } });
    expect(await handleVnpayIpn(port, replay, sandbox)).toEqual({ RspCode: "02", Message: "Order already confirmed" });
    expect(await handleVnpayIpn(port, conflict, sandbox)).toEqual({ RspCode: "02", Message: "Order already confirmed" });
    expect(mutations).toEqual(["finalize_vnpay_ipn", "finalize_vnpay_ipn"]);
    expect(mutations).not.toContain("consume_inventory_attempt");
  });
});

describe("AT-024-04 return before IPN and failure after success", () => {
  it("keeps the return page pending and never marks paid from the querystring", async () => {
    const checkoutPort: VnpayCheckoutPort = {
      async rpc(name) {
        if (name === "read_vnpay_return") {
          return { data: { txnRef, attemptId, frozenTotalVnd: 120000, expiresAt: "2026-09-12T05:15:00.000Z", attemptStatus: "ACTIVE", paymentStatus: "UNPAID", fulfilmentStatus: "AWAITING_PAYMENT" }, error: null };
        }
        return { data: null, error: { message: "unexpected" } };
      },
    };
    const fields = buildVnpayPaymentFields({
      frozenTotalVnd: 120000, txnRef, tmnCode: sandbox.tmnCode, createDate: "20260912120000",
      expireDate: "20260912121500", ipAddr: "127.0.0.1", returnUrl: `${origin}/api/payments/vnpay/return`,
    });
    const query = { ...fields, vnp_ResponseCode: "00", vnp_TransactionStatus: "00", vnp_SecureHash: signVnpaySecureHash({ ...fields, vnp_ResponseCode: "00", vnp_TransactionStatus: "00" }, secret) };
    expect(await readVnpayReturn(checkoutPort, query, sandbox)).toMatchObject({ status: "pending", paymentStatus: "UNPAID" });
    const { port, mutations } = fakePort({ finalize: { RspCode: "02", Message: "Order already confirmed", outcome: "PAID" } });
    expect(await handleVnpayIpn(port, signedIpn({ vnp_ResponseCode: "24", vnp_TransactionStatus: "02" }), sandbox)).toEqual({ RspCode: "02", Message: "Order already confirmed" });
    expect(mutations).toEqual(["finalize_vnpay_ipn"]);
  });
});

describe("HTTP IPN route", () => {
  it("returns official JSON ACK and does not require a browser origin", async () => {
    const { port, mutations } = fakePort();
    const route = createVnpayIpnRoute({
      port,
      env: { VNPAY_TMN_CODE: sandbox.tmnCode, VNPAY_HASH_SECRET: secret, VNPAY_PAYMENT_URL: VNPAY_SANDBOX_PAYMENT_URL },
    });
    const query = new URLSearchParams(signedIpn());
    const response = await route.GET(new Request(`${origin}${VNPAY_IPN_PATH}?${query}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ RspCode: "00", Message: "Confirm Success" });
    expect(mutations).toEqual(["finalize_vnpay_ipn"]);
    const denied = createVnpayIpnRoute({ port, env: {} });
    const blocked = await denied.GET(new Request(`${origin}${VNPAY_IPN_PATH}?${query}`));
    expect(await blocked.json()).toEqual({ RspCode: "99", Message: "Unknow error" });
    expect(createConfirmationToken(() => Uint8Array.from({ length: 32 }, (_, i) => i + 1)).token.length).toBe(43);
  });
});

describe("AT-024-05 sandbox IPN without a charge", () => {
  it("does not submit a payment and does not treat unsigned mocks as sandbox IPN", async () => {
    const live = readVnpayMerchantConfig();
    const { port, mutations } = fakePort();
    expect(await handleVnpayIpn(port, { vnp_TxnRef: txnRef, vnp_Amount: "12000000", vnp_ResponseCode: "00" }, sandbox)).toEqual({ RspCode: "99", Message: "Unknow error" });
    expect(mutations).toEqual([]);
    if (live.ok) expect(live.merchant.environment).toBe("sandbox");
    expect(VNPAY_IPN_ACK.retryEnds).toEqual(["00", "02"]);
  });
});

describe("local database finalization", () => {
  it("AT-024-01/02/04 persist HMAC-gated SQL outcomes", () => {
    applyFinalizationMigration();
    const ids = { org: randomUUID(), actor: randomUUID(), product: randomUUID(), orderId: randomUUID(), requestId: randomUUID() };
    const pay = randomUUID();
    sql(fixtureSql({ ...ids, stock: 2 }));
    try {
      const started = JSON.parse(sql(`select public.begin_payment('${ids.org}','${ids.orderId}',1,'${pay}');`));
      const ref = started.attemptId.replaceAll("-", "");
      sql(`select public.persist_vnpay_checkout('${ids.org}','${started.attemptId}','${ref}','TESTTMN1',${started.frozenTotalVnd},'20260912120000','20260912121500','127.0.0.1','sandbox.vnpayment.vn');`);
      expect(JSON.parse(sql(`select public.finalize_vnpay_ipn('missingref1','TESTTMN1',${started.frozenTotalVnd * 100},'VND','00','00','1','${"a".repeat(64)}');`)).RspCode).toBe("01");
      expect(JSON.parse(sql(`select public.finalize_vnpay_ipn('${ref}','OTHERTM1',${started.frozenTotalVnd * 100},'VND','00','00','1','${"b".repeat(64)}');`)).RspCode).toBe("01");
      expect(JSON.parse(sql(`select public.finalize_vnpay_ipn('${ref}','TESTTMN1',100,'VND','00','00','1','${"c".repeat(64)}');`)).RspCode).toBe("04");
      expect(sql(`select payment_status||','||stock_quantity from public.orders o join public.products p on p.id='${ids.product}' where o.id='${ids.orderId}';`)).toBe("UNPAID,2");
      const paid = JSON.parse(sql(`select public.finalize_vnpay_ipn('${ref}','TESTTMN1',${started.frozenTotalVnd * 100},'VND','00','00','14226112','${"e".repeat(64)}');`));
      expect(paid).toMatchObject({ RspCode: "00", outcome: "PAID", fulfilmentStatus: "PREPARING" });
      expect(JSON.parse(sql(`select public.finalize_vnpay_ipn('${ref}','TESTTMN1',${started.frozenTotalVnd * 100},'VND','00','00','14226112','${"e".repeat(64)}');`)).RspCode).toBe("02");
      expect(JSON.parse(sql(`select public.finalize_vnpay_ipn('${ref}','TESTTMN1',${started.frozenTotalVnd * 100},'VND','00','00','9','${"f".repeat(64)}');`)).RspCode).toBe("02");
      expect(JSON.parse(sql(`select public.finalize_vnpay_ipn('${ref}','TESTTMN1',${started.frozenTotalVnd * 100},'VND','24','02','8','${"0".repeat(64)}');`)).RspCode).toBe("02");
      expect(sql(`select payment_status||','||fulfilment_status||','||stock_quantity from public.orders o join public.products p on p.id='${ids.product}' where o.id='${ids.orderId}';`)).toBe("PAID,PREPARING,1");
      expect(sql(`select count(*) from public.vnpay_ipn_receipts where txn_ref='${ref}';`)).toBe("1");
      expect(sql(`select count(*) from public.audit_events where entity_id='${ids.orderId}' and action='order.payment_paid';`)).toBe("1");
    } finally {
      sql(`update public.products set disabled_at=clock_timestamp() where id='${ids.product}'; update public.staff_profiles set active=false where user_id='${ids.actor}';`);
    }
  }, 30000);

  it("AT-024-03 two connections race expiry against late IPN without preparing", async () => {
    applyFinalizationMigration();
    const ids = { org: randomUUID(), actor: randomUUID(), product: randomUUID(), orderId: randomUUID(), requestId: randomUUID() };
    const pay = randomUUID();
    const app = `ov024-${ids.orderId}`;
    sql(fixtureSql({ ...ids, stock: 1 }));
    try {
      const started = JSON.parse(sql(`select public.begin_payment('${ids.org}','${ids.orderId}',1,'${pay}');`));
      const ref = started.attemptId.replaceAll("-", "");
      sql(`select public.persist_vnpay_checkout('${ids.org}','${started.attemptId}','${ref}','TESTTMN1',${started.frozenTotalVnd},'20260912120000','20260912121500','127.0.0.1','sandbox.vnpayment.vn');
           update public.payment_attempts set expires_at=clock_timestamp()-interval '1 second' where id='${started.attemptId}';
           update public.inventory_reservations set expires_at=clock_timestamp()-interval '1 second' where attempt_id='${started.attemptId}';`);
      const expire = psqlSession();
      let ipn: PsqlSession | undefined;
      try {
        expire.child.stdin!.write(`begin; select public.expire_inventory_attempt('${ids.org}','${started.attemptId}')->>'status'; select 'HELD';\n`);
        await waitFor(expire, "HELD", "expire did not reach barrier");
        ipn = psqlSession();
        ipn.child.stdin!.end(`set application_name='${app}'; begin; select public.finalize_vnpay_ipn('${ref}','TESTTMN1',${started.frozenTotalVnd * 100},'VND','00','00','14228000','${"1".repeat(64)}'); commit;\n`);
        const waitingDeadline = Date.now() + 15000;
        let waiting = false;
        while (!waiting) {
          if (Date.now() >= waitingDeadline) throw Error("ipn never blocked on expire");
          waiting = sql(`select exists(select 1 from pg_stat_activity where application_name='${app}' and wait_event is not null);`).startsWith("t");
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expire.child.stdin!.end("commit;\n");
        expect((await expire.done).code).toBe(0);
        expect((await ipn.done).code).toBe(0);
        expect(sql(`select payment_status||','||fulfilment_status||','||reconciliation from public.orders where id='${ids.orderId}';`)).toBe("PAID,EXPIRED,MANUAL_REVIEW");
        expect(sql(`select status from public.payment_attempts where id='${started.attemptId}';`)).toBe("RELEASED");
        expect(sql(`select stock_quantity from public.products where id='${ids.product}';`)).toBe("1");
        expect(sql(`select count(*) from public.payment_exceptions where order_id='${ids.orderId}';`)).toBe("1");
        expect(sql(`select count(*) from public.inventory_reservations where attempt_id='${started.attemptId}' and state='ACTIVE';`)).toBe("0");
      } finally {
        if (expire.child.stdin && !expire.child.stdin.destroyed) expire.child.stdin.end("rollback;\n");
        await expire.done.catch(() => undefined);
        if (ipn?.child.stdin && !ipn.child.stdin.destroyed) ipn.child.stdin.end("rollback;\n");
        if (ipn) await ipn.done.catch(() => undefined);
      }
    } finally {
      sql(`update public.products set disabled_at=clock_timestamp() where id='${ids.product}'; update public.staff_profiles set active=false where user_id='${ids.actor}';`);
    }
  }, 30000);
});
