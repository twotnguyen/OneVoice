// SPDX-License-Identifier: Apache-2.0
// Two real local Postgres sessions. Only synthetic fixtures; no remote connection.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
function session() {
  const child = spawn("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { windowsHide: true });
  let stdout = "", stderr = "";
  child.stdout.on("data", (data) => { stdout += data; }); child.stderr.on("data", (data) => { stderr += data; });
  const done = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", (code) => resolve({ code, stdout, stderr })); });
  return { child, done, output: () => stdout };
}
async function query(sql) { const s = session(); s.child.stdin.end(sql); return s.done; }
async function required(sql) { const result = await query(sql); assert.equal(result.code, 0, result.stderr); return result.stdout; }
const org = "a0000000-0000-0000-0000-000000000001";
const actor = randomUUID();
await required(`insert into auth.users(id) values('${actor}'); insert into public.staff_profiles(user_id,organization_id,role,active) values('${actor}','${org}','manager',true);`);
try {
  for (const kind of process.argv[2] ? [process.argv[2]] : ["variant", "image"]) {
    assert.ok(["variant", "image"].includes(kind));
    const a = randomUUID(), b = randomUUID(), childId = randomUUID(), appName = `catalog-race-${randomUUID()}`;
    const table = kind === "variant" ? "product_variants" : "product_images";
    await required(`insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,in_stock,quality) values('${a}','${org}','Concurrency fixture','urn:test:${a}','urn:test:${a}','Race owner A',false,'partial'),('${b}','${org}','Concurrency fixture','urn:test:${b}','urn:test:${b}','Race owner B',false,'partial');`);
    const first = session();
    let second;
    try {
      first.child.stdin.write(`begin; insert into public.${table}(id,product_id,${kind === "variant" ? "name" : "source_url"}) values('${childId}','${a}','${kind === "variant" ? "Owner A" : "https://example.invalid/original.jpg"}'); select 'CHILD_INSERTED';\n`);
      const deadline = Date.now() + 15000;
      while (!first.output().includes("CHILD_INSERTED")) { assert.ok(Date.now() < deadline, "first transaction did not reach barrier"); await new Promise((resolve) => setTimeout(resolve, 50)); }
      const document = { name: "Race owner B changed", sku: null, brand: null, productType: "keyboard", descriptionText: null, priceVnd: 1, stockQuantity: null, inStock: false, active: true, specifications: [], images: [], variants: [] };
      if (kind === "variant") document.variants.push({ id: childId, name: "MUST NOT OVERWRITE", sku: null, priceVnd: 1, stockQuantity: 1, inStock: true, active: true, imageUrl: null });
      else document.images.push({ id: childId, url: "https://example.invalid/overwritten.jpg", altText: null });
      // Explicit rollback also cleans up when testing the vulnerable implementation.
      second = query(`set application_name='${appName}'; begin; set local role service_role; select public.save_catalog_product('${org}','${actor}','${randomUUID()}','${b}',1,'${JSON.stringify(document)}'::jsonb); rollback;`);
      let waiting = false;
      while (!waiting) {
        assert.ok(Date.now() < deadline, "second transaction never blocked on child ownership");
        waiting = (await required(`select exists(select 1 from pg_stat_activity where application_name='${appName}' and wait_event='transactionid');`)).includes("t");
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      first.child.stdin.end("commit;\n"); assert.equal((await first.done).code, 0);
      const result = await second;
      assert.notEqual(result.code, 0, `${kind}: foreign child race was accepted`);
      assert.match(result.stderr, /CATALOG_FORBIDDEN/);
      assert.equal((await required(`select product_id from public.${table} where id='${childId}';`)).trim(), a);
      assert.equal((await required(`select version from public.products where id='${b}';`)).trim(), "1");
      console.log(`PASS: ${kind} concurrent foreign-child upsert denied; losing product rolled back`);
    } finally {
      if (!first.child.stdin.destroyed) first.child.stdin.end("rollback;\n");
      await first.done; if (second) await second;
      await required(`delete from public.products where id in('${a}','${b}');`);
    }
  }
} finally { await required(`delete from auth.users where id='${actor}';`); }
