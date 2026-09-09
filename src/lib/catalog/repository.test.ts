// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import { CatalogRepository } from "./repository";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("CatalogRepository", () => {
  it("filters and paginates products correctly", async () => {
    const mockQueryBuilder: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{ id: "p1", name: "Keyboard A", sku: "KB-01", price_vnd: 1000000 }],
        count: 1,
        error: null,
      }),
    };

    const mockClient = {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
    } as unknown as SupabaseClient<Database>;

    const repo = new CatalogRepository({ client: mockClient });
    const result = await repo.listProducts(
      {
        search: "Keyboard",
        brand: "Logitech",
        quality: "usable",
        inStock: true,
        minPrice: 500000,
        maxPrice: 2000000,
      },
      { field: "price_vnd", direction: "asc" },
      { page: 1, pageSize: 10 }
    );

    expect(mockClient.from).toHaveBeenCalledWith("products");
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith("brand", "Logitech");
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith("quality", "usable");
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith("in_stock", true);
    expect(mockQueryBuilder.gte).toHaveBeenCalledWith("price_vnd", 500000);
    expect(mockQueryBuilder.lte).toHaveBeenCalledWith("price_vnd", 2000000);
    expect(mockQueryBuilder.order).toHaveBeenCalledWith("price_vnd", {
      ascending: true,
      nullsFirst: false,
    });
    expect(result.data.length).toBe(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it("fetches product detail with related entities", async () => {
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === "products") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "prod-1",
                organization_id: "org-1",
                name: "Gaming Laptop",
                sku: "LAP-01",
                quality: "usable",
                in_stock: true,
                price_vnd: 30000000,
              },
              error: null,
            }),
          };
        }
        if (table === "product_images") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "img-1",
                  source_url: "https://example.com/1.jpg",
                  position: 0,
                  is_primary: true,
                  alt_text: null,
                },
              ],
              error: null,
            }),
          };
        }
        if (table === "product_variants") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "var-1",
                  source_variant_id: "v-01",
                  sku: "LAP-01",
                  name: "Gaming Laptop",
                  price_vnd: 30000000,
                  compare_at_price_vnd: null,
                  in_stock: true,
                  stock_quantity: 5,
                  options: null,
                  image_url: null,
                },
              ],
              error: null,
            }),
          };
        }
        if (table === "product_categories") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  is_primary: true,
                  category: { id: "cat-1", name: "Laptop", slug: "laptop" },
                },
              ],
              error: null,
            }),
          };
        }
        if (table === "active_product_promotions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  promotion_id: "promo-1",
                  source_code: "PROMO-01",
                  label: "Summer Sale",
                  discount_type: "percentage",
                  discount_value: 10,
                  starts_at: null,
                  expires_at: null,
                  is_flash_sale: false,
                },
              ],
              error: null,
            }),
          };
        }
        return {};
      }),
    } as unknown as SupabaseClient<Database>;

    const repo = new CatalogRepository({ client: mockClient });
    const detail = await repo.getProductDetail("prod-1");

    expect(detail).not.toBeNull();
    expect(detail?.id).toBe("prod-1");
    expect(detail?.name).toBe("Gaming Laptop");
    expect(detail?.images.length).toBe(1);
    expect(detail?.variants.length).toBe(1);
    expect(detail?.categories.length).toBe(1);
    expect(detail?.activePromotions.length).toBe(1);
  });

  it("fetches product content context safely for AI", async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            product_id: "prod-1",
            organization_id: "org-1",
            name: "VGA RTX 4080",
            sku: "VGA-4080",
            brand: "ASUS",
            product_type: "gpu",
            current_price: 32000000,
            compare_at_price: 35000000,
            in_stock: true,
            stock_quantity: 4,
            primary_image_url: "https://example.com/vga.jpg",
            normalized_attributes: { chipset: "RTX 4080" },
            specifications: [{ name: "VRAM", value: "16GB" }],
            active_promotions: [
              {
                code: "HOT-VGA",
                label: "Giảm 5%",
                discount_type: "percentage",
                discount_value: 5,
                expires_at: "2026-12-31T00:00:00Z",
                is_flash_sale: false,
              },
            ],
            quality: "usable",
            completeness_score: 1.0,
            collected_at: "2026-08-31T00:00:00Z",
            is_data_stale: true,
          },
          error: null,
        }),
      }),
    } as unknown as SupabaseClient<Database>;

    const repo = new CatalogRepository({ client: mockClient });
    const context = await repo.getProductContentContext("prod-1");

    expect(context).not.toBeNull();
    expect(context?.productId).toBe("prod-1");
    expect(context?.name).toBe("VGA RTX 4080");
    expect(context?.currentPrice).toBe(32000000);
    expect(context?.isDataStale).toBe(true);
    expect(context?.activePromotions.length).toBe(1);
    // Ensure raw source payload is not in context
    const rawContext = context as unknown as Record<string, unknown>;
    expect(rawContext.source_payload).toBeUndefined();
    expect(rawContext.descriptionHtml).toBeUndefined();
  });
});
