// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { StaffSession } from "@/lib/auth/session";
import { sanitizePostgrestSearchTerm } from "@/lib/catalog/repository";
import { knowledgeCommandSchema, type KnowledgeCommand, type KnowledgePage, type KnowledgeRecord, type knowledgeQuerySchema } from "./management";

export class KnowledgeError extends Error { constructor(public code: "INVALID" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE") { super(code); } }
type Policy = Database["public"]["Tables"]["business_policies"]["Row"];
type Promotion = Database["public"]["Tables"]["promotions"]["Row"];
function policyRecord(row: Policy): KnowledgeRecord {
  return { id: row.id, version: row.version, source: "Do người quản lý nhập", document: { kind: row.kind as "return" | "warranty" | "service", title: row.title, body: row.body, startsAt: row.starts_at, expiresAt: row.expires_at, active: row.disabled_at === null, scope: row.product_ids.length ? "products" : "all", productIds: row.product_ids, discountType: null, discountValue: null } };
}
function promotionRecord(row: Promotion, productIds: string[]): KnowledgeRecord {
  return { id: row.id, version: row.version, source: row.source_code ? `Nguồn nhập: ${row.source_code}` : row.promotion_type === "manual" ? "Do người quản lý nhập" : "Dữ liệu khuyến mãi nhập trước đây", document: { kind: "promotion", title: row.label, body: row.details_text ?? row.label, startsAt: row.starts_at, expiresAt: row.expires_at, active: row.disabled_at === null, scope: row.scope as "all" | "products", productIds, discountType: row.discount_type, discountValue: row.discount_value } };
}
/** Trusted server repository: callers must authorize manager reads/writes, or verified
 * conversation scope for evidence. No claim approval and no discount aggregation.
 */
export class KnowledgeRepository {
  constructor(private client: SupabaseClient<Database>) {}
  async list(organizationId: string, options: z.infer<typeof knowledgeQuerySchema>): Promise<KnowledgePage> {
    const term = sanitizePostgrestSearchTerm(options.search);
    const offset = (options.page - 1) * options.pageSize;
    if (options.kind === "policy") {
      let query = this.client.from("business_policies").select("*", { count: "exact" }).eq("organization_id", organizationId);
      if (term) query = query.ilike("title", `%${term}%`);
      const { data, error, count } = await query.order("updated_at", { ascending: false }).order("id").range(offset, offset + options.pageSize - 1);
      if (error) throw new KnowledgeError("UNAVAILABLE");
      return { items: (data ?? []).map(policyRecord), total: count ?? 0, page: options.page, pageSize: options.pageSize };
    }
    let query = this.client.from("promotions").select("id,organization_id,version,scope,label,details_text,starts_at,expires_at,disabled_at,discount_type,discount_value,source_code,promotion_type,created_at,updated_at,is_flash_sale,manually_edited_at", { count: "exact" }).eq("organization_id", organizationId);
    if (term) query = query.ilike("label", `%${term}%`);
    const { data, error, count } = await query.order("updated_at", { ascending: false }).order("id").range(offset, offset + options.pageSize - 1);
    if (error) throw new KnowledgeError("UNAVAILABLE");
    const ids = (data ?? []).map(row => row.id);
    const links: Array<{ promotion_id: string; product_id: string }> = [];
    if (ids.length) for (let offset = 0; ; offset += 1000) {
      const batch = await this.client.from("product_promotions").select("promotion_id,product_id", { count: "exact" }).in("promotion_id", ids).order("promotion_id").order("product_id").range(offset, offset + 999);
      if (batch.error || (batch.count ?? 0) > 5000) throw new KnowledgeError("UNAVAILABLE");
      links.push(...(batch.data ?? []));
      if ((batch.data?.length ?? 0) < 1000) break;
    }
    return { items: (data ?? []).map(row => promotionRecord({ ...row, source_payload: null }, links.filter(link => link.promotion_id === row.id).map(link => link.product_id))), total: count ?? 0, page: options.page, pageSize: options.pageSize };
  }
  async save(actor: StaffSession, input: KnowledgeCommand): Promise<{ id: string; version: number }> {
    const command = knowledgeCommandSchema.parse(input);
    const { data, error } = await this.client.rpc("save_knowledge", { p_organization_id: actor.organizationId, p_actor_id: actor.userId, p_id: command.id, p_request_id: command.requestId, p_expected_version: command.expectedVersion, p_document: command.document as Json });
    if (error) throw new KnowledgeError(error.code === "42501" ? "FORBIDDEN" : ["40001", "23505"].includes(error.code) ? "CONFLICT" : ["22023", "22007", "22008", "22P02", "23514"].includes(error.code) ? "INVALID" : "UNAVAILABLE");
    return z.object({ id: z.string().uuid(), version: z.number().int().positive() }).parse(data);
  }
  async history(organizationId: string, id: string) {
    const { data, error } = await this.client.from("knowledge_edits").select("version,document,created_at").eq("organization_id", organizationId).eq("entity_id", z.string().uuid().parse(id)).order("version", { ascending: false }).limit(50);
    if (error) throw new KnowledgeError("UNAVAILABLE");
    return data ?? [];
  }
  /** Every evidence read uses a fresh database query and a server-owned instant.
   * More than 100 matches fails closed, avoiding silent incomplete advice.
   */
  async evidence(organizationId: string, productId: string | null = null, at = new Date()) {
    const time = at.toISOString();
    if (productId) {
      z.string().uuid().parse(productId);
      const product = await this.client.from("products").select("id").eq("id", productId).eq("organization_id", organizationId).is("disabled_at", null).maybeSingle();
      if (product.error) throw new KnowledgeError("UNAVAILABLE");
      if (!product.data) return { policies: [], promotions: [], evaluatedAt: time };
    }
    let policyQuery = this.client.from("business_policies").select("*").eq("organization_id", organizationId).is("disabled_at", null)
      .or(`starts_at.is.null,starts_at.lte.${time}`).or(`expires_at.is.null,expires_at.gt.${time}`);
    policyQuery = productId ? policyQuery.or(`product_ids.eq.{},product_ids.cs.{${productId}}`) : policyQuery.filter("product_ids", "eq", "{}");
    const policies = await policyQuery.limit(101);
    if (policies.error || (policies.data?.length ?? 0) > 100) throw new KnowledgeError("UNAVAILABLE");
    const globalPromotions = await this.client.from("promotions").select("id,organization_id,version,scope,label,details_text,starts_at,expires_at,disabled_at,discount_type,discount_value,source_code,promotion_type,created_at,updated_at,is_flash_sale,manually_edited_at")
      .eq("organization_id", organizationId).eq("scope", "all").is("disabled_at", null).or(`starts_at.is.null,starts_at.lte.${time}`).or(`expires_at.is.null,expires_at.gt.${time}`).limit(101);
    if (globalPromotions.error || (globalPromotions.data?.length ?? 0) > 100) throw new KnowledgeError("UNAVAILABLE");
    const general = (globalPromotions.data ?? []).map(row => promotionRecord({ ...row, source_payload: null }, []));
    if (!productId) return { policies: (policies.data ?? []).map(policyRecord), promotions: general, evaluatedAt: time };
    // Use the same underlying promotion rows and explicit time boundary as the catalog view.
    const links = await this.client.from("product_promotions").select("promotions!inner(id,organization_id,version,scope,label,details_text,starts_at,expires_at,disabled_at,discount_type,discount_value,source_code,promotion_type,created_at,updated_at,is_flash_sale,manually_edited_at)")
      .eq("product_id", productId).eq("promotions.organization_id", organizationId).eq("promotions.scope", "products").is("promotions.disabled_at", null)
      .or(`starts_at.is.null,starts_at.lte.${time}`, { referencedTable: "promotions" }).or(`expires_at.is.null,expires_at.gt.${time}`, { referencedTable: "promotions" }).limit(101);
    if (links.error || (links.data?.length ?? 0) + general.length > 100) throw new KnowledgeError("UNAVAILABLE");
    return { policies: (policies.data ?? []).map(policyRecord), promotions: [...general, ...(links.data ?? []).map(link => promotionRecord({ ...link.promotions, source_payload: null }, [productId]))], evaluatedAt: time };
  }
}
