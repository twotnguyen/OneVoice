import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createTrendRepository } from "./repository";
import { runTrendIngestion } from "./operator";

export async function main(){
 try{
  const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"");
  if(url.username || url.password || (url.protocol!=="https:" && !(url.protocol==="http:" && ["localhost","127.0.0.1"].includes(url.hostname))) || !process.env.SUPABASE_SECRET_KEY)throw Error();
  const client=createClient<Database>(url.href,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const repository=createTrendRepository(client);
  const result=await runTrendIngestion({organizationId:process.env.ONEVOICE_ORGANIZATION_ID??"",sources:process.env.ONEVOICE_TREND_SOURCES},{save:repository.save});
  console.log(JSON.stringify(result));return result.counts.error?2:0;
 }catch{console.error("trend_ingestion_failed");return 1;}
}
