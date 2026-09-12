// SPDX-License-Identifier: Apache-2.0
import { requirePagePermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createWarrantyRepository } from "@/lib/warranty/repository";
import { WarrantyManager } from "./warranty-manager";
export const dynamic = "force-dynamic";
export default async function WarrantyPage() {
 const actor = await requirePagePermission("update_warranty", "/warranty");
 const initial = await createWarrantyRepository(createSupabaseDataClient(), actor).list({ page: 1, search: "" });
 return <WarrantyManager initial={initial} />;
}
