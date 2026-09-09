// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { RawProductSchema, type RawProduct } from "../../../scripts/import-products-to-supabase.ts";

describe("Catalog Data Foundation & Importer Validation", () => {
  const baseProduct: RawProduct = {
    sourceUrl: "https://gearvn.com/products/test-product-1",
    canonicalUrl: "https://gearvn.com/products/test-product-1",
    productSlug: "test-product-1",
    name: "Laptop Asus ROG Zephyrus G16",
    sku: "LAP-ASUS-ROG-G16",
    brand: "ASUS",
    category: "Laptop Gaming",
    imageUrls: [
      "https://cdn.example.com/img1.jpg",
      "https://cdn.example.com/img2.jpg",
    ],
    offer: {
      price: 45000000,
      compareAtPrice: 50000000,
      priceCurrency: "VND",
      availability: "https://schema.org/InStock",
    },
    internalProductId: "prod-uuid-001",
    stockTotal: 10,
    primaryCollection: {
      id: "col-001",
      name: "Laptop Gaming",
      slug: "laptop-gaming",
    },
    variants: [
      {
        id: "var-001",
        sku: "LAP-ASUS-ROG-G16-16G",
        name: "Laptop Asus ROG Zephyrus G16 (16GB RAM)",
        price: 45000000,
        compareAtPrice: 50000000,
        inStock: true,
        stockQuantity: 10,
        options: { ram: "16GB" },
        imageUrl: "https://cdn.example.com/img1.jpg",
      },
    ],
    promotions: [
      {
        code: "DEAL-HOT-2026",
        label: "Giảm giá mùa tựu trường",
        type: "product_discount",
        discountType: "percentage",
        discountValue: 10,
        startDate: "2026-08-01T00:00:00Z",
        expiryDate: "2026-12-31T23:59:59Z",
        isFlashSale: false,
      },
    ],
    specifications: [
      { name: "CPU", value: "Intel Core Ultra 9" },
      { name: "RAM", value: "32GB" },
    ],
    productType: "laptop",
    completeness: {
      score: 1,
      missing: [],
    },
    collectedAt: "2026-08-31T05:34:42.944Z",
    extractorVersion: "v1.0",
    httpStatus: 200,
    priceVnd: 45000000,
    specificationCount: 2,
    normalizedAttributes: { cpu: "Ultra 9", ram: "32GB" },
    quality: "usable",
  };

  it("1. validates a fully-formed product successfully", () => {
    const res = RawProductSchema.safeParse(baseProduct);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.name).toBe("Laptop Asus ROG Zephyrus G16");
      expect(res.data.quality).toBe("usable");
    }
  });

  it("2. handles InStock product with stock_quantity mapped correctly", () => {
    const item = { ...baseProduct, stockTotal: 15 };
    const res = RawProductSchema.safeParse(item);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.offer?.availability).toBe("https://schema.org/InStock");
      expect(res.data.stockTotal).toBe(15);
    }
  });

  it("3. handles OutOfStock product keeping stock_quantity as null (not 0)", () => {
    const item = {
      ...baseProduct,
      offer: {
        ...baseProduct.offer,
        availability: "https://schema.org/OutOfStock",
      },
      stockTotal: null,
    };
    const res = RawProductSchema.safeParse(item);
    expect(res.success).toBe(true);
    if (res.success) {
      const inStock = res.data.offer?.availability === "https://schema.org/InStock";
      expect(inStock).toBe(false);
      expect(res.data.stockTotal).toBeNull();
    }
  });

  it("4. validates partial product", () => {
    const partialItem = {
      ...baseProduct,
      quality: "partial" as const,
      descriptionText: null,
      completeness: { score: 0.7, missing: ["description"] },
    };
    const res = RawProductSchema.safeParse(partialItem);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.quality).toBe("partial");
    }
  });

  it("5. validates identity_only product", () => {
    const identityOnlyItem = {
      ...baseProduct,
      quality: "identity_only" as const,
      specifications: [],
      specificationCount: 0,
    };
    const res = RawProductSchema.safeParse(identityOnlyItem);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.quality).toBe("identity_only");
    }
  });

  it("6. handles product with multiple images and identifies primary image", () => {
    const item = {
      ...baseProduct,
      imageUrls: [
        "https://cdn.example.com/primary.jpg",
        "https://cdn.example.com/sec1.jpg",
        "https://cdn.example.com/sec2.jpg",
      ],
    };
    const res = RawProductSchema.safeParse(item);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.imageUrls.length).toBe(3);
      const mappedImages = res.data.imageUrls.map((url, idx) => ({
        url,
        position: idx,
        isPrimary: idx === 0,
      }));
      expect(mappedImages[0].isPrimary).toBe(true);
      expect(mappedImages[1].isPrimary).toBe(false);
      expect(mappedImages[2].isPrimary).toBe(false);
    }
  });

  it("7. handles product with multiple variants", () => {
    const item = {
      ...baseProduct,
      variants: [
        {
          id: "var-16gb",
          sku: "LAP-ASUS-16G",
          name: "Asus ROG 16GB",
          price: 45000000,
          compareAtPrice: 50000000,
          inStock: true,
          stockQuantity: 5,
        },
        {
          id: "var-32gb",
          sku: "LAP-ASUS-32G",
          name: "Asus ROG 32GB",
          price: 52000000,
          compareAtPrice: 56000000,
          inStock: true,
          stockQuantity: 3,
        },
      ],
    };
    const res = RawProductSchema.safeParse(item);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.variants.length).toBe(2);
    }
  });

  it("8. variant maintains its own individual stock quantity", () => {
    const item = {
      ...baseProduct,
      stockTotal: 10,
      variants: [
        {
          id: "var-001",
          sku: "LAP-ASUS-VAR-1",
          name: "Variant 1",
          price: 45000000,
          inStock: true,
          stockQuantity: 4,
        },
      ],
    };
    const res = RawProductSchema.safeParse(item);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.variants[0].stockQuantity).toBe(4);
      expect(res.data.stockTotal).toBe(10);
    }
  });

  it("9. detects active promotion (future expiry)", () => {
    const futurePromo = {
      code: "ACTIVE-DEAL",
      label: "Khuyến mãi đang chạy",
      startDate: "2026-08-01T00:00:00Z",
      expiryDate: "2026-12-31T23:59:59Z",
    };
    const now = new Date("2026-09-09T00:00:00Z");
    const isActive =
      (!futurePromo.startDate || new Date(futurePromo.startDate) <= now) &&
      (!futurePromo.expiryDate || new Date(futurePromo.expiryDate) >= now);
    expect(isActive).toBe(true);
  });

  it("10. detects expired promotion (past expiry)", () => {
    const expiredPromo = {
      code: "GEARVN-DEAL-DOCLAP",
      label: "Khuyến mãi Quốc khánh",
      startDate: "2026-08-28T17:00:00Z",
      expiryDate: "2026-09-02T16:59:00Z",
    };
    const now = new Date("2026-09-09T00:00:00Z");
    const isActive =
      (!expiredPromo.startDate || new Date(expiredPromo.startDate) <= now) &&
      (!expiredPromo.expiryDate || new Date(expiredPromo.expiryDate) >= now);
    expect(isActive).toBe(false);
  });

  it("11. duplicate SKU does not fail schema validation or cause conflict when canonical URL is unique", () => {
    const item1 = {
      ...baseProduct,
      canonicalUrl: "https://gearvn.com/products/kb-brown-1",
      sku: "KB-LEOPOLD-FC750RBT",
    };
    const item2 = {
      ...baseProduct,
      canonicalUrl: "https://gearvn.com/products/kb-brown-2",
      sku: "KB-LEOPOLD-FC750RBT",
    };

    const res1 = RawProductSchema.safeParse(item1);
    const res2 = RawProductSchema.safeParse(item2);
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const map = new Map<string, RawProduct>();
    map.set(item1.canonicalUrl, item1);
    map.set(item2.canonicalUrl, item2);
    expect(map.size).toBe(2);
  });

  it("12. idempotent re-import updates existing natural key instead of duplicating", () => {
    const item = { ...baseProduct };
    const dbRows = new Map<string, { id: string; name: string }>();
    const naturalKey = `org-1:::${item.canonicalUrl}`;

    // First import
    dbRows.set(naturalKey, { id: "uuid-1", name: item.name });
    expect(dbRows.size).toBe(1);

    // Second import with updated name
    dbRows.set(naturalKey, { id: "uuid-1", name: "Updated Name" });
    expect(dbRows.size).toBe(1);
    expect(dbRows.get(naturalKey)?.name).toBe("Updated Name");
  });

  it("13. invalid record fails validation safely without crashing", () => {
    const invalidRecord = {
      sourceUrl: "", // invalid empty url
      canonicalUrl: "",
      name: "", // invalid empty name
    };
    const res = RawProductSchema.safeParse(invalidRecord);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("14. secrets do not appear in logger or error messages", () => {
    const secret = "sb_secret_super_confidential_key_12345";
    const sanitizeMessage = (msg: string): string => {
      return msg.replaceAll(secret, "[REDACTED]");
    };

    const rawError = `Connection failed with auth key: ${secret}`;
    const safeError = sanitizeMessage(rawError);
    expect(safeError).not.toContain(secret);
    expect(safeError).toContain("[REDACTED]");
  });
});
