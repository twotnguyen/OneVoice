// SPDX-License-Identifier: Apache-2.0
import { execFileSync, execSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readConfirmedQuote, type ConfirmationPort } from "./confirmation";
import {
  beginPayment,
  beginPaymentInputSchema,
  consumeInventoryAttempt,
  expireInventoryAttempt,
  type ReservationPort,
} from "./reservations";

const org = "a2200000-0000-4000-8000-000000000001";
const order = "a2200000-0000-4000-8000-000000000010";
const request = "a2200000-0000-4000-8000-000000000020";
const attempt = "a2200000-0000-4000-8000-000000000030";
const quote = {
  orderId: order, organizationId: org, revision: 1, currency: "VND" as const,
  buyerName: "Buyer", phone: "+84900000022", address: { line1: "12 Test", ward: null, district: null, province: "Hà Nội", countryCode: "VN" },
  subtotalVnd: 100000, shippingFeeVnd: 20000, shippingRevision: 1, totalVnd: 120000,
  fulfilmentStatus: "DRAFT" as const, paymentStatus: "UNPAID" as const, checkoutFrozenAt: null,
  items: [{ productId: "a2200000-0000-4000-8000-000000000004", variantId: null, productVersion: 1, name: "Keyboard", sku: "KB", quantity: 1, unitPriceVnd: 100000, lineTotalVnd: 100000 }],
};

function fakePort(options?: { quote?: typeof quote | null; begin?: Record<string, unknown>; error?: { code?: string; message?: string } }) {
  const calls: string[] = [];
  const rpc: ReservationPort["rpc"] = async (name, args) => {
    calls.push(name);
    if (name === "read_confirmed_order_quote") {
      if (args.p_organization_id !== org || args.p_order_id !== order) return { data: null, error: null };
      return { data: options?.quote === undefined ? quote : options.quote, error: null };
    }
    if (name === "begin_payment") {
      if (Object.prototype.hasOwnProperty.call(args, "p_total_vnd") || Object.prototype.hasOwnProperty.call(args, "p_frozen_total_vnd")) {
        return { data: null, error: { code: "22023", message: "ORDER_INVALID" } };
      }
      if (options?.error) return { data: null, error: options.error };
      return {
        data: options?.begin ?? { attemptId: attempt, frozenTotalVnd: 120000, expiresAt: "2026-09-12T00:15:00.000+00:00" },
        error: null,
      };
    }
    if (name === "expire_inventory_attempt" || name === "consume_inventory_attempt") {
      if (options?.error) return { data: null, error: options.error };
      return { data: { status: name.startsWith("expire") ? "released" : "consumed", attemptId: args.p_attempt_id, frozenTotalVnd: 120000 }, error: null };
    }
    return { data: null, error: { code: "42883" } };
  };
  return { rpc, calls };
}

