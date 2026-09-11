// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import type { OrganizationScope, StudioProduct } from "@/lib/catalog/types";

type Dependencies = Readonly<{
  scope: OrganizationScope;
  catalog: {
    listStudioProducts(
      scope: OrganizationScope,
      pagination: { page: number; pageSize: number },
      productType?: string,
      filters?: { brand?: string; search?: string }
    ): Promise<Readonly<{
      items: readonly StudioProduct[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>>;
  };
}>;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(18),
  brand: z.string().trim().max(50).optional(),
  search: z.string().trim().max(100).optional(),
});

export function createProductsRoute(dependencies: Dependencies) {
  return {
    async GET(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const parsed = querySchema.safeParse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        brand: url.searchParams.get("brand") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
      });
      if (!parsed.success) {
        return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
      }

      const { page, pageSize, brand, search } = parsed.data;
      const filters = {
        ...(brand ? { brand } : {}),
        ...(search ? { search } : {}),
      };
      const hasFilters = Object.keys(filters).length > 0;

      try {
        const result = hasFilters
          ? await dependencies.catalog.listStudioProducts(
              dependencies.scope,
              { page, pageSize },
              "laptop",
              filters,
            )
          : await dependencies.catalog.listStudioProducts(
              dependencies.scope,
              { page, pageSize },
            );
        return Response.json(result);
      } catch {
        return Response.json({ error: { code: "CATALOG_UNAVAILABLE" } }, { status: 500 });
      }
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  const { getComposition } = await import("@/lib/render/composition-root");
  return createProductsRoute(getComposition()).GET(request);
}
