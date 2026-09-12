// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { withApiPermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createSupportReader, supportQuery } from "@/lib/conversations/support/read";
export async function GET(request: Request) {
 return withApiPermission(request,"read_operations",async actor=>{
  try { const query=supportQuery.parse(Object.fromEntries(new URL(request.url).searchParams)); return Response.json(await createSupportReader(createSupabaseDataClient()).queue(actor.organizationId,query)); }
  catch(error) { if(error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({error:"INVALID_QUERY"},{status:400}); throw error; }
 });
}