describe("beginPayment contract", () => {
  it("rejects a client total and only forwards trusted identifiers", () => {
    expect(beginPaymentInputSchema.safeParse({ orderId: order, expectedVersion: 1, requestId: request, totalVnd: 1 }).success).toBe(false);
    expect(beginPaymentInputSchema.parse({ orderId: order, expectedVersion: 1, requestId: request })).toEqual({
      orderId: order, expectedVersion: 1, requestId: request,
    });
  });

  it("consumes readConfirmedQuote and does not begin payment without a current quote", async () => {
    const missing = fakePort({ quote: null });
    await expect(beginPayment(missing, org, { orderId: order, expectedVersion: 1, requestId: request })).rejects.toThrow("ORDER_QUOTE_REQUIRED");
    expect(missing.calls).toEqual(["read_confirmed_order_quote"]);
    await expect(readConfirmedQuote(missing as unknown as ConfirmationPort, org, order)).resolves.toBeNull();
  });

  it("rejects a stale confirmed revision before reserve", async () => {
    const stale = fakePort({ quote: { ...quote, revision: 2 } });
    await expect(beginPayment(stale, org, { orderId: order, expectedVersion: 1, requestId: request })).rejects.toThrow("ORDER_CONFLICT");
    expect(stale.calls).toEqual(["read_confirmed_order_quote"]);
  });

  it("returns the frozen attempt without sending a client total", async () => {
    const port = fakePort();
    await expect(beginPayment(port, org, { orderId: order, expectedVersion: 1, requestId: request })).resolves.toEqual({
      attemptId: attempt, frozenTotalVnd: 120000, expiresAt: "2026-09-12T00:15:00.000+00:00",
    });
    expect(port.calls).toEqual(["read_confirmed_order_quote", "begin_payment"]);
  });

  it("replays the same attempt and surfaces stock/conflict errors", async () => {
    const replay = fakePort();
    const first = await beginPayment(replay, org, { orderId: order, expectedVersion: 1, requestId: request });
    expect(await beginPayment(replay, org, { orderId: order, expectedVersion: 1, requestId: request })).toEqual(first);
    const conflict = fakePort({ error: { code: "40001", message: "ORDER_REQUEST_CONFLICT" } });
    await expect(beginPayment(conflict, org, { orderId: order, expectedVersion: 1, requestId: request })).rejects.toThrow("ORDER_REQUEST_CONFLICT");
    const stock = fakePort({ error: { code: "22023", message: "ORDER_STOCK_UNAVAILABLE" } });
    await expect(beginPayment(stock, org, { orderId: order, expectedVersion: 1, requestId: request })).rejects.toThrow("ORDER_STOCK_UNAVAILABLE");
  });

  it("maps consume and expire outcomes for paid/expiry races", async () => {
    const port = fakePort();
    expect(await consumeInventoryAttempt(port, org, attempt)).toEqual({ status: "consumed", attemptId: attempt, frozenTotalVnd: 120000 });
    expect(await expireInventoryAttempt(port, org, attempt)).toEqual({ status: "released", attemptId: attempt, frozenTotalVnd: 120000 });
  });
});

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

