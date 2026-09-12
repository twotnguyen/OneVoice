// Local Docker only. Immutable synthetic campaigns remain; fixture ends paused.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
const args=['exec','-i','supabase_db_onevoice','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'];
const sql=query=>execFileSync('docker',args,{input:query,encoding:'utf8',windowsHide:true}).trim();
const org=randomUUID(),actor=randomUUID(),product=randomUUID(),first=randomUUID(),second=randomUUID();
const create=id=>`select public.create_priority_campaign('${org}','${actor}','${id}','${randomUUID()}',0,'{"sourceKind":"product","sourceId":"${product}","objective":"mixed"}');`;
sql(`begin;insert into public.organizations(id,name,slug) values('${org}','Campaign concurrency fixture','${org}');insert into auth.users(id) values('${actor}');insert into public.staff_profiles(user_id,organization_id,role) values('${actor}','${org}','manager');insert into public.business_settings(organization_id,revision,settings) values('${org}',1,'{"brandName":"Fixture","brandVoice":"Plain","allowedTopics":[],"forbiddenTopics":[],"timezone":"Asia/Ho_Chi_Minh","goalSelection":"auto","managerGoal":"","timingMode":"constrained","dailyCap":1,"windows":[{"start":"09:00","end":"17:00"}],"objective":"mixed"}');insert into public.products(id,organization_id,source_url,canonical_url,name,price_vnd,stock_quantity,in_stock,quality) values('${product}','${org}','urn:fixture:${product}','urn:fixture:${product}','Concurrency fixture',100000,2,true,'partial');commit;`);
try {
 const holder=spawn('docker',args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let output='';const locked=new Promise(resolve=>holder.stdout.on('data',data=>{output+=data.toString();if(output.includes('priority_locked'))resolve();}));
 const complete=new Promise((resolve,reject)=>{holder.on('error',reject);holder.on('exit',code=>code===0?resolve():reject(Error('priority transaction failed')));});
 holder.stdin.end(`begin;${create(first)}select 'priority_locked';select pg_sleep(2);commit;`);
 await locked;
 let rejected=false;
 try { sql(create(second)); } catch(error) { assert.match(String(error.stderr),/CAMPAIGN_CONFLICT/); rejected=true; }
 await complete;
 assert.equal(rejected,true);
 assert.equal(sql(`select count(*) from public.campaigns where organization_id='${org}';`),'1');
 assert.equal(sql(`select status||':'||priority_campaign_id from public.marketing_control where organization_id='${org}';`),`PAUSED:${first}`);
 assert.equal(sql(`select count(*) from public.audit_events where organization_id='${org}' and action='campaign.created';`),'1');
 sql(`select public.finish_campaign('${org}','${first}','${randomUUID()}',1,'FAILED');`);
 assert.equal(sql(`select status||':'||(priority_campaign_id is null)::text from public.marketing_control where organization_id='${org}';`),'PAUSED:true');
 console.log('PASS competing actual transactions yield one audited priority; terminal stays paused');
} finally {sql(`update public.products set disabled_at=clock_timestamp() where id='${product}';update public.staff_profiles set active=false where user_id='${actor}';`);}
