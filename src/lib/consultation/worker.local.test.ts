import {execFileSync,execSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {it,expect} from "vitest";
import type {Database} from "@/lib/supabase/database.types";
import {createConsultationStore,createConsultationHandler,consultationPorts} from "./worker";
const localStatus=()=>{const raw=execSync("pnpm exec supabase status --output json",{encoding:"utf8",stdio:["ignore","pipe","pipe"]});const status=JSON.parse(raw.slice(raw.indexOf("{")));const url=new URL(status.API_URL);if(url.protocol!=="http:"||!["127.0.0.1","localhost"].includes(url.hostname))throw Error("local_only");return {href:url.href,key:status.SERVICE_ROLE_KEY as string};};
it.skipIf(process.env.ONEVOICE_LOCAL_CONSULTATION_PROOF!=="1")("actual local REST commits grounded candidate then atomically hands off with one acknowledgment",async()=>{
 const status=localStatus();
 const client=createClient<Database>(status.href,status.key,{auth:{persistSession:false,autoRefreshToken:false}});const org=randomUUID(),product=randomUUID(),owner=randomUUID(),page=String(Date.now());
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
it.skipIf(process.env.ONEVOICE_LOCAL_CONSULTATION_PROOF!=="1")("AT-017-03 local claim search history compare uses persisted catalog IDs",async()=>{
 const status=localStatus();
 const client=createClient<Database>(status.href,status.key,{auth:{persistSession:false,autoRefreshToken:false}});
 const org=randomUUID(),productA=randomUUID(),productB=randomUUID(),owner=randomUUID(),page=`201703${Date.now()}`;
 const sql=(s:string)=>execFileSync("docker",["exec","-i","supabase_db_onevoice","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"],{input:s,stdio:["pipe","pipe","pipe"]});
 sql(`begin;insert into public.organizations(id,name,slug) values('${org}','OV017 compare history fixture','${org}');
insert into public.products(id,organization_id,source_url,canonical_url,name,sku,price_vnd,in_stock,stock_quantity,quality,specifications) values
('${productA}','${org}','https://fixture.example/${productA}','https://fixture.example/${productA}','OV017Cmp Alpha','EXACT-A',500,true,2,'usable','[{"name":"RAM","value":"16GB"},{"name":"Display","value":"14 inch"}]'),
('${productB}','${org}','https://fixture.example/${productB}','https://fixture.example/${productB}','OV017Cmp Beta','EXACT-B',700,true,2,'usable','[{"name":"RAM","value":"32GB"},{"name":"Display","value":"15.6 inch"}]');
commit;`);
 const ingest=async(key:string,text:string)=>{const result=await client.rpc("ingest_facebook_events",{p_organization_id:org,p_page_id:page,p_events:[{pageId:page,providerKey:`message:${key}`,kind:"message",senderId:"201700003",recipientId:page,data:{text}}]});if(result.error)throw Error("fixture_ingress_failed");};
 try{
  await ingest(randomUUID(),"Tìm laptop OV017Cmp");
  const store=createConsultationStore(client,org);const job=await store.queue.claim(owner);if(!job)throw Error("no search job");
  const searchReplies=[{intent:"needs",query:{operation:"search_products",need:"OV017Cmp"}},{facts:[0,4],closing:"none"}];
  await createConsultationHandler(store,consultationPorts(client,{generateText:async()=>({text:JSON.stringify(searchReplies.shift()),model:"local-fake"})}))(job,new AbortController().signal);
  const first=await client.from("consultation_receipts").select("candidate,outcome").eq("event_id",job.entity_id).single();
  expect(first.error).toBeNull();expect(first.data?.candidate).toMatchObject({type:"reply"});
  const persisted=(((first.data?.candidate as {claims?:Array<{kind?:string;productId?:string;variantId?:string|null;sku?:string}>}|null)?.claims)??[]).filter(c=>c.kind==="catalog").map(c=>({productId:c.productId,variantId:c.variantId??null,sku:c.sku}));
  expect(persisted.map(p=>p.sku).sort()).toEqual(["EXACT-A","EXACT-B"]);
  const compareText="So sánh hai mẫu vừa rồi";
  expect(compareText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  await ingest(randomUUID(),compareText);
  const next=await store.queue.claim(owner);if(!next)throw Error("no compare job");
  const claimed=store.context(next);
  expect(claimed.text).toBe(compareText);
  expect(claimed.text).not.toContain(productA);expect(claimed.text).not.toContain(productB);
  const historyIds=((claimed.history??[]) as Array<{decision?:{catalogItems?:Array<{productId?:string;variantId?:string|null;sku?:string}>}}>).flatMap(h=>h.decision?.catalogItems??[]);
  expect(historyIds.map(i=>i.sku).sort()).toEqual(["EXACT-A","EXACT-B"]);
  expect(historyIds.map(i=>i.productId).sort()).toEqual([productA,productB].sort());
  await createConsultationHandler(store,consultationPorts(client,{generateText:async({prompt})=>{
   if(prompt.startsWith("Classify")){
    const data=JSON.parse(prompt.slice(prompt.indexOf("DATA=")+5)) as {history:Array<{decision?:{catalogItems?:Array<{productId:string;variantId:string|null}>}}>};
    const items=[...new Map(data.history.flatMap(h=>h.decision?.catalogItems??[]).filter(i=>i.productId).map(i=>[i.productId,{productId:i.productId,variantId:i.variantId??null}])).values()];
    return {text:JSON.stringify({intent:"compare",query:{operation:"compare_products",items}}),model:"local-fake"};
   }
   return {text:JSON.stringify({facts:[0,4],closing:"none"}),model:"local-fake"};
  }}))(next,new AbortController().signal);
  const second=await client.from("consultation_receipts").select("candidate,outcome").eq("event_id",next.entity_id).single();
  expect(second.data?.candidate).toMatchObject({type:"reply"});
  expect(second.data?.candidate).toEqual(expect.objectContaining({text:expect.stringContaining("EXACT-A")}));
  expect(JSON.stringify(second.data?.candidate)).toContain("EXACT-B");
  const query=(second.data?.outcome as {query?:{operation?:string;items?:Array<{productId:string}>}}|null)?.query??(second.data?.candidate as {query?:{operation?:string;items?:Array<{productId:string}>}}|null)?.query;
  expect(query?.operation).toBe("compare_products");
  expect((query?.items??[]).map(i=>i.productId).sort()).toEqual([productA,productB].sort());
 }finally{sql(`update public.products set disabled_at=clock_timestamp() where id in ('${productA}','${productB}');`);}
},20000);