function applyReservationMigration() {
  const raw = execSync("pnpm exec supabase status --output json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const status = JSON.parse(raw.slice(raw.indexOf("{")));
  const url = new URL(status.API_URL);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("local_only");
  if (!sql("select version from supabase_migrations.schema_migrations where version='20260912118000';")) {
    sql(readFileSync("supabase/migrations/20260912118000_inventory_reservations.sql", "utf8"));
    const columns = sql("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations';");
    if (columns.includes("statements") && columns.includes("name")) sql("insert into supabase_migrations.schema_migrations(version,name,statements) values('20260912118000','inventory_reservations','{}');");
    else if (columns.includes("name")) sql("insert into supabase_migrations.schema_migrations(version,name) values('20260912118000','inventory_reservations');");
    else sql("insert into supabase_migrations.schema_migrations(version) values('20260912118000');");
  }
}

function fixtureSql(ids: {
  org: string; actor: string; product: string; variant?: string; second?: string;
  orderA: string; orderB?: string; requestA: string; requestB?: string;
  qty?: number; stock?: number; price?: number;
}) {
  const qty = ids.qty ?? 1;
  const stock = ids.stock ?? 1;
  const price = ids.price ?? 100000;
  const variantInsert = ids.variant
    ? `insert into public.product_variants(id,product_id,name,sku,price_vnd,stock_quantity,in_stock) values('${ids.variant}','${ids.product}','Variant','VAR-1',${price},${stock},true);`
    : "";
  const parentStock = ids.variant ? stock : stock;
  const item = ids.variant
    ? `{"productId":"${ids.product}","variantId":"${ids.variant}","quantity":${qty}}`
    : `{"productId":"${ids.product}","variantId":null,"quantity":${qty}}`;
  const document = `{"buyerName":"Buyer","phone":"+84900000022","address":{"line1":"12 Test","ward":null,"district":null,"province":"Ha Noi","countryCode":"VN"},"items":[${item}]}`;
  const extraProduct = ids.second
    ? `insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,sku,price_vnd,stock_quantity,in_stock,quality) values('${ids.second}','${ids.org}','Fixture','urn:test:${ids.second}','urn:test:${ids.second}','Second','SEC-1',50000,0,true,'partial');`
    : "";
  const confirm = (orderId: string, requestId: string) => `
    select public.save_staff_order_draft('${ids.org}','${ids.actor}','${orderId}','${requestId}',0,'${document}'::jsonb);
    insert into public.order_confirmation_quotes(request_id,organization_id,order_id,revision,quote)
    select '${requestId}','${ids.org}','${orderId}',o.revision,public.internal_order_snapshot('${ids.org}','${orderId}') from public.orders o where o.id='${orderId}';
  `;
  return `
    insert into public.organizations(id,name,slug) values('${ids.org}','OV022 fixture','${ids.org}');
    insert into auth.users(id) values('${ids.actor}');
    insert into public.staff_profiles(user_id,organization_id,role,active) values('${ids.actor}','${ids.org}','manager',true);
    insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,sku,price_vnd,stock_quantity,in_stock,quality)
    values('${ids.product}','${ids.org}','Fixture','urn:test:${ids.product}','urn:test:${ids.product}','Keyboard','KB-1',${price},${parentStock},true,'partial');
    ${variantInsert}
    ${extraProduct}
    insert into public.order_shipping_settings(organization_id,flat_fee_vnd) values('${ids.org}',20000);
    ${confirm(ids.orderA, ids.requestA)}
    ${ids.orderB && ids.requestB ? confirm(ids.orderB, ids.requestB) : ""}
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

describe("local database reservations", () => {
  it("AT-022-01 two connections compete for the last unit", async () => {
    applyReservationMigration();
    const ids = { org: randomUUID(), actor: randomUUID(), product: randomUUID(), orderA: randomUUID(), orderB: randomUUID(), requestA: randomUUID(), requestB: randomUUID() };
    const payA = randomUUID(), payB = randomUUID(), app = `ov022-${ids.orderB}`;
    sql(fixtureSql(ids));
    try {
      const first = psqlSession();
      let second: PsqlSession | undefined;
      try {
        first.child.stdin!.write(`begin; select public.begin_payment('${ids.org}','${ids.orderA}',1,'${payA}')->>'attemptId'; select 'HELD';\n`);
        await waitFor(first, "HELD", "first begin_payment did not reach barrier");
        second = psqlSession();
        second.child.stdin!.end(`set application_name='${app}'; begin; select public.begin_payment('${ids.org}','${ids.orderB}',1,'${payB}'); commit;\n`);
        const waitingDeadline = Date.now() + 15000;
        let waiting = false;
        while (!waiting) {
          if (Date.now() >= waitingDeadline) throw Error("second begin_payment never blocked");
          waiting = sql(`select exists(select 1 from pg_stat_activity where application_name='${app}' and wait_event is not null);`).startsWith("t");
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
        }
        first.child.stdin!.end("commit;\n");
        expect((await first.done).code).toBe(0);
        const lost = await second.done;
        expect(lost.code).not.toBe(0);
        expect(lost.stderr).toMatch(/ORDER_STOCK_UNAVAILABLE/);
        expect(sql(`select count(*) from public.payment_attempts where organization_id='${ids.org}' and status='ACTIVE';`)).toBe("1");
        expect(sql(`select coalesce(sum(quantity),0) from public.inventory_reservations where organization_id='${ids.org}' and state='ACTIVE';`)).toBe("1");
        expect(sql(`select stock_quantity from public.products where id='${ids.product}';`)).toBe("1");
        expect(Number(sql(`select stock_quantity - (select coalesce(sum(quantity),0) from public.inventory_reservations r where r.product_id='${ids.product}' and r.variant_id is null and r.state='ACTIVE') from public.products where id='${ids.product}';`))).toBe(0);
      } finally {
        if (first.child.stdin && !first.child.stdin.destroyed) first.child.stdin.end("rollback;\n");
        await first.done.catch(() => undefined);
        if (second?.child.stdin && !second.child.stdin.destroyed) second.child.stdin.end("rollback;\n");
        if (second) await second.done.catch(() => undefined);
      }
    } finally {
      sql(`update public.products set disabled_at=clock_timestamp() where id='${ids.product}'; update public.staff_profiles set active=false where user_id='${ids.actor}';`);
    }
  }, 30000);

  it("AT-022-02/03/05 refuse partial holds, replay the same attempt, and fence catalog stock", async () => {
    applyReservationMigration();
    const ids = { org: randomUUID(), actor: randomUUID(), product: randomUUID(), second: randomUUID(), orderA: randomUUID(), requestA: randomUUID() };
    const twoItems = `{"buyerName":"Buyer","phone":"+84900000022","address":{"line1":"12 Test","ward":null,"district":null,"province":"Ha Noi","countryCode":"VN"},"items":[{"productId":"${ids.product}","variantId":null,"quantity":1},{"productId":"${ids.second}","variantId":null,"quantity":1}]}`;
    sql(`
      insert into public.organizations(id,name,slug) values('${ids.org}','OV022 multi','${ids.org}');
      insert into auth.users(id) values('${ids.actor}');
      insert into public.staff_profiles(user_id,organization_id,role,active) values('${ids.actor}','${ids.org}','manager',true);
      insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,sku,price_vnd,stock_quantity,in_stock,quality) values
        ('${ids.product}','${ids.org}','Fixture','urn:test:${ids.product}','urn:test:${ids.product}','One','ONE',100000,2,true,'partial'),
        ('${ids.second}','${ids.org}','Fixture','urn:test:${ids.second}','urn:test:${ids.second}','Two','TWO',50000,0,true,'partial');
      insert into public.order_shipping_settings(organization_id,flat_fee_vnd) values('${ids.org}',20000);
      select public.save_staff_order_draft('${ids.org}','${ids.actor}','${ids.orderA}','${ids.requestA}',0,'${twoItems}'::jsonb);
      insert into public.order_confirmation_quotes(request_id,organization_id,order_id,revision,quote)
      select '${ids.requestA}','${ids.org}','${ids.orderA}',o.revision,public.internal_order_snapshot('${ids.org}','${ids.orderA}') from public.orders o where o.id='${ids.orderA}';
    `);
    try {
      expect(() => sql(`select public.begin_payment('${ids.org}','${ids.orderA}',1,'${randomUUID()}');`)).toThrow(/ORDER_STOCK_UNAVAILABLE/);
      expect(sql(`select count(*) from public.payment_attempts where organization_id='${ids.org}';`)).toBe("0");
      expect(sql(`select count(*) from public.inventory_reservations where organization_id='${ids.org}';`)).toBe("0");
      expect(sql(`select checkout_frozen_at is null from public.orders where id='${ids.orderA}';`)).toBe("t");
      sql(`update public.products set stock_quantity=2 where id='${ids.second}';`);
      const unknown = randomUUID();
      sql(`insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,price_vnd,stock_quantity,in_stock,quality) values('${unknown}','${ids.org}','Fixture','urn:test:${unknown}','urn:test:${unknown}','Unknown',100000,null,true,'partial');`);
      const unknownOrder = randomUUID(), unknownReq = randomUUID();
      const unknownDoc = `{"buyerName":"Buyer","phone":"+84900000022","address":{"line1":"12 Test","ward":null,"district":null,"province":"Ha Noi","countryCode":"VN"},"items":[{"productId":"${unknown}","variantId":null,"quantity":1}]}`;
      sql(`select public.save_staff_order_draft('${ids.org}','${ids.actor}','${unknownOrder}','${unknownReq}',0,'${unknownDoc}'::jsonb);
           insert into public.order_confirmation_quotes(request_id,organization_id,order_id,revision,quote)
           select '${unknownReq}','${ids.org}','${unknownOrder}',o.revision,public.internal_order_snapshot('${ids.org}','${unknownOrder}') from public.orders o where o.id='${unknownOrder}';`);
      expect(() => sql(`select public.begin_payment('${ids.org}','${unknownOrder}',1,'${randomUUID()}');`)).toThrow(/ORDER_STOCK_UNKNOWN/);
      const payReq = randomUUID();
      const first = JSON.parse(sql(`select public.begin_payment('${ids.org}','${ids.orderA}',1,'${payReq}');`));
      expect(first.frozenTotalVnd).toBe(170000);
      expect(JSON.parse(sql(`select public.begin_payment('${ids.org}','${ids.orderA}',1,'${payReq}');`))).toEqual(first);
      expect(() => sql(`select public.begin_payment('${ids.org}','${ids.orderA}',2,'${payReq}');`)).toThrow(/ORDER_REQUEST_CONFLICT/);
      expect(sql(`select (expires_at - created_at) = interval '15 minutes' from public.payment_attempts where id='${first.attemptId}';`)).toBe("t");
      expect(() => sql(`update public.products set stock_quantity=0 where id='${ids.product}';`)).toThrow(/CATALOG_STOCK_RESERVED/);
      const document = JSON.stringify({
        name: "One", sku: "ONE", brand: null, productType: "keyboard", descriptionText: null, priceVnd: 100000,
        stockQuantity: 0, inStock: true, active: true, specifications: [], images: [], variants: [],
      }).replaceAll("'", "''");
      expect(() => sql(`select public.save_catalog_product('${ids.org}','${ids.actor}','${randomUUID()}','${ids.product}',1,'${document}'::jsonb);`)).toThrow(/CATALOG_STOCK_RESERVED/);
      expect(sql(`select stock_quantity from public.products where id='${ids.product}';`)).toBe("2");
    } finally {
      sql(`update public.products set disabled_at=clock_timestamp() where organization_id='${ids.org}'; update public.staff_profiles set active=false where user_id='${ids.actor}';`);
    }
  }, 30000);

  it("AT-022-04 two connections consume or expire exactly once and late pay cannot steal", async () => {
    applyReservationMigration();
    const ids = { org: randomUUID(), actor: randomUUID(), product: randomUUID(), orderA: randomUUID(), orderB: randomUUID(), requestA: randomUUID(), requestB: randomUUID() };
    const payA = randomUUID(), payB = randomUUID(), app = `ov022-consume-${ids.orderA}`;
    sql(fixtureSql({ ...ids, stock: 1 }));
    try {
      const started = JSON.parse(sql(`select public.begin_payment('${ids.org}','${ids.orderA}',1,'${payA}');`));
      sql(`update public.payment_attempts set expires_at=clock_timestamp()-interval '1 second' where id='${started.attemptId}';
           update public.inventory_reservations set expires_at=clock_timestamp()-interval '1 second' where attempt_id='${started.attemptId}';`);
      const expire = psqlSession();
      let consume: PsqlSession | undefined;
      try {
        expire.child.stdin!.write(`begin; select public.expire_inventory_attempt('${ids.org}','${started.attemptId}')->>'status'; select 'HELD';\n`);
        await waitFor(expire, "HELD", "expire did not reach barrier");
        consume = psqlSession();
        consume.child.stdin!.end(`set application_name='${app}'; begin; select public.consume_inventory_attempt('${ids.org}','${started.attemptId}')->>'status'; commit;\n`);
        const waitingDeadline = Date.now() + 15000;
        let waiting = false;
        while (!waiting) {
          if (Date.now() >= waitingDeadline) throw Error("consume never blocked on expire");
          waiting = sql(`select exists(select 1 from pg_stat_activity where application_name='${app}' and wait_event is not null);`).startsWith("t");
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expire.child.stdin!.end("commit;\n");
        expect((await expire.done).code).toBe(0);
        const paid = await consume.done;
        expect(paid.code).toBe(0);
        const states = sql(`select status||','||(select string_agg(state,',' order by state) from public.inventory_reservations where attempt_id='${started.attemptId}') from public.payment_attempts where id='${started.attemptId}';`);
        expect(states === "RELEASED,RELEASED" || states === "CONSUMED,CONSUMED").toBe(true);
        expect(sql(`select count(*) from public.inventory_reservations where attempt_id='${started.attemptId}' and state in ('CONSUMED','RELEASED');`)).toBe("1");
        expect(sql(`select count(*) from public.inventory_reservations where attempt_id='${started.attemptId}' and state='ACTIVE';`)).toBe("0");
        const physical = Number(sql(`select stock_quantity from public.products where id='${ids.product}';`));
        if (states.startsWith("CONSUMED")) expect(physical).toBe(0);
        else expect(physical).toBe(1);
        sql(`select public.expire_inventory_attempt('${ids.org}','${started.attemptId}'); select public.consume_inventory_attempt('${ids.org}','${started.attemptId}');`);
        expect(sql(`select status from public.payment_attempts where id='${started.attemptId}';`)).toBe(states.split(",")[0]);
        if (states.startsWith("RELEASED")) {
          const second = JSON.parse(sql(`select public.begin_payment('${ids.org}','${ids.orderB}',1,'${payB}');`));
          expect(second.attemptId).toBeTruthy();
          expect(JSON.parse(sql(`select public.consume_inventory_attempt('${ids.org}','${started.attemptId}');`)).status).toBe("released");
          expect(sql(`select state from public.inventory_reservations where attempt_id='${second.attemptId}';`)).toBe("ACTIVE");
          expect(sql(`select stock_quantity from public.products where id='${ids.product}';`)).toBe("1");
        }
      } finally {
        if (expire.child.stdin && !expire.child.stdin.destroyed) expire.child.stdin.end("rollback;\n");
        await expire.done.catch(() => undefined);
        if (consume?.child.stdin && !consume.child.stdin.destroyed) consume.child.stdin.end("rollback;\n");
        if (consume) await consume.done.catch(() => undefined);
      }
    } finally {
      sql(`update public.products set disabled_at=clock_timestamp() where id='${ids.product}'; update public.staff_profiles set active=false where user_id='${ids.actor}';`);
    }
  }, 30000);

  it("AT-022-05 disabled variant with an active reserve keeps the physical floor", async () => {
    applyReservationMigration();
    const ids = { org: randomUUID(), actor: randomUUID(), product: randomUUID(), variant: randomUUID(), orderA: randomUUID(), requestA: randomUUID() };
    sql(fixtureSql({ ...ids, stock: 2 }));
    try {
      sql(`select public.begin_payment('${ids.org}','${ids.orderA}',1,'${randomUUID()}');`);
      const disable = JSON.stringify({
        name: "Keyboard", sku: "KB-1", brand: null, productType: "keyboard", descriptionText: null, priceVnd: 100000,
        stockQuantity: 2, inStock: true, active: true, specifications: [], images: [],
        variants: [{ id: ids.variant, name: "Variant", sku: "VAR-1", priceVnd: 100000, stockQuantity: 2, inStock: true, active: false, imageUrl: null }],
      }).replaceAll("'", "''");
      sql(`select public.save_catalog_product('${ids.org}','${ids.actor}','${randomUUID()}','${ids.product}',1,'${disable}'::jsonb);`);
      expect(sql(`select disabled_at is not null from public.product_variants where id='${ids.variant}';`)).toBe("t");
      expect(sql(`select state from public.inventory_reservations where order_id='${ids.orderA}';`)).toBe("ACTIVE");
      expect(() => sql(`update public.product_variants set stock_quantity=0 where id='${ids.variant}';`)).toThrow(/CATALOG_STOCK_RESERVED/);
      expect(sql(`select stock_quantity from public.product_variants where id='${ids.variant}';`)).toBe("2");
    } finally {
      sql(`update public.products set disabled_at=clock_timestamp() where id='${ids.product}'; update public.staff_profiles set active=false where user_id='${ids.actor}';`);
    }
  }, 30000);
});
