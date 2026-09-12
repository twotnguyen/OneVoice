import type { SupabaseClient } from "@supabase/supabase-js";
import { postgresUuid } from "@/lib/jobs/types";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { TrendBatch } from "./ingest";

/** OV029 must freeze runId + full evidence/metrics/TTL in its own decision transaction.
 * These are topic candidates, never catalog facts or trusted model instructions.
 * Latest run defines configured sources: removed/failed sources do not carry forward.
 */
export function eligibleEvidence(batch:TrendBatch,now=new Date()){
 return batch.sources.flatMap(source=>source.status!=="success" || Date.parse(batch.observedAt)+source.ttlSeconds*1000<=now.getTime()?[]:source.observations.filter(item=>item.sourceTimestamp!==null && item.timestampKind!=="unknown" && Date.parse(item.expiresAt)>now.getTime()).map(item=>({sourceKey:source.key,sourceKind:source.kind,sourceUrl:source.url,observedAt:batch.observedAt,ttlSeconds:source.ttlSeconds,...item})));
}
async function bounded<T>(work:PromiseLike<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([Promise.resolve(work),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("trend_storage_unavailable")),6000);})]);}
 finally{if(timer)clearTimeout(timer);}
}
export function createTrendRepository(client:SupabaseClient<Database>){
 return {
  async save(organizationId:string,runId:string,batch:TrendBatch):Promise<string>{
   postgresUuid.parse(organizationId);postgresUuid.parse(runId);
   const serialized=JSON.stringify(batch);
   // PostgreSQL JSONB adds whitespace after structural separators; overcounting
   // those inside text is deliberately conservative and prevents permanent RPC retry.
   if(Buffer.byteLength(serialized)+(serialized.match(/[:,]/g)?.length??0)>524288)throw Error("trend_batch_too_large");
   try{
    const result=await bounded(client.rpc("record_trend_ingestion",{p_organization_id:organizationId,p_run_id:runId,p_batch:batch as unknown as Json}));
    if(result.error || !result.data)throw Error();return result.data;
   }catch{throw Error("trend_storage_unavailable");}
  },
  async latest(organizationId:string):Promise<{runId:string;batch:TrendBatch}|null>{
   postgresUuid.parse(organizationId);
   try{
    const result=await bounded(client.from("trend_ingestion_runs").select("id,snapshot").eq("organization_id",organizationId).order("observed_at",{ascending:false}).order("id",{ascending:false}).limit(1).maybeSingle());
    if(result.error)throw Error();return result.data?{runId:result.data.id,batch:result.data.snapshot as unknown as TrendBatch}:null;
   }catch{throw Error("trend_storage_unavailable");}
  },
 };
}
