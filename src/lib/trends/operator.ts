import { randomUUID } from "node:crypto";
import { postgresUuid } from "@/lib/jobs/types";
import type { PublicTextFetcher } from "@/lib/network/public-http";
import { collectTrends,parseSources,type TrendBatch } from "./ingest";

export async function runTrendIngestion(input:{organizationId:string;sources:string|undefined},ports:{save:(organizationId:string,runId:string,batch:TrendBatch)=>Promise<string>;fetch?:PublicTextFetcher}){
 const organizationId=postgresUuid.parse(input.organizationId);const sources=parseSources(input.sources);const runId=randomUUID();
 const batch=await collectTrends(sources,{fetch:ports.fetch});
 // On uncertain storage failure retry the exact prepared batch once. This can
 // recover an already committed receipt; it never refetches into the same receipt.
 try{await ports.save(organizationId,runId,batch);}catch{await ports.save(organizationId,runId,batch);}
 return {runId,capabilities:batch.capabilities,counts:{success:batch.sources.filter(s=>s.status==="success").length,empty:batch.sources.filter(s=>s.status==="empty").length,error:batch.sources.filter(s=>s.status==="error").length}};
}
