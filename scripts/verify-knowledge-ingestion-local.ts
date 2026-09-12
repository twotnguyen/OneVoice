// SPDX-License-Identifier: Apache-2.0
// Local fixture only; records retained because ingestion/audit history is immutable.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { createIngestionWorkerStore, createIngestionManager, readCurrentKnowledge } from "../src/lib/knowledge/ingestion-repository";
import { createIngestionHandler } from "../src/lib/knowledge/ingestion-worker";
const key = process.env.ONEVOICE_LOCAL_ADMIN; assert.ok(key);
const db = createClient<Database>("http://127.0.0.1:54321", key, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = (query: string) => execFileSync("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, encoding: "utf8", windowsHide: true });
const org = randomUUID(), manager = randomUUID(), source = randomUUID();
sql(`begin; insert into public.organizations(id,name,slug) values('${org}','Knowledge ingestion local fixture','${org}'); insert into auth.users(id) values('${manager}'); insert into public.staff_profiles(user_id,organization_id,role) values('${manager}','${org}','manager'); insert into public.knowledge_sources(id,organization_id,version,document) values('${source}','${org}',1,'{"name":"Local ingestion proof","kind":"text","text":"Fixture service guide","url":null,"authority":"business","productIds":[],"topics":[],"freshnessHours":1,"active":true}'); commit;`);
try {
 const actor = { userId: manager, organizationId: org, role: "manager" as const, displayName: "Fixture" };
 assert.equal(await readCurrentKnowledge(db, 'a0000000-0000-0000-0000-000000000001', source), null, 'Actual default-org UUID accepted and foreign source remains scoped');
 const api = createIngestionManager(db, actor), store = createIngestionWorkerStore(db);
 const runId = await api.refresh(source, 1); assert.equal(await api.refresh(source, 1), runId);
 sql(`update public.business_jobs set available_at='1970-01-01' where entity_id='${runId}';`);
 const job = await store.queue.claim(randomUUID()); assert.equal(job?.entity_id, runId); assert.ok(job);
 await createIngestionHandler(store)(job, new AbortController().signal); assert.equal(await store.queue.finish(job), true);
 assert.equal((await api.status(source))?.status, "ready");
 const result = await readCurrentKnowledge(db, org, source); assert.equal((result as { chunks: string[] }).chunks[0], "Fixture service guide");
 sql(`update public.knowledge_sources set version=2,document=document||'{"text":"New fixture guide"}' where id='${source}';`);
 assert.equal(await readCurrentKnowledge(db, org, source), null);
 assert.equal((await api.status(source))?.status, "not_loaded");
 sql(`update public.knowledge_sources set document=document||'{"kind":"html","text":null,"url":"https://example.com/fixture"}' where id='${source}';`);
 const htmlRun = await api.refresh(source, 2); sql(`update public.business_jobs set available_at='1970-01-01' where entity_id='${htmlRun}';`);
 const htmlJob = await store.queue.claim(randomUUID()); assert.equal(htmlJob?.entity_id, htmlRun); assert.ok(htmlJob);
 await createIngestionHandler(store, async () => ({ text: '<html><body><script>private script</script><p>Fixture HTML</p></body></html>', contentType: 'text/html', finalUrl: 'https://example.com/fixture' }))(htmlJob, new AbortController().signal);
 assert.equal(await store.queue.finish(htmlJob), true);
 const htmlResult = await readCurrentKnowledge(db, org, source); assert.deepEqual((htmlResult as { chunks: string[] }).chunks, ['Fixture HTML']);
 console.log("PASS local REST enqueue/dedup/claim/text+compiled isolated HTML parse/publish/finish/current evidence/version invalidation; injected HTML transport, no external requests");
} finally { sql(`update public.knowledge_sources set version=version+1,document=document||'{"active":false}' where id='${source}'; update public.staff_profiles set active=false where user_id='${manager}';`); }
