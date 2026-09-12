// Local Docker PostgreSQL only. Synthetic immutable history is retained, source disabled.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
const args=['exec','-i','supabase_db_onevoice','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'];
const sql=query=>execFileSync('docker',args,{input:query,encoding:'utf8',windowsHide:true}).trim();
const org=randomUUID(),actor=randomUUID(),source=randomUUID(),owner=randomUUID(),token=randomUUID();
sql(`begin;insert into public.organizations(id,name,slug) values('${org}','Ingestion lease fixture','${org}');insert into auth.users(id) values('${actor}');insert into public.staff_profiles(user_id,organization_id,role) values('${actor}','${org}','manager');insert into public.knowledge_sources(id,organization_id,version,document) values('${source}','${org}',1,'{"name":"Lease fixture","kind":"text","text":"Fixture","url":null,"authority":"business","productIds":[],"topics":[],"freshnessHours":1,"active":true}');select public.request_knowledge_ingestion('${org}','${actor}','${source}',1);commit;`);
const job=sql(`select job_id from public.knowledge_ingestion_runs where source_id='${source}';`);
try {
 const locker=spawn('docker',args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let output='';const locked=new Promise(resolve=>locker.stdout.on('data',data=>{output+=data.toString();if(output.includes('source_locked'))resolve();}));
 const released=new Promise((resolve,reject)=>{locker.on('error',reject);locker.on('exit',code=>code===0?resolve():reject(Error('lock fixture failed')));});
 locker.stdin.end(`begin;select id from public.knowledge_sources where id='${source}' for update;select 'source_locked';select pg_sleep(3);commit;`);
 await locked;
 sql(`update public.business_jobs set status='running',attempts=1,lease_owner='${owner}',lease_token='${token}',lease_expires_at=clock_timestamp()+interval '700 milliseconds',attempt_started_at=clock_timestamp() where id='${job}';`);
 const result=sql(`select public.publish_knowledge_ingestion('${job}','${owner}','${token}',repeat('a',64),'["Fixture"]',null,'text/plain');`);
 await released;
 assert.equal(result,'f','publish must recheck lease after waiting for source lock');
 assert.equal(sql(`select count(*) from public.knowledge_ingestions where source_id='${source}';`),'0');
 console.log('PASS actual source-lock wait past lease expiry cannot publish');
} finally {sql(`update public.knowledge_sources set document=document||'{"active":false}',version=version+1 where id='${source}';update public.staff_profiles set active=false where user_id='${actor}';`);}
