// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { managementCommandSchema, managementListSchema } from "./management";
const id = "c0000000-0000-4000-8000-000000000001";
const document = { name: "Bàn phím", sku: null, brand: null, productType: "keyboard", descriptionText: null, priceVnd: 150000, stockQuantity: null, inStock: true, active: true, specifications: [], images: [{ id, url: "https://example.invalid/broken.jpg", altText: null }], variants: [] };
const command = { requestId: id, productId: id, expectedVersion: 0, document };
describe("catalog management validation", () => {
  it("preserves unknown physical stock and accepts an unfetched external image link", () => {
    const parsed = managementCommandSchema.parse(command);
    expect(parsed.document.stockQuantity).toBeNull();
    expect(parsed.document.inStock).toBe(true);
    expect(parsed.document.images[0].url).toBe("https://example.invalid/broken.jpg");
  });
  it("zero physical quantity overrides a stale availability checkbox", () => {
    const parsed = managementCommandSchema.parse({ ...command, document: { ...document, stockQuantity: 0, variants: [{ id, name: null, sku: null, priceVnd: null, stockQuantity: 0, inStock: true, active: true, imageUrl: null }] } });
    expect(parsed.document.inStock).toBe(false);
    expect(parsed.document.variants[0].inStock).toBe(false);
  });
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1000"])("rejects invalid VND price %s", (priceVnd) => {
    expect(managementCommandSchema.safeParse({ ...command, document: { ...document, priceVnd } }).success).toBe(false);
  });
  it.each([-1, 0.1, 2147483648, "3"])("rejects invalid physical quantity %s", (stockQuantity) => {
    expect(managementCommandSchema.safeParse({ ...command, document: { ...document, stockQuantity } }).success).toBe(false);
  });
  it.each(["http://example.invalid/a", "https://user:pass@example.invalid/a", "javascript:alert(1)", "file:///a"])("rejects unsafe image URL %s", (url) => {
    expect(managementCommandSchema.safeParse({ ...command, document: { ...document, images: [{ id, url, altText: null }] } }).success).toBe(false);
  });
  it("rejects source/actor injection, duplicate IDs and stale-invalid versions", () => {
    expect(managementCommandSchema.safeParse({ ...command, actorId: id }).success).toBe(false);
    expect(managementCommandSchema.safeParse({ ...command, expectedVersion: -1 }).success).toBe(false);
    expect(managementCommandSchema.safeParse({ ...command, document: { ...document, sourceName: "GearVN" } }).success).toBe(false);
    expect(managementCommandSchema.safeParse({ ...command, document: { ...document, images: [document.images[0], document.images[0]] } }).success).toBe(false);
  });
  it("rejects active variant totals exceeding the physical quantity storage limit", () => {
    const variant = { id, name: null, sku: null, priceVnd: null, stockQuantity: 2147483647, inStock: true, active: true, imageUrl: null };
    expect(managementCommandSchema.safeParse({ ...command, document: { ...document, variants: [variant, { ...variant, id: "c0000000-0000-4000-8000-000000000002", stockQuantity: 1 }] } }).success).toBe(false);
  });
  it("supports all product groups with bounded database paging", () => {
    expect(managementListSchema.parse({})).toEqual({ page: 1, pageSize: 20, search: "", active: "all" });
    expect(managementListSchema.parse({ productType: "mouse", page: "2" }).productType).toBe("mouse");
    expect(managementListSchema.safeParse({ pageSize: 1000 }).success).toBe(false);
  });
});
