import { afterAll, beforeAll, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { readOpportunityInput } from "./snapshot";
import { rankOpportunities } from "./engine";
const enabled = Boolean(process.env.ONEVOICE_LOCAL_ADMIN);
const org = randomUUID(), product = randomUUID(), variant = randomUUID(), program = randomUUID();
const sql = (query: string) => execFileSync("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, windowsHide: true, encoding: "utf8" });
beforeAll(() => {
 if (!enabled) return;
 sql(`insert into public.organizations(id,name,slug) values('${org}','Opportunity local fixture','opportunity-${org}'); insert into public.products(id,organization_id,source_url,canonical_url,name,in_stock,stock_quantity,price_vnd,quality) values('${product}','${org}','urn:test:${product}','urn:test:${product}','Local keyboard',true,99,500000,'partial'); insert into public.product_variants(id,product_id,name,in_stock,stock_quantity,price_vnd) values('${variant}','${product}','Zero stock',false,0,600000); insert into public.promotions(id,organization_id,label,scope,expires_at,discount_type,discount_value) values('${program}','${org}','Expired fixture','all','2000-01-01T00:00:00Z','percent',12.5);`);
});
afterAll(() => { if (enabled) sql(`delete from public.promotions where id='${program}'; delete from public.products where id='${product}'; delete from public.organizations where id='${org}';`); });
it.skipIf(!enabled)("reads actual local operational facts afresh and respects variant/expiry gates", async () => {
 const client = createClient<Database>("http://127.0.0.1:54321", process.env.ONEVOICE_LOCAL_ADMIN!, { auth: { persistSession: false, autoRefreshToken: false } });
 const initial = await readOpportunityInput(client, org, [product], []);
 expect((await rankOpportunities(initial)).selectedKey).toBeNull();
 expect(initial.programs[0].discountValue).toBe(12.5); expect(initial.programs[0].expiresAt).toContain("2000-01-01"); expect(initial.trends).toBeNull();
 sql(`update public.product_variants set stock_quantity=3,in_stock=true,price_vnd=700000 where id='${variant}'; update public.products set version=version+1 where id='${product}';`);
 const fresh = await readOpportunityInput(client, org, [product], []); const ranked = await rankOpportunities(fresh);
 expect(fresh.products[0].version).toBe(2); expect(fresh.products[0].variants[0].priceVnd).toBe(700000); expect(ranked.selectedKey).toBe(`product:${product}`); expect(ranked.ranked[0].components.program).toBe(0);
 sql(`update public.promotions set expires_at=null,version=version+1 where id='${program}';`);
 const fractional = await readOpportunityInput(client, org, [product], []);
 expect((await rankOpportunities(fractional)).ranked[0].components.program).toBe(10);
 await expect(readOpportunityInput(client, randomUUID(), [product], [])).rejects.toThrow("PRODUCT_SCOPE_UNAVAILABLE");
});
