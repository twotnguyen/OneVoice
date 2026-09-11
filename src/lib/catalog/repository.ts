// SPDX-License-Identifier: Apache-2.0

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type {
  CatalogPagination,
  CatalogQueryFilters,
  CatalogQuerySort,
  OrganizationScope,
  PaginatedResult,
  ProductContentContext,
  ProductDetail,
  ProductFact,
  ProductSnapshot,
  StudioProduct,
  StudioProductFilters,
} from "./types";

const MAX_PRODUCT_FACTS = 8;

const ALLOWED_PRODUCT_SORT_FIELDS: ReadonlySet<string> = new Set([
  "price_vnd",
  "stock_quantity",
  "created_at",
  "name",
]);

function isOrganizationScope(value: unknown): value is OrganizationScope {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { organizationId?: unknown }).organizationId === "string"
  );
}

// PostgREST parses `or=(a,b)` filter lists structurally: an unescaped comma,
// parenthesis, backslash or double quote in an interpolated value breaks out of
// the intended expression and injects arbitrary filters (a bare `"` also yields a
// 400 "failed to parse filter"). `%` / `*` would act as `ilike` wildcards. Strip
// all of them so the term can only ever be a literal contains-match fragment
// (a leading/trailing `"` from an inch spec like `14"` is simply dropped).
export function sanitizePostgrestSearchTerm(term: string): string {
  return term.replace(/[,()\\%*"]/g, "").trim();
}

export function extractKeySpecs(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null) return [];
  const attrs = raw as Record<string, unknown>;
  const specs: string[] = [];

  if (typeof attrs.gpu === "string" && attrs.gpu.trim()) {
    specs.push(attrs.gpu.trim());
  }
  if (typeof attrs.ram === "string" && attrs.ram.trim()) {
    const ram = attrs.ram.trim();
    if (/^\d+$/.test(ram)) {
      specs.push(`${ram}GB RAM`);
    } else {
      specs.push(ram.toUpperCase().includes("RAM") ? ram : `${ram} RAM`);
    }
  }
  if (typeof attrs.storage === "string" && attrs.storage.trim()) {
    const s = attrs.storage.trim();
    if (/^\d+$/.test(s)) {
      const num = Number(s);
      specs.push(num >= 1000 ? `${Math.round(num / 1024)}TB SSD` : `${num}GB SSD`);
    } else {
      specs.push(s);
    }
  }
  if (typeof attrs.refreshRate === "string" && attrs.refreshRate.trim() && specs.length < 3) {
    specs.push(attrs.refreshRate.trim());
  }
  if (typeof attrs.resolution === "string" && attrs.resolution.trim() && specs.length < 3) {
    specs.push(attrs.resolution.trim());
  }
  if (typeof attrs.cpu === "string" && attrs.cpu.trim() && specs.length < 3) {
    const cpu = attrs.cpu.trim().split(/[\(\/]/)[0].trim();
    specs.push(cpu);
  }
  if (typeof attrs.size === "string" && attrs.size.trim() && specs.length < 3) {
    specs.push(attrs.size.trim());
  }

  return specs.slice(0, 3);
}

export interface CatalogRepositoryOptions {
  client: SupabaseClient<Database>;
  defaultOrganizationId?: string;
}

export class CatalogRepository {
  private readonly client: SupabaseClient<Database>;
  private readonly defaultOrgId: string;

  constructor(options: CatalogRepositoryOptions) {
    this.client = options.client;
    this.defaultOrgId =
      options.defaultOrganizationId ?? "a0000000-0000-0000-0000-000000000001";
  }

  async listStudioProducts(
    scope: OrganizationScope,
    pagination: CatalogPagination = {},
    productType: string = "laptop",
    filters?: StudioProductFilters
  ): Promise<Readonly<{
    items: readonly StudioProduct[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>> {
    const page = Math.min(100, Math.max(1, pagination.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, pagination.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    let query = this.client
      .from("content_ready_products")
      .select(
        "id, name, sku, brand, price_vnd, currency, in_stock, stock_quantity, collected_at, normalized_attributes, product_images(source_url, is_primary, position)",
        { count: "exact" }
      )
      .eq("organization_id", scope.organizationId)
      .eq("quality", "usable")
      .gt("price_vnd", 0);

    const effectiveType = productType ?? filters?.productType;
    if (effectiveType && effectiveType !== "all") {
      query = query.eq("product_type", effectiveType);
    }
    if (filters?.inStockOnly !== false) {
      query = query.eq("in_stock", true);
    }

    if (filters?.brand) {
      query = query.ilike("brand", filters.brand);
    }

    if (typeof filters?.minPrice === "number" && filters.minPrice >= 0) {
      query = query.gte("price_vnd", filters.minPrice);
    }

    if (typeof filters?.maxPrice === "number" && filters.maxPrice > 0) {
      query = query.lte("price_vnd", filters.maxPrice);
    }

    if (filters?.search) {
      const term = sanitizePostgrestSearchTerm(filters.search);
      if (term) {
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      }
    }

    const { data, count, error } = await query
      .order("price_vnd", { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to list studio products: ${error.message}`);
    }

    const items: StudioProduct[] = (data ?? []).flatMap((product) => {
      if (!product.id || !product.name || !product.price_vnd) {
        return [];
      }

      type ProductImageRow = { source_url?: string; is_primary?: boolean; position?: number };
      const rawImages = (product as { product_images?: ProductImageRow[] }).product_images;
      const images: ProductImageRow[] = Array.isArray(rawImages) ? rawImages : [];
      const primaryImg = images.find((img) => img.is_primary) ?? images[0];
      const primaryImageUrl = primaryImg?.source_url ? String(primaryImg.source_url) : null;
      const keySpecs = extractKeySpecs((product as { normalized_attributes?: unknown }).normalized_attributes);

      return [{
        id: product.id,
        name: product.name,
        sku: product.sku,
        brand: product.brand,
        priceVnd: product.price_vnd,
        currency: product.currency ?? "VND",
        stockQuantity: product.stock_quantity,
        inStock: Boolean(product.in_stock),
        primaryImageUrl,
        keySpecs,
        collectedAt: product.collected_at,
      }];
    });
    const total = count ?? 0;

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getProductSnapshot(
    scope: OrganizationScope,
    productId: string,
    productType: string = "laptop"
  ): Promise<ProductSnapshot | null> {
    const { data, error } = await this.client
      .from("product_content_context")
      .select(
        "product_id, organization_id, name, sku, brand, current_price, stock_quantity, primary_image_url, specifications, collected_at, product_type, quality, in_stock"
      )
      .eq("product_id", productId)
      .eq("organization_id", scope.organizationId)
      .eq("product_type", productType)
      .eq("quality", "usable")
      .eq("in_stock", true)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to get product snapshot");
    }

    if (
      !data?.name ||
      !data.current_price ||
      data.current_price <= 0 ||
      data.product_type !== productType ||
      data.quality !== "usable" ||
      data.in_stock !== true
    ) {
      return null;
    }

    const facts: ProductFact[] = [
      { ref: "product.name", label: "Product", value: data.name, critical: true },
      ...(data.sku
        ? [{ ref: "product.sku", label: "SKU", value: data.sku, critical: true }]
        : []),
      {
        ref: "offer.price",
        label: "Price",
        value: `${data.current_price} VND`,
        critical: true,
      },
      ...(data.stock_quantity === null
        ? []
        : [{
            ref: "inventory.stock",
            label: "Stock",
            value: String(data.stock_quantity),
            critical: true,
          }]),
      ...this.toSpecificationFacts(data.specifications),
    ].slice(0, MAX_PRODUCT_FACTS);

    return {
      productId,
      organizationId: scope.organizationId,
      name: data.name,
      sku: data.sku,
      brand: data.brand,
      priceVnd: data.current_price,
      currency: "VND",
      stockQuantity: data.stock_quantity,
      collectedAt: data.collected_at,
      primaryImageUrl: data.primary_image_url,
      facts,
    };
  }

  private toSpecificationFacts(specifications: unknown): ProductFact[] {
    if (!Array.isArray(specifications)) {
      return [];
    }

    return specifications.flatMap((specification, index) => {
      if (
        typeof specification !== "object" ||
        specification === null ||
        !("name" in specification) ||
        !("value" in specification) ||
        typeof specification.name !== "string" ||
        typeof specification.value !== "string" ||
        !specification.name.trim() ||
        !specification.value.trim()
      ) {
        return [];
      }

      return [{
        ref: `spec.${index}`,
        label: specification.name,
        value: specification.value,
        critical: true,
      }];
    });
  }

  async listProducts(
    filters: CatalogQueryFilters = {},
    sort: CatalogQuerySort = {},
    pagination: CatalogPagination = {}
  ): Promise<PaginatedResult<Database["public"]["Tables"]["products"]["Row"]>> {
    const page = Math.min(100, Math.max(1, pagination.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, pagination.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    let query = this.client
      .from("products")
      .select("*", { count: "exact" });

    const orgId = filters.organizationId ?? this.defaultOrgId;
    query = query.eq("organization_id", orgId);

    if (filters.search && filters.search.trim()) {
      const term = sanitizePostgrestSearchTerm(filters.search);
      if (term) {
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      }
    }

    if (filters.brand) {
      query = query.eq("brand", filters.brand);
    }

    if (filters.productType) {
      query = query.eq("product_type", filters.productType);
    }

    if (filters.quality) {
      query = query.eq("quality", filters.quality);
    }

    if (typeof filters.inStock === "boolean") {
      query = query.eq("in_stock", filters.inStock);
    }

    if (typeof filters.minPrice === "number") {
      query = query.gte("price_vnd", filters.minPrice);
    }

    if (typeof filters.maxPrice === "number") {
      query = query.lte("price_vnd", filters.maxPrice);
    }

    const requestedSortField = sort.field ?? "created_at";
    const sortField = ALLOWED_PRODUCT_SORT_FIELDS.has(requestedSortField)
      ? requestedSortField
      : "created_at";
    const ascending = sort.direction === "asc";
    query = query.order(sortField, { ascending, nullsFirst: false });

    query = query.range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;
    if (error) {
      throw new Error(`Failed to list products: ${error.message}`);
    }

    const total = count ?? 0;
    return {
      data: data ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getProductDetail(
    scope: OrganizationScope,
    id: string
  ): Promise<ProductDetail | null>;
  async getProductDetail(
    id: string,
    scope?: OrganizationScope
  ): Promise<ProductDetail | null>;
  async getProductDetail(
    scopeOrId: OrganizationScope | string,
    idOrScope?: string | OrganizationScope
  ): Promise<ProductDetail | null> {
    let scope: OrganizationScope | undefined;
    let id: string;
    if (isOrganizationScope(scopeOrId) && typeof idOrScope === "string") {
      scope = scopeOrId;
      id = idOrScope;
    } else if (typeof scopeOrId === "string") {
      id = scopeOrId;
      scope = isOrganizationScope(idOrScope) ? idOrScope : undefined;
    } else {
      return null;
    }

    let productQuery = this.client.from("products").select("*").eq("id", id);
    if (scope) {
      productQuery = productQuery.eq("organization_id", scope.organizationId);
    }
    const { data: product, error: prodErr } = await productQuery.maybeSingle();

    if (prodErr || !product) {
      return null;
    }

    if (scope && product.organization_id !== scope.organizationId) {
      return null;
    }

    const [imagesRes, variantsRes, catMapRes, promoMapRes] = await Promise.all([
      this.client
        .from("product_images")
        .select("*")
        .eq("product_id", id)
        .order("position", { ascending: true }),
      this.client
        .from("product_variants")
        .select("*")
        .eq("product_id", id),
      this.client
        .from("product_categories")
        .select("is_primary, category:categories(id, name, slug)")
        .eq("product_id", id),
      this.client
        .from("active_product_promotions")
        .select("*")
        .eq("product_id", id),
    ]);

    const categories = (catMapRes.data ?? [])
      .map((entry) => {
        const cat = entry.category as { id: string; name: string; slug: string | null } | null;
        if (!cat) return null;
        return {
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          isPrimary: entry.is_primary,
        };
      })
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    const activePromotions = (promoMapRes.data ?? []).map((p) => ({
      id: p.promotion_id ?? "",
      sourceCode: p.source_code,
      label: p.label ?? "",
      discountType: p.discount_type,
      discountValue: p.discount_value,
      startsAt: p.starts_at,
      expiresAt: p.expires_at,
      isFlashSale: p.is_flash_sale ?? false,
    }));

    return {
      id: product.id,
      organizationId: product.organization_id,
      sourceName: product.source_name,
      sourceUrl: product.source_url,
      canonicalUrl: product.canonical_url,
      sourceProductId: product.source_product_id,
      slug: product.slug,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      productType: product.product_type,
      categoryName: product.category_name,
      description: product.description,
      descriptionText: product.description_text,
      priceVnd: product.price_vnd,
      compareAtPriceVnd: product.compare_at_price_vnd,
      currency: product.currency,
      availability: product.availability,
      inStock: product.in_stock,
      stockQuantity: product.stock_quantity,
      quality: product.quality as ProductDetail["quality"],
      completenessScore: product.completeness_score,
      specificationCount: product.specification_count,
      collectedAt: product.collected_at,
      extractorVersion: product.extractor_version,
      sourceHttpStatus: product.source_http_status,
      normalizedAttributes: product.normalized_attributes as Record<string, unknown> | null,
      specifications: product.specifications as unknown[] | null,
      breadcrumbs: product.breadcrumbs as unknown[] | null,
      images: (imagesRes.data ?? []).map((img) => ({
        id: img.id,
        sourceUrl: img.source_url,
        position: img.position,
        isPrimary: img.is_primary,
        altText: img.alt_text,
      })),
      variants: (variantsRes.data ?? []).map((v) => ({
        id: v.id,
        sourceVariantId: v.source_variant_id,
        sku: v.sku,
        name: v.name,
        priceVnd: v.price_vnd,
        compareAtPriceVnd: v.compare_at_price_vnd,
        inStock: v.in_stock,
        stockQuantity: v.stock_quantity,
        options: v.options as Record<string, unknown> | null,
        imageUrl: v.image_url,
      })),
      categories,
      activePromotions,
    };
  }

  async getContentReadyProducts(
    scope: OrganizationScope,
    pagination?: CatalogPagination
  ): Promise<PaginatedResult<Database["public"]["Views"]["content_ready_products"]["Row"]>>;
  async getContentReadyProducts(
    pagination?: CatalogPagination
  ): Promise<PaginatedResult<Database["public"]["Views"]["content_ready_products"]["Row"]>>;
  async getContentReadyProducts(
    scopeOrPagination?: OrganizationScope | CatalogPagination,
    paginationOrScope?: CatalogPagination | OrganizationScope
  ): Promise<PaginatedResult<Database["public"]["Views"]["content_ready_products"]["Row"]>> {
    let scope: OrganizationScope | undefined;
    let pagination: CatalogPagination = {};
    if (isOrganizationScope(scopeOrPagination)) {
      scope = scopeOrPagination;
      pagination = isOrganizationScope(paginationOrScope)
        ? {}
        : (paginationOrScope ?? {});
    } else {
      pagination = scopeOrPagination ?? {};
      scope = isOrganizationScope(paginationOrScope)
        ? paginationOrScope
        : undefined;
    }
    const page = Math.max(1, pagination.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, pagination.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    let contentReadyQuery = this.client
      .from("content_ready_products")
      .select("*", { count: "exact" });
    if (scope) {
      contentReadyQuery = contentReadyQuery.eq(
        "organization_id",
        scope.organizationId
      );
    }
    const { data, count, error } = await contentReadyQuery.range(
      offset,
      offset + pageSize - 1
    );

    if (error) {
      throw new Error(`Failed to get content-ready products: ${error.message}`);
    }

    const total = count ?? 0;
    return {
      data: data ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getRandomContentReadyProduct(
    scope?: OrganizationScope
  ): Promise<Database["public"]["Views"]["content_ready_products"]["Row"] | null> {
    let countQuery = this.client
      .from("content_ready_products")
      .select("*", { count: "exact", head: true });
    if (scope) {
      countQuery = countQuery.eq("organization_id", scope.organizationId);
    }
    const { count, error: countErr } = await countQuery;

    if (countErr || !count || count === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * count);
    let dataQuery = this.client.from("content_ready_products").select("*");
    if (scope) {
      dataQuery = dataQuery.eq("organization_id", scope.organizationId);
    }
    const { data, error } = await dataQuery
      .range(randomIndex, randomIndex)
      .limit(1);

    if (error || !data || data.length === 0) {
      return null;
    }

    return data[0];
  }

  async getProductContentContext(
    scope: OrganizationScope,
    productId: string
  ): Promise<ProductContentContext | null>;
  async getProductContentContext(
    productId: string,
    scope?: OrganizationScope
  ): Promise<ProductContentContext | null>;
  async getProductContentContext(
    scopeOrProductId: OrganizationScope | string,
    productIdOrScope?: string | OrganizationScope
  ): Promise<ProductContentContext | null> {
    let scope: OrganizationScope | undefined;
    let productId: string;
    if (
      isOrganizationScope(scopeOrProductId) &&
      typeof productIdOrScope === "string"
    ) {
      scope = scopeOrProductId;
      productId = productIdOrScope;
    } else if (typeof scopeOrProductId === "string") {
      productId = scopeOrProductId;
      scope = isOrganizationScope(productIdOrScope)
        ? productIdOrScope
        : undefined;
    } else {
      return null;
    }

    let contextQuery = this.client
      .from("product_content_context")
      .select("*")
      .eq("product_id", productId);
    if (scope) {
      contextQuery = contextQuery.eq("organization_id", scope.organizationId);
    }
    const { data, error } = await contextQuery.maybeSingle();

    if (error || !data) {
      return null;
    }

    if (scope && data.organization_id !== scope.organizationId) {
      return null;
    }

    return {
      productId: data.product_id ?? productId,
      organizationId: data.organization_id,
      name: data.name,
      sku: data.sku,
      brand: data.brand,
      productType: data.product_type,
      currentPrice: data.current_price,
      compareAtPrice: data.compare_at_price,
      inStock: data.in_stock,
      stockQuantity: data.stock_quantity,
      primaryImageUrl: data.primary_image_url,
      normalizedAttributes: data.normalized_attributes as Record<string, unknown> | null,
      specifications: data.specifications as unknown[] | null,
      activePromotions: (data.active_promotions as Array<{
        code: string | null;
        label: string;
        discount_type: string | null;
        discount_value: number | null;
        expires_at: string | null;
        is_flash_sale: boolean;
      }>) ?? [],
      quality: data.quality,
      completenessScore: data.completeness_score,
      collectedAt: data.collected_at,
      isDataStale: data.is_data_stale,
    };
  }
}
