// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { postgresUuid } from "../jobs/types";
import { createSupabaseSettingsRepository } from "../business/settings-supabase";
import { KnowledgeRepository } from "../knowledge/repository";
import { createTrendRepository } from "../trends/repository";
import { opportunityInputSchema, type OpportunityInput } from "./engine";
type ProductRow = Pick<Database["public"]["Tables"]["products"]["Row"], "id" | "organization_id" | "version" | "name" | "product_type" | "disabled_at" | "price_vnd" | "stock_quantity" | "in_stock"> & { product_variants: Array<Pick<Database["public"]["Tables"]["product_variants"]["Row"], "id" | "name" | "disabled_at" | "price_vnd" | "stock_quantity" | "in_stock">> };
export function mapProductFacts(row: ProductRow): OpportunityInput["products"][number] {
 return { id: row.id, organizationId: row.organization_id, version: row.version, name: row.name, productType: row.product_type, active: row.disabled_at === null, priceVnd: row.price_vnd, stockQuantity: row.stock_quantity, inStock: row.in_stock, variants: [...row.product_variants].sort((a, b) => a.id.localeCompare(b.id)).map(v => ({ id: v.id, name: v.name ?? "", active: v.disabled_at === null, priceVnd: v.price_vnd, stockQuantity: v.stock_quantity, inStock: v.in_stock })) };
}
async function bounded<T>(work: PromiseLike<T>): Promise<T> {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try { return await Promise.race([Promise.resolve(work), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("OPPORTUNITY_SOURCE_UNAVAILABLE")), 10000); })]); }
 finally { if (timer) clearTimeout(timer); }
}
/** Read-only, uncached composition. The authorized scheduler supplies a bounded
 * candidate product set and its durable recent picks. [] permits general programs
 * and engagement-only trends. No inference from external data changes catalog facts.
 * Each source/version is frozen; OV030 must revalidate before durable use.
 */
export async function readOpportunityInput(client: SupabaseClient<Database>, organizationId: string, productIds: string[], recent: OpportunityInput["recent"], now = new Date()): Promise<OpportunityInput> {
 const org = postgresUuid.parse(organizationId);
 const ids = z.array(postgresUuid).max(100).parse(productIds);
 if (new Set(ids).size !== ids.length) throw Error("DUPLICATE_PRODUCT_SCOPE");
 const capturedAt = now.toISOString();
 const [products, settings, firstPrograms, trends] = await Promise.all([
  ids.length ? bounded(client.from("products").select("id,organization_id,version,name,product_type,disabled_at,price_vnd,stock_quantity,in_stock,product_variants(id,name,disabled_at,price_vnd,stock_quantity,in_stock)").eq("organization_id", org).in("id", ids).order("id")) : Promise.resolve({ data: [], error: null }),
  bounded(createSupabaseSettingsRepository(client).read(org)),
  bounded(new KnowledgeRepository(client).list(org, { kind: "promotion", page: 1, pageSize: 50, search: "" })),
  bounded(createTrendRepository(client).latest(org)),
 ]);
 if (products.error || products.data?.length !== ids.length) throw Error("PRODUCT_SCOPE_UNAVAILABLE");
 if (firstPrograms.total > 100) throw Error("PROGRAM_SCOPE_TOO_LARGE");
 const secondPrograms = firstPrograms.total > 50 ? await bounded(new KnowledgeRepository(client).list(org, { kind: "promotion", page: 2, pageSize: 50, search: "" })) : null;
 const programs = [...firstPrograms.items, ...(secondPrograms?.items ?? [])].map(item => ({ id: item.id, version: item.version, title: item.document.title, body: item.document.body, active: item.document.active, startsAt: item.document.startsAt, expiresAt: item.document.expiresAt, scope: item.document.scope, productIds: item.document.productIds, discountType: item.document.discountType, discountValue: item.document.discountValue }));
 if (new Set(programs.map(p => p.id)).size !== programs.length || programs.length !== firstPrograms.total || (secondPrograms && secondPrograms.total !== firstPrograms.total)) throw Error("PROGRAM_SCOPE_CHANGED");
 return opportunityInputSchema.parse({ organizationId: org, capturedAt, settings, products: products.data.map(mapProductFacts), programs, trends, recent, performance: null });
}
