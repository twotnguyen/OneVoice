// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import { CatalogRepository } from "./repository";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("CatalogRepository", () => {
  it("lists only scoped, usable, in-stock laptops with a positive price", async () => {
    const contentReadyRow: Database["public"]["Views"]["content_ready_products"]["Row"] = {
      availability: "InStock",
      brand: "ASUS",
      breadcrumbs: [{ name: "Laptop", url: "https://example.com/laptop" }],
      canonical_url: "https://example.com/laptop-asus",
      category_name: "Laptop",
      collected_at: "2026-08-31T00:00:00Z",
      compare_at_price_vnd: 32_000_000,
      completeness_score: 1,
      created_at: "2026-08-31T00:00:00Z",
      currency: "VND",
      description: "<p>Raw description</p>",
      description_text: "Raw description",
      extractor_version: "1.0.0",
      id: "prod-1",
      in_stock: true,
      name: "Laptop ASUS",
      normalized_attributes: { cpu: "Intel Core i7" },
      organization_id: "org-1",
      price_vnd: 30_000_000,
      product_type: "laptop",
      quality: "usable",
      sku: "LAP-01",
      slug: "laptop-asus",
      source_http_status: 200,
      source_name: "Example",
      source_product_id: "source-1",
      source_url: "https://example.com/laptop-asus",
      specification_count: 1,
      specifications: [{ name: "CPU", value: "Intel Core i7" }],
      stock_quantity: 4,
      updated_at: "2026-08-31T00:00:00Z",
    };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [contentReadyRow],
        count: 1,
        error: null,
      }),
    };
    const client = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>;
    const repository = new CatalogRepository({ client });

    const result = await repository.listStudioProducts(
      { organizationId: "org-1" },
      { page: 1, pageSize: 18 }
    );

    expect(client.from).toHaveBeenCalledWith("content_ready_products");
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(query.eq).toHaveBeenCalledWith("product_type", "laptop");
    expect(query.eq).toHaveBeenCalledWith("quality", "usable");
    expect(query.eq).toHaveBeenCalledWith("in_stock", true);
    expect(query.gt).toHaveBeenCalledWith("price_vnd", 0);
    expect(query.order).toHaveBeenCalledWith("price_vnd", {
      ascending: false,
      nullsFirst: false,
    });
    expect(query.range).toHaveBeenCalledWith(0, 17);
    expect(result.items[0]).toEqual({
      id: "prod-1",
      name: "Laptop ASUS",
      sku: "LAP-01",
      brand: "ASUS",
      priceVnd: 30_000_000,
      currency: "VND",
      stockQuantity: 4,
      collectedAt: "2026-08-31T00:00:00Z",
    });
    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 18, totalPages: 1 });
  });

  it("filters studio products by brand and sanitized search term", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      }),
    };
    const client = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>;
    const repository = new CatalogRepository({ client });

    await repository.listStudioProducts(
      { organizationId: "org-1" },
      { page: 1, pageSize: 18 },
      "laptop",
      { brand: "ACER", search: 'Nitro 16", (pro)%' },
    );

    expect(client.from).toHaveBeenCalledWith("content_ready_products");
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(query.eq).toHaveBeenCalledWith("product_type", "laptop");
    expect(query.ilike).toHaveBeenCalledWith("brand", "ACER");
    expect(query.or).toHaveBeenCalledWith("name.ilike.%Nitro 16 pro%,sku.ilike.%Nitro 16 pro%");
  });

  it("does not apply or filter when search term sanitizes to empty string", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [],
        count: 0,
        error: null,
      }),
    };
    const client = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>;
    const repository = new CatalogRepository({ client });

    await repository.listStudioProducts(
      { organizationId: "org-1" },
      { page: 1, pageSize: 18 },
      "laptop",
      { search: '",()\\%*"' },
    );

    expect(query.or).not.toHaveBeenCalled();
  });

  it("returns an organization-scoped snapshot with only allow-listed facts", async () => {
    const specifications = Array.from({ length: 10 }, (_, index) => ({
      name: `Specification ${index + 1}`,
      value: `Value ${index + 1}`,
    }));
    const contentContextRow: Database["public"]["Views"]["product_content_context"]["Row"] = {
      active_promotions: [{ label: "Raw promotion" }],
      brand: "ASUS",
      collected_at: "2026-08-31T00:00:00Z",
      compare_at_price: 32_000_000,
      completeness_score: 1,
      current_price: 30_000_000,
      in_stock: true,
      is_data_stale: false,
      name: "Laptop ASUS",
      normalized_attributes: { unsafe: "arbitrary JSON" },
      organization_id: "org-1",
      primary_image_url: "https://example.com/laptop.jpg",
      product_id: "prod-1",
      product_type: "laptop",
      quality: "usable",
      sku: "LAP-01",
      specifications,
      stock_quantity: 4,
    };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: contentContextRow, error: null }),
    };
    const client = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>;
    const repository = new CatalogRepository({ client });

    const snapshot = await repository.getProductSnapshot(
      { organizationId: "org-1" },
      "prod-1"
    );

    expect(client.from).toHaveBeenCalledWith("product_content_context");
    expect(query.eq).toHaveBeenCalledWith("product_id", "prod-1");
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(snapshot).toEqual({
      productId: "prod-1",
      organizationId: "org-1",
      name: "Laptop ASUS",
      sku: "LAP-01",
      brand: "ASUS",
      priceVnd: 30_000_000,
      currency: "VND",
      stockQuantity: 4,
      collectedAt: "2026-08-31T00:00:00Z",
      primaryImageUrl: "https://example.com/laptop.jpg",
      facts: [
        { ref: "product.name", label: "Product", value: "Laptop ASUS", critical: true },
        { ref: "product.sku", label: "SKU", value: "LAP-01", critical: true },
        { ref: "offer.price", label: "Price", value: "30000000 VND", critical: true },
        { ref: "inventory.stock", label: "Stock", value: "4", critical: true },
        ...specifications.slice(0, 4).map((specification, index) => ({
          ref: `spec.${index}`,
          label: specification.name,
          value: specification.value,
          critical: true,
        })),
      ],
    });
    expect(snapshot?.facts).toHaveLength(8);
    expect(snapshot).not.toHaveProperty("description");
    expect(snapshot).not.toHaveProperty("source_payload");
    expect(snapshot).not.toHaveProperty("breadcrumbs");
    expect(snapshot).not.toHaveProperty("normalizedAttributes");
  });

  it.each([null, 0])("returns no snapshot when price is %s", async (currentPrice) => {
    const contentContextRow: Database["public"]["Views"]["product_content_context"]["Row"] = {
      active_promotions: null,
      brand: "ASUS",
      collected_at: "2026-08-31T00:00:00Z",
      compare_at_price: null,
      completeness_score: 1,
      current_price: currentPrice,
      in_stock: true,
      is_data_stale: false,
      name: "Laptop ASUS",
      normalized_attributes: null,
      organization_id: "org-1",
      primary_image_url: null,
      product_id: "prod-1",
      product_type: "laptop",
      quality: "usable",
      sku: "LAP-01",
      specifications: [],
      stock_quantity: 4,
    };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: contentContextRow, error: null }),
    };
    const client = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>;
    const repository = new CatalogRepository({ client });

    await expect(
      repository.getProductSnapshot({ organizationId: "org-1" }, "prod-1")
    ).resolves.toBeNull();
  });

  it.each<[string, Partial<Database["public"]["Views"]["product_content_context"]["Row"]>]>([
    ["a not-usable quality", { quality: "partial" }],
    ["an out-of-stock row", { in_stock: false }],
    ["a non-laptop product type", { product_type: "gpu" }],
  ])("returns no snapshot for %s in the same organization", async (_case, overrides) => {
    const contentContextRow: Database["public"]["Views"]["product_content_context"]["Row"] = {
      active_promotions: null,
      brand: "ASUS",
      collected_at: "2026-08-31T00:00:00Z",
      compare_at_price: null,
      completeness_score: 1,
      current_price: 30_000_000,
      in_stock: true,
      is_data_stale: false,
      name: "Laptop ASUS",
      normalized_attributes: null,
      organization_id: "org-1",
      primary_image_url: null,
      product_id: "prod-1",
      product_type: "laptop",
      quality: "usable",
      sku: "LAP-01",
      specifications: [],
      stock_quantity: 4,
      ...overrides,
    };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: contentContextRow, error: null }),
    };
    const client = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>;
    const repository = new CatalogRepository({ client });

    await expect(
      repository.getProductSnapshot({ organizationId: "org-1" }, "prod-1")
    ).resolves.toBeNull();
    expect(query.eq).toHaveBeenCalledWith("product_type", "laptop");
    expect(query.eq).toHaveBeenCalledWith("quality", "usable");
    expect(query.eq).toHaveBeenCalledWith("in_stock", true);
  });

  it("throws a safe repository error when the snapshot query fails", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "sensitive database detail" },
      }),
    };
    const client = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>;
    const repository = new CatalogRepository({ client });

    const snapshot = repository.getProductSnapshot(
      { organizationId: "org-1" },
      "prod-1"
    );

    await expect(snapshot).rejects.toThrow("Failed to get product snapshot");
    await expect(snapshot).rejects.not.toThrow("sensitive database detail");
  });

  it("clamps studio product pages to the supported range", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
    };
    const client = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>;
    const repository = new CatalogRepository({ client });

    const result = await repository.listStudioProducts(
      { organizationId: "org-1" },
      { page: 101, pageSize: 18 }
    );

    expect(query.range).toHaveBeenCalledWith(1782, 1799);
    expect(result.page).toBe(100);
  });

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

  it("cannot inject a second PostgREST filter through the search term", async () => {
    const or = vi.fn().mockReturnThis();
    const mockQueryBuilder: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or,
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
    };
    const mockClient = {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
    } as unknown as SupabaseClient<Database>;
    const repo = new CatalogRepository({ client: mockClient });

    await repo.listProducts({
      search: "x,organization_id.neq.00000000-0000-0000-0000-000000000000),(price_vnd.gt.0",
    });

    expect(or).toHaveBeenCalledTimes(1);
    const filter = or.mock.calls[0][0] as string;
    // No parens/backslash survive, and there is exactly one comma — the single
    // separator between the intended name and sku clauses.
    expect(filter).not.toMatch(/[()\\]/);
    const clauses = filter.split(",");
    expect(clauses).toHaveLength(2);
    expect(clauses[0].startsWith("name.ilike.%")).toBe(true);
    expect(clauses[1].startsWith("sku.ilike.%")).toBe(true);
  });

  it("skips the search filter when the term is only PostgREST metacharacters", async () => {
    const or = vi.fn().mockReturnThis();
    const mockQueryBuilder: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or,
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
    };
    const mockClient = {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
    } as unknown as SupabaseClient<Database>;
    const repo = new CatalogRepository({ client: mockClient });

    await repo.listProducts({ search: ' ,()%*" ' });

    expect(or).not.toHaveBeenCalled();
  });

  it("strips a double quote from an inch-spec term so PostgREST does not 400", async () => {
    const or = vi.fn().mockReturnThis();
    const mockQueryBuilder: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or,
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
    };
    const mockClient = {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
    } as unknown as SupabaseClient<Database>;
    const repo = new CatalogRepository({ client: mockClient });

    await repo.listProducts({ search: 'Zephyrus 14"' });

    expect(or).toHaveBeenCalledWith(
      "name.ilike.%Zephyrus 14%,sku.ilike.%Zephyrus 14%",
    );
    expect((or.mock.calls[0][0] as string)).not.toContain('"');
  });

  it("keeps a plain search term as a case-insensitive name/sku contains match", async () => {
    const or = vi.fn().mockReturnThis();
    const mockQueryBuilder: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or,
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
    };
    const mockClient = {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
    } as unknown as SupabaseClient<Database>;
    const repo = new CatalogRepository({ client: mockClient });

    await repo.listProducts({ search: "  Zephyrus G14  " });

    expect(or).toHaveBeenCalledWith(
      "name.ilike.%Zephyrus G14%,sku.ilike.%Zephyrus G14%",
    );
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
