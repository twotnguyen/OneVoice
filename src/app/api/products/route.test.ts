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

  it("rejects pagination outside the public bounds", async () => {
    const route = createProductsRoute({
      scope,
      catalog: { async listStudioProducts() { throw new Error("must not run"); } },
    });

    const response = await route.GET(new Request("http://localhost/api/products?page=0&pageSize=101"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_REQUEST" } });
  });
});
