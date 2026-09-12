import {spawn,execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
const org=randomUUID(),owner=randomUUID(),second=randomUUID(),page=String(Date.now());
const args=["exec","-i","supabase_db_onevoice","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"];
const sql=text=>execFileSync("docker",args,{input:text,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
sql(`insert into public.organizations(id,name,slug) values('${org}','OV017 local concurrency fixture','${org}'); select public.ingest_facebook_events('${org}','${page}','[{"pageId":"${page}","providerKey":"message:a","kind":"message","senderId":"20171111","recipientId":"${page}","data":{"text":"first fake message"}},{"pageId":"${page}","providerKey":"message:b","kind":"message","senderId":"20171111","recipientId":"${page}","data":{"text":"second fake message"}}]');`);
const first=spawn("docker",args,{stdio:["pipe","pipe","pipe"]});let output="",errors="";first.stdout.on("data",data=>{output+=data;});first.stderr.on("data",data=>{errors+=data;});
const done=new Promise((resolve,reject)=>{first.once("error",reject);first.once("exit",code=>code===0?resolve():reject(Error(errors)));});
first.stdin.end(`begin;select public.claim_consultation_job('${owner}','${org}');select 'CLAIM_LOCK_HELD';select pg_sleep(3);commit;`);
const deadline=Date.now()+5000;while(!output.includes("CLAIM_LOCK_HELD")){if(Date.now()>deadline)throw Error("claim lock not observed");await new Promise(resolve=>setTimeout(resolve,20));}
const overlap=sql(`select coalesce(public.claim_consultation_job('${second}','${org}')::text,'EMPTY');`);
if(overlap!=="EMPTY")throw Error("two workers claimed same conversation concurrently");await done;
const firstClaim=JSON.parse(output.split(/\r?\n/).find(line=>line.startsWith("{")));if(firstClaim.organizationId!==org)throw Error("unexpected local pending job: rerun in idle local worker environment");
const receiptCount=sql(`select count(*) from public.consultation_receipts where organization_id='${org}' and status='running';`);if(receiptCount!=="1")throw Error("running receipt invariant violated");
const j=firstClaim.job;sql(`select public.finish_consultation('${j.id}','${j.lease_owner}','${j.lease_token}','{"type":"handoff","intent":"handoff","reason":"customer_requested"}');select public.claim_consultation_job('${second}','${org}');`);
console.log("PASS: two independent local psql connections overlap; one claim, second skips locked predecessor/conversation; one running receipt.");
const product=randomUUID(),policy=randomUUID();
sql(`insert into public.products(id,organization_id,source_url,canonical_url,name,sku,price_vnd,in_stock,quality) values('${product}','${org}','https://fixture.example/${product}','https://fixture.example/${product}','Fixture','FIXTURE',500,false,'usable');insert into public.business_policies(id,organization_id,kind,title,body,version,expires_at) values('${policy}','${org}','service','Fixture service','Fixture clause',1,clock_timestamp()+interval '2 seconds');select public.ingest_facebook_events('${org}','${page}','[{"pageId":"${page}","providerKey":"message:expiry","kind":"message","senderId":"20172222","recipientId":"${page}","data":{"text":"fake expiry race"}}]');`);
const expiryClaim=JSON.parse(sql(`select public.claim_consultation_job('${owner}','${org}');`));
const policyRecord=JSON.parse(sql(`select jsonb_build_object('kind','policy','id',id,'title',title,'version',version,'value',body,'productId',null,'startsAt',starts_at,'expiresAt',expires_at) from public.business_policies where id='${policy}';`));
const blocker=spawn("docker",args,{stdio:["pipe","pipe","pipe"]});let blocked="";blocker.stdout.on("data",d=>{blocked+=d;});const released=new Promise((resolve,reject)=>{blocker.once("error",reject);blocker.once("exit",code=>code===0?resolve():reject(Error("blocker failed")));});
blocker.stdin.end(`begin;select id from public.products where id='${product}' for update;select 'PRODUCT_LOCK_HELD';select pg_sleep(3);commit;`);
const blockDeadline=Date.now()+5000;while(!blocked.includes("PRODUCT_LOCK_HELD")){if(Date.now()>blockDeadline)throw Error("product lock not observed");await new Promise(resolve=>setTimeout(resolve,20));}
const outcome={type:"reply",intent:"needs",text:"Fixture clause; Fixture price 500",claims:[policyRecord,{kind:"catalog",productId:product,variantId:null,name:"Fixture",sku:"FIXTURE",version:1,variantUpdatedAt:null,field:"price_vnd",value:500}]};
const ej=expiryClaim.job;sql(`select public.finish_consultation('${ej.id}','${ej.lease_owner}','${ej.lease_token}','${JSON.stringify(outcome).replaceAll("'","''")}');`);await released;
if(sql(`select outcome->>'type' from public.consultation_receipts where event_id='${ej.entity_id}';`)!=="gap")throw Error("expired earlier policy passed final fence");
sql(`update public.products set disabled_at=clock_timestamp() where id='${product}';update public.business_policies set disabled_at=clock_timestamp() where id='${policy}';`);
console.log("PASS: policy expires while finish waits on a later product lock; final validity pass converts reply to gap/handoff. No sends.");
