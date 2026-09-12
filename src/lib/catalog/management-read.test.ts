// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { CatalogRepository } from "./repository";
function repository(disabled: boolean) {
  const client = { from(table: string) {
    const result = { error: null, data: table === "products" ? { id: "p", organization_id: "o", disabled_at: disabled ? "2026-01-01" : null } : table === "product_variants" ? [{ id: "active", disabled_at: null }, { id: "disabled", disabled_at: "2026-01-01" }] : [] };
    const query = { select: () => query, eq: () => query, order: () => query, maybeSingle: async () => result, then: (resolve: (value: unknown) => void) => resolve(result) };
    return query;
  } } as unknown as SupabaseClient<Database>;
  return new CatalogRepository({ client });
}
it("disabled products cannot be read through the legacy detail API", async () => {
  expect(await repository(true).getProductDetail({ organizationId: "o" }, "p")).toBeNull();
});
it("disabled variants are excluded from legacy customer-facing detail", async () => {
  expect((await repository(false).getProductDetail({ organizationId: "o" }, "p"))?.variants.map((v) => v.id)).toEqual(["active"]);
});
