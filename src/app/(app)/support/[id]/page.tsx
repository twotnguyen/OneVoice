// SPDX-License-Identifier: Apache-2.0
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createSupportReader } from "@/lib/conversations/support/read";
import { postgresUuid } from "@/lib/jobs/types";
import { SupportConversation } from "../support-conversation";
export const dynamic="force-dynamic";
export default async function ConversationPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const actor=await requirePagePermission("read_operations",`/support/${id}`);
 if(!postgresUuid.safeParse(id).success)notFound();
 const detail=await createSupportReader(createSupabaseDataClient()).detail(actor.organizationId,id,actor.role==="manager");
 if(!detail)notFound();
 return <SupportConversation initial={detail} viewer={{id:actor.userId,role:actor.role}}/>;
}
