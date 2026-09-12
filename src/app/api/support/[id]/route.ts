// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";
import { withApiPermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createSupportReader } from "@/lib/conversations/support/read";
import { createSupabaseConversationRepository } from "@/lib/conversations/supabase";
import { postgresUuid } from "@/lib/jobs/types";
const command=z.object({operation:z.enum(["claim","complete","reassign"]),expectedRevision:z.number().int().nonnegative(),requestId:postgresUuid,assigneeId:postgresUuid.optional()}).strict().refine(input=>input.operation==="reassign"?!!input.assigneeId:input.assigneeId===undefined);
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {
 return withApiPermission(request,"read_operations",async actor=>{
  try {
   const {id}=await context.params; postgresUuid.parse(id);
   const query=z.object({cursor:z.string().max(300).optional()}).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
   const detail=await createSupportReader(createSupabaseDataClient()).detail(actor.organizationId,id,actor.role==="manager",query.cursor);
   return detail?Response.json({detail,viewer:{id:actor.userId,role:actor.role}}):Response.json({error:"NOT_FOUND"},{status:404});
  } catch(error) { if(error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({error:"INVALID_QUERY"},{status:400}); throw error; }
 });
}
async function body(request:Request) {
 if(request.headers.get("content-type")?.split(";")[0]!=="application/json") throw Error("INVALID_INPUT");
 const reader=request.body?.getReader(); if(!reader) throw Error("INVALID_INPUT");
 let timer:ReturnType<typeof setTimeout>|undefined;
 try { return await Promise.race([(async()=>{const chunks:Uint8Array[]=[];let size=0;while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>4096)throw Error("INVALID_INPUT");chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("INVALID_INPUT")),4000);})]); }
 finally {if(timer)clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
export async function POST(request:Request,context:Context) {
 return withApiPermission(request,"claim_handoff",async actor=>{
  let input:z.infer<typeof command>;let id:string;
  try {id=postgresUuid.parse((await context.params).id);input=command.parse(await body(request));}catch{return Response.json({error:"INVALID_INPUT"},{status:400});}
  if(input.operation==="reassign"&&actor.role!=="manager")return Response.json({error:"FORBIDDEN"},{status:403});
  const client=createSupabaseDataClient();
  try {
   if(input.operation==="reassign"){
    const {data,error}=await client.rpc("reassign_conversation_handoff",{p_organization_id:actor.organizationId,p_actor_id:actor.userId,p_conversation_id:id,p_expected_revision:input.expectedRevision,p_assignee_id:input.assigneeId!,p_request_id:input.requestId}).abortSignal(AbortSignal.timeout(10000));
    if(error)throw Error(error.code==="42501"?"CONVERSATION_FORBIDDEN":error.code==="40001"||error.code==="23505"?"CONVERSATION_CONFLICT":error.code==="22023"?"CONVERSATION_INVALID_INPUT":"CONVERSATION_UNAVAILABLE");
    return Response.json(data);
   }
   return Response.json(await createSupabaseConversationRepository(client).transition(actor.organizationId,actor.userId,{conversationId:id,expectedRevision:input.expectedRevision,operation:input.operation,requestId:input.requestId},AbortSignal.timeout(10000)));
  }catch(error){const code=error instanceof Error?error.message:"";if(code==="CONVERSATION_FORBIDDEN")return Response.json({error:"FORBIDDEN"},{status:403});if(code==="CONVERSATION_CONFLICT")return Response.json({error:"VERSION_CONFLICT"},{status:409});if(code==="CONVERSATION_INVALID_INPUT")return Response.json({error:"INVALID_TRANSITION"},{status:400});throw error;}
 },{mutation:true});
}
