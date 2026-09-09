// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import type { OrganizationScope, StudioProduct } from "@/lib/catalog/types";

type Dependencies = Readonly<{
  scope: OrganizationScope;
  catalog: {
    listStudioProducts(scope: OrganizationScope, pagination: { page: number; pageSize: number }): Promise<Readonly<{
      items: readonly StudioProduct[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>>;
  };
}>;

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(18),
});

export function createProductsRoute(dependencies: Dependencies) {
  return {
    async GET(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const parsed = paginationSchema.safeParse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
      });
      if (!parsed.success) {
        return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
      }
      try {
        return Response.json(await dependencies.catalog.listStudioProducts(
          dependencies.scope,
          parsed.data,
        ));
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
