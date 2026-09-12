// SPDX-License-Identifier: Apache-2.0
import { requirePagePermission } from "@/lib/auth/guards";
import { CatalogManagementRepository } from "@/lib/catalog/management-repository";
import { managementListSchema } from "@/lib/catalog/management";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { ProductsManager } from "./products-manager";
export const dynamic = "force-dynamic";
export default async function ProductsPage() {
  const actor = await requirePagePermission("manage_catalog", "/products");
  const initial = await new CatalogManagementRepository(createSupabaseDataClient()).list(actor.organizationId, managementListSchema.parse({}));
  return <ProductsManager initial={initial} />;
}
