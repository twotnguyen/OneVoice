// SPDX-License-Identifier: Apache-2.0

import { readServerEnv } from "@/lib/env/server";
import { requirePagePermission, requireActionPermission } from "@/lib/auth/guards";
import { CatalogRepository } from "@/lib/catalog/repository";
import type { ProductDetail, StudioProduct } from "@/lib/catalog/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { CatalogClient } from "./catalog-client";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  await requirePagePermission("read_catalog", "/catalog");
  const { runtime } = readServerEnv();
  const repository = new CatalogRepository({
    client: createSupabaseServerClient(),
  });

  let initialProducts: readonly StudioProduct[] = [];
  let initialTotal = 0;
  let initialTotalPages = 1;

  try {
    const result = await repository.listStudioProducts(
      { organizationId: runtime.organizationId },
      { page: 1, pageSize: 24 },
      "all"
    );
    initialProducts = result.items;
    initialTotal = result.total;
    initialTotalPages = result.totalPages;
  } catch (error) {
    console.error("Failed to load initial studio products:", error);
  }

  async function fetchProductDetailAction(id: string): Promise<ProductDetail | null> {
    "use server";
    await requireActionPermission("read_catalog");
    const { runtime: currentRuntime } = readServerEnv();
    const repo = new CatalogRepository({ client: createSupabaseServerClient() });
    return repo.getProductDetail({ organizationId: currentRuntime.organizationId }, id);
  }

  async function fetchProductsAction(options: {
    page: number;
    pageSize?: number;
    category?: string;
    brand?: string | null;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    inStockOnly?: boolean;
  }) {
    "use server";
    await requireActionPermission("read_catalog");
    const { runtime: currentRuntime } = readServerEnv();
    const repo = new CatalogRepository({ client: createSupabaseServerClient() });
    const productType = !options.category || options.category === "all" ? "all" : options.category;

    return repo.listStudioProducts(
      { organizationId: currentRuntime.organizationId },
      { page: options.page, pageSize: options.pageSize ?? 24 },
      productType,
      {
        brand: options.brand ?? undefined,
        search: options.search ? options.search.trim() : undefined,
        minPrice: options.minPrice,
        maxPrice: options.maxPrice,
        inStockOnly: options.inStockOnly,
      }
    );
  }

  return (
    <CatalogClient
      initialProducts={initialProducts}
      initialTotal={initialTotal}
      initialTotalPages={initialTotalPages}
      onFetchProductDetail={fetchProductDetailAction}
      onFetchProducts={fetchProductsAction}
    />
  );
}
