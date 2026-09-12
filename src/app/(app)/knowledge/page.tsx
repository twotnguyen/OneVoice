// SPDX-License-Identifier: Apache-2.0
import { requirePagePermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { KnowledgeRepository } from "@/lib/knowledge/repository";
import { knowledgeQuerySchema } from "@/lib/knowledge/management";
import { KnowledgeManager } from "./knowledge-manager";
export const dynamic = "force-dynamic";
export default async function KnowledgePage() {
  const actor = await requirePagePermission("manage_policies", "/knowledge");
  const initial = await new KnowledgeRepository(createSupabaseDataClient()).list(actor.organizationId, knowledgeQuerySchema.parse({}));
  return <KnowledgeManager initial={initial} />;
}
