// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { createProductsRoute } from "./route";

const scope = { organizationId: "a0000000-0000-0000-0000-000000000001" };

describe("GET /api/products", () => {
  it("returns bounded pagination using only the server-derived organization", async () => {
    const calls: unknown[] = [];
    const route = createProductsRoute({
      scope,
      catalog: {
        async listStudioProducts(receivedScope, pagination) {
          calls.push([receivedScope, pagination]);
          return {
            items: [{
              id: "b0000000-0000-4000-8000-000000000002",
              name: "ThinkPad X1",
              sku: "X1",
              brand: "Lenovo",
              priceVnd: 42_990_000,
              currency: "VND",
              stockQuantity: 2,
              inStock: true,
              primaryImageUrl: null,
              keySpecs: [],
              collectedAt: null,
            }],
            total: 1,
            page: 2,
            pageSize: 18,
            totalPages: 1,
          };
        },
      },
    });

    const response = await route.GET(new Request(
      "http://localhost/api/products?page=2&pageSize=18&organizationId=attacker",
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1, page: 2, pageSize: 18 });
    expect(calls).toEqual([[scope, { page: 2, pageSize: 18 }]]);
  });

  it("maps a catalog failure to a safe 500 without leaking the thrown message", async () => {
    const secret = "postgres://user:pw@host";
    const route = createProductsRoute({
      scope,
      catalog: { async listStudioProducts() { throw new Error(secret); } },
    });

    const response = await route.GET(new Request("http://localhost/api/products"));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ error: { code: "CATALOG_UNAVAILABLE" } });
    expect(body).not.toContain(secret);
  });

  it("rejects pagination outside the public bounds", async () => {
    const route = createProductsRoute({
      scope,
      catalog: { async listStudioProducts() { throw new Error("must not run"); } },
    });

    const response = await route.GET(new Request("http://localhost/api/products?page=0&pageSize=101"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_REQUEST" } });
  });

  it("passes brand and search filter to catalog repository when provided", async () => {
    const calls: unknown[] = [];
    const route = createProductsRoute({
      scope,
      catalog: {
        async listStudioProducts(receivedScope, pagination, productType, filters) {
          calls.push([receivedScope, pagination, productType, filters]);
          return {
            items: [{
              id: "b0000000-0000-4000-8000-000000000003",
              name: "Acer Predator Helios",
              sku: "PH16",
              brand: "ACER",
              priceVnd: 45_000_000,
              currency: "VND",
              stockQuantity: 5,
              inStock: true,
              primaryImageUrl: null,
              keySpecs: [],
              collectedAt: null,
            }],
            total: 1,
            page: 1,
            pageSize: 18,
            totalPages: 1,
          };
        },
      },
    });

    const response = await route.GET(new Request(
      "http://localhost/api/products?page=1&pageSize=18&brand=ACER&search=helios",
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1, page: 1, pageSize: 18 });
    expect(calls).toEqual([
      [
        scope,
        { page: 1, pageSize: 18 },
        "laptop",
        { brand: "ACER", search: "helios" },
      ],
    ]);
  });

  it("sanitizes search term without error", async () => {
    const calls: unknown[] = [];
    const route = createProductsRoute({
      scope,
      catalog: {
        async listStudioProducts(receivedScope, pagination, productType, filters) {
          calls.push([receivedScope, pagination, productType, filters]);
          return {
            items: [],
            total: 0,
            page: 1,
            pageSize: 18,
            totalPages: 0,
          };
        },
      },
    });

    const response = await route.GET(new Request(
      'http://localhost/api/products?search=%20%20helios%2C%2816%29%5C%25%2A%22pro%22%20%20',
    ));

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      [
        scope,
        { page: 1, pageSize: 18 },
        "laptop",
        { search: 'helios,(16)\\%*"pro"' },
      ],
    ]);
  });

  it("passes minPrice, maxPrice, and inStockOnly filters to repository", async () => {
    const calls: unknown[] = [];
    const route = createProductsRoute({
      scope,
      catalog: {
        async listStudioProducts(receivedScope, pagination, productType, filters) {
          calls.push([receivedScope, pagination, productType, filters]);
          return {
            items: [],
            total: 0,
            page: 1,
            pageSize: 18,
            totalPages: 0,
          };
        },
      },
    });

    const response = await route.GET(new Request(
      "http://localhost/api/products?minPrice=15000000&maxPrice=30000000&inStockOnly=true",
    ));

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      [
        scope,
        { page: 1, pageSize: 18 },
        "laptop",
        { minPrice: 15_000_000, maxPrice: 30_000_000, inStockOnly: true },
      ],
    ]);
  });
});
