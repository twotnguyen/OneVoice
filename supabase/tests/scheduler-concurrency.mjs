// Local Docker only. Two connections cannot duplicate a due slot or exceed daily cap.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const args = ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
const sql = (query) => execFileSync("docker", args, { input: query, encoding: "utf8", windowsHide: true }).trim();
if (!sql("select version from supabase_migrations.schema_migrations where version='20260913106000';")) {
  sql(readFileSync("supabase/migrations/20260913106000_marketing_scheduler.sql", "utf8"));
  sql("insert into supabase_migrations.schema_migrations(version) values('20260913106000') on conflict do nothing;");
}
const org = randomUUID(), product = randomUUID(), campaign = randomUUID(), slot = randomUUID(), first = randomUUID(), second = randomUUID();
sql(`begin;
insert into public.organizations(id,name,slug) values('${org}','Scheduler concurrency','${org}');
insert into public.business_settings(organization_id,revision,settings) values('${org}',1,'{"brandName":"Fixture","brandVoice":"Plain","allowedTopics":[],"forbiddenTopics":[],"timezone":"Asia/Ho_Chi_Minh","goalSelection":"auto","managerGoal":"","timingMode":"constrained","dailyCap":1,"windows":[{"start":"00:00","end":"23:59"}],"objective":"mixed"}');
insert into public.marketing_control(organization_id,status,reason) values('${org}','RUNNING','enabled');
insert into public.products(id,organization_id,source_url,canonical_url,name,price_vnd,stock_quantity,in_stock,quality) values('${product}','${org}','urn:${product}','urn:${product}','Keyboard',100000,2,true,'partial');
insert into public.campaigns(id,organization_id,title,objective,source_kind,source_ref,priority,source_snapshot,settings_snapshot,timezone,decision) values('${campaign}','${org}','Concurrency','mixed','product','${product}',false,'{"skus":[{"id":"${product}","priceVnd":100000}]}','{}','Asia/Ho_Chi_Minh','{}');
insert into public.campaign_slots(id,campaign_id,ordinal,scheduled_at) values('${slot}','${campaign}',1,clock_timestamp()-interval '1 minute');
commit;`);
const claim = (id) => `select public.claim_marketing_tick('${org}','${id}',clock_timestamp());`;
try {
  const holder = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let output = "";
  const locked = new Promise((resolve) => holder.stdout.on("data", (data) => { output += data.toString(); if (output.includes("tick_locked")) resolve(); }));
  const complete = new Promise((resolve, reject) => { holder.on("error", reject); holder.on("exit", (code) => code === 0 ? resolve() : reject(Error("holder failed"))); });
  holder.stdin.end(`begin;${claim(first)}select 'tick_locked';select pg_sleep(2);commit;`);
  await locked;
  const other = sql(claim(second));
  await complete;
  const firstSlots = sql(`select jsonb_array_length(result->'slots') from public.marketing_tick_receipts where request_id='${first}';`);
  const plannedClaims = sql(`select count(*) from public.campaign_slots where id='${slot}' and claimed_request='${first}';`);
  assert.equal(firstSlots, "1");
  assert.match(other, /"slots":\s*\[\]/);
  assert.equal(plannedClaims, "1");
  assert.equal(sql(`select count(*) from public.campaign_slots where campaign_id='${campaign}' and status='PUBLISHED';`), "0");
  console.log("PASS two connections claim one due slot; cap/claim fenced; never published");
} finally {
  sql(`update public.products set disabled_at=clock_timestamp() where id='${product}'; update public.campaigns set status='FAILED' where id='${campaign}'; update public.marketing_control set status='PAUSED',reason='fixture_complete' where organization_id='${org}';`);
}
