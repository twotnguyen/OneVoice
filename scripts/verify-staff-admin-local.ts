// SPDX-License-Identifier: Apache-2.0
// Local-only synthetic Auth and independent PostgreSQL transactions; never reads .env.
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { StaffAdminRepository } from "../src/lib/auth/staff-admin-repository";
import { verifyStaffSession } from "../src/lib/auth/session";
const key = process.env.ONEVOICE_LOCAL_ADMIN;
assert.ok(key, "Explicit local Admin key required");
const db = createClient<Database>("http://127.0.0.1:54321", key, { auth: { persistSession: false, autoRefreshToken: false } });
const repo = new StaffAdminRepository(db, key);
function session() {
 const child = spawn("docker", ["exec", "-i", "supabase_db_onevoice", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { windowsHide: true });
 let stdout = "", stderr = ""; child.stdout.on("data", data => { stdout += data; }); child.stderr.on("data", data => { stderr += data; });
 const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => { child.on("error", reject); child.on("close", code => resolve({ code, stdout, stderr })); });
 return { child, done, output: () => stdout };
}
async function sql(query: string) { const s = session(); s.child.stdin.end(query); const result = await s.done; assert.equal(result.code, 0, result.stderr); return result.stdout; }
const org = randomUUID(), actor = randomUUID(), other = randomUUID(), createdIds: string[] = [];
await sql(`insert into public.organizations(id,name,slug) values('${org}','Local staff verification','local-staff-${org}'); insert into auth.users(id) values('${actor}'),('${other}'); insert into public.staff_profiles(user_id,organization_id,role,display_name) values('${actor}','${org}','manager','Local manager A'),('${other}','${org}','manager','Local manager B');`);
try {
 const input = { action: "create" as const, requestId: randomUUID(), email: `staff-${randomUUID()}@example.invalid`, password: randomUUID() + "!aA9", displayName: "Local fake employee", role: "staff" as const };
 const saved = await repo.save(org, actor, input); createdIds.push(saved.userId);
 assert.deepEqual(await repo.save(org, actor, input), saved, "completed replay");
 const loginClient = createClient("http://127.0.0.1:54321", key, { auth: { persistSession: false, autoRefreshToken: false } });
 const signed = await loginClient.auth.signInWithPassword({ email: input.email, password: input.password }); assert.equal(signed.error, null);
 const token = signed.data.session!.access_token;
 const readSession = () => verifyStaffSession({ getUser: async () => { const result = await db.auth.getUser(token); return result.data.user; }, getProfile: async (id, organizationId) => { const { data } = await db.from("staff_profiles").select("*").eq("user_id", id).eq("organization_id", organizationId).single(); return data; } }, org);
 assert.equal((await readSession())?.role, "staff");
 await repo.save(org, actor, { action: "update", requestId: randomUUID(), userId: saved.userId, expectedVersion: 1, displayName: input.displayName, role: "staff", active: false });
 assert.equal(await readSession(), null, "existing token loses internal access immediately");
 await repo.save(org, actor, { action: "update", requestId: randomUUID(), userId: saved.userId, expectedVersion: 2, displayName: input.displayName, role: "staff", active: true });
 assert.equal((await readSession())?.role, "staff");
 const pending = { ...input, requestId: randomUUID(), email: `staff-${randomUUID()}@example.invalid` };
 const credentialDigest = createHmac("sha256", key).update(pending.requestId + "\0" + pending.password).digest("hex");
 const reserved = await db.rpc("reserve_staff_account", { p_organization_id: org, p_actor_id: actor, p_request_id: pending.requestId, p_email: pending.email, p_display_name: pending.displayName, p_role: pending.role, p_credential_digest: credentialDigest }); assert.equal(reserved.error, null);
 const reservation = reserved.data as { userId: string; marker: string }; createdIds.push(reservation.userId);
 const pendingList = await repo.list(org, actor);
 assert.ok(pendingList.pending.some(item => item.requestId === pending.requestId));
 assert.ok(!JSON.stringify(pendingList).includes(credentialDigest) && !JSON.stringify(pendingList).includes(reservation.marker), "pending UI exposes neither digest nor marker");
 assert.equal((await repo.list(org, other)).pending.length, 0, "pending recovery is actor scoped");
 const auth = await db.auth.admin.createUser({ id: reservation.userId, email: pending.email, password: pending.password, email_confirm: true, app_metadata: { onevoice_staff_marker: reservation.marker } }); assert.equal(auth.error, null);
 assert.equal((await db.from("staff_profiles").select("user_id").eq("user_id", reservation.userId)).data?.length, 0, "interrupted creation has no access");
 assert.equal((await repo.save(org, actor, pending)).userId, reservation.userId, "reserved ownership recovers interrupted completion");
 await assert.rejects(repo.save(org, actor, { ...input, requestId: randomUUID() }), /PROVISION_FAILED/, "duplicate email does not adopt another identity");
 console.log("PASS: local Auth create, reserved retry, duplicate rejection, disable/enable fresh session");
 const first = session(); let second: ReturnType<typeof session> | undefined;
 try {
  first.child.stdin.write(`begin; set local role service_role; select public.update_staff_account('${org}','${actor}','${actor}','${randomUUID()}',1,'Manager A','staff',true); select 'FIRST_DEMOTED';\n`);
  const deadline = Date.now() + 15000;
  while (!first.output().includes("FIRST_DEMOTED")) { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 30)); }
  second = session(); const app = `staff-race-${randomUUID()}`;
  second.child.stdin.end(`set application_name='${app}'; set role service_role; select public.update_staff_account('${org}','${other}','${other}','${randomUUID()}',1,'Manager B','staff',true);`);
  while (!(await sql(`select exists(select 1 from pg_stat_activity where application_name='${app}' and wait_event='advisory');`)).includes("t")) { assert.ok(Date.now() < deadline, "second manager must block"); await new Promise(resolve => setTimeout(resolve, 30)); }
  first.child.stdin.end("commit;\n"); assert.equal((await first.done).code, 0);
  const loser = await second.done; assert.notEqual(loser.code, 0); assert.match(loser.stderr, /last_active_manager/);
  assert.equal((await sql(`select count(*) from public.staff_profiles where organization_id='${org}' and active and role='manager';`)).trim(), "1");
  console.log("PASS: overlapping transactions serialize manager demotions; last manager preserved");
 } finally { if (!first.child.stdin.destroyed) first.child.stdin.end("rollback;\n"); await first.done; if (second) await second.done; }
} finally {
 for (const id of createdIds) { const removed = await db.auth.admin.deleteUser(id); assert.equal(removed.error, null); }
 await sql(`delete from auth.users where id in('${actor}','${other}');`);
 // Keep synthetic organization and append-only audit evidence; all Auth users removed.
}
