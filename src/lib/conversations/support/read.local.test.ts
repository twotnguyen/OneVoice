import {execFileSync,execSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,it} from "vitest";
import type {Database} from "@/lib/supabase/database.types";
import {createSupportReader} from "./read";
it.skipIf(process.env.ONEVOICE_LOCAL_SUPPORT_TEST!=="1")("reads a durable scoped queue and paginates recent messages through local REST",async()=>{
 let status:{API_URL:string;SERVICE_ROLE_KEY:string};try{status=JSON.parse(execSync("pnpm exec supabase status --output json",{encoding:"utf8",stdio:["ignore","pipe","pipe"]}));}catch{throw Error("local_supabase_unavailable");}
 const url=new URL(status.API_URL);if(!["localhost","127.0.0.1"].includes(url.hostname)||url.protocol!=="http:")throw Error("local_database_required");
 const org=randomUUID(),conversation=randomUUID(),handoff=randomUUID();
 const sql=(command:string)=>execFileSync("docker",["exec","supabase_db_onevoice","psql","-X","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-c",command],{stdio:["ignore","pipe","pipe"]});
 try{
  sql(`begin; insert into public.organizations(id,name,slug) values('${org}','Local support fixture','${org}'); insert into public.conversations(id,organization_id,page_id,psid) values('${conversation}','${org}','10000000016','20000000016'); insert into public.facebook_inbound_events(organization_id,page_id,provider_key,kind,sender_id,recipient_id,event_time_ms,data,received_at) select '${org}','10000000016','fixture-'||n,'message','20000000016','10000000016',1700000000000+n,jsonb_build_object('text','local fixture '||n),'2026-01-01'::timestamptz+n*interval '1 millisecond' from generate_series(1,35) n; insert into public.conversation_messages(conversation_id,inbound_event_id,provider_key,kind,data,received_at) select '${conversation}',id,provider_key,kind,data,received_at from public.facebook_inbound_events where organization_id='${org}'; insert into public.conversation_handoffs(id,conversation_id,source_event_id,reason) select '${handoff}','${conversation}',id,'customer_requested' from public.facebook_inbound_events where organization_id='${org}' limit 1; update public.conversations set status='WAITING_STAFF',active_handoff_id='${handoff}',revision=1 where id='${conversation}'; commit;`);
  const client=createClient<Database>(url.href,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const reader=createSupportReader(client);
  const queue=await reader.queue(org,{});expect(queue.counts).toEqual({waiting:1,active:0});expect(queue.events[0].conversationId).toBe(conversation);
  const first=await reader.detail(org,conversation,false);expect(first?.messages).toHaveLength(30);expect(first?.messages[0].text).toBe("local fixture 35");expect(first?.nextCursor).not.toBeNull();
  const second=await reader.detail(org,conversation,false,first!.nextCursor!);expect(second?.messages).toHaveLength(5);expect(second?.messages[0].text).toBe("local fixture 5");expect(second?.nextCursor).toBeNull();
  expect(await reader.detail(randomUUID(),conversation,false)).toBeNull();
  const newReader=createSupportReader(createClient<Database>(url.href,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}));expect((await newReader.queue(org,{status:"WAITING_STAFF"})).events).toHaveLength(1);
 }finally{sql(`begin; update public.conversations set status='AI_ACTIVE',active_handoff_id=null where id='${conversation}'; delete from public.conversation_handoffs where id='${handoff}'; delete from public.conversation_messages where conversation_id='${conversation}'; delete from public.conversations where id='${conversation}'; delete from public.facebook_inbound_events where organization_id='${org}'; delete from public.organizations where id='${org}'; commit;`);}
},20000);
