import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect,it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { collectTrends } from "./ingest";
import { createTrendRepository } from "./repository";

it.skipIf(process.env.ONEVOICE_LOCAL_TRENDS_PROOF!=="1")("persists real permitted public metadata to local DB atomically under concurrent receipt retries",async()=>{
 const status=JSON.parse(execSync("pnpm exec supabase status --output json",{encoding:"utf8",stdio:["ignore","pipe","pipe"]}));
 const url=new URL(status.API_URL);if(url.protocol!=="http:" || !["127.0.0.1","localhost"].includes(url.hostname))throw Error("local_only");
 const client=createClient<Database>(url.href,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const id=randomUUID();const suffix=id.replaceAll("-","");const org="a0000000-0000-0000-0000-000000000001";
 const batch=await collectTrends([{key:`social_${suffix}`,kind:"mastodon_tags",url:"https://mastodon.social/",ttlSeconds:86400},{key:`news_${suffix}`,kind:"rss_news",url:"https://www.nasa.gov/news-release/feed/",ttlSeconds:86400}]);
 expect(batch.sources.every(s=>s.status==="success")).toBe(true);
 expect(batch.sources.every(s=>s.observations.length>0)).toBe(true);
 const repository=createTrendRepository(client);
 try{
  const results=await Promise.all([repository.save(org,id,batch),repository.save(org,id,batch)]);expect(results).toEqual([id,id]);
  const rows=await client.from("trend_ingestion_runs").select("id,snapshot").eq("id",id);expect(rows.error).toBeNull();expect(rows.data).toHaveLength(1);
  const evidence=await client.from("trend_observations").select("id,evidence").in("source_key",batch.sources.map(s=>s.key));expect(evidence.error).toBeNull();expect(evidence.data).toHaveLength(batch.sources.reduce((n,s)=>n+s.observations.length,0));
  const other=await client.from("trend_ingestion_runs").select("id").eq("id",id).eq("organization_id",randomUUID());expect(other.data).toEqual([]);
 }finally{
  // Fixed local container; generated UUID contains only validated UUID characters.
  execFileSync("docker",["exec","supabase_db_onevoice","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-c",`begin; delete from public.trend_ingestion_runs where id='${id}'; delete from public.trend_observations where source_key in ('social_${suffix}','news_${suffix}'); commit;`],{stdio:"pipe"});
 }
},30000);
