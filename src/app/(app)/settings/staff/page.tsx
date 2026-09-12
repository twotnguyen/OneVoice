// SPDX-License-Identifier: Apache-2.0
import { requirePagePermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { StaffAdminRepository } from "@/lib/auth/staff-admin-repository";
import { StaffManager } from "./staff-manager";
export const dynamic = "force-dynamic";
export default async function StaffPage() {
 const actor = await requirePagePermission("manage_staff", "/settings/staff");
 const initial = await new StaffAdminRepository(createSupabaseDataClient(), "").list(actor.organizationId, actor.userId);
 return <StaffManager initial={initial} actorId={actor.userId} />;
}
