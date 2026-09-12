// SPDX-License-Identifier: Apache-2.0
import { requirePagePermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createCampaignRepository } from "@/lib/campaigns/repository";
import { CampaignManager } from "./campaign-manager";
export const dynamic = "force-dynamic";
export default async function CampaignPage() { const actor = await requirePagePermission("read_operations", "/campaigns"); const initial = await createCampaignRepository(createSupabaseDataClient(), actor).list(); return <CampaignManager initial={initial} canManage={actor.role === "manager"} />; }
