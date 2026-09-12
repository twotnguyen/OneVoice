// SPDX-License-Identifier: Apache-2.0
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { StaffSession } from "@/lib/auth/session";
import { sanitizePostgrestSearchTerm } from "./repository";
import { managementCommandSchema, type ManagedProduct, type ManagementCommand, type ManagementListQuery, type ManagementListResult, type ManagementDocument } from "./management";

export class ManagementError extends Error {
  constructor(public code: "CONFLICT" | "FORBIDDEN" | "INVALID" | "UNAVAILABLE") { super(code); }
}
export class CatalogManagementRepository {
  constructor(private client: SupabaseClient<Database>) {}
  async list(organizationId: string, options: ManagementListQuery): Promise<ManagementListResult> {
    let query = this.client.from("products").select("id,name,sku,product_type,price_vnd,stock_quantity,disabled_at,version,source_name", { count: "exact" }).eq("organization_id", organizationId);
    const term = sanitizePostgrestSearchTerm(options.search);
    if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
    if (options.productType) query = query.eq("product_type", options.productType);
    if (options.active === "active") query = query.is("disabled_at", null);
    if (options.active === "disabled") query = query.not("disabled_at", "is", null);
    const offset = (options.page - 1) * options.pageSize;
    const { data, error, count } = await query.order("updated_at", { ascending: false }).order("id", { ascending: true }).range(offset, offset + options.pageSize - 1);
    if (error) throw new ManagementError("UNAVAILABLE");
    return { items: (data ?? []).map((row) => ({ id: row.id, name: row.name, sku: row.sku, productType: row.product_type, priceVnd: row.price_vnd, stockQuantity: row.stock_quantity, active: row.disabled_at === null, version: row.version, sourceName: row.source_name })), total: count ?? 0, page: options.page, pageSize: options.pageSize };
  }
  async get(organizationId: string, id: string): Promise<ManagedProduct | null> {
    const { data: product, error } = await this.client.from("products").select("id,name,sku,brand,product_type,description_text,price_vnd,stock_quantity,in_stock,disabled_at,version,source_name,source_url,source_product_id,manually_edited_at,specifications").eq("organization_id", organizationId).eq("id", id).maybeSingle();
    if (error) throw new ManagementError("UNAVAILABLE");
    if (!product) return null;
    const [images, variants] = await Promise.all([
      this.client.from("product_images").select("id,source_url,alt_text").eq("product_id", id).order("position"),
      this.client.from("product_variants").select("id,name,sku,price_vnd,stock_quantity,in_stock,disabled_at,image_url").eq("product_id", id).order("created_at"),
    ]);
    if (images.error || variants.error) throw new ManagementError("UNAVAILABLE");
    const specifications: ManagementDocument["specifications"] = Array.isArray(product.specifications) ? product.specifications.flatMap((s) => s && typeof s === "object" && !Array.isArray(s) && typeof s.name === "string" && typeof s.value === "string" ? [{ name: s.name, value: s.value }] : []) : [];
    return { id: product.id, version: product.version, sourceName: product.source_name, sourceUrl: product.source_url, sourceProductId: product.source_product_id, editedAt: product.manually_edited_at,
      document: { name: product.name, sku: product.sku, brand: product.brand, productType: product.product_type ?? "other", descriptionText: product.description_text, priceVnd: product.price_vnd, stockQuantity: product.stock_quantity, inStock: product.in_stock, active: product.disabled_at === null, specifications,
        images: (images.data ?? []).map((image) => ({ id: image.id, url: image.source_url, altText: image.alt_text })),
        variants: (variants.data ?? []).map((v) => ({ id: v.id, name: v.name, sku: v.sku, priceVnd: v.price_vnd, stockQuantity: v.stock_quantity, inStock: v.in_stock, active: v.disabled_at === null, imageUrl: v.image_url })),
      } };
  }
  async save(actor: StaffSession, input: ManagementCommand): Promise<{ productId: string; version: number }> {
    const command = managementCommandSchema.parse(input);
    const { data, error } = await this.client.rpc("save_catalog_product", { p_organization_id: actor.organizationId, p_actor_id: actor.userId, p_request_id: command.requestId, p_product_id: command.productId, p_expected_version: command.expectedVersion, p_document: command.document as Json });
    if (error) {
      if (error.code === "40001" || error.code === "23505") throw new ManagementError("CONFLICT");
      if (error.code === "42501") throw new ManagementError("FORBIDDEN");
      if (["22023", "22P02", "23514"].includes(error.code)) throw new ManagementError("INVALID");
      throw new ManagementError("UNAVAILABLE");
    }
    if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.productId !== "string" || typeof data.version !== "number") throw new ManagementError("UNAVAILABLE");
    return { productId: data.productId, version: data.version };
  }
}
