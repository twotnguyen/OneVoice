import { expect, it } from "vitest";
import { mapProductFacts } from "./snapshot";
it("maps the operational variant bucket and preserves version, null stock and price", () => {
 const result = mapProductFacts({ id: "product", organization_id: "org", version: 4, name: "Item", product_type: null, disabled_at: null, price_vnd: 100, stock_quantity: 99, in_stock: true, product_variants: [{ id: "variant", name: "Choice", disabled_at: null, price_vnd: null, stock_quantity: null, in_stock: null }] });
 expect(result.version).toBe(4); expect(result.variants[0]).toMatchObject({ priceVnd: null, stockQuantity: null, active: true });
 expect(result.stockQuantity).toBe(99);
});
it("maps identical variant sets identically regardless of embedded database row order", () => {
 const row = { id: "product", organization_id: "org", version: 4, name: "Item", product_type: null, disabled_at: null, price_vnd: 100, stock_quantity: 99, in_stock: true, product_variants: [{ id: "b", name: "B", disabled_at: null, price_vnd: 100, stock_quantity: 1, in_stock: true }, { id: "a", name: "A", disabled_at: null, price_vnd: 100, stock_quantity: 1, in_stock: true }] };
 expect(mapProductFacts(row)).toEqual(mapProductFacts({ ...row, product_variants: [...row.product_variants].reverse() }));
});
