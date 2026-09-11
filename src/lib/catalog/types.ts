// SPDX-License-Identifier: Apache-2.0

export type ProductQuality = "usable" | "partial" | "identity_only";

export interface CatalogQueryFilters {
  search?: string;
  brand?: string;
  productType?: string;
  quality?: ProductQuality;
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  organizationId?: string;
}

export interface CatalogQuerySort {
  field?: "price_vnd" | "stock_quantity" | "created_at" | "name";
  direction?: "asc" | "desc";
}

export interface CatalogPagination {
  page?: number;
  pageSize?: number;
}

export type OrganizationScope = Readonly<{
  organizationId: string;
}>;

export interface StudioProductFilters {
  brand?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
}

export type StudioProduct = Readonly<{
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  priceVnd: number;
  currency: string;
  stockQuantity: number | null;
  inStock: boolean;
  primaryImageUrl: string | null;
  keySpecs: readonly string[];
  collectedAt: string | null;
}>;

export type ProductFact = Readonly<{
  ref: string;
  label: string;
  value: string;
  critical: boolean;
}>;

export type ProductSnapshot = Readonly<{
  productId: string;
  organizationId: string;
  name: string;
  sku: string | null;
  brand: string | null;
  priceVnd: number;
  currency: string;
  stockQuantity: number | null;
  collectedAt: string | null;
  primaryImageUrl: string | null;
  facts: readonly ProductFact[];
}>;

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProductDetail {
  id: string;
  organizationId: string;
  sourceName: string | null;
  sourceUrl: string;
  canonicalUrl: string;
  sourceProductId: string | null;
  slug: string | null;
  sku: string | null;
  name: string;
  brand: string | null;
  productType: string | null;
  categoryName: string | null;
  description: string | null;
  descriptionText: string | null;
  priceVnd: number | null;
  compareAtPriceVnd: number | null;
  currency: string;
  availability: string | null;
  inStock: boolean;
  stockQuantity: number | null;
  quality: ProductQuality;
  completenessScore: number | null;
  specificationCount: number;
  collectedAt: string | null;
  extractorVersion: string | null;
  sourceHttpStatus: number | null;
  normalizedAttributes: Record<string, unknown> | null;
  specifications: unknown[] | null;
  breadcrumbs: unknown[] | null;
  images: Array<{
    id: string;
    sourceUrl: string;
    position: number;
    isPrimary: boolean;
    altText: string | null;
  }>;
  variants: Array<{
    id: string;
    sourceVariantId: string | null;
    sku: string | null;
    name: string | null;
    priceVnd: number | null;
    compareAtPriceVnd: number | null;
    inStock: boolean | null;
    stockQuantity: number | null;
    options: Record<string, unknown> | null;
    imageUrl: string | null;
  }>;
  categories: Array<{
    id: string;
    name: string;
    slug: string | null;
    isPrimary: boolean;
  }>;
  activePromotions: Array<{
    id: string;
    sourceCode: string | null;
    label: string;
    discountType: string | null;
    discountValue: number | null;
    startsAt: string | null;
    expiresAt: string | null;
    isFlashSale: boolean;
  }>;
}

export interface ProductContentContext {
  productId: string;
  organizationId: string | null;
  name: string | null;
  sku: string | null;
  brand: string | null;
  productType: string | null;
  currentPrice: number | null;
  compareAtPrice: number | null;
  inStock: boolean | null;
  stockQuantity: number | null;
  primaryImageUrl: string | null;
  normalizedAttributes: Record<string, unknown> | null;
  specifications: unknown[] | null;
  activePromotions: Array<{
    code: string | null;
    label: string;
    discount_type: string | null;
    discount_value: number | null;
    expires_at: string | null;
    is_flash_sale: boolean;
  }>;
  quality: string | null;
  completenessScore: number | null;
  collectedAt: string | null;
  isDataStale: boolean | null;
}
