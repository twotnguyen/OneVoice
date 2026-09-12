import {execFileSync,execSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {it,expect} from "vitest";
import type {Database} from "@/lib/supabase/database.types";
import {createConsultationStore,createConsultationHandler,consultationPorts} from "./worker";
it.skipIf(process.env.ONEVOICE_LOCAL_CONSULTATION_PROOF!=="1")("actual local REST commits grounded candidate then atomically hands off with one acknowledgment",async()=>{
 const status=JSON.parse(execSync("pnpm exec supabase status --output json",{encoding:"utf8",stdio:["ignore","pipe","pipe"]}));const url=new URL(status.API_URL);if(url.protocol!=="http:"||!["127.0.0.1","localhost"].includes(url.hostname))throw Error("local_only");
 const client=createClient<Database>(url.href,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const org=randomUUID(),product=randomUUID(),owner=randomUUID(),page=String(Date.now());
 const sql=(s:string)=>execFileSync("docker",["exec","-i","supabase_db_onevoice","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"],{input:s,stdio:["pipe","pipe","pipe"]});
 sql(`begin;insert into public.organizations(id,name,slug) values('${org}','OV017 fake REST fixture','${org}');insert into public.products(id,organization_id,source_url,canonical_url,name,sku,price_vnd,in_stock,stock_quantity,quality,specifications) values('${product}','${org}','https://fixture.example/${product}','https://fixture.example/${product}','OV017 Laptop','EXACT-017',500,true,2,'usable','[{"name":"RAM","value":"16GB"}]');commit;`);
 const ingest=async(key:string,text:string)=>{const result=await client.rpc("ingest_facebook_events",{p_organization_id:org,p_page_id:page,p_events:[{pageId:page,providerKey:`message:${key}`,kind:"message",senderId:"201700000",recipientId:page,data:{text}}]});if(result.error)throw Error("fixture_ingress_failed");};
 try{
  await ingest(randomUUID(),"Giá máy OV017 Laptop bao nhiêu?");
  expect(await createConsultationStore(client,randomUUID()).queue.claim(owner)).toBeNull();
  const store=createConsultationStore(client,org);const job=await store.queue.claim(owner);expect(job?.organization_id).toBe(org);if(!job)throw Error();
  const replies=[{intent:"needs",query:{operation:"search_products",need:"OV017 Laptop"}},{facts:[0],closing:"none"}];
  await createConsultationHandler(store,consultationPorts(client,{generateText:async()=>({text:JSON.stringify(replies.shift()),model:"local-fake"})}))(job,new AbortController().signal);
  const receipt=await client.from("consultation_receipts").select("candidate,outcome").eq("event_id",job.entity_id).single();expect(receipt.error).toBeNull();expect(receipt.data?.candidate).toMatchObject({type:"reply",text:expect.stringContaining("500 đồng")});
  expect(await store.finish(job,{type:"reply",intent:"praise",text:"different",claims:[]},new AbortController().signal)).toBeUndefined();
  await ingest(randomUUID(),"Máy hỏng, tôi muốn gửi bảo hành");const next=await store.queue.claim(owner);if(!next)throw Error("no next job");
  await createConsultationHandler(store,consultationPorts(client,{generateText:async()=>{throw Error("explicit request needs no AI");}}))(next,new AbortController().signal);
  const handoff=await client.from("consultation_receipts").select("candidate").eq("event_id",next.entity_id).single();expect(handoff.data?.candidate).toMatchObject({type:"handoff_ack"});
  await ingest(randomUUID(),"Tôi gửi thêm thông tin");expect(await store.queue.claim(owner)).toBeNull();
  const count=await client.from("consultation_receipts").select("candidate").eq("organization_id",org);expect(count.data?.filter(r=>r.candidate!==null)).toHaveLength(2);
 }finally{sql(`update public.products set disabled_at=clock_timestamp() where id='${product}';`);}
},20000);
