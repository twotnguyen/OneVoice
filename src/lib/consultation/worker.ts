import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database,Json} from "@/lib/supabase/database.types";
import type {AiProvider} from "@/lib/ai/provider";
import {postgresUuid,type BusinessJob} from "@/lib/jobs/types";
import {createBusinessJobQueue} from "@/lib/jobs/supabase";
import {createEvidenceLookup} from "./evidence";
import {abortable,consult,type ConsultationContext,type Outcome} from "./planner";
const claimSchema=z.object({job:z.object({id:postgresUuid,organization_id:postgresUuid,entity_id:postgresUuid,kind:z.literal("inbound_event"),lease_owner:postgresUuid,lease_token:postgresUuid}),conversationId:postgresUuid,revision:z.number().int().nonnegative(),organizationId:postgresUuid,text:z.string().max(4000),history:z.array(z.object({text:z.string().max(600),decision:z.unknown().optional()})).max(8),introduce:z.boolean()});
export type ConsultationClaim=z.infer<typeof claimSchema>;
export function createConsultationStore(client:SupabaseClient<Database>,organizationId:string){
 postgresUuid.parse(organizationId);
 const contexts=new Map<string,ConsultationClaim>();const base=createBusinessJobQueue((name,args)=>client.rpc(name,args as never));
 return {
  queue:{...base,async claim(owner:string){const result=await client.rpc("claim_consultation_job",{p_owner:postgresUuid.parse(owner),p_organization_id:organizationId}).abortSignal(AbortSignal.timeout(8000));if(result.error)throw Error("consultation_store_failed");if(result.data===null)return null;const claim=claimSchema.parse(result.data);if(claim.organizationId!==organizationId||claim.job.organization_id!==organizationId)throw Error("consultation_scope_mismatch");contexts.clear();contexts.set(claim.job.id,claim);return claim.job;},async finish(job:BusinessJob,error?:"handler_failed"|"shutdown"|"unsupported_kind"){contexts.delete(job.id);return error?base.finish(job,error):true;}},
  context(job:BusinessJob):ConsultationContext{const claim=contexts.get(job.id);if(!claim)throw Error("consultation_context_missing");return claim;},
  async finish(job:BusinessJob,outcome:Outcome,signal:AbortSignal){signal.throwIfAborted();const result=await client.rpc("finish_consultation",{p_job_id:job.id,p_owner:job.lease_owner,p_token:job.lease_token,p_outcome:outcome as unknown as Json}).abortSignal(AbortSignal.any([signal,AbortSignal.timeout(8000)]));if(result.error||result.data!==true)throw Error("consultation_finish_rejected");},
 };
}
export function createConsultationHandler(store:{context:(job:BusinessJob)=>ConsultationContext;finish:(job:BusinessJob,outcome:Outcome,signal:AbortSignal)=>Promise<void>},ports:Parameters<typeof consult>[1]){
 return async(job:BusinessJob,parent:AbortSignal)=>{
  const signal=AbortSignal.any([parent,AbortSignal.timeout(40000)]);
  const outcome=await consult(store.context(job),ports,signal);signal.throwIfAborted();
  await abortable(store.finish(job,outcome,signal),signal);
 };
}
export function consultationPorts(client:SupabaseClient<Database>,ai:AiProvider){return {ai,lookup:createEvidenceLookup(client).lookup};}
