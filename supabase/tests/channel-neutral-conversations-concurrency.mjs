// SPDX-License-Identifier: Apache-2.0
// Local Docker PostgreSQL only. Two real connections project the same WEB event.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
const args = ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
const sql = (query) => execFileSync("docker", args, { input: query, encoding: "utf8", windowsHide: true }).trim();
const org = randomUUID();
sql(`insert into public.organizations(id,name,slug) values('${org}','OV-054 concurrency','${org}');`);
const event = sql(`select public.ingest_web_event('${org}','{"providerKey":"message:ov054-race","senderKey":"web-race-054","kind":"message","eventTimeMs":1700000004000,"data":{"text":"race"}}');`);
try {
  const holder = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let output = "";
  const locked = new Promise((resolve) =>
    holder.stdout.on("data", (data) => {
      output += data.toString();
      if (output.includes("web_projected")) resolve();
    }),
  );
  const complete = new Promise((resolve, reject) => {
    holder.on("error", reject);
    holder.on("exit", (code) => (code === 0 ? resolve() : reject(Error("holder project failed"))));
  });
  holder.stdin.end(`begin;select public.project_web_conversation('${org}','${event}');select 'web_projected';select pg_sleep(2);commit;`);
  await locked;
  const second = sql(`select public.project_web_conversation('${org}','${event}');`);
  await complete;
  const parsed = JSON.parse(second);
  assert.equal(parsed.inserted, false);
  assert.equal(sql(`select count(*) from public.conversations where organization_id='${org}';`), "1");
  assert.equal(sql(`select count(*) from public.conversation_messages m join public.conversations c on c.id=m.conversation_id where c.organization_id='${org}';`), "1");
  assert.equal(sql(`select revision from public.conversations where organization_id='${org}';`), "0");
  console.log("PASS AT-054-05 two connections yield one conversation, one message, revision preserved");
} finally {
  sql(`update public.conversations set updated_at=clock_timestamp() where organization_id='${org}';`);
}
