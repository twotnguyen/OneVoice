// SPDX-License-Identifier: Apache-2.0
// Bundle with esbuild and run locally. Never reads .env or connects remotely.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { KnowledgeRepository } from "../src/lib/knowledge/repository";
const url = "http://127.0.0.1:54321";
const key = process.env.ONEVOICE_LOCAL_ADMIN;
assert.ok(key, "Set ONEVOICE_LOCAL_ADMIN from local Supabase status");
const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
  const response = await fetch(input, init);
  if (!response.ok) { const error = await response.clone().json(); console.error("Local REST fixture failure:", error.code, error.message); }
  return response;
} } });
const repo = new KnowledgeRepository(db);
function sql(query: string) { return execFileSync("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, encoding: "utf8", windowsHide: true }); }
const org = randomUUID(), product = randomUUID(), policy = randomUUID(), globalOffer = randomUUID(), scopedOffer = randomUUID(), unlinked = randomUUID();
try {
  sql(`begin;
    insert into public.organizations(id,name,slug) values('${org}','Knowledge REST fixture','${org}');
    insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,in_stock,quality) values('${product}','${org}','fixture','urn:${product}','urn:${product}','REST fixture product',true,'partial');
    insert into public.business_policies(id,organization_id,kind,title,body,starts_at,expires_at,version) values('${policy}','${org}','return','Return policy','Original text','2025-01-01T02:00:00Z','2025-01-01T03:00:00Z',1);
    insert into public.promotions(id,organization_id,label,details_text,scope,discount_type,discount_value,starts_at,expires_at) values
    ('${globalOffer}','${org}','Global offer','Global program','all','percent',10,'2025-01-01T02:00:00Z','2025-01-01T03:00:00Z'),
    ('${scopedOffer}','${org}','Product offer','Product program','products','percent',20,'2025-01-01T02:00:00Z','2025-01-01T03:00:00Z'),
    ('${unlinked}','${org}','Unlinked imported offer','Imported record','products',null,null,null,null);
    insert into public.product_promotions(product_id,promotion_id) values('${product}','${scopedOffer}');
    commit;`);
  const before = await repo.evidence(org, product, new Date("2025-01-01T01:59:59Z"));
  assert.equal(before.policies.length + before.promotions.length, 0);
  const start = await repo.evidence(org, product, new Date("2025-01-01T02:00:00Z"));
  assert.equal(start.policies.length, 1);
  assert.deepEqual(start.promotions.map(item => item.document.discountValue).sort((a, b) => (a ?? 0) - (b ?? 0)), [10, 20], "Overlapping offers remain separate");
  assert.equal(start.promotions.some(item => item.id === unlinked), false, "Unlinked imports never become global");
  const general = await repo.evidence(org, null, new Date("2025-01-01T02:30:00Z"));
  assert.deepEqual(general.promotions.map(item => item.id), [globalOffer]);
  const expired = await repo.evidence(org, product, new Date("2025-01-01T03:00:00Z"));
  assert.equal(expired.policies.length + expired.promotions.length, 0);
  sql(`update public.business_policies set body='Updated immediately',version=2 where id='${policy}';`);
  assert.equal((await repo.evidence(org, product, new Date("2025-01-01T02:30:00Z"))).policies[0].document.body, "Updated immediately");
  sql(`update public.promotions set disabled_at=clock_timestamp() where id='${scopedOffer}';`);
  assert.equal((await repo.evidence(org, product, new Date("2025-01-01T02:30:00Z"))).promotions.length, 1);
  const foreign = await repo.evidence(randomUUID(), product, new Date("2025-01-01T02:30:00Z"));
  assert.equal(foreign.policies.length + foreign.promotions.length, 0);
  console.log("PASS: actual local REST evidence inclusive-start/exclusive-expiry, global/scoped offers, no stacking, fresh updates, disable and scope isolation");
} finally {
  sql(`delete from public.business_policies where organization_id='${org}'; delete from public.promotions where organization_id='${org}'; delete from public.products where organization_id='${org}'; delete from public.organizations where id='${org}';`);
}
